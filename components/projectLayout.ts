import type { LayoutItem, Project, ProjectMedia } from "@/content";

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
 *  numbers, through --font and --line. */
export const FONT = { title: 2.1, dek: 0.8, text: 0.53 } as const;
export const LINE = { title: 1.0, dek: 1.3, text: 1.6 } as const;
/** Afacad's average letter, in ems: for guessing how many lines a text runs to. */
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

/** Units a text of this kind runs down at this width: a guess, by words. */
export function textHeight(kind: keyof typeof FONT, text: string, w: number, size = 1) {
  const f = FONT[kind] * size;
  const perLine = Math.max(4, Math.floor(w / (f * CHAR)));
  const words = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/\s+/).filter(Boolean);
  let lines = 1;
  let len = 0;
  for (const word of words) {
    if (len && len + 1 + word.length > perLine) {
      lines++;
      len = word.length;
    } else len += (len ? 1 : 0) + word.length;
  }
  return lines * f * LINE[kind];
}

/** A run of pictures as rows no wider than `most` heights each. */
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

/**
 * The spread set automatically, the way a magazine would set it: the cover
 * from the left edge of the window, with the headline, dek and first paragraph
 * beside it; then every paragraph as a column beside the row of pictures that
 * followed it on the old page, swapping sides as it goes, and every other row
 * across the whole window. Every picture in a row is the same height, and the
 * pictures run out to the edges of the window; only the text keeps a margin.
 *
 * `fit` is the height each text actually came to on the page, in units, where
 * it has been measured — see ProjectSpread; otherwise the heights are guessed.
 */
export function autoLayout(p: Project, fit: Record<string, number> = {}): LayoutItem[] {
  const pieces = piecesOf(p);
  /** A text's height: as measured on the page, if it has been, or a guess. */
  const tall = (key: string, kind: keyof typeof FONT, text: string, w: number, pad = 0) =>
    Math.ceil(fit[key] ?? textHeight(kind, text, w) + pad);
  const aspect = (k: string) => {
    const piece = pieces.get(k);
    return piece?.kind === "media" ? mediaAspect(piece.media) : 1;
  };
  const items: LayoutItem[] = [];

  // The opening.
  const coverW = 29;
  const coverH = Math.min(26, Math.round(coverW / aspect("cover")));
  items.push({ key: "cover", x: 0, y: 0, w: coverW, h: coverH });
  const tx = 31;
  const tw = COLS - tx - 2;
  let ty = 1;
  const titleH = tall("title", "title", p.title, tw);
  items.push({ key: "title", x: tx, y: ty, w: tw, h: titleH });
  ty += titleH;
  const dekH = tall("dek", "dek", p.description, tw, 0.6);
  items.push({ key: "dek", x: tx, y: ty, w: tw, h: dekH });
  ty += dekH + 1;
  const lead = pieces.get("p0");
  if (lead?.kind === "text") {
    const h = tall("p0", "text", lead.text, tw);
    items.push({ key: "p0", x: tx, y: ty, w: tw, h });
    ty += h;
  }
  let y = Math.max(coverH, ty) + 3;

  // The rest, a group at a time: a paragraph and the pictures after it, or
  // pictures on their own.
  const groups: { text: string | null; media: string[] }[] = [];
  let pi = 0;
  let mi = 0;
  let text: string | null = null;
  for (const block of p.blocks) {
    if (typeof block === "string") {
      const key = `p${pi++}`;
      if (key === "p0") continue;
      if (text) groups.push({ text, media: [] });
      text = key;
      continue;
    }
    const media: string[] = [];
    for (const m of block) {
      if (m.kind === "image" && m.image === p.cover) continue;
      media.push(`m${mi++}`);
    }
    if (!media.length) continue;
    groups.push({ text, media });
    text = null;
  }
  if (text) groups.push({ text, media: [] });

  /** Lays rows of pictures between x0 and x1 from `top`, flush with `flush`
   *  when a row comes out narrower than the room; returns where they end. */
  const lay = (rows: string[][], x0: number, x1: number, top: number, cap: number, flush: "left" | "right" | "centre") => {
    let at = top;
    for (const row of rows) {
      const room = x1 - x0 - GAP * (row.length - 1);
      const sum = row.reduce((s, k) => s + aspect(k), 0);
      const h = Math.max(6, Math.min(cap, Math.round(room / sum)));
      const ws = row.map((k) => Math.max(3, Math.round(aspect(k) * h)));
      const total = ws.reduce((s, w) => s + w, 0) + GAP * (row.length - 1);
      // A row that fills the room fills it exactly; one that cannot stands
      // against the edge it is flush with.
      if (h < cap || total > x1 - x0) ws[ws.length - 1] += x1 - x0 - total;
      const used = ws.reduce((s, w) => s + w, 0) + GAP * (row.length - 1);
      let x = flush === "left" ? x0 : flush === "right" ? x1 - used : Math.round(x0 + (x1 - x0 - used) / 2);
      row.forEach((k, i) => {
        items.push({ key: k, x, y: at, w: ws[i], h });
        x += ws[i] + GAP;
      });
      at += h + GAP;
    }
    return at - GAP;
  };

  groups.forEach((g, gi) => {
    if (g.text) {
      const left = gi % 2 === 0;
      const tw = 13;
      const tx = left ? 2 : COLS - 2 - tw;
      const piece = pieces.get(g.text);
      const th = piece?.kind === "text" ? tall(g.text, "text", piece.text, tw, 1) : 4;
      items.push({ key: g.text, x: tx, y, w: tw, h: th });
      const rows = rowsOf(g.media, aspect, 2.9);
      const end = g.media.length
        ? left
          ? lay(rows, tx + tw + 2, COLS, y, 28, "right")
          : lay(rows, 0, tx - 2, y, 28, "left")
        : y;
      y = Math.max(end, y + th) + 3;
    } else {
      // A picture on its own across the page is plenty at a little less height.
      const cap = g.media.length === 1 ? 19 : 24;
      y = lay(rowsOf(g.media, aspect, 4.8), 0, COLS, y, cap, "centre") + 3;
    }
  });

  return items;
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

/** The pieces in reading order — down, then across — for a narrow window,
 *  where the spread is one column. */
export const readingOrder = (items: LayoutItem[]) =>
  new Map([...items].sort((a, b) => a.y - b.y || a.x - b.x).map((it, i) => [it.key, i]));
