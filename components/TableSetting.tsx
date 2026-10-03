"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Drawn from "@/components/Drawn";
import type { Laid, Piece } from "@/components/bakeryLayout";
import type { Shift } from "@/components/RecipeReveal";
import { TABLE_WIDTH } from "@/content";
import styles from "./TableSetting.module.css";

/** One thing on the table the editor can take hold of: the plate, the dessert
 *  or the hand of setting `i`, or piece `i` of the cutlery. */
export type Part = { part: "plate" | "dessert" | "hand" | "cutlery"; i: number };

export const samePart = (a: Part | null, b: Part | null) =>
  !!a && !!b && a.i === b.i && a.part === b.part;

/** What taking hold of it does: drag it, size it from the corner, or turn it
 *  from the stalk above it. */
export type Grip = "move" | "size" | "turn";

export type Edit = {
  selected: Part | null;
  grab: (part: Part, grip: Grip, e: React.PointerEvent<HTMLElement>) => void;
};

/** How the table is laid, in milliseconds: one setting starting after
 *  another, each sliding in, its hand resting on it a moment and then going. */
const STAGGER = 170;
const SLIDE = 950;
const REST = 160;
const RETREAT = 700;

/** A piece moved from where it is laid, in the window's pixels — see
 *  RecipeReveal — after `delay`. */
type Moved = Shift & { delay?: number };

/** How long the rest of the table takes to go off the window, or come back,
 *  when a recipe is brought; one piece starting after another, outwards from
 *  the plate the recipe is for. */
const AWAY = 800;
const RIPPLE = 320;

/** One piece, placed by its middle and scaled to the window — and moved,
 *  `shift`. */
const place = (p: Piece, scale: number, shift?: Moved): React.CSSProperties => ({
  left: (p.x - p.width / 2) * scale,
  top: (p.y - p.height / 2) * scale,
  width: p.width * scale,
  height: p.height * scale,
  transform:
    [shift ? `translate(${shift.dx}px, ${shift.dy}px)` : "", p.rotate ? `rotate(${p.rotate}deg)` : ""]
      .join(" ")
      .trim() || undefined,
  transition: shift?.ms ? `transform ${shift.ms}ms ${shift.ease} ${shift.delay ?? 0}ms` : undefined,
});

type Vec = { x: number; y: number };

/**
 * How far something at `from`, `r` across from its middle to its furthest
 * edge, has to go along `way` to be off the window altogether — which, as the
 * table is laid, is the top of it: TABLE_WIDTH wide and `high` long.
 */
const offWindow = (from: Vec, way: Vec, r: number, high: number) => {
  const go: number[] = [];
  if (way.x < 0) go.push((from.x + r) / -way.x);
  if (way.x > 0) go.push((TABLE_WIDTH - from.x + r) / way.x);
  if (way.y < 0) go.push((from.y + r) / -way.y);
  if (way.y > 0) go.push((high - from.y + r) / way.y);
  return go.length ? Math.max(0, Math.min(...go)) : 0;
};

/** A move across the window, as a translate inside a piece turned `rotate`
 *  degrees: the turn is undone first, so it moves straight across all the
 *  same. */
const along = (v: Vec, rotate: number, scale: number, name: "from" | "to") => {
  const a = (rotate * Math.PI) / 180;
  const x = (v.x * Math.cos(a) + v.y * Math.sin(a)) * scale;
  const y = (-v.x * Math.sin(a) + v.y * Math.cos(a)) * scale;
  return { [`--${name}-x`]: `${x}px`, [`--${name}-y`]: `${y}px` } as React.CSSProperties;
};

/** As far as a piece reaches from the middle of its plate. */
const reach = (p: Piece, from: Vec) => Math.hypot(p.x - from.x, p.y - from.y) + Math.hypot(p.width, p.height) / 2;

/** The box a piece sits in, and in the editor the handles on it. */
function Hold({
  part,
  piece,
  scale,
  edit,
  shift,
  children,
}: {
  part: Part;
  piece: Piece;
  scale: number;
  edit?: Edit;
  shift?: Moved;
  children: React.ReactNode;
}) {
  const on = samePart(edit?.selected ?? null, part);
  return (
    <div
      className={styles.piece}
      style={place(piece, scale, shift)}
      data-editing={edit ? "" : undefined}
      data-selected={on || undefined}
      onPointerDown={edit ? (e) => edit.grab(part, "move", e) : undefined}
    >
      {children}
      {edit && on ? (
        <>
          <span className={styles.turn} onPointerDown={(e) => edit.grab(part, "turn", e)} />
          <span className={styles.size} onPointerDown={(e) => edit.grab(part, "size", e)} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The desserts on the bakery's table, on the plates content/bakeryTable.ts
 * gives them, and the cutlery and flowers around them — which is where the
 * table is laid; this only draws it, at `scale` to the window.
 *
 * Laid one setting after another once the cloth is lying still — `arrive` —
 * each sliding in from off the window: pushed in by its hand, for the
 * settings on the first screen that have one, the hand going back the way it
 * came once the plate is down; from the nearer side on its own, for the rest.
 * The cutlery is set down after the plate nearest it. Without `arrive` all of
 * it is already there, for the faces of a turn. The cutlery under everything,
 * then the plates, then what is on them, and the hands over the lot.
 *
 * With `edit`, in development only, every piece can be picked up — see
 * TableEditor — and with `hands` too, the hands, standing where they leave
 * their plates. `onArrived` is told once the table is laid.
 *
 * Otherwise, once it is laid, every dessert can be clicked — `pick` is told
 * which — and `shift` moves one setting's plate and dessert, and `away`
 * everything else on the table off the window, and back: see RecipeReveal.
 */
export default function TableSetting({
  laid,
  cutlery,
  scale,
  arrive = false,
  edit,
  hands = false,
  onArrived,
  pick,
  shift,
  away,
}: {
  laid: Laid[];
  cutlery: Piece[];
  scale: number;
  arrive?: boolean;
  edit?: Edit;
  hands?: boolean;
  onArrived?: () => void;
  pick?: (i: number) => void;
  shift?: Shift & { i: number };
  /** Everything but setting `except` off the window, or on its way back. */
  away?: { except: number; out: boolean };
}) {
  /** Where each setting comes, top of the page first: in the order they are
   *  set down, and in which their pictures are fetched. */
  const rank = new Map(
    laid
      .map((s, i) => [i, s.plate.y] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([i], n) => [i, n] as const),
  );
  const start = (i: number) => (rank.get(i) ?? i) * STAGGER;
  const total = Math.max(0, laid.length - 1) * STAGGER + SLIDE + REST + RETREAT;

  // Laid once: after that it is only there, so nothing slides in again when
  // the editor is closed, and the hands are gone.
  const [done, setDone] = useState(!arrive);
  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(() => {
      setDone(true);
      onArrived?.();
    }, total);
    return () => window.clearTimeout(t);
    // Once, for this table: a remount (a new key) is what lays it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const moving = arrive && !done;
  const picking = !!pick && !edit;

  /** Whether setting `i` is down yet, and so can be clicked: as soon as its
   *  own plate is, not once the whole table is — which, the length of it,
   *  is seconds after the ones in the window have landed. */
  const laidAt = useRef(0);
  useEffect(() => {
    laidAt.current = performance.now();
  }, []);
  const landed = (i: number) => !moving || performance.now() - laidAt.current >= start(i) + SLIDE;

  /** The top of the table, as much of it as is in the window, in the
   *  table's own pixels. */
  const high = typeof window === "undefined" ? Infinity : window.innerHeight / scale;

  /** Whether a setting is on the first screen of the table, whose pictures
   *  are fetched straight away; the rest wait until they are scrolled near. */
  const first = (s: Laid) =>
    typeof window === "undefined" || (s.plate.y - s.plate.height / 2) * scale < window.innerHeight * 1.2;

  /** How each setting comes in: which way it is pushed, how far, and whether
   *  it is its hand that pushes it — and then how far the hand has to go back
   *  to be out of sight. */
  const ways = laid.map((s) => {
    const at = { x: s.plate.x, y: s.plate.y };
    // Only on the first screen: further down nobody is there to see it.
    const pushed = !!s.hand && s.plate.y - s.plate.height / 2 < high;
    let way: Vec = { x: at.x < TABLE_WIDTH / 2 ? 1 : -1, y: 0 };
    if (pushed && s.hand) {
      const d = Math.hypot(at.x - s.hand.x, at.y - s.hand.y);
      if (d > 0) way = { x: (at.x - s.hand.x) / d, y: (at.y - s.hand.y) / d };
    }
    const back = { x: -way.x, y: -way.y };
    const r = Math.max(reach(s.plate, at), reach(s.dessert, at));
    let far = offWindow(at, back, r, high);
    let retreat = 0;
    if (pushed && s.hand) {
      const h = { x: s.hand.x, y: s.hand.y };
      const hr = Math.hypot(s.hand.width, s.hand.height) / 2;
      far = Math.max(far, offWindow(h, back, hr, high));
      retreat = offWindow(h, back, hr, high);
    }
    return {
      hand: pushed ? s.hand : undefined,
      from: { x: back.x * far, y: back.y * far },
      to: { x: back.x * retreat, y: back.y * retreat },
    };
  });

  /** A plate or what is on it, sliding in with the rest of its setting. */
  const slide = (i: number, p: Piece) => ({
    className: styles.slide,
    "data-arrive": moving || undefined,
    style: { animationDelay: `${start(i)}ms`, ...along(ways[i].from, p.rotate, scale, "from") },
  });

  /** A piece of cutlery or a flower, set down once its plate is. */
  const set = (i: number) => ({
    className: styles.set,
    "data-arrive": moving || undefined,
    style: { animationDelay: `${start(i) + SLIDE * 0.8}ms` },
  });

  /** Off the window to the nearer side, for everything but the plate a
   *  recipe is for — and back, the nearest to it first out and last in. */
  const from = away ? laid[away.except]?.plate : undefined;
  const sweep = (p: Piece, r: number): Moved | undefined => {
    if (!away || !from) return undefined;
    const ripple = Math.min(RIPPLE, Math.hypot(p.x - from.x, p.y - from.y) * 0.3);
    const dx = p.x < TABLE_WIDTH / 2 ? -(p.x + r + 40) : TABLE_WIDTH - p.x + r + 40;
    return away.out
      ? { dx: dx * scale, dy: 0, ms: AWAY, ease: "cubic-bezier(0.5, 0, 0.6, 1)", delay: ripple }
      : { dx: 0, dy: 0, ms: AWAY, ease: "cubic-bezier(0.25, 0.7, 0.3, 1)", delay: RIPPLE - ripple };
  };
  const moved = (i: number) => {
    if (shift?.i === i) return shift;
    if (away && away.except !== i) {
      const s = laid[i];
      return sweep(s.plate, Math.max(reach(s.plate, s.plate), reach(s.dessert, s.plate)));
    }
    return undefined;
  };

  /** Which setting a piece of cutlery comes with, as it is set down: the one
   *  whose plate is nearest. */
  const nearest = (c: Piece) => {
    let best = 0;
    let far = Infinity;
    laid.forEach((s, i) => {
      const d = Math.hypot(s.plate.x - c.x, s.plate.y - c.y);
      if (d < far) [best, far] = [i, d];
    });
    return best;
  };

  return (
    <div
      className={styles.table}
      data-editing={edit ? "" : undefined}
      style={{ "--slide": `${SLIDE}ms`, "--retreat": `${RETREAT}ms` } as React.CSSProperties}
    >
      {cutlery.map((c, k) => (
        <Hold
          key={`ware-${k}`}
          part={{ part: "cutlery", i: c.source ?? k }}
          piece={c}
          scale={scale}
          edit={edit}
          shift={sweep(c, Math.hypot(c.width, c.height) / 2)}
        >
          <div {...set(nearest(c))}>
            <Drawn image={c.image} width={c.width * scale} />
          </div>
        </Hold>
      ))}

      {[...rank.keys()].map((i) => [laid[i], i] as const).map(([s, i]) => (
        <div key={`${s.id}-${i}`} className={styles.setting}>
          <Hold part={{ i, part: "plate" }} piece={s.plate} scale={scale} edit={edit} shift={moved(i)}>
            <div {...slide(i, s.plate)}>
              <Drawn image={s.plate.image} width={s.plate.width * scale} />
            </div>
          </Hold>

          <Hold part={{ i, part: "dessert" }} piece={s.dessert} scale={scale} edit={edit} shift={moved(i)}>
            <div {...slide(i, s.dessert)}>
              <div className={styles.bake}>
                {picking ? (
                  <button
                    type="button"
                    className={styles.pick}
                    data-recipe-keep=""
                    aria-label={s.bake.title}
                    onClick={() => landed(i) && pick?.(i)}
                  />
                ) : null}
                <Image
                  src={s.dessert.image}
                  alt={s.bake.title}
                  fill
                  draggable={false}
                  loading={first(s) ? "eager" : "lazy"}
                  fetchPriority={first(s) ? "high" : "auto"}
                  sizes={`${Math.ceil(s.dessert.width * scale)}px`}
                  className={styles.photo}
                />
              </div>
            </div>
          </Hold>
        </div>
      ))}

      {/* The hands: pushing the first plates in, or in the editor standing
          where they leave them, to be put where they should. */}
      {laid.map((s, i) => {
        const hand = moving ? ways[i].hand : hands ? s.hand : undefined;
        if (!hand) return null;
        return (
          <Hold key={`hand-${s.id}-${i}`} part={{ i, part: "hand" }} piece={hand} scale={scale} edit={moving ? undefined : edit}>
            <div {...slide(i, hand)} data-hand="">
              <div
                className={styles.retreat}
                data-arrive={moving || undefined}
                style={{
                  animationDelay: `${start(i) + SLIDE + REST}ms`,
                  ...along(ways[i].to, hand.rotate, scale, "to"),
                }}
              >
                <Drawn image={hand.image} width={hand.width * scale} openFoot />
              </div>
            </div>
          </Hold>
        );
      })}
    </div>
  );
}
