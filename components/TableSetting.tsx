"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Drawn from "@/components/Drawn";
import { outOf, type Laid, type Piece, type Vec } from "@/components/bakeryLayout";
import { keyframes, shuffle, type Hand, type Shuffle } from "@/components/tableShuffle";
import { TABLE_WIDTH } from "@/content";
import styles from "./TableSetting.module.css";

/** One thing on the table the editor can take hold of: the plate, the dessert
 *  or the hand of setting `i`, or piece `i` of the cutlery. */
export type Part = { part: "plate" | "dessert" | "hand" | "cutlery"; i: number };

const samePart = (a: Part | null, b: Part | null) =>
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

/** One piece, placed by its middle and scaled to the window. */
const place = (p: Piece, scale: number): React.CSSProperties => ({
  left: (p.x - p.width / 2) * scale,
  top: (p.y - p.height / 2) * scale,
  width: p.width * scale,
  height: p.height * scale,
  transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined,
});

/** How far a piece has to go along `way` to be off the window as the table
 *  is laid — the top of it, TABLE_WIDTH wide and `high` long. */
const offWindow = (from: Vec, way: Vec, r: number, high: number) =>
  outOf({ x0: 0, y0: 0, x1: TABLE_WIDTH, y1: high }, from, way, r);

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
  hidden = false,
  children,
}: {
  part: Part;
  piece: Piece;
  scale: number;
  edit?: Edit;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  const on = samePart(edit?.selected ?? null, part);
  return (
    <div
      className={styles.piece}
      style={{ ...place(piece, scale), visibility: hidden ? "hidden" : undefined }}
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
 * which — and `hide` takes one setting off the table while its recipe is
 * out: see RecipeView, which has it up close instead.
 *
 * Each time `shuffled` counts up, the table has been rearranged — see
 * bakerySearch — and is seen to be, by hand: see tableShuffle.
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
  hide,
  shuffled = 0,
  onShuffle,
}: {
  laid: Laid[];
  cutlery: Piece[];
  scale: number;
  arrive?: boolean;
  edit?: Edit;
  hands?: boolean;
  onArrived?: () => void;
  pick?: (i: number) => void;
  hide?: number;
  shuffled?: number;
  /** Told how long the table takes to be rearranged, each time it is. */
  onShuffle?: (ms: number) => void;
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

  /* The table rearranged: everything moved is drawn where it was and moved
     by hand to where it is laid now — see tableShuffle. */
  const root = useRef<HTMLDivElement>(null);
  const was = useRef(laid);
  const [helpers, setHelpers] = useState<Hand[]>([]);
  const timeline = useRef<Shuffle | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!shuffled || !el) return;
    for (const a of el.getAnimations({ subtree: true })) if (a.id === "shuffle") a.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHelpers([]);
      return;
    }
    const box = el.getBoundingClientRect();
    const plan = shuffle(was.current, laid, {
      top: -box.top / scale,
      bottom: (window.innerHeight - box.top) / scale,
    });
    timeline.current = plan;
    onShuffle?.(plan.total);
    el.querySelectorAll<HTMLElement>("[data-of]").forEach((part) => {
      const track = plan.settings.get(part.dataset.of ?? "");
      if (!track) return;
      part.animate(keyframes(track, Number(part.dataset.turn) || 0, scale, plan.total), {
        duration: plan.total,
        id: "shuffle",
      });
    });
    setHelpers(plan.hands);
    const t = window.setTimeout(() => setHelpers([]), plan.total + 50);
    return () => window.clearTimeout(t);
    // Only as the table is rearranged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffled]);
  // Where everything was, for the next time.
  useLayoutEffect(() => {
    was.current = laid;
  });
  // The hands, once they are there to move.
  useLayoutEffect(() => {
    const el = root.current;
    const plan = timeline.current;
    if (!el || !plan) return;
    for (const h of helpers) {
      const part = el.querySelector<HTMLElement>(`[data-helper="${h.key}"]`);
      part?.animate(keyframes(h.track, h.piece.rotate, scale, plan.total), {
        duration: plan.total,
        fill: "forwards",
        id: "shuffle",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpers]);

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
      ref={root}
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
        >
          <div {...set(nearest(c))} data-of={laid[nearest(c)]?.id} data-turn={c.rotate}>
            <Drawn image={c.image} width={c.width * scale} />
          </div>
        </Hold>
      ))}

      {[...rank.keys()].map((i) => [laid[i], i] as const).map(([s, i]) => (
        <div key={`${s.id}-${i}`} className={styles.setting}>
          <Hold
            part={{ i, part: "plate" }}
            piece={s.plate}
            scale={scale}
            edit={edit}
            hidden={hide === i}
          >
            <div {...slide(i, s.plate)} data-of={s.id} data-turn={s.plate.rotate}>
              <Drawn image={s.plate.image} width={s.plate.width * scale} />
            </div>
          </Hold>

          <Hold
            part={{ i, part: "dessert" }}
            piece={s.dessert}
            scale={scale}
            edit={edit}
            hidden={hide === i}
          >
            <div {...slide(i, s.dessert)} data-of={s.id} data-turn={s.dessert.rotate}>
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

      {/* The hands rearranging the table. */}
      {helpers.map((h) => (
        <div key={h.key} className={styles.piece} style={place(h.piece, scale)}>
          <div data-helper={h.key}>
            <Drawn image={h.piece.image} width={h.piece.width * scale} openFoot />
          </div>
        </div>
      ))}
    </div>
  );
}
