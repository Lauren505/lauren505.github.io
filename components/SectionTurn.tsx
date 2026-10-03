"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./SectionTurn.module.css";

const DEG = Math.PI / 180;
const TURN_MS = 760;
/** As in the fold: the camera's distance as a multiple of the turning face. */
const CAMERA = 2.9;
/** How far the face coming round tips away mid-turn, in degrees. */
const TILT = 11;

/** Smoothstep, as the other two turns use. */
const easeInOut = (t: number) => t * t * (3 - 2 * t);

type Props = {
  /** The section being left and the one being opened, each drawn still. */
  from: React.ReactNode;
  to: React.ReactNode;
  /** Towards a later section, which rolls up as home does into publications;
   *  back towards an earlier one, which rolls down again. */
  up: boolean;
  /** How far down the section being left had been scrolled. The page goes
   *  back to its top for the turn — the section coming round starts there —
   *  so the face it leaves on is drawn from where the reader was. */
  lift?: number;
  onDone: () => void;
};

/**
 * The side quests sections, turning on the same cube as home and publications
 * — the vertical fold, with the crease starting at the foot of the window
 * rather than halfway down it, since here the whole section is the face that
 * goes.
 *
 * Rolling up, the section on screen is the top face and folds away over the
 * top of the window while the next one comes up from below. Rolling down is
 * that played backwards, with the faces the other way round. It sits under the
 * nav — see .stage — so the nav stays where it is and stays pressable.
 */
export default function SectionTurn({ from, to, up, lift = 0, onDone }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const set = (name: string, value: string) => stage.style.setProperty(name, value);

    // The page's column starts below the nav, so each face is pushed down by
    // exactly as much; the nav itself is not on either face.
    const top = stage.parentElement?.getBoundingClientRect().top ?? 0;
    const view = window.innerHeight || 1;
    set("--st-top", `${top.toFixed(2)}px`);
    set("--st-camera", `${Math.max(1200, view * CAMERA).toFixed(0)}px`);

    const paint = (v: number) => {
      const theta = v * 90;
      const sin = Math.sin(theta * DEG);
      const cos = Math.cos(theta * DEG);
      const edge = view * cos;
      const ramp = Math.min(1, v / 0.05);
      // Out over the last of the turn, so no line is left behind at the top.
      const out = Math.min(1, (1 - v) / 0.2);

      set("--st-theta", `${theta}deg`);
      set("--st-edge-y", `${edge.toFixed(2)}px`);
      set("--st-above-s", `${(edge / view).toFixed(5)}`);
      set("--st-below-s", `${Math.max(0, (view - edge) / view).toFixed(5)}`);
      set("--st-top-z", `${(-view * sin).toFixed(2)}px`);
      set("--st-tilt", `${(-TILT * 2 * sin * cos).toFixed(3)}deg`);
      set("--st-shade-top", `${(0.13 * sin).toFixed(4)}`);
      set("--st-shade-bottom", `${(0.36 * cos * ramp).toFixed(4)}`);
      set("--st-veil-top", `${(0.5 * sin).toFixed(4)}`);
      set("--st-veil-bottom", `${(0.7 * sin * cos * ramp).toFixed(4)}`);
      set("--st-edge", `${(Math.min(1, v * 9) * out).toFixed(4)}`);
    };

    const a = up ? 0 : 1;
    const b = up ? 1 : 0;
    paint(a);
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / TURN_MS);
      paint(a + (b - a) * easeInOut(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else done.current();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [up]);

  const leaving = (
    <div style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>{from}</div>
  );

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden inert>
      <div className={styles.top}>
        <div className={styles.inner}>{up ? leaving : to}</div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.inner}>{up ? to : leaving}</div>
      </div>

      <span className={`${styles.shadeAbove} ${styles.veilTop}`} />
      <span className={`${styles.shadeAbove} ${styles.shadeTop}`} />
      <span className={`${styles.shadeBelow} ${styles.veilBottom}`} />
      <span className={`${styles.shadeBelow} ${styles.shadeBottom}`} />
      <span className={styles.edge} />
    </div>
  );
}
