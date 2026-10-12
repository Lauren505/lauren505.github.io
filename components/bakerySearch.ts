import { TABLE_WIDTH, recipes } from "@/content";
import type { Laid, Piece, Vec } from "@/components/bakeryLayout";

/**
 * Looking for desserts on the bakery's table by what is written on the
 * custom order pad: each line written there names something — a dessert, a
 * part of one, something in it — and a dessert is wanted if every word of a
 * line is a word of its name, of the parts its recipe is made of, or of its
 * ingredients. A line that names nothing on the table yet — a word still
 * being written — is passed over, and changes nothing.
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
 * Which desserts the lines written ask for, by their ids: those any line
 * names, of the lines that name something. `null` if nothing is written —
 * the table as it was laid — and `undefined` if what is written names
 * nothing yet, which leaves the table as it is.
 */
export const lookFor = (laid: Laid[], lines: string[]): Set<string> | null | undefined => {
  const asked = lines.map(wordsIn).filter((w) => w.length);
  if (!lines.some((l) => l.trim())) return null;
  const found = new Set<string>();
  for (const words of asked) {
    for (const s of laid) {
      const has = wordsFor(s);
      if (words.every((w) => [...has].some((h) => same(w, h)))) found.add(s.id);
    }
  }
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

/** The same small turn of the place, for the same dessert, every time, so
 *  that they are not ruled into rows. */
const nudge = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { x: ((h % 1000) / 1000 - 0.5) * 0.12, y: (((h >> 10) % 1000) / 1000 - 0.5) * 0.1 };
};

/**
 * Where the desserts asked for go: spread out evenly over the part of the
 * table in the window — not under the nav, or the pad — in rows as far
 * apart as the room allows and no closer than the biggest of them needs;
 * and if they do not all fit, in more rows like them down the table. In
 * the order they were laid, top first. The rest go off the table, on
 * whichever side is nearer.
 */
export const arrange = (laid: Laid[], wanted: Set<string>, room: Room): Moves => {
  const moves: Moves = new Map();
  const asked = laid
    .filter((s) => wanted.has(s.id))
    .sort((a, b) => a.plate.y - b.plate.y || a.plate.x - b.plate.x);

  const big = Math.max(0, ...asked.map((s) => Math.max(s.plate.width, s.plate.height, s.dessert.width, s.dessert.height)));
  const least = big + 20;
  const left = EDGE;
  const wide = TABLE_WIDTH - 2 * EDGE;
  const top = room.top + NAV;
  const high = Math.max(least, room.bottom - EDGE - top);
  const covered = (x: number, y: number, w: number, h: number) =>
    !!room.pad && x + w * 0.25 > room.pad.left && y > room.pad.top - h * 0.3 && y < room.pad.bottom + h * 0.3;

  /** The places in a grid `cols` across with rows `tall` apart, `rows` of
   *  them — or as many as `need` takes — row by row, less those under the
   *  pad. */
  const grid = (cols: number, tall: number, rows: number, need: number) => {
    const w = wide / cols;
    const out: { x: number; y: number; row: number }[] = [];
    for (let j = 0; j < rows && out.length < need; j++) {
      for (let i = 0; i < cols && out.length < need; i++) {
        const x = left + (i + 0.5) * w;
        const y = top + (j + 0.5) * tall;
        if (!covered(x, y, w, tall)) out.push({ x, y, row: j });
      }
    }
    return { out, w };
  };

  // As few across as will all fit in the window, so they are as far apart
  // as they can be; if none will, as many across as there is room for, and
  // the rest further down.
  let places: { x: number; y: number; row: number }[] = [];
  let w = wide;
  let tall = least;
  for (let cols = 1; wide / cols >= least; cols++) {
    const rows = Math.max(1, Math.floor(high / Math.max(least * 0.9, (wide / cols) * 0.75)));
    const g = grid(cols, high / rows, rows, asked.length);
    if (g.out.length >= asked.length) {
      [places, w, tall] = [g.out, g.w, high / rows];
      break;
    }
  }
  if (places.length < asked.length) {
    const cols = Math.max(1, Math.floor(wide / least));
    const g = grid(cols, least, Infinity, asked.length);
    [places, w, tall] = [g.out, g.w, least];
  }
  // A last row only partly filled, and clear of the pad, spread across.
  const lastRow = places.length ? places[places.length - 1].row : 0;
  const last = places.filter((p) => p.row === lastRow);
  if (last.length && !last.some((p) => covered(p.x, p.y, w, tall)) && last.length < Math.round(wide / w)) {
    last.forEach((p, i) => (p.x = left + ((i + 0.5) * wide) / last.length));
  }

  asked.forEach((s, n) => {
    const at = places[n];
    const k = nudge(s.id);
    const x = at.x + k.x * w;
    const y = at.y + k.y * tall;
    moves.set(s.id, { by: { x: x - s.plate.x, y: y - s.plate.y }, order: n, wanted: true });
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
