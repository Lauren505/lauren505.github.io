"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawCloth } from "@/components/clothPattern";
import styles from "./Tablecloth.module.css";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The bakery's tablecloth, the length of the table — `length`, in CSS pixels
 * from the top of the page, which is as long as the page is.
 *
 * Live, it is thrown onto the table: the window's worth of it the reader is
 * looking at is a WebGL cloth (see clothScene, fetched with three only when the
 * cloth is), and once that is lying still it hands over to the flat drawing
 * of the whole cloth, which is what is there to scroll down. The two are drawn
 * from the same cloth, so the hand-over changes no pixel.
 *
 * `still` is the cloth already lying there: the picture a turn carries on its
 * faces, where a second WebGL context for a moment's travel would cost more
 * than the moment is worth. A reader who has asked for less motion gets the
 * picture too, and so does a browser with no WebGL to give.
 */
export default function Tablecloth({
  still = false,
  length,
  onDown,
}: {
  still?: boolean;
  length: number;
  /** When the table can start being laid: as the cloth is settling (see
   *  SET_AT in clothScene), and at once for the picture of it. */
  onDown?: () => void;
}) {
  const flatRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const down = useRef(onDown);
  down.current = onDown;
  const len = useRef(length);
  len.current = length;

  // Only rendered once the table has been measured, so never on the server.
  const [throwing, setThrowing] = useState(() => !still && !reduced());
  const stop = useRef<() => void>(() => {});

  // The flat cloth, once there is nothing in front of it. A layout effect, so
  // it is drawn in the same frame the thrown one is taken away in.
  useLayoutEffect(() => {
    const canvas = flatRef.current;
    if (!canvas || throwing) return;
    const paint = () => drawCloth(canvas, canvas.clientWidth, len.current, 0, len.current);
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [throwing, length]);

  // Nothing to throw: it is lying there already.
  useEffect(() => {
    if (!throwing) down.current?.();
  }, [throwing]);

  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas || !throwing) return;
    // The window the reader is looking at, wherever down the table that is.
    const at = window.scrollY;
    canvas.style.top = `${at}px`;
    canvas.style.height = `${window.innerHeight}px`;

    let gone = false;
    import("@/components/clothScene")
      .then(({ layCloth }) => {
        if (gone) return;
        stop.current = layCloth(
          canvas,
          { length: len.current, at },
          () => setThrowing(false),
          () => down.current?.(),
        );
      })
      .catch(() => {
        if (!gone) setThrowing(false);
      });
    return () => {
      gone = true;
      stop.current();
      stop.current = () => {};
    };
  }, [throwing]);

  return (
    <>
      <canvas ref={flatRef} className={styles.flat} aria-hidden />
      {throwing ? <canvas ref={liveRef} className={styles.live} aria-hidden /> : null}
    </>
  );
}
