"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import SideQuestsBody from "@/components/SideQuestsBody";
import { freezePage, type Frozen } from "@/components/freezePage";
import { setTurn, setTurning } from "@/components/turnSignal";
import styles from "./PageTurn.module.css";

const SIDE = "/side-quests";
const DEG = Math.PI / 180;
const TURN_MS = 760;
/** How far the camera sits from the page, as a multiple of the turning face's
 *  width — so the convergence looks the same whatever the window's size. */
const CAMERA = 2.9;
/** How much of the turn the far face takes to come up to full strength. The
 *  page it covers is the page still being read: anything past the crease
 *  belongs to the face coming round, so it has to go, but it dissolves over a
 *  frame or two rather than being cut away the instant the tab is pressed. */
const RAMP = 0.06;
/** How much of the turn the crease — the line and the shading that gathers
 *  into it — takes to fade out at the far end of it. Everything the stage
 *  draws over the near half has to be gone by the last frame: the stage is
 *  taken down the moment the turn is over, and whatever is still painted then
 *  goes with it in one step. */
const EDGE_OUT = 0.2;
/** How far into the turn the side quests tabs start to arrive. They are full
 *  strength well before the end, so the nav the turn hands back to is the nav
 *  it was showing. */
const SUBS_AT = 0.62;
/** If a route never arrives, let go rather than leave the stage up. */
const STRAND_MS = 2500;

/** The crease at rest, in a given layout: the middle of the gap between the
 *  two labels — the words themselves, not the boxes they are laid out in. The
 *  tab that is the page is wider than the others, so a box edge is not where
 *  the reader sees the word end. */
const seam = (root: ParentNode) => {
  const a = root.querySelector("[data-turn-seam-left] span")?.getBoundingClientRect();
  const b = root.querySelector("[data-turn-seam-right] span")?.getBoundingClientRect();
  return a && b ? (a.right + b.left) / 2 : null;
};

/** Smoothstep: symmetric, and off the mark far sooner than a cubic ease, which
 *  on a click reads as the page having ignored you. */
const easeInOut = (t: number) => t * t * (3 - 2 * t);

type Phase = "idle" | "out" | "outWait" | "inWait" | "in";

/**
 * The side quests turn: the same cube as the home -> publications fold, laid on
 * its side. The crease is the vertical line between the Publications and Side
 * quests tabs, so the tab you press is already on the face coming round.
 *
 * It wraps the whole document because the near face is the live page itself,
 * rotated where it stands — a route is only laid out where it is mounted, so
 * there is nothing to copy it from. The far face is always side quests, which
 * is what makes both directions the same animation. Turning to it, it is drawn
 * fresh, as it opens; turning back, it is a picture of the live page, frozen
 * as it stands — see freezePage — rather than drawn again from the start:
 *
 *   to side quests   turn 0 -> 1, then change route behind the covered screen
 *   from side quests change route behind the covered screen, then turn 1 -> 0
 */
export default function PageTurn({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  /** Side quests as it stood when the turn back from it began. */
  const [frozen, setFrozen] = useState<Frozen | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const phase = useRef<Phase>("idle");
  const dest = useRef("/");
  const raf = useRef(0);
  const strand = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Last value of the hand-over, which only moves over the first frames of
   *  the turn, so it is written only when it has actually changed. */
  const faced = useRef(-1);
  /** The elements a frame writes to, found once per turn — see paint(). */
  const parts = useRef<Record<string, HTMLElement>>({});
  /** The live page's Side quests tab, which hands over to the stage's copy —
   *  the one tab that is on neither face. */
  const liveTab = useRef<HTMLElement | null>(null);
  /** Window width, and the crease's place in it at rest. */
  const split = useRef(0);
  /** How far the Side quests tab has to travel, and which way round — see
   *  measure(). */
  const navShift = useRef(0);
  /** The near face: everything left of the crease, hinged at the window's
   *  left edge. */
  const faceW = useRef(0);
  const viewW = useRef(1);
  const camera = useRef(1600);

  /* ---------------------------------------------------------------- paint */

  // Every animated value feeds a transform or an opacity, so a turn costs a
  // style recalculation and compositing and no layout at all.
  //
  // And each is written straight to the element it moves rather than through
  // a custom property: those inherit, so one set on the live page or on the
  // stage would invalidate the computed style of every node beneath it — the
  // whole document, or the whole of side quests — on every frame.
  const paint = useCallback((v: number) => {
    const page = pageRef.current;
    const stage = stageRef.current;
    const { face, chrome, veilNear, shadeNear, veilFar, shadeFar, edgeLine } = parts.current;
    if (!page || !stage || !face) return;

    const theta = v * 90;
    const sin = Math.sin(theta * DEG);
    const cos = Math.cos(theta * DEG);
    /** The crease: where the faces meet, and what the rest is measured from.
     *  It starts in the gap between the Publications and Side quests tabs and
     *  sweeps the near face — Home and Publications with it — away off the
     *  left of the window. */
    const edge = faceW.current * cos;
    const view = viewW.current || 1;
    /** Holds the shading — and the face coming round — off for the first
     *  sliver of the turn, so the page still looks untouched at the moment
     *  the edge appears. */
    const ramp = Math.min(1, v / RAMP);
    /** And the mirror of it at the other end: what is left of the crease. */
    const out = Math.min(1, (1 - v) / EDGE_OUT);

    // The near face, hinged along the left of the window. Pushing it back by
    // exactly the depth its near edge gained puts that edge on the camera
    // plane: it keeps its size and the crease stays at width * cos(theta),
    // while everything behind it draws smaller.
    page.style.transform =
      `perspective(${camera.current.toFixed(0)}px) ` +
      `translateZ(${(-faceW.current * sin).toFixed(2)}px) ` +
      `rotateY(${(-theta).toFixed(3)}deg)`;

    // The far face, hung from the crease at a right angle to the near one:
    // edge-on as the turn begins and square on at the end of it, so its far
    // side recedes into the window — drawn smaller — the whole way round, as
    // the near face's does. Home and Publications are printed on it, at the
    // right of its header, so they come round with it.
    face.style.transform =
      `translateX(${edge.toFixed(2)}px) perspective(${camera.current.toFixed(0)}px) ` +
      `rotateY(${(90 - theta).toFixed(3)}deg)`;
    edgeLine.style.transform = `translateX(${edge.toFixed(2)}px)`;
    if (ramp !== faced.current) {
      faced.current = ramp;
      face.style.opacity = ramp.toFixed(4);
      // Four times the face's own ramp, so the hand-over between the two Side
      // quests tabs is over while the page beneath has turned barely a degree:
      // they stand in the same place, and any longer would show them both.
      const navs = Math.min(1, ramp * 4);
      chrome.style.opacity = navs.toFixed(4);
      if (liveTab.current) liveTab.current.style.opacity = (1 - navs).toFixed(4);
    }
    // The two halves the crease divides the window into, as scale factors: the
    // shading is a window-sized gradient, and squashing one is far cheaper
    // than rasterising a differently-sized one every frame.
    const near = `scaleX(${(edge / view).toFixed(5)})`;
    const far = `scaleX(${Math.max(0, (view - edge) / view).toFixed(5)})`;
    veilNear.style.transform = shadeNear.style.transform = near;
    veilFar.style.transform = shadeFar.style.transform = far;

    // The near face turns away into the light, so it only darkens into the
    // crease; the far one starts in shadow and lifts out of it.
    // Both of the near face's are spent with the crease: it is the only thing
    // they are describing, and by the last frame there is no near face left to
    // shade. The far face's own two go out with the turn already — cos and
    // sin * cos are nothing at a right angle.
    shadeNear.style.opacity = (0.13 * sin * out).toFixed(4);
    shadeFar.style.opacity = (0.36 * cos * ramp).toFixed(4);
    veilNear.style.opacity = (0.5 * sin * out).toFixed(4);
    veilFar.style.opacity = (0.7 * sin * cos * ramp).toFixed(4);
    // Up over the first frames, and out again over the last, as the crease
    // reaches the edge of the window.
    edgeLine.style.opacity = (Math.min(1, v * 9) * out).toFixed(4);
    // The Side quests tab travels by the same law as the crease, between the
    // two places the two layouts put it: just past the crease at rest, and
    // where Home stood once side quests fills the window. It starts right of
    // the crease and lands right of where the crease does, so it stays on the
    // face coming round the whole way.
    chrome.style.transform = `translateX(${(navShift.current * cos).toFixed(2)}px)`;
    // And the sections it is carrying, which only make sense once it is nearly
    // there: at the start of the turn it is still standing at the right of the
    // window, and they would reach off the edge of it.
    // Set on the copy of the nav, the only thing beneath it that reads it.
    chrome.style.setProperty("--nav-subs", Math.max(0, Math.min(1, (v - SUBS_AT) / 0.3)).toFixed(4));
  }, []);

  /** Where the crease sits, and where the axis it turns about runs. */
  const measure = useCallback(() => {
    const page = pageRef.current;
    const stage = stageRef.current;
    if (!page || !stage) return;

    const part = (name: string) => stage.querySelector<HTMLElement>(`:scope > [data-part="${name}"]`)!;
    parts.current = Object.fromEntries(
      ["face", "chrome", "veilNear", "shadeNear", "veilFar", "shadeFar", "edgeLine"].map((n) => [n, part(n)]),
    );
    // The route may have changed since the last measure, and its nav with it.
    if (liveTab.current) liveTab.current.style.opacity = "";
    liveTab.current = page.querySelector<HTMLElement>("header [data-turn-seam-right]");
    faced.current = -1;

    // Read with the rotation off: every rect below would otherwise come back
    // projected. paint() puts it straight back before the frame is drawn.
    page.style.transform = "";

    viewW.current = window.innerWidth;
    // The crease halves the gap between the two tabs, rather than sitting
    // against either of them: it is the line those two words are written
    // either side of.
    split.current = seam(page) ?? viewW.current;
    faceW.current = Math.max(1, split.current);
    camera.current = Math.max(1200, faceW.current * CAMERA);

    // Where the Side quests tab is going. The stage's copy is drawn as side
    // quests draws it and the live one as the page being left draws it, so the
    // distance between the two is the whole of the journey, whichever way
    // round the turn is going — and nothing, where the window is too narrow
    // for the tab to move. Read with the carriage at rest, for the same reason
    // the rotation is cleared above.
    parts.current.chrome.style.transform = "";
    const from = liveTab.current?.querySelector("span")?.getBoundingClientRect().left;
    const to = parts.current.chrome
      .querySelector("[data-turn-seam-right] span")
      ?.getBoundingClientRect().left;
    navShift.current = from !== undefined && to !== undefined ? from - to : 0;

    // The axis runs down the left of the window, through its middle: the page
    // is document-tall, so the vanishing point has to be carried down to
    // wherever the reader is.
    const top = page.getBoundingClientRect().top + window.scrollY;
    page.style.transformOrigin = `0px ${(window.scrollY + window.innerHeight / 2 - top).toFixed(2)}px`;
    page.style.willChange = "transform";
  }, []);

  /* ------------------------------------------------------------ lifecycle */

  const finish = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    clearTimeout(strand.current);
    const page = pageRef.current;
    if (page) {
      page.style.transform = "";
      page.style.transformOrigin = "";
      page.style.willChange = "";
    }
    if (liveTab.current) liveTab.current.style.opacity = "";
    liveTab.current = null;
    faced.current = -1;
    phase.current = "idle";
    setTurning(false);
    setActive(false);
    setFrozen(null);
  }, []);

  const run = useCallback(
    (from: number, to: number, done: () => void) => {
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / TURN_MS);
        paint(from + (to - from) * easeInOut(t));
        if (t < 1) {
          raf.current = requestAnimationFrame(step);
          return;
        }
        raf.current = 0;
        done();
      };
      raf.current = requestAnimationFrame(step);
    },
    [paint],
  );

  /** Hand over once the screen is covered: at a full turn the near face is
   *  edge-on and the far one fills the window, so the route can change
   *  underneath without anything to see. */
  const handOver = useCallback(
    (next: Phase) => {
      phase.current = next;
      strand.current = setTimeout(finish, STRAND_MS);
      router.push(dest.current);
    },
    [finish, router],
  );

  const start = useCallback((href: string) => {
    dest.current = href;
    setTurning(true);
    if (href === SIDE) {
      phase.current = "out";
      setActive(true);
      return;
    }
    // Leaving side quests: the face is the page as it is, nav and all, so it
    // is taken on the next frame, once a scene that draws every frame has
    // drawn — see freezePage.
    phase.current = "inWait";
    const page = pageRef.current;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setFrozen(page ? freezePage(page) : null);
      setActive(true);
    });
  }, []);

  // The stage is mounted: measure both layouts and put the first frame up
  // before the browser draws one.
  useLayoutEffect(() => {
    if (!active) return;
    if (frozen) {
      stageRef.current?.querySelector(':scope > [data-part="face"]')?.appendChild(frozen.node);
      frozen.hold();
    }
    measure();

    if (phase.current === "out") {
      paint(0);
      run(0, 1, () => handOver("outWait"));
      return;
    }
    // Turning back. The far face is the page already on screen, so covering
    // the window with it changes nothing the reader can see; the route is
    // swapped behind it and the turn plays from there.
    paint(1);
    handOver("inWait");
  }, [active, frozen, measure, paint, run, handOver]);

  // The route has landed. Either the turn is over, or this is where it starts.
  useLayoutEffect(() => {
    const at = phase.current;
    if (at !== "outWait" && at !== "inWait") return;
    // Somewhere else entirely — a back button, say. Let go.
    if (pathname !== dest.current) {
      finish();
      return;
    }
    clearTimeout(strand.current);
    if (at === "outWait") {
      finish();
      return;
    }
    phase.current = "in";
    // A new page, landed at the top of itself: the crease and the axis both
    // have to be found again.
    measure();
    paint(1);
    run(1, 0, finish);
  }, [pathname, finish, measure, paint, run]);

  /* --------------------------------------------------------------- inputs */

  useEffect(() => {
    setTurn(start);
    return () => setTurn(null);
  }, [start]);

  useEffect(() => {
    if (pathname === SIDE) {
      router.prefetch("/");
      router.prefetch("/publications");
      return;
    }
    router.prefetch(SIDE);
  }, [router, pathname]);

  // The page underneath is a face of a turning cube for the length of the
  // turn, so it is not a page to scroll.
  useEffect(() => {
    if (!active) return;
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener("wheel", swallow, { passive: false });
    window.addEventListener("touchmove", swallow, { passive: false });
    return () => {
      window.removeEventListener("wheel", swallow);
      window.removeEventListener("touchmove", swallow);
    };
  }, [active]);

  useEffect(() => () => clearTimeout(strand.current), []);

  /* --------------------------------------------------------------- render */

  return (
    <>
      <div ref={pageRef} className={styles.page} inert={active || undefined}>
        {children}
      </div>

      {active ? (
        <div ref={stageRef} className={styles.stage} aria-hidden>
          <div className={styles.face} data-part="face" inert>
            {/* Empty when it is the frozen page, which goes in by hand. Either
                way it carries its own nav, Home and Publications at the right
                of it — see .face in the CSS for the tab that does not ride
                on it. */}
            {frozen ? null : (
              <>
                <Nav current={SIDE} />
                <SideQuestsBody still arriving />
              </>
            )}
          </div>

          {/* Over the window, not over the faces — see .tint. */}
          <span className={`${styles.near} ${styles.veilNear}`} data-part="veilNear" />
          <span className={`${styles.near} ${styles.shadeNear}`} data-part="shadeNear" />
          <span className={`${styles.far} ${styles.veilFar}`} data-part="veilFar" />
          <span className={`${styles.far} ${styles.shadeFar}`} data-part="shadeFar" />

          <span className={styles.edge} data-part="edgeLine" />

          {/* Above the shading and outside both faces — see .chrome. */}
          <div className={styles.chrome} data-part="chrome" inert>
            <Nav current={SIDE} />
          </div>
        </div>
      ) : null}
    </>
  );
}
