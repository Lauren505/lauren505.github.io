import type { StaticImageData } from "next/image";
import type { Laid, Piece, Vec } from "@/components/bakeryLayout";
import { TABLE_WIDTH, decorations } from "@/content";

/**
 * The table rearranged by hand, the way it is laid: see bakerySearch for
 * where each setting goes, and TableSetting for the table being laid. A
 * setting taken off the table is pulled off by a hand that reaches in from
 * the nearer side, takes hold of its plate, and draws it off the way it
 * came; a setting put on the table is pushed in from the nearer side by a
 * hand that then goes back the way it came; and a setting moved from one
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

/** A hand at the side `side` (−1 left, 1 right) of a plate at `at`,
 *  fingers to it, the way the table's own hands are. */
const handBy = (plate: Piece, at: Vec, side: number, n: number): Piece | null => {
  const drawn = HANDS[n % Math.max(1, HANDS.length)];
  if (!drawn) return null;
  const length = Math.min(380, Math.max(300, plate.width * 1.4));
  return {
    image: drawn.image,
    x: at.x + side * (plate.width / 2 + 155),
    y: at.y,
    width: length / shape(drawn.image),
    height: length,
    rotate: side < 0 ? 90 : -90,
  };
};

/** How far along the side `side` something at `x`, `r` across, has to go to
 *  be off the table. */
const offBy = (x: number, side: number, r: number) => (side > 0 ? TABLE_WIDTH - x : x) + r;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const nearer = (x: number) => (x < TABLE_WIDTH / 2 ? -1 : 1);

/**
 * How the table goes from `was` to `now`, settings matched by id: `seen` is
 * the part of the table in the window, top and bottom, in its own pixels —
 * nothing outside it is seen to move, so it is simply where it is going.
 */
export const shuffle = (was: Laid[], now: Laid[], seen: { top: number; bottom: number }): Shuffle => {
  const before = new Map(was.map((s) => [s.id, s]));
  const onTable = (p: Piece) => {
    const r = Math.max(p.width, p.height) / 2;
    return p.x + r > 0 && p.x - r < TABLE_WIDTH && p.y + r > seen.top && p.y - r < seen.bottom;
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

  for (const p of plans) {
    const to = p.s.plate;
    const A = { x: p.from.x, y: p.from.y };
    const B = { x: to.x, y: to.y };
    const r = Math.max(to.width, to.height) / 2 + 40;
    const track: Track = [];
    let gone = 0;

    if (p.going) {
      const start = goers.indexOf(p) * GOING;
      // Off the side it is going to — or, if it is only going so as to come
      // back somewhere else, the nearer.
      const side = p.coming ? nearer(A.x) : Math.sign(B.x - A.x) || nearer(A.x);
      const out = p.coming ? { x: A.x + side * offBy(A.x, side, r), y: A.y } : B;
      const held = start + REACH + GRIP;
      gone = held + DRAW;
      track.push({ at: 0, v: sub(A, B) }, { at: held, v: sub(A, B) }, { at: gone, v: sub(out, B), ease: SLIDE });
      const hand = handBy(to, A, side, n++);
      if (hand) {
        const away = { x: side * offBy(hand.x, side, hand.height * 0.6), y: 0 };
        hands.push({
          key: `${p.s.id}-going`,
          piece: hand,
          track: [
            { at: 0, v: away },
            { at: start, v: away },
            { at: start + REACH, v: { x: 0, y: 0 }, ease: REACHING },
            { at: held, v: { x: 0, y: 0 } },
            { at: held + DRAW, v: sub(out, A), ease: SLIDE },
          ],
        });
      }
    }

    if (p.coming) {
      // Not before it has gone, if it is coming back somewhere else.
      const start = Math.max(firstComing + comers.indexOf(p) * COMING, gone);
      const side = nearer(B.x);
      const from = { x: B.x + side * offBy(B.x, side, r), y: B.y };
      // Off the table until then — from where it went off to where it comes
      // on in no time, not across it.
      if (p.going) track.push({ at: start, v: track[track.length - 1].v });
      else track.push({ at: 0, v: sub(from, B) });
      track.push({ at: start, v: sub(from, B) }, { at: start + PUSH, v: { x: 0, y: 0 }, ease: SLIDE });
      const hand = handBy(to, B, side, n++);
      if (hand) {
        const away = { x: side * offBy(hand.x, side, hand.height * 0.6), y: 0 };
        hands.push({
          key: `${p.s.id}-coming`,
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
    settings.set(p.s.id, track);
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
