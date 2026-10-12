import type { StaticImageData } from "next/image";
import { outOf, type Laid, type Piece, type Vec } from "@/components/bakeryLayout";
import { TABLE_WIDTH, decorations } from "@/content";

/**
 * The table rearranged by hand, the way it is laid: see bakerySearch for
 * where each setting goes, and TableSetting for the table being laid. A
 * setting taken off the table is pulled off by a hand that reaches in from
 * the nearest edge of the window — a side, the top or the bottom, or a
 * corner — takes hold of its plate, and draws it off the way it came; a
 * setting put on the table is pushed in the same way from the edge nearest
 * it by a hand that then goes back the way it came; and a setting moved from one
 * place on the table to another is pulled off and pushed in again. The ones
 * going go first, the ones coming once the table is clearing.
 *
 * All of it is one timeline: where each setting is, and each hand, as the
 * table is rearranged — in the table's own pixels, from where it is laid
 * now.
 */

/** How long each part of it takes, in milliseconds. */
const REACH = 550;
const GRIP = 150;
const DRAW = 850;
const PUSH = 950;
const REST = 160;
const RETREAT = 700;
/** One setting after another, going, and coming. */
const GOING = 90;
const COMING = 170;
/** When the first comes, if any are going: once the table is clearing. */
const CLEARING = REACH + GRIP + DRAW * 0.55;

const SLIDE = "cubic-bezier(0.55, 0, 0.25, 1)";
const REACHING = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVING = "cubic-bezier(0.5, 0, 0.75, 0)";

/** Where something is, from where it is laid now, from a time on — and how
 *  it gets to where it is next. */
export type Step = { at: number; v: Vec; ease?: string };
export type Track = Step[];

export type Hand = { key: string; piece: Piece; track: Track };

export type Shuffle = {
  /** For each setting that moves, by its id: its plate and all with it. */
  settings: Map<string, Track>;
  hands: Hand[];
  /** How long it all takes. */
  total: number;
};

const HANDS = decorations.filter((d) => d.kind === "hand");

const shape = (image: StaticImageData) => image.height / image.width;

/** As long as a hand is drawn, and as long as one can be drawn to reach a
 *  plate from off the table. */
const HAND = 300;
const LONGEST = 470;
/** How many hands at once, going and coming. */
const MOST = 4;

/** The ways a plate can be taken off the window, or brought on: every
 *  sixteenth of the way round. */
const WAYS: Vec[] = Array.from({ length: 16 }, (_, k) => ({
  x: Math.cos((k * Math.PI) / 8),
  y: Math.sin((k * Math.PI) / 8),
}));

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const along = (a: Vec, d: Vec, by: number): Vec => ({ x: a.x + d.x * by, y: a.y + d.y * by });

/**
 * How the table goes from `was` to `now`, settings matched by id: `seen` is
 * the part of the table in the window, top and bottom, in its own pixels —
 * nothing outside it is seen to move, so it is simply where it is going.
 */
export const shuffle = (was: Laid[], now: Laid[], seen: { top: number; bottom: number }): Shuffle => {
  const before = new Map(was.map((s) => [s.id, s]));
  const box = { x0: 0, y0: seen.top, x1: TABLE_WIDTH, y1: seen.bottom };
  /** How far from `at` along `d` the edge of the window is. */
  const edge = (at: Vec, d: Vec) => outOf(box, at, d, 0);
  const onTable = (p: Piece) => {
    const r = Math.max(p.width, p.height) / 2;
    return p.x + r > 0 && p.x - r < TABLE_WIDTH && p.y + r > seen.top && p.y - r < seen.bottom;
  };

  /** The rim of a plate at `at`, the way `d` from its middle — with the
   *  fingers that take hold of it a little over it. */
  const rim = (plate: Piece, at: Vec, d: Vec) =>
    along(at, d, Math.hypot((d.x * plate.width) / 2, (d.y * plate.height) / 2) - 25);

  /** The quickest way off the window for a plate at `at`: the way the hand
   *  that takes it comes from, and goes. */
  const wayOff = (plate: Piece, at: Vec) => {
    let best = WAYS[0];
    let far = Infinity;
    for (const d of WAYS) {
      const e = edge(rim(plate, at, d), d);
      if (e < far - 1) [best, far] = [d, e];
    }
    return best;
  };

  /**
   * A hand coming the way `d` to a plate at `at`, fingers to it and just
   * over its rim, the way the table's own hands are — long enough that its
   * arm reaches off the window, so the end of it is never seen. None, for a
   * plate too far in for one to reach.
   */
  const handBy = (plate: Piece, at: Vec, d: Vec, n: number): Piece | null => {
    const drawn = HANDS[n % Math.max(1, HANDS.length)];
    if (!drawn) return null;
    const tip = rim(plate, at, d);
    const length = Math.max(HAND, edge(tip, d) + 60);
    if (length > LONGEST) return null;
    const mid = along(tip, d, length / 2);
    // Drawn upright, fingers up: turned so they point back along `d`.
    return {
      image: drawn.image,
      x: mid.x,
      y: mid.y,
      width: length / shape(drawn.image),
      height: length,
      rotate: (Math.atan2(-d.x, d.y) * 180) / Math.PI,
    };
  };

  type Plan = { s: Laid; from: Piece; going: boolean; coming: boolean };
  const plans: Plan[] = [];
  for (const s of now) {
    const a = before.get(s.id);
    if (!a || (a.plate.x === s.plate.x && a.plate.y === s.plate.y)) continue;
    const going = onTable(a.plate);
    const coming = onTable(s.plate);
    if (going || coming) plans.push({ s, from: a.plate, going, coming });
  }

  const settings = new Map<string, Track>();
  const hands: Hand[] = [];
  const goers = plans.filter((p) => p.going).sort((a, b) => a.from.y - b.from.y);
  const comers = plans.filter((p) => p.coming).sort((a, b) => a.s.plate.y - b.s.plate.y);
  const firstComing = goers.length ? CLEARING : 0;
  let n = 0;
  // Only so many hands; the rest slide on their own, as the plates with no
  // hand do when the table is laid.
  let pulling = 0;
  let pushing = 0;

  for (const p of plans) {
    const s = p.s;
    const to = s.plate;
    const A = { x: p.from.x, y: p.from.y };
    const B = { x: to.x, y: to.y };
    // Far enough that it is off the window, and what is laid by it too.
    const r = Math.max(to.width, to.height, s.dessert.width, s.dessert.height) / 2 + 220;
    const track: Track = [];
    let gone = 0;

    if (p.going) {
      const start = goers.indexOf(p) * GOING;
      const d = wayOff(to, A);
      const out = along(A, d, edge(A, d) + r);
      const held = start + REACH + GRIP;
      gone = held + DRAW;
      track.push({ at: 0, v: sub(A, B) }, { at: held, v: sub(A, B) }, { at: gone, v: sub(out, B), ease: SLIDE });
      // Off the window, it is wherever it is going in no time.
      if (!p.coming) track.push({ at: gone, v: { x: 0, y: 0 } });
      const hand = pulling < MOST ? handBy(to, A, d, n++) : null;
      if (hand) {
        pulling++;
        const away = along({ x: 0, y: 0 }, d, edge(hand, d) + hand.height);
        hands.push({
          key: `${s.id}-going`,
          piece: hand,
          track: [
            { at: 0, v: away },
            { at: start, v: away },
            { at: start + REACH, v: { x: 0, y: 0 }, ease: REACHING },
            { at: held, v: { x: 0, y: 0 } },
            { at: gone, v: sub(out, A), ease: SLIDE },
          ],
        });
      }
    }

    if (p.coming) {
      // Not before it has gone, if it is coming back somewhere else.
      const start = Math.max(firstComing + comers.indexOf(p) * COMING, gone);
      const d = wayOff(to, B);
      const from = along(B, d, edge(B, d) + r);
      // Off the window until then — from where it went off to where it
      // comes on in no time, not across it.
      if (p.going) track.push({ at: start, v: track[track.length - 1].v });
      else track.push({ at: 0, v: sub(from, B) });
      track.push({ at: start, v: sub(from, B) }, { at: start + PUSH, v: { x: 0, y: 0 }, ease: SLIDE });
      const hand = pushing < MOST ? handBy(to, B, d, n++) : null;
      if (hand) {
        pushing++;
        const away = along({ x: 0, y: 0 }, d, edge(hand, d) + hand.height);
        hands.push({
          key: `${s.id}-coming`,
          piece: hand,
          track: [
            { at: 0, v: sub(from, B) },
            { at: start, v: sub(from, B) },
            { at: start + PUSH, v: { x: 0, y: 0 }, ease: SLIDE },
            { at: start + PUSH + REST, v: { x: 0, y: 0 } },
            { at: start + PUSH + REST + RETREAT, v: away, ease: LEAVING },
          ],
        });
      }
    }
    settings.set(s.id, track);
  }

  const ends = [...settings.values(), ...hands.map((h) => h.track)].map((t) => t[t.length - 1]?.at ?? 0);
  return { settings, hands, total: Math.max(0, ...ends) };
};

/** A track as keyframes for something turned `rotate` degrees, `scale`
 *  pixels to the table's, over `total`: the turn undone first, so it moves
 *  straight across all the same. */
export const keyframes = (track: Track, rotate: number, scale: number, total: number): Keyframe[] => {
  const a = (rotate * Math.PI) / 180;
  const frames = track.map((s, i) => {
    const x = (s.v.x * Math.cos(a) + s.v.y * Math.sin(a)) * scale;
    const y = (-s.v.x * Math.sin(a) + s.v.y * Math.cos(a)) * scale;
    // How it gets to the next step is said on this one.
    const ease = track[i + 1]?.ease ?? "linear";
    return { offset: total ? Math.min(1, s.at / total) : 1, transform: `translate(${x}px, ${y}px)`, easing: ease };
  });
  const last = frames[frames.length - 1];
  if (last && last.offset < 1) frames.push({ ...last, offset: 1 });
  return frames;
};
