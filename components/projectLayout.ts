import type { LayoutItem, Project, ProjectMedia, SavedLayout } from "@/content";

/** Units across the window. One unit is as tall as it is wide. */
export const COLS = 48;
/** Between two pieces that sit side by side or one over the other. */
export const GAP = 1;

export type Piece =
  | { kind: "title"; text: string }
  | { kind: "dek"; text: string }
  | { kind: "text"; text: string; lead: boolean }
  | { kind: "media"; media: ProjectMedia; cover: boolean };

/** Type sizes, in units, and line heights, in ems — the CSS reads the same
 *  numbers, through --font and --line. A layout scales them with `size`. */
export const FONT = { title: 2.1, dek: 0.8, text: 0.53 } as const;
export const LINE = { title: 1.0, dek: 1.3, text: 1.6 } as const;
/** Between the columns of a text set in more than one, in units. */
const TEXT_GAP = 1.2;
/** Afacad's average letter, in ems: for guessing, where nothing is measured. */
const CHAR = 0.47;

export const mediaAspect = (m: ProjectMedia) => (m.kind === "video" ? 16 / 9 : m.image.width / m.image.height);

/** Every piece of a project, by the key a layout calls it. The cover is its
 *  own piece, and the pictures in the blocks that are the cover again are
 *  left out. */
export function piecesOf(p: Project) {
  const pieces = new Map<string, Piece>();
  pieces.set("title", { kind: "title", text: p.title });
  pieces.set("dek", { kind: "dek", text: p.description });
  pieces.set("cover", { kind: "media", media: { kind: "image", image: p.cover }, cover: true });
  let pi = 0;
  let mi = 0;
  for (const block of p.blocks) {
    if (typeof block === "string") {
      pieces.set(`p${pi}`, { kind: "text", text: block, lead: pi === 0 });
      pi++;
    } else {
      for (const m of block) {
        if (m.kind === "image" && m.image === p.cover) continue;
        pieces.set(`m${mi++}`, { kind: "media", media: m, cover: false });
      }
    }
  }
  return pieces;
}

const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/** Units a text of this kind runs down at this width: a guess, by words —
 *  for the editor, which only needs somewhere to put a piece it adds back. */
export function textHeight(kind: keyof typeof FONT, text: string, w: number, size = 1) {
  const f = FONT[kind] * size;
  const perLine = Math.max(4, Math.floor(w / (f * CHAR)));
  let lines = 1;
  let len = 0;
  for (const word of plain(text).split(/\s+/).filter(Boolean)) {
    if (len && len + 1 + word.length > perLine) {
      lines++;
      len = word.length;
    } else len += (len ? 1 : 0) + word.length;
  }
  return lines * f * LINE[kind];
}

/* ------------------------------------------------------------ measuring */

type TextSpec = {
  text: string;
  /** Pixels: the type, and the width of the box. */
  px: number;
  width: number;
  weight: number;
  line: number;
  cols: number;
  /** Pixels between columns. */
  gap: number;
  /** Opens with a drop cap, which takes a line's room more. */
  cap?: boolean;
};

/** How tall, in pixels, a text comes out: its words wrapped at their real
 *  widths in the page's face, and shared evenly over its columns. */
type Measure = (t: TextSpec) => number;

export function makeMeasure(family: string): Measure {
  const g = document.createElement("canvas").getContext("2d")!;
  const memo = new Map<string, number>();
  return (t) => {
    const id = `${t.px}|${t.width}|${t.weight}|${t.cols}|${t.cap}|${t.text}`;
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    g.font = `${t.weight} ${t.px}px ${family}`;
    const col = (t.width - t.gap * (t.cols - 1)) / t.cols;
    const space = g.measureText(" ").width;
    let lines = 1;
    let run = 0;
    for (const word of plain(t.text).split(/\s+/).filter(Boolean)) {
      const w = g.measureText(word).width;
      if (run && run + space + w > col) {
        lines++;
        run = w;
      } else run += (run ? space : 0) + w;
    }
    if (t.cap) lines += 1;
    const perCol = t.cols > 1 ? Math.ceil(lines / t.cols) + 1 : lines;
    const h = perCol * t.px * t.line;
    memo.set(id, h);
    return h;
  };
}

/* -------------------------------------------------------------- fitting */

/** The window the spread is fitted to: unit size in pixels, how many units
 *  tall the room under the masthead is, and which way up it is. */
export type View = { u: number; rows: number; portrait: boolean };

type Group = { before: string[]; media: string[]; after: string[]; header: boolean };

/** The project as a run of groups, in reading order: the headline, dek and
 *  cover with the first paragraph; then every later paragraph with the row of
 *  pictures that followed it on the old page, or pictures on their own. */
function groupsOf(p: Project): Group[] {
  const groups: Group[] = [{ before: ["title", "dek"], media: ["cover"], after: ["p0"], header: true }];
  let pi = 0;
  let mi = 0;
  let text: string | null = null;
  for (const block of p.blocks) {
    if (typeof block === "string") {
      const key = `p${pi++}`;
      if (key === "p0") continue;
      if (text) groups.push({ before: [text], media: [], after: [], header: false });
      text = key;
      continue;
    }
    const media: string[] = [];
    for (const m of block) {
      if (m.kind === "image" && m.image === p.cover) continue;
      media.push(`m${mi++}`);
    }
    if (!media.length) continue;
    groups.push({ before: text ? [text] : [], media, after: [], header: false });
    text = null;
  }
  if (text) groups.push({ before: [text], media: [], after: [], header: false });
  return groups;
}

/** Rows of pictures no wider than `most` heights each. */
function rowsOf(keys: string[], aspect: (k: string) => number, most: number) {
  const rows: string[][] = [];
  let row: string[] = [];
  let sum = 0;
  for (const k of keys) {
    const a = aspect(k);
    if (row.length && sum + a > most) {
      rows.push(row);
      row = [];
      sum = 0;
    }
    row.push(k);
    sum += a;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** A group laid out at a given width: how tall it is, and the pieces, from
 *  the top of it. */
type Laid = { h: number; items: LayoutItem[] };

/**
 * The spread fitted to the window, so it reads without scrolling.
 *
 * The page is cut into columns — one on an upright window, always; one, two
 * or three on a wide one, as few as the project needs — and the groups run
 * down them in order, split so the columns come out as even as they can.
 * Within a column a group is either stacked, its words above its pictures, or
 * set side by side, whichever is shorter; a text wider than a comfortable
 * line is set in columns of its own, as a paper sets it. Pictures run out to
 * the edges of the window; text keeps a margin from them.
 *
 * Then it is fitted: the type as large as it can be, between a floor and a
 * ceiling, and the pictures cropped shorter — or, with room to spare, a
 * little taller — until the tallest column is the height of the window. Each
 * column count is tried, and the one that keeps the type largest and the
 * pictures least cropped wins, fewer columns breaking a tie. On an upright
 * window that cannot hold everything at a readable size, the page keeps its
 * size and scrolls instead.
 */
export function fitLayout(p: Project, view: View, measure: Measure): LayoutItem[] {
  const { u, rows: H, portrait } = view;
  const pieces = piecesOf(p);
  const groups = groupsOf(p);
  const aspect = (k: string) => {
    const piece = pieces.get(k);
    return piece?.kind === "media" ? mediaAspect(piece.media) : 1;
  };

  const EDGE = portrait ? 2 : 1.5;
  const GUTTER = 1.5;
  const BETWEEN = portrait ? 2.4 : 1.8;
  const fMax = portrait ? 16 : Math.min(17, Math.max(14, u * 0.53));
  const fMin = portrait ? 14 : 11.5;

  /** A text at this width, as a piece of the given height. */
  const text = (key: string, x: number, w: number, f: number) => {
    const piece = pieces.get(key);
    if (!piece || piece.kind === "media") return null;
    const kind = piece.kind;
    const wPx = w * u;
    const px = kind === "title" ? Math.min(f * 3.6, wPx * 0.12) : kind === "dek" ? f * 1.4 : f;
    const cols = kind === "text" ? Math.max(1, Math.min(3, Math.floor(wPx / 290))) : 1;
    let h = measure({
      text: piece.text,
      px,
      width: wPx,
      weight: kind === "title" ? 700 : 400,
      line: LINE[kind],
      cols,
      gap: TEXT_GAP * u,
      cap: kind === "text" && piece.lead,
    });
    // The rules: under the dek, and over every paragraph but the first. A
    // headline is set solid, and its face reaches past its lines.
    if (kind === "dek" || (kind === "text" && !piece.lead)) h += px * 0.7 + 1;
    if (kind === "title") h += px * 0.2;
    const item: LayoutItem = { key, x, y: 0, w, h: h / u + 0.2, size: px / (FONT[kind] * u) };
    if (cols > 1) item.cols = cols;
    return item;
  };

  /** Texts one over another from `y`. */
  const stackTexts = (keys: string[], x: number, w: number, f: number, y: number) => {
    const out: LayoutItem[] = [];
    for (const k of keys) {
      const it = text(k, x, w, f);
      if (!it) continue;
      it.y = y;
      out.push(it);
      y += it.h + (k === "title" ? 0.4 : GAP);
    }
    return { items: out, y: out.length ? y - GAP : y };
  };

  /** Rows of pictures across x0..x1 from `y`, `c` times their natural
   *  height: shorter crops their tops and bottoms, taller their sides. A row
   *  that would be taller than `cap` is drawn smaller instead, in the middle
   *  of the room. */
  const rows = (keys: string[], x0: number, x1: number, y: number, c: number, most: number, cap: number) => {
    const out: LayoutItem[] = [];
    for (const row of rowsOf(keys, aspect, most)) {
      const room = x1 - x0 - GAP * (row.length - 1);
      const sum = row.reduce((s, k) => s + aspect(k), 0);
      let h = (room / sum) * c;
      const shrink = h > cap ? cap / h : 1;
      h = Math.min(h, cap);
      const used = room * shrink + GAP * (row.length - 1);
      let x = x0 + (x1 - x0 - used) / 2;
      row.forEach((k, i) => {
        const w = shrink === 1 && i === row.length - 1 ? x1 - x : (aspect(k) / sum) * room * shrink;
        out.push({ key: k, x, y, w, h });
        x += w + GAP;
      });
      y += h + GAP;
    }
    return { items: out, y: out.length ? y - GAP : y };
  };

  /** A group in the column x0..x1. `mediaSide` is where its pictures go when
   *  set beside its words — towards the window's edge, where they bleed. */
  /** How many pictures' widths of height a row may hold across `w` units:
   *  `d` above one packs more, and so smaller, pictures to a row. */
  const mostFor = (w: number, d: number) => (portrait ? 2 * Math.min(d, 1.4) : Math.max(1.6, w / (H * 0.36)) * d);

  /** How tall a row of pictures may be, by how tightly the page is packed. */
  const capFor = (d: number) => (portrait ? H * (d > 1.6 ? 0.26 : d > 1.2 ? 0.34 : 0.46) : Infinity);

  const lay = (g: Group, x0: number, x1: number, f: number, c: number, d: number, mediaSide: "left" | "right"): Laid => {
    const inL = x0 <= 0.01 ? EDGE : 0;
    const inR = x1 >= COLS - 0.01 ? EDGE : 0;
    const cw = x1 - x0;
    const most = mostFor(cw, d);

    // Stacked: the words above the pictures, any after them below.
    const a = stackTexts(g.before, x0 + inL, cw - inL - inR, f, 0);
    const r = rows(g.media, x0, x1, g.before.length ? a.y + GAP * 1.4 : 0, c, most, capFor(d));
    const b = stackTexts(g.after, x0 + inL, cw - inL - inR, f, g.media.length ? r.y + GAP * 1.4 : a.y + GAP);
    const stacked: Laid = { h: Math.max(a.y, r.y, b.y), items: [...a.items, ...r.items, ...b.items] };

    const words = [...g.before, ...g.after];
    if (portrait || !g.media.length || !words.length || cw < 20) return stacked;

    // Beside: the words in a column of their own next to the pictures.
    const tw = Math.max(280 / u, Math.min(cw * 0.5, cw * (g.header ? 0.4 : 0.36)));
    const textLeft = mediaSide === "right";
    const tx = textLeft ? x0 + inL : x1 - inR - (tw - (textLeft ? inL : inR));
    const tW = tw - (textLeft ? inL : inR);
    const s = stackTexts(words, tx, tW, f, 0);
    const mx0 = textLeft ? x0 + tw + GUTTER : x0;
    const mx1 = textLeft ? x1 : x1 - tw - GUTTER;
    const m = rows(g.media, mx0, mx1, 0, c, mostFor(mx1 - mx0, d), capFor(d));
    const beside: Laid = { h: Math.max(s.y, m.y), items: [...s.items, ...m.items] };
    return beside.h < stacked.h ? beside : stacked;
  };

  /** The columns' spans across the window. */
  const spans = (k: number) => {
    const cw = (COLS - GUTTER * (k - 1)) / k;
    return Array.from({ length: k }, (_, i) => [i * (cw + GUTTER), i * (cw + GUTTER) + cw] as const);
  };
  const sideOf = (k: number, col: number, gi: number): "left" | "right" =>
    k > 1 && col === 0 ? "left" : k > 1 && col === k - 1 ? "right" : gi % 2 ? "right" : "left";

  /** The groups cut into k runs, in order, so the tallest run is as short as
   *  it can be. */
  const split = (hs: number[], k: number) => {
    const n = hs.length;
    k = Math.min(k, n);
    const run = (i: number, j: number) => {
      let t = 0;
      for (let q = i; q < j; q++) t += hs[q] + (q > i ? BETWEEN : 0);
      return t;
    };
    // best[c][j]: the shortest tallest run, cutting the first j groups into c.
    const best = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity));
    const cut = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0));
    best[0][0] = 0;
    for (let c = 1; c <= k; c++)
      for (let j = 1; j <= n; j++)
        for (let i = c - 1; i < j; i++) {
          const v = Math.max(best[c - 1][i], run(i, j));
          if (v < best[c][j]) {
            best[c][j] = v;
            cut[c][j] = i;
          }
        }
    const starts: number[] = [];
    for (let c = k, j = n; c > 0; c--) {
      starts.unshift(cut[c][j]);
      j = cut[c][j];
    }
    return { tallest: best[k][n], starts };
  };

  /** Each group's height at the narrowest it could be set: in a column with
   *  a margin on both sides, which none of them is narrower than. */
  const heights = (k: number, f: number, c: number, d: number) => {
    const [x0, x1] = spans(k)[0];
    return groups.map((g, gi) => lay(g, x0 + 0.02, x1 - 0.02, f, c, d, sideOf(k, 0, gi)).h);
  };
  const tallest = (k: number, f: number, c: number, d: number) => split(heights(k, f, c, d), k).tallest;

  const C_MIN = portrait ? 0.7 : 0.6;
  const C_MAX = 1.3;
  /** The tallest crop that fits, or null if not even the shortest does. */
  const bestCrop = (k: number, f: number, d: number) => {
    if (tallest(k, f, C_MIN, d) > H) return null;
    if (tallest(k, f, C_MAX, d) <= H) return C_MAX;
    let lo = C_MIN;
    let hi = C_MAX;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (tallest(k, f, mid, d) <= H) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  // Every column count, with the pictures as large as they come and packed
  // tighter, each at the largest type that fits without cropping the
  // pictures to slivers — or failing that, that fits at all — scored on all
  // of it: large type, whole pictures, large pictures, few columns.
  const DENSE = portrait ? [1, 1.4, 2] : [1, 1.5, 2.2];
  let choice: { k: number; f: number; c: number; d: number } | null = null;
  let score = -Infinity;
  for (const k of portrait ? [1] : [1, 2, 3])
    for (const d of DENSE) {
      let found: { f: number; c: number } | null = null;
      let fallback: { f: number; c: number } | null = null;
      for (let f = fMax; f >= fMin - 0.01; f -= 0.5) {
        const c = bestCrop(k, f, d);
        if (c === null) continue;
        fallback ??= { f, c };
        if (c >= 0.8) {
          found = { f, c };
          break;
        }
      }
      const pick = found ?? fallback;
      if (!pick) continue;
      const s =
        (pick.f - fMin) / (fMax - fMin || 1) + Math.min(pick.c, 1) * 1.2 - 0.12 * (k - 1) - 0.3 * (d - 1);
      if (s > score) {
        score = s;
        choice = { k, d, ...pick };
      }
    }
  // Nothing fits. An upright window keeps its type readable and scrolls; a
  // wide one takes whichever column count runs over least at its smallest.
  if (!choice) {
    if (portrait) choice = { k: 1, f: fMax - 1, c: 0.9, d: DENSE[DENSE.length - 1] };
    else {
      const d = DENSE[DENSE.length - 1];
      const k = [1, 2, 3].reduce((a, b) => (tallest(b, fMin, C_MIN, d) < tallest(a, fMin, C_MIN, d) ? b : a));
      choice = { k, f: fMin, c: C_MIN, d };
    }
  }

  // Laid out for real, each group in its own column, the room left at the
  // foot of a shorter column shared out between its groups, and whatever is
  // left after that split above and below, so the page sits in the middle of
  // the window rather than up against the top of it.
  const { k, f, c, d } = choice;
  const sp = spans(k);
  const { starts } = split(heights(k, f, c, d), k);
  const columns = starts.map((start, col) => {
    const end = col + 1 < starts.length ? starts[col + 1] : groups.length;
    const [x0, x1] = sp[col];
    const laid = groups.slice(start, end).map((g, i) => lay(g, x0, x1, f, c, d, sideOf(k, col, start + i)));
    const used = laid.reduce((s, l) => s + l.h, 0) + BETWEEN * (laid.length - 1);
    const extra = laid.length > 1 ? Math.min(2, Math.max(0, (H - used) / (laid.length - 1))) : 0;
    return { laid, extra, h: used + extra * (laid.length - 1) };
  });
  // One offset for every column, so they still start level with each other.
  const top = Math.max(0, (H - Math.max(...columns.map((col) => col.h))) / 2);
  const items: LayoutItem[] = [];
  for (const { laid, extra } of columns) {
    let y = top;
    for (const l of laid) {
      for (const it of l.items) items.push({ ...it, y: it.y + y });
      y += l.h + BETWEEN + extra;
    }
  }
  return items;
}

/** A layout saved at one window height, drawn at another: stretched or
 *  squeezed down the page to fill it, and its type made smaller if the boxes
 *  are, so the words still fit them. */
export function fitSaved(saved: SavedLayout, rows: number): LayoutItem[] {
  const r = rows / saved.rows;
  return saved.items.map((it) => ({
    ...it,
    y: it.y * r,
    h: it.h * r,
    ...(it.size !== undefined || r < 1 ? { size: (it.size ?? 1) * Math.min(1, r) } : {}),
  }));
}

const overlapsAcross = (a: LayoutItem, b: LayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w;

/** Everything moved up as far as it will go, a gap clear of whatever is
 *  above it — and so off anything it was lying over. */
export function tidy(items: LayoutItem[]): LayoutItem[] {
  const order = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: LayoutItem[] = [];
  for (const it of order) {
    let y = 0;
    for (const q of placed) if (overlapsAcross(it, q)) y = Math.max(y, q.y + q.h + GAP);
    placed.push({ ...it, y });
  }
  const byKey = new Map(placed.map((it) => [it.key, it]));
  return items.map((it) => byKey.get(it.key)!);
}

/** The foot of the lowest piece. */
export const bottomOf = (items: LayoutItem[]) => items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
