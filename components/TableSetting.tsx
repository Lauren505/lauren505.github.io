"use client";

import Image from "next/image";
import Drawn from "@/components/Drawn";
import type { Laid, Piece } from "@/components/bakeryLayout";
import styles from "./TableSetting.module.css";

/** One thing on the table the editor can take hold of: the plate or the
 *  dessert of setting `i`, or piece `i` of the cutlery. */
export type Part = { part: "plate" | "dessert" | "cutlery"; i: number };

export const samePart = (a: Part | null, b: Part | null) =>
  !!a && !!b && a.i === b.i && a.part === b.part;

/** What taking hold of it does: drag it, size it from the corner, or turn it
 *  from the stalk above it. */
export type Grip = "move" | "size" | "turn";

export type Edit = {
  selected: Part | null;
  grab: (part: Part, grip: Grip, e: React.PointerEvent<HTMLElement>) => void;
};

/** One piece, placed by its middle and scaled to the window. */
const place = (p: Piece, scale: number): React.CSSProperties => ({
  left: (p.x - p.width / 2) * scale,
  top: (p.y - p.height / 2) * scale,
  width: p.width * scale,
  height: p.height * scale,
  transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined,
});

/** The box a piece sits in, and in the editor the handles on it. */
function Hold({
  part,
  piece,
  scale,
  edit,
  children,
}: {
  part: Part;
  piece: Piece;
  scale: number;
  edit?: Edit;
  children: React.ReactNode;
}) {
  const on = samePart(edit?.selected ?? null, part);
  return (
    <div
      className={styles.piece}
      style={place(piece, scale)}
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
 * gives them, and the cutlery around them — which is where the table is laid;
 * this only draws it, at `scale` to the window.
 *
 * Set down one setting after another once the cloth is lying still —
 * `arrive` — each piece of cutlery just after the plate nearest it, or
 * already there, for the faces of a turn. The cutlery under everything, then
 * the plates, then what is on them.
 *
 * With `edit`, in development only, every piece can be picked up — see
 * TableEditor.
 */
export default function TableSetting({
  laid,
  cutlery,
  scale,
  arrive = false,
  edit,
}: {
  laid: Laid[];
  cutlery: Piece[];
  scale: number;
  arrive?: boolean;
  edit?: Edit;
}) {
  /** Where each setting comes, top of the page first: in the order they are
   *  set down, and in which their pictures are fetched. */
  const rank = new Map(
    laid
      .map((s, i) => [i, s.plate.y] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([i], n) => [i, n] as const),
  );
  const set = (i: number, k: number) => ({
    className: styles.arrive,
    "data-arrive": (arrive && !edit) || undefined,
    style: { animationDelay: `${(rank.get(i) ?? i) * 160 + k * 90}ms` },
  });

  /** Whether a setting is on the first screen of the table, whose pictures
   *  are fetched straight away; the rest wait until they are scrolled near. */
  const first = (s: Laid) =>
    typeof window === "undefined" || (s.plate.y - s.plate.height / 2) * scale < window.innerHeight * 1.2;

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
    <div className={styles.table} data-editing={edit ? "" : undefined}>
      {cutlery.map((c, k) => (
        <Hold key={`ware-${k}`} part={{ part: "cutlery", i: c.source ?? k }} piece={c} scale={scale} edit={edit}>
          <div {...set(nearest(c), 2)}>
            <Drawn image={c.image} width={c.width * scale} />
          </div>
        </Hold>
      ))}

      {[...rank.keys()].map((i) => [laid[i], i] as const).map(([s, i]) => (
        <div key={`${s.id}-${i}`} className={styles.setting}>
          <Hold part={{ i, part: "plate" }} piece={s.plate} scale={scale} edit={edit}>
            <div {...set(i, 0)}>
              <Drawn image={s.plate.image} width={s.plate.width * scale} />
            </div>
          </Hold>

          <Hold part={{ i, part: "dessert" }} piece={s.dessert} scale={scale} edit={edit}>
            <div {...set(i, 1)}>
              <div className={styles.bake}>
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
    </div>
  );
}
