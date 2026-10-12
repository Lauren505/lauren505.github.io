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

/**
 * Where the desserts asked for go, and the rest: the ones asked for to the
 * places at the front of the table — `places`, the indices of the settings
 * whose places they are, best first — in the order they were laid, top
 * first; the rest off the table, on whichever side is nearer.
 */
export const arrange = (laid: Laid[], wanted: Set<string>, places: number[]): Moves => {
  const moves: Moves = new Map();
  const asked = laid
    .map((s, i) => [s, i] as const)
    .filter(([s]) => wanted.has(s.id))
    .sort((a, b) => a[0].plate.y - b[0].plate.y || a[0].plate.x - b[0].plate.x);
  asked.forEach(([s], n) => {
    const to = laid[places[n]].plate;
    moves.set(s.id, { by: { x: to.x - s.plate.x, y: to.y - s.plate.y }, order: n, wanted: true });
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
