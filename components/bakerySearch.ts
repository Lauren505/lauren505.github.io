import { TABLE_WIDTH, recipes } from "@/content";
import type { Laid, Piece, Vec } from "@/components/bakeryLayout";

/**
 * Looking for desserts on the bakery's table by what is written on the
 * custom order pad: each line written there names something — a dessert, a
 * part of one, something in it — and a dessert is wanted if every word of
 * every line is a word of its name, of the parts its recipe is made of, or
 * of its ingredients. A line that names nothing on the table yet — a word
 * still being written — is passed over, and changes nothing; and so do
 * lines that name nothing together.
 */

/** The words in something written: lower case, without accents, and only
 *  those that say something — no amounts, and no single letters, which are
 *  most of them units. */
const wordsIn = (text: string) =>
  (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  ).filter((w) => w.length > 1 && !/^\d+$/.test(w));

/** One word the same as another, or the same but for being more than one:
 *  "apple" is "apples", "peach" is "peaches". */
const same = (a: string, b: string) => a === b || a + "s" === b || b + "s" === a || a + "es" === b || b + "es" === a;

/** Every word a setting's dessert can be found by. */
const wordsOf = (s: Laid) => {
  const recipe = recipes[s.id];
  const text = [
    s.bake.title,
    recipe?.name ?? "",
    ...(recipe?.ingredients ?? []).flatMap((g) => [g.heading ?? "", ...g.lines.map((l) => l.text)]),
  ];
  return new Set(text.flatMap(wordsIn));
};

const known = new WeakMap<Laid, Set<string>>();
const wordsFor = (s: Laid) => {
  let w = known.get(s);
  if (!w) known.set(s, (w = wordsOf(s)));
  return w;
};

/**
 * Which desserts the lines written ask for, by their ids: those every line
 * names, of the lines that name something. `null` if nothing is written —
 * the table as it was laid — and `undefined` if what is written names
 * nothing yet, which leaves the table as it is.
 */
export const lookFor = (laid: Laid[], lines: string[]): Set<string> | null | undefined => {
  if (!lines.some((l) => l.trim())) return null;
  const has = (s: Laid, words: string[]) => {
    const own = wordsFor(s);
    return words.every((w) => [...own].some((h) => same(w, h)));
  };
  // The lines that name something on the table: one still being written,
  // naming nothing yet, is passed over.
  const asked = lines
    .map(wordsIn)
    .filter((w) => w.length)
    .filter((words) => laid.some((s) => has(s, words)));
  if (!asked.length) return undefined;
  // What every one of them names.
  const found = new Set(laid.filter((s) => asked.every((words) => has(s, words))).map((s) => s.id));
  return found.size ? found : undefined;
};

/** How far each setting is moved, by its id, and in what order it goes. */
export type Moves = Map<string, { by: Vec; order: number; wanted: boolean }>;

/** The part of the table in the window, top to bottom, in its own pixels —
 *  and the order pad over it, if it is out. */
export type Room = { top: number; bottom: number; pad: { left: number; top: number; bottom: number } | null };

/** Room left round the table's edges, and under the nav at the window's
 *  top, in the table's pixels. */
const EDGE = 40;
const NAV = 90;

/** The room kept between desserts, widest first: the widest that lets them
 *  all into the window is the one they are laid with. */
const GAPS = [300, 240, 190, 150, 115, 85, 60, 40, 25];

type Spot = { x: number; y: number; r: number };

/**
 * Lays dishes `r` across from their middles to their edges, in order, with
 * at least `gap` between them, from the top of the room down: in rows across
 * the room — short of the pad, beside it — each spread out to fill its row,
 * every other row starting half a dish in, as bricks are laid; each dish
 * then as high as it will go against those above it, so the rows sit into
 * each other. Where each goes, and whether they are all in the window.
 */
const pack = (rs: number[], gap: number, room: Room) => {
  const left = EDGE;
  const right = TABLE_WIDTH - EDGE;
  const top = room.top + NAV;
  const bottom = room.bottom - EDGE;
  const pad = room.pad;
  const mean = rs.reduce((a, r) => a + 2 * r, 0) / Math.max(1, rs.length);
  const spots: Spot[] = [];
  let y = top;
  let row = 0;
  let n = 0;
  while (n < rs.length) {
    // Beside the pad, only as far as it.
    const beside = !!pad && y < pad.bottom + gap && y + 2 * rs[n] > pad.top - gap;
    const end = beside && pad ? Math.max(left + 2 * rs[n], pad.left - gap) : right;
    const indent = row % 2 ? Math.min(mean / 2, (end - left) / 4) : 0;
    const from = left + indent;
    // As many as fit with the gap round each.
    const take: number[] = [];
    let used = 0;
    while (n + take.length < rs.length) {
      const more = used + 2 * rs[n + take.length] + gap;
      if (take.length && more > end - from) break;
      take.push(n + take.length);
      used = more;
    }
    // Spread out across the row — or, the last, together in the middle.
    const last = n + take.length >= rs.length;
    const sum = take.reduce((a, i) => a + 2 * rs[i], 0);
    const space = last ? gap : (end - from - sum) / take.length;
    let x = last ? (from + end) / 2 - (sum + gap * (take.length - 1)) / 2 : from + space / 2;
    for (const i of take) {
      const r = rs[i];
      const cx = x + r;
      x += 2 * r + space;
      // As high as it will go: below the top, clear of the pad, and of
      // every dish above it.
      let cy = top + r;
      if (pad && cx + r > pad.left - gap) cy = Math.max(cy, pad.bottom + gap + r);
      for (const o of spots) {
        const need = r + o.r + gap;
        const dx = cx - o.x;
        if (Math.abs(dx) < need) cy = Math.max(cy, o.y + Math.sqrt(need * need - dx * dx));
      }
      spots.push({ x: cx, y: cy, r });
    }
    n += take.length;
    row++;
    // The next row, roughly where these end.
    const ends = take.map((i) => spots[i].y);
    y = Math.max(y + mean * 0.5, Math.min(...ends) + mean * 0.4);
  }
  return { spots, fits: spots.every((o) => o.y + o.r <= bottom) };
};

/**
 * Where the desserts asked for go: laid over the part of the table in the
 * window — not under the nav, or the pad — like bricks, each by its own
 * size, as far apart as lets them all in; if they will not all go in, as
 * close as they go, and on down the table. In the order they were laid, top
 * first. The rest go off the table, on whichever side is nearer.
 */
export const arrange = (laid: Laid[], wanted: Set<string>, room: Room): Moves => {
  const moves: Moves = new Map();
  const asked = laid
    .filter((s) => wanted.has(s.id))
    .sort((a, b) => a.plate.y - b.plate.y || a.plate.x - b.plate.x);
  const rs = asked.map((s) => Math.max(s.plate.width, s.plate.height, s.dessert.width, s.dessert.height) / 2);
  let laidOut = pack(rs, GAPS[GAPS.length - 1], room);
  for (const gap of GAPS) {
    const tried = pack(rs, gap, room);
    if (tried.fits) {
      laidOut = tried;
      break;
    }
  }
  asked.forEach((s, n) => {
    const at = laidOut.spots[n];
    moves.set(s.id, { by: { x: at.x - s.plate.x, y: at.y - s.plate.y }, order: n, wanted: true });
  });
  laid.forEach((s) => {
    if (wanted.has(s.id)) return;
    const r = Math.max(s.plate.width, s.plate.height, s.dessert.width, s.dessert.height) + 60;
    const x = s.plate.x < TABLE_WIDTH / 2 ? -(s.plate.x + r) : TABLE_WIDTH - s.plate.x + r;
    moves.set(s.id, { by: { x, y: 0 }, order: 0, wanted: false });
  });
  return moves;
};

const moved = (p: Piece, by: Vec): Piece => ({ ...p, x: p.x + by.x, y: p.y + by.y });

/** The table as it is laid, with every setting moved as `moves` has it, and
 *  each piece of cutlery with the plate it is laid by. */
export const moveTable = (laid: Laid[], cutlery: Piece[], moves: Moves | null) => {
  if (!moves) return { laid, cutlery, nearest: cutlery.map(() => -1) };
  const nearest = cutlery.map((c) => {
    let best = -1;
    let far = Infinity;
    laid.forEach((s, i) => {
      const d = Math.hypot(s.plate.x - c.x, s.plate.y - c.y);
      if (d < far) [best, far] = [i, d];
    });
    return best;
  });
  const by = (s: Laid | undefined) => (s && moves.get(s.id)?.by) || { x: 0, y: 0 };
  return {
    laid: laid.map((s) => {
      const v = by(s);
      return { ...s, plate: moved(s.plate, v), dessert: moved(s.dessert, v), hand: s.hand && moved(s.hand, v) };
    }),
    cutlery: cutlery.map((c, k) => moved(c, by(laid[nearest[k]]))),
    nearest,
  };
};
