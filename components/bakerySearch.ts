import { MARGIN, TABLE_WIDTH, recipes } from "@/content";
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
const EDGE = 24;
/** Room round a plate itself at the table's edges, as it is laid. */
const SIDES = 110;
const NAV = 90;

/** The room kept between settings, widest first: the widest that lets
 *  them all into the window is the one they are laid with — and never less
 *  than the last. */
const GAPS = [240, 190, 150, 120, 95, 75, 60];

/** How far a setting reaches from the middle of its plate — left, right,
 *  up and down — and its shape, as rounds from there: its plate, what is on
 *  it, and a few along each piece of its cutlery. */
type Round = { dx: number; dy: number; r: number };
type Reach = { l: number; r: number; t: number; b: number; rounds: Round[] };
type Spot = Reach & { x: number; y: number };

/** Which setting each piece of cutlery is laid by: the nearest plate. */
const owners = (laid: Laid[], cutlery: Piece[]) =>
  cutlery.map((c) => {
    let best = -1;
    let far = Infinity;
    laid.forEach((s, i) => {
      const d = Math.hypot(s.plate.x - c.x, s.plate.y - c.y);
      if (d < far) [best, far] = [i, d];
    });
    return best;
  });

/** How far a setting reaches from the middle of its plate: the plate, the
 *  dessert on it, and the cutlery by it, each as it is turned. */
const reachOf = (s: Laid, wares: Piece[]): Reach => {
  const at = s.plate;
  const round = (p: Piece, k = 1): Round => ({ dx: p.x - at.x, dy: p.y - at.y, r: (Math.max(p.width, p.height) / 2) * k });
  const rounds = [round(s.plate), round(s.dessert, 0.9)];
  for (const c of wares) {
    // Drawn upright: its length runs down it, turned as it is.
    const a = (c.rotate * Math.PI) / 180;
    const along = { x: -Math.sin(a), y: Math.cos(a) };
    const r = Math.max(c.width / 2, c.height * 0.17);
    for (const t of [-0.33, 0, 0.33]) {
      rounds.push({ dx: c.x - at.x + along.x * t * c.height, dy: c.y - at.y + along.y * t * c.height, r });
    }
  }
  const out = { l: 0, r: 0, t: 0, b: 0, rounds };
  for (const p of [s.plate, s.dessert, ...wares]) {
    const a = (p.rotate * Math.PI) / 180;
    const w = (Math.abs(p.width * Math.cos(a)) + Math.abs(p.height * Math.sin(a))) / 2;
    const h = (Math.abs(p.width * Math.sin(a)) + Math.abs(p.height * Math.cos(a))) / 2;
    out.l = Math.max(out.l, at.x - (p.x - w));
    out.r = Math.max(out.r, p.x + w - at.x);
    out.t = Math.max(out.t, at.y - (p.y - h));
    out.b = Math.max(out.b, p.y + h - at.y);
  }
  return out;
};

/**
 * Lays settings reaching as far as `reach` from their plates, in order,
 * with at least `gap` between them, from the top of the room down: each in
 * the highest place there is room for it, across the table — below the nav,
 * clear of the pad, and clear of every setting already laid, round by round,
 * so that its plate is never over another's cutlery, nor theirs over its.
 * The ones after sit into the gaps between those before, as bricks are
 * laid. Where each plate goes, and whether they are all in the window.
 */
const pack = (reach: Reach[], gap: number, room: Room) => {
  const left = EDGE;
  const right = TABLE_WIDTH - EDGE;
  const top = room.top + NAV;
  const bottom = room.bottom - EDGE;
  const pad = room.pad;
  const spots: Spot[] = [];
  /** How high a setting can go with its plate at `x`. */
  const highest = (k: Reach, x: number) => {
    let y = top + k.t;
    // Beside the pad, a little of the plate can be under it, and of its
    // cutlery as much as may be — but not the middle of it.
    const plate = k.rounds[0].r;
    if (pad && x + plate * 0.2 > pad.left - gap / 4) y = Math.max(y, pad.bottom + gap / 2 + plate);
    for (const o of spots) {
      for (const a of k.rounds) {
        for (const b of o.rounds) {
          const need = a.r + b.r + gap;
          const dx = x + a.dx - (o.x + b.dx);
          if (Math.abs(dx) < need) y = Math.max(y, o.y + b.dy + Math.sqrt(need * need - dx * dx) - a.dy);
        }
      }
    }
    return y;
  };
  for (const k of reach) {
    let best = { x: left + k.l, y: Infinity };

    // The cutlery by the table's edges, and the plate further in.
    const plate = k.rounds[0].r;
    const from = Math.max(left + k.l, SIDES + plate);
    const to = Math.min(right - k.r, TABLE_WIDTH - SIDES - plate);
    for (let x = from; x <= Math.max(from, to); x += 16) {
      const y = highest(k, x);
      // The highest; of those as high, the one furthest left.
      if (y < best.y - 4) best = { x, y };
    }
    spots.push({ ...k, ...best });
  }
  return { spots, fits: spots.every((o) => o.y + o.b <= bottom) };
};

/**
 * Where the desserts asked for go: laid over the part of the table in the
 * window — not under the nav, or the pad — like bricks, each setting by its
 * own size, cutlery and all, so that no plate is laid over another's
 * cutlery; as far apart as lets them all in, or if they will not all go in,
 * on down the table. In the order they were laid, top first. The rest go
 * off the table, on whichever side is nearer.
 */
export const arrange = (laid: Laid[], cutlery: Piece[], wanted: Set<string>, room: Room): Moves => {
  const moves: Moves = new Map();
  const by = owners(laid, cutlery);
  const asked = laid
    .filter((s) => wanted.has(s.id))
    .sort((a, b) => a.plate.y - b.plate.y || a.plate.x - b.plate.x);
  // Its cutlery: what is laid close by its plate — not what only happens
  // to be nearer it than any other, further off.
  const near = (s: Laid, c: Piece) =>
    Math.hypot(c.x - s.plate.x, c.y - s.plate.y) < Math.max(s.plate.width, s.plate.height) / 2 + Math.max(c.width, c.height) / 2 + 40;
  const reach = asked.map((s) => reachOf(s, cutlery.filter((c, k) => laid[by[k]] === s && near(s, c))));
  let laidOut = pack(reach, GAPS[GAPS.length - 1], room);
  for (const gap of GAPS) {
    const tried = pack(reach, gap, room);
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
 *  each piece of cutlery with the plate it is laid by — and, rearranged, how
 *  long the table has to be for what is on it, in its own pixels. */
export const moveTable = (laid: Laid[], cutlery: Piece[], moves: Moves | null) => {
  if (!moves) return { laid, cutlery, nearest: cutlery.map(() => -1), length: undefined };
  const nearest = owners(laid, cutlery);
  const by = (s: Laid | undefined) => (s && moves.get(s.id)?.by) || { x: 0, y: 0 };
  const placed = laid.map((s) => {
    const v = by(s);
    return { ...s, plate: moved(s.plate, v), dessert: moved(s.dessert, v), hand: s.hand && moved(s.hand, v) };
  });
  const wares = cutlery.map((c, k) => moved(c, by(laid[nearest[k]])));
  // Only what is on the table: the rest is off its sides.
  const kept = (s: Laid | undefined) => !!s && !!moves.get(s.id)?.wanted;
  const on = [
    ...placed.filter(kept).flatMap((s) => [s.plate, s.dessert]),
    ...wares.filter((_, k) => kept(laid[nearest[k]])),
  ];
  const length = on.length ? Math.max(...on.map((p) => p.y + p.height / 2)) + MARGIN : 0;
  return { laid: placed, cutlery: wares, nearest, length };
};
