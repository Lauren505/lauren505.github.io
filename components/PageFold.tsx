"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ChargeLine from "@/components/ChargeLine";
import Nav from "@/components/Nav";
import { clearRollUp, pendingRollUp, setRollDown } from "@/components/foldSignal";
import { isTurning } from "@/components/turnSignal";
import styles from "./PageFold.module.css";

type Props = {
  /** About + News — the face that folds away. */
  above: React.ReactNode;
  /** The block below the edge, which rearranges as the fold turns. */
  below: React.ReactNode;
  href: string;
  label: string;
};

const DEG = Math.PI / 180;
/** Travel absorbed before anything moves — the catch you feel first, and what
 *  keeps momentum at the bottom of the page from tripping the fold. */
const DEADZONE = 90;
/** Higher is stiffer, and the line takes longer to fill. With DEADZONE and
 *  COMMIT this comes to about 670px of scroll to charge it from end to end. */
const RESIST = 1400;
/** Pull past which the line is full and the turn takes over. */
const COMMIT = 0.34;
/** Quiet time after the last event before an unspent charge drains. Long
 *  enough to bridge the gap between two flicks of a wheel, since the line now
 *  takes more scroll than one flick gives it. */
const RELEASE_MS = 450;
const COMMIT_MS = 760;
/** Time constant of the line's fill. In milliseconds rather than in frames, so
 *  the feel does not change with the refresh rate. */
const FILL_TAU = 55;
/** Fraction of the turn the flying elements take to reach their slots. */
const FLIGHT = 0.88;
const BOTTOM_SLOP = 2;
/** How far the camera sits from the page, as a multiple of the folding face's
 *  height — so the convergence looks the same whatever the face's size. */
const CAMERA = 2.9;
/** How far the lower face tips away from the reader at the middle of the turn,
 *  in degrees. Nothing at either end, where it has a real page to match. */
const TILT = 11;

/** Type size of an element, read off its first child when it has one — a tag
 *  group's size lives on the tags, not on the box around them. */
const fontSize = (el: HTMLElement) => {
  const probe = (el.firstElementChild as HTMLElement | null) ?? el;
  return parseFloat(getComputedStyle(probe).fontSize) || 1;
};

const typeScale = (from: HTMLElement, to: HTMLElement) => fontSize(to) / fontSize(from);

/** How much an ancestor is already scaling this element — the rows shrink
 *  their inactive entries, which the type size alone doesn't show. */
const boxScale = (el: HTMLElement, rect: DOMRect) =>
  el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;

/** Smoothstep. A cubic ease-in-out spends its first hundred milliseconds
 *  barely moving, which on a click reads as the page having ignored you; this
 *  is symmetric and just as smooth at both ends but leaves the mark far
 *  sooner. */
const easeInOut = (t: number) => t * t * (3 - 2 * t);

export default function PageFold({ above, below, href, label }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);

  const activeRef = useRef(false);
  const committedRef = useRef(false);
  const reducedRef = useRef(false);

  /** Distance from the top of the viewport to the fold's edge at rest. */
  const split = useRef(0);
  const viewH = useRef(0);
  const shown = useRef(0);
  const pull = useRef(0);
  const raf = useRef(0);
  /** The line's fill and where it is heading, on their own spring: the turn no
   *  longer follows the scroll, so this is the only thing the gesture moves
   *  until it is spent. */
  const fill = useRef(0);
  const fillTo = useRef(0);
  const fillRaf = useRef(0);
  const ticked = useRef(0);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchY = useRef(0);
  const anchorY = useRef(0);

  /* ---------------------------------------------------------------- paint */

  // Every animated value is a custom property, so a whole turn never re-renders
  // React — and none of them can trigger layout. Each one feeds a transform or
  // an opacity, which is work the compositor can do on its own; a length that
  // something has to be laid out against would cost a reflow of the face on
  // every frame, and the faces hold most of the page.
  const paint = useCallback((v: number) => {
    const stage = stageRef.current;
    const face = faceRef.current;
    if (!stage || !face) return;

    const theta = v * 90;
    const sin = Math.sin(theta * DEG);
    const cos = Math.cos(theta * DEG);
    /** The crease: where the faces meet, and what the rest is measured from. */
    const edge = split.current * cos;
    const view = viewH.current || 1;
    /** Holds the shading off for the first sliver of the turn, so the page
     *  still looks untouched at the moment the edge appears. */
    const ramp = Math.min(1, v / 0.05);
    const set = (name: string, value: string) => stage.style.setProperty(name, value);

    // --- the turn
    set("--fold-theta", `${theta}deg`);
    set("--fold-edge-y", `${edge.toFixed(2)}px`);
    // The two regions the crease divides the window into, as scale factors:
    // the shading is a window-sized gradient and squashing one is far cheaper
    // than rasterising a differently-sized one every frame.
    set("--fold-above-s", `${(edge / view).toFixed(5)}`);
    set("--fold-below-s", `${Math.max(0, (view - edge) / view).toFixed(5)}`);

    // --- the camera
    // Pushing the upper face back by exactly the depth its near edge gained
    // puts that edge on the camera plane: it keeps its size and the crease
    // stays at height * cos(theta), while everything behind it draws smaller.
    // The whole fold hangs off the crease, so this is what lets a perspective
    // camera in without moving anything.
    set("--fold-top-z", `${(-split.current * sin).toFixed(2)}px`);
    // The lower face leans away from the same edge, deepest side-on.
    set("--fold-tilt", `${(-TILT * 2 * sin * cos).toFixed(3)}deg`);

    // --- depth
    // The upper face turns up into the light, so it only darkens into the
    // crease; the lower one starts in shadow and lifts out of it.
    set("--fold-shade-top", `${(0.13 * sin).toFixed(4)}`);
    set("--fold-shade-bottom", `${(0.36 * cos * ramp).toFixed(4)}`);
    // Haze. The edge is the near corner and each face falls away from it, so
    // the far end — over the top of the screen, or past the foot of it — is
    // the one that loses itself. The upper face deepens the whole way round;
    // the lower one is deepest side-on and clean at both ends, where it has a
    // real page to match.
    set("--fold-veil-top", `${(0.5 * sin).toFixed(4)}`);
    set("--fold-veil-bottom", `${(0.7 * sin * cos * ramp).toFixed(4)}`);
    set("--fold-edge", `${Math.min(1, v * 9).toFixed(4)}`);

    // --- progress
    // On the lower face rather than on the stage: everything that reads it
    // lives there, and an inherited custom property invalidates the computed
    // style of every element beneath wherever it is set — from the stage that
    // would include the home page's copy, for nothing.
    //
    // The flight finishes a little before the turn does, so a flying element
    // hands over to the real one while the two sit on top of each other
    // rather than a jump apart.
    face.style.setProperty("--fold-q", `${Math.min(1, v / FLIGHT).toFixed(4)}`);
    face.style.setProperty("--fold-p", `${v.toFixed(4)}`);
  }, []);

  /** Where the edge sits, and how far the frozen copy has to be shifted. */
  const measureFrame = useCallback(() => {
    const root = rootRef.current;
    const anchor = anchorRef.current;
    if (!root || !anchor) return;
    const flow = root.querySelector<HTMLElement>("[data-fold-flow]");
    const panelTop = anchor.getBoundingClientRect().top;
    viewH.current = window.innerHeight;

    // The edge halves the gap between the last line above it and the first
    // line below it, rather than sitting on the boundary between the two
    // blocks — which is right against the line above and a whole heading
    // margin clear of the one below.
    const lastAbove = flow?.querySelector<HTMLElement>("[data-fold-seam-above]");
    const firstBelow = flow?.querySelector<HTMLElement>("[data-fold-seam-below]");
    const seam =
      lastAbove && firstBelow
        ? (lastAbove.getBoundingClientRect().bottom + firstBelow.getBoundingClientRect().top) / 2
        : panelTop;

    split.current = Math.max(0, seam);
    // The block below is drawn from the edge down, so it has to be pulled back
    // up by however far the edge moved past its top. On a narrow window the
    // block is taller than the screen and its top has already scrolled off,
    // which this same shift covers. Either way it eases to 0 by the end.
    const offset = Math.min(0, panelTop - split.current);

    // Where the block has to sit once the face is square on: clear of the nav,
    // which is exactly where the publications page puts it.
    const header = document.querySelector("header");
    const land = header ? header.getBoundingClientRect().height : 0;

    root.style.setProperty("--fold-split", `${split.current.toFixed(2)}px`);
    root.style.setProperty("--fold-offset", `${offset.toFixed(2)}px`);
    root.style.setProperty("--fold-land", `${land.toFixed(2)}px`);
    root.style.setProperty("--fold-camera", `${Math.max(1200, split.current * CAMERA).toFixed(0)}px`);
    // The face above carries a copy of the page from its very top, nav
    // included, so it only has to be shifted by the scroll.
    root.style.setProperty("--fold-scroll", `${(-window.scrollY).toFixed(2)}px`);
  }, []);

  /* ------------------------------------------------------------ lifecycle */

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const deactivate = useCallback(() => {
    stop();
    clearTimeout(release.current);
    activeRef.current = false;
    committedRef.current = false;
    pull.current = 0;
    shown.current = 0;
    setActive(false);
  }, [stop]);

  /** The turn, played backwards: publications square on, rolling back down to
   *  the home page at the point the forward turn would have left it. */
  const rewind = useCallback(() => {
    committedRef.current = true;
    const t0 = performance.now();
    const run = () => {
      const t = Math.min(1, (performance.now() - t0) / COMMIT_MS);
      shown.current = 1 - easeInOut(t);
      paint(shown.current);
      if (t < 1) {
        raf.current = requestAnimationFrame(run);
        return;
      }
      raf.current = 0;
      deactivate();
    };
    raf.current = requestAnimationFrame(run);
  }, [paint, deactivate]);

  const rewinding = useRef(false);

  const wasActive = useRef(false);
  useLayoutEffect(() => {
    if (!active) {
      if (wasActive.current) window.scrollTo({ top: anchorY.current, behavior: "instant" });
      wasActive.current = false;
      return;
    }
    wasActive.current = true;

    // Pair every flying element with its landing slot and bank the deltas, now
    // that the stage is mounted and both layouts have real geometry.
    //
    // Measured in one pass and written in another. Interleaving them would
    // make each write invalidate the layout the next read needs, so the
    // browser would lay the whole stage out again for every element.
    const stage = stageRef.current;
    if (!stage) return;

    const flights = [...stage.querySelectorAll<HTMLElement>("[data-flip]")].flatMap((el) => {
      const slot = stage.querySelector<HTMLElement>(`[data-flip-to="${el.dataset.flip}"]`);
      if (!slot) return [];
      const from = el.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      // Text gets one uniform scale off the type size. Scaling a text block by
      // its box would stretch the letters, since the two versions wrap at
      // different widths.
      const scale =
        el.dataset.flipMode === "text"
          ? typeScale(el, slot) * (boxScale(slot, to) / boxScale(el, from))
          : null;
      return [{ el, from, to, scale }];
    });

    // The heading has to know how wide "Selected " is before the rest of it
    // can slide over the word. It goes on the heading, not on the word: the
    // two are siblings, and a custom property only reaches descendants.
    const words = [...stage.querySelectorAll<HTMLElement>("[data-fold-word]")].map((el) => ({
      host: el.parentElement ?? el,
      width: el.getBoundingClientRect().width,
    }));

    for (const { el, from, to, scale } of flights) {
      el.style.setProperty("--dx", `${(to.left - from.left).toFixed(2)}px`);
      el.style.setProperty("--dy", `${(to.top - from.top).toFixed(2)}px`);
      if (scale !== null) {
        el.style.setProperty("--sx", `${scale.toFixed(5)}`);
        el.style.setProperty("--sy", `${scale.toFixed(5)}`);
      } else if (from.width > 0 && from.height > 0) {
        el.style.setProperty("--sx", `${(to.width / from.width).toFixed(5)}`);
        el.style.setProperty("--sy", `${(to.height / from.height).toFixed(5)}`);
      }
    }
    for (const { host, width } of words) {
      host.style.setProperty("--word-w", `${width.toFixed(2)}px`);
    }
    paint(shown.current);

    // Painted square on before the browser has drawn a frame; now unwind.
    if (rewinding.current) {
      rewinding.current = false;
      clearRollUp();
      rewind();
    }
  }, [active, paint, rewind]);

  /** The line, following the pull. Nothing else moves until it is full. */
  const paintFill = useCallback((v: number) => {
    handleRef.current?.style.setProperty("--pull", v.toFixed(3));
  }, []);

  const easeFill = useCallback(() => {
    fillRaf.current = 0;
    const now = performance.now();
    // Capped, so a dropped frame or a backgrounded tab does not jump the fill.
    const dt = Math.min(64, now - ticked.current);
    ticked.current = now;

    const diff = fillTo.current - fill.current;
    if (Math.abs(diff) < 0.002) {
      fill.current = fillTo.current;
      paintFill(fill.current);
      return;
    }
    fill.current += diff * (1 - Math.exp(-dt / FILL_TAU));
    paintFill(fill.current);
    fillRaf.current = requestAnimationFrame(easeFill);
  }, [paintFill]);

  /** Starts the fill's spring if it is not already running. */
  const kick = useCallback(() => {
    if (fillRaf.current) return;
    ticked.current = performance.now();
    fillRaf.current = requestAnimationFrame(easeFill);
  }, [easeFill]);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    stop();
    clearTimeout(release.current);

    const from = shown.current;
    const span = Math.max(1 - from, 0.0001);
    const t0 = performance.now();
    // The remainder keeps the original pace, so committing late doesn't replay
    // the whole turn.
    const dur = COMMIT_MS * span;

    const run = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      shown.current = from + span * easeInOut(t);
      paint(shown.current);
      if (t < 1) {
        raf.current = requestAnimationFrame(run);
        return;
      }
      raf.current = 0;
      router.push(href);
    };
    raf.current = requestAnimationFrame(run);
  }, [paint, stop, router, href]);

  const scheduleRelease = useCallback(() => {
    clearTimeout(release.current);
    release.current = setTimeout(() => {
      if (committedRef.current) return;
      pull.current = 0;
      fillTo.current = 0;
      kick();
    }, RELEASE_MS);
  }, [kick]);

  const begin = useCallback((at = 0) => {
    anchorY.current = window.scrollY;
    measureFrame();
    activeRef.current = true;
    pull.current = 0;
    shown.current = at;
    setActive(true);
  }, [measureFrame]);

  /** The line is full: put the turn up and play it through. Two frames of
   *  grace so the stage paints its zero state before the rotation starts —
   *  otherwise the turn begins mid-way. */
  const fire = useCallback(() => {
    if (committedRef.current) return;
    clearTimeout(release.current);
    if (fillRaf.current) cancelAnimationFrame(fillRaf.current);
    fillRaf.current = 0;
    fill.current = 1;
    fillTo.current = 1;
    paintFill(1);
    if (!activeRef.current) begin();
    requestAnimationFrame(() => requestAnimationFrame(commit));
  }, [begin, commit, paintFill]);

  const advance = useCallback(
    (delta: number) => {
      pull.current = Math.max(0, pull.current + delta);
      // Diminishing returns: the further you pull, the more it costs — so the
      // line's last tenth asks for more scroll than its first.
      const v = 1 - Math.exp(-Math.max(0, pull.current - DEADZONE) / RESIST);
      if (v >= COMMIT) {
        fire();
        return;
      }
      fillTo.current = v / COMMIT;
      kick();
      scheduleRelease();
    },
    [fire, kick, scheduleRelease],
  );

  /* --------------------------------------------------------------- inputs */

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  // Arriving from the publications page: the nav left a note. Play the turn
  // backwards and leave the reader at the top of the home page, which is where
  // arriving at a page should put them. This runs before paint, so the first
  // frame drawn is the publications face square on, not the home page.
  useLayoutEffect(() => {
    if (!pendingRollUp()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearRollUp();
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    rewinding.current = true;
    begin(1);
  }, [begin]);

  useEffect(() => {
    const isBottom = () =>
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - BOTTOM_SLOP;

    const drain = () => {
      if (pull.current <= 0 && fillTo.current <= 0) return;
      pull.current = 0;
      fillTo.current = 0;
      kick();
    };

    const onWheel = (e: WheelEvent) => {
      // The sideways turn is holding the window; this fold is not the gesture
      // it belongs to.
      if (reducedRef.current || isTurning()) return;
      if (committedRef.current) {
        e.preventDefault();
        return;
      }
      // Any upward intent spends the charge rather than banking it, and is
      // handed back to the page: nothing is being held while the line fills.
      if (e.deltaY <= 0) {
        drain();
        return;
      }
      if (!isBottom()) return;
      e.preventDefault();
      advance(e.deltaY);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (reducedRef.current || isTurning()) return;
      const y = e.touches[0].clientY;
      const delta = touchY.current - y;
      touchY.current = y;
      if (committedRef.current) {
        e.preventDefault();
        return;
      }
      if (delta <= 0) {
        drain();
        return;
      }
      if (!isBottom()) return;
      e.preventDefault();
      advance(delta);
    };

    const onTouchEnd = () => {
      if (!committedRef.current) scheduleRelease();
    };

    const onResize = () => {
      if (activeRef.current) measureFrame();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      stop();
      clearTimeout(release.current);
    };
  }, [advance, kick, measureFrame, scheduleRelease, stop]);

  const onHandle = useCallback(() => {
    if (reducedRef.current) {
      router.push(href);
      return;
    }
    fire();
  }, [fire, router, href]);

  // The nav is on the other side of the route boundary, so it reaches the
  // fold through the signal module rather than a prop.
  useEffect(() => {
    setRollDown(onHandle);
    return () => setRollDown(null);
  }, [onHandle]);

  /* --------------------------------------------------------------- render */

  return (
    <div ref={rootRef} className={styles.root}>
      <div data-fold-flow>
        {above}
        <div ref={anchorRef}>{below}</div>
      </div>

      {active ? (
        <div ref={stageRef} className={styles.stage} data-fold-active aria-hidden>
          {/* About + News: hinged along the top of the viewport, so with no
              perspective in play it projects to exactly height * cos(theta). */}
          <div className={styles.top}>
            {/* A copy of the page from its very top, so the nav folds away
                with the face it belongs to instead of blinking out. */}
            <div className={styles.topInner} inert>
              <Nav current="/" />
              {above}
            </div>
          </div>

          {/* The other face, pinned to the edge and flat, rearranging as it
              comes out of shadow. */}
          <div ref={faceRef} className={styles.bottom}>
            <div className={styles.bottomInner} inert>
              {below}
            </div>
            {/* The destination's nav, printed on this face: it rides up with
                the edge and is only fully there once the face is. */}
            <div className={styles.bottomNav} inert>
              <Nav current={href} />
            </div>
          </div>

          {/* Over the window, not over the faces — see .shade. */}
          <span className={`${styles.shadeAbove} ${styles.veilTop}`} />
          <span className={`${styles.shadeAbove} ${styles.shadeTop}`} />
          <span className={`${styles.shadeBelow} ${styles.veilBottom}`} />
          <span className={`${styles.shadeBelow} ${styles.shadeBottom}`} />

          <span className={styles.edge} />
        </div>
      ) : null}

      {/* Always on the page: it is the foot of the home page rather than
          something the foot of the page reveals. */}
      <button
        ref={handleRef}
        type="button"
        className={styles.handle}
        data-show
        onClick={onHandle}
      >
        <span className={styles.handleLabel}>{label}</span>
        <ChargeLine />
      </button>
    </div>
  );
}
