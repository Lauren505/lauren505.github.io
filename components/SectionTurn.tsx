"use client";

import { useLayoutEffect, useRef } from "react";
import { DEG, TILT, TURN_MS, cameraFor, easeInOut } from "@/components/cube";
import styles from "./SectionTurn.module.css";


type Props = {
  /** The section being left and the one being opened, each drawn still. */
  from: React.ReactNode;
  to: React.ReactNode;
  /** Towards a later section, which rolls up as home does into publications;
   *  back towards an earlier one, which rolls down again. */
  up: boolean;
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
export default function SectionTurn({ from, to, up, onDone }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const part = (name: string) => stage.querySelector<HTMLElement>(`:scope > [data-part="${name}"]`)!;
    const [top, bottom, veilTop, shadeTop, veilBottom, shadeBottom, edgeLine] = [
      "top", "bottom", "veilTop", "shadeTop", "veilBottom", "shadeBottom", "edge",
    ].map(part);

    // The page's column starts below the nav, so each face is pushed down by
    // exactly as much; the nav itself is not on either face.
    const offset = stage.parentElement?.getBoundingClientRect().top ?? 0;
    const view = window.innerHeight || 1;
    stage.style.setProperty("--st-top", `${offset.toFixed(2)}px`);
    const camera = `perspective(${cameraFor(view).toFixed(0)}px)`;

    // Every frame is written straight to the handful of elements that move,
    // never as custom properties on the stage: those inherit, so setting one
    // there would restyle both sections, every node of them, on every frame.
    const paint = (v: number) => {
      const theta = v * 90;
      const sin = Math.sin(theta * DEG);
      const cos = Math.cos(theta * DEG);
      const edge = view * cos;
      const ramp = Math.min(1, v / 0.05);
      // Out over the last of the turn, so no line is left behind at the top.
      const out = Math.min(1, (1 - v) / 0.2);

      top.style.transform =
        `${camera} translateZ(${(-view * sin).toFixed(2)}px) rotateX(${theta.toFixed(3)}deg)`;
      bottom.style.transform =
        `translateY(${edge.toFixed(2)}px) ${camera} rotateX(${(-TILT * 2 * sin * cos).toFixed(3)}deg)`;
      const above = `scaleY(${(edge / view).toFixed(5)})`;
      const below = `scaleY(${Math.max(0, (view - edge) / view).toFixed(5)})`;
      veilTop.style.transform = shadeTop.style.transform = above;
      veilBottom.style.transform = shadeBottom.style.transform = below;
      shadeTop.style.opacity = (0.13 * sin).toFixed(4);
      shadeBottom.style.opacity = (0.36 * cos * ramp).toFixed(4);
      veilTop.style.opacity = (0.5 * sin).toFixed(4);
      veilBottom.style.opacity = (0.7 * sin * cos * ramp).toFixed(4);
      edgeLine.style.transform = `translateY(${edge.toFixed(2)}px)`;
      edgeLine.style.opacity = (Math.min(1, v * 9) * out).toFixed(4);
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

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden inert>
      <div className={styles.top} data-part="top">
        <div className={styles.inner}>{up ? from : to}</div>
      </div>
      <div className={styles.bottom} data-part="bottom">
        <div className={styles.inner}>{up ? to : from}</div>
      </div>

      <span className={`${styles.shadeAbove} ${styles.veilTop}`} data-part="veilTop" />
      <span className={`${styles.shadeAbove} ${styles.shadeTop}`} data-part="shadeTop" />
      <span className={`${styles.shadeBelow} ${styles.veilBottom}`} data-part="veilBottom" />
      <span className={`${styles.shadeBelow} ${styles.shadeBottom}`} data-part="shadeBottom" />
      <span className={styles.edge} data-part="edge" />
    </div>
  );
}
