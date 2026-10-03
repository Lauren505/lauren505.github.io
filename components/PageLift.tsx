"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ChargeLine from "@/components/ChargeLine";
import { requestRollUp } from "@/components/foldSignal";
import { isTurning } from "@/components/turnSignal";
import foldStyles from "./PageFold.module.css";
import styles from "./PageLift.module.css";

type Props = { href: string; label: string };

/** Travel absorbed before the pull counts — what keeps the momentum of a fast
 *  scroll back to the top from tripping the turn. */
const DEADZONE = 80;
/** Higher is stiffer. Matched to the fold's, so charging the line takes the
 *  same length of scroll whichever way the cube is about to turn. */
const RESIST = 1400;
/** Pull past which the turn takes over. */
const COMMIT = 0.34;
/** Quiet time after the last event before an unspent charge drains. Long
 *  enough to bridge the gap between two flicks of a wheel, since the line now
 *  takes more scroll than one flick gives it. */
const RELEASE_MS = 450;
/** Time constant of the handle's fill, in milliseconds rather than in frames,
 *  so the feel does not change with the refresh rate. */
const FILL_TAU = 55;
const TOP_SLOP = 2;
/** Long enough for an arrival to land before the way back is offered. */
const SETTLE_MS = 700;

/**
 * Pulling up at the top of the publications page turns the cube back to the
 * home page — the same gesture as pulling down at the foot of the home page,
 * in reverse.
 *
 * The turn itself cannot run here: it is laid out against the home page, which
 * only the home route has. So this measures the pull and, once it is spent,
 * hands over through `foldSignal` — the home route plays the turn backwards on
 * arrival. What the pull drives in the meantime is the handle, not the
 * rotation.
 */
export default function PageLift({ href, label }: Props) {
  const router = useRouter();
  const [atTop, setAtTop] = useState(false);
  const [ready, setReady] = useState(false);

  const handleRef = useRef<HTMLButtonElement>(null);
  const pull = useRef(0);
  const shown = useRef(0);
  const raf = useRef(0);
  const ticked = useRef(0);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gone = useRef(false);
  const reduced = useRef(false);
  const touchY = useRef(0);

  const paint = useCallback((v: number) => {
    handleRef.current?.style.setProperty("--pull", v.toFixed(3));
  }, []);

  const ease = useCallback(() => {
    raf.current = 0;
    const now = performance.now();
    const dt = Math.min(64, now - ticked.current);
    ticked.current = now;

    const target = Math.min(1, Math.max(0, pull.current - DEADZONE) / RESIST / COMMIT);
    const diff = target - shown.current;
    if (Math.abs(diff) < 0.002) {
      shown.current = target;
      paint(target);
      return;
    }
    shown.current += diff * (1 - Math.exp(-dt / FILL_TAU));
    paint(shown.current);
    raf.current = requestAnimationFrame(ease);
  }, [paint]);

  const kick = useCallback(() => {
    if (raf.current) return;
    ticked.current = performance.now();
    raf.current = requestAnimationFrame(ease);
  }, [ease]);

  const go = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    paint(1);
    requestRollUp();
    router.push(href);
  }, [paint, router, href]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduced.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    router.prefetch(href);
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [router, href]);

  useEffect(() => {
    const isTop = () => window.scrollY <= TOP_SLOP;

    const slacken = () => {
      clearTimeout(release.current);
      release.current = setTimeout(() => {
        pull.current = 0;
        kick();
      }, RELEASE_MS);
    };

    const advance = (delta: number) => {
      pull.current = Math.max(0, pull.current + delta);
      const v = 1 - Math.exp(-Math.max(0, pull.current - DEADZONE) / RESIST);
      if (v >= COMMIT) {
        go();
        return;
      }
      kick();
      slacken();
    };

    const onScroll = () => {
      setAtTop(isTop());
      if (!isTop()) {
        pull.current = 0;
        kick();
      }
    };

    const onWheel = (e: WheelEvent) => {
      // The sideways turn is holding the window; this pull is not the gesture
      // it belongs to.
      if (reduced.current || gone.current || isTurning()) return;
      if (e.deltaY >= 0) {
        // Any downward intent spends the pull rather than banking it.
        pull.current = 0;
        kick();
        return;
      }
      if (!isTop()) return;
      e.preventDefault();
      advance(-e.deltaY);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (reduced.current || gone.current || isTurning()) return;
      const y = e.touches[0].clientY;
      const delta = touchY.current - y;
      touchY.current = y;
      if (delta >= 0 || !isTop()) return;
      e.preventDefault();
      advance(-delta);
    };

    const onTouchEnd = () => slacken();

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(release.current);
    };
  }, [kick, go]);

  const onClick = useCallback(() => {
    if (reduced.current) {
      router.push(href);
      return;
    }
    go();
  }, [go, router, href]);

  // Only once the page is back at its top: until then there is nothing to pull
  // against, and the line would be promising a gesture that does nothing.
  return (
    <button
      ref={handleRef}
      type="button"
      className={styles.lift}
      data-show={(atTop && ready) || undefined}
      onClick={onClick}
    >
      <ChargeLine up />
      <span className={foldStyles.handleLabel}>{label}</span>
    </button>
  );
}
