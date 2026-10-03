"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import SideQuestsBody from "@/components/SideQuestsBody";
import { setTurn, setTurning } from "@/components/turnSignal";
import styles from "./PageTurn.module.css";

const SIDE = "/side-quests";
const DEG = Math.PI / 180;
const TURN_MS = 760;
/** How far the camera sits from the page, as a multiple of the turning face's
 *  width — so the convergence looks the same whatever the window's size. */
const CAMERA = 2.9;
/** How far the far face tips away from the reader at the middle of the turn,
 *  in degrees. Nothing at either end, where it has a real page to match. */
const TILT = 11;
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
 * is empty and so can be drawn from anywhere; that is what makes both
 * directions the same animation:
 *
 *   to side quests   turn 0 -> 1, then change route behind the covered screen
 *   from side quests change route behind the covered screen, then turn 1 -> 0
 */
export default function PageTurn({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const phase = useRef<Phase>("idle");
  const dest = useRef("/");
  const raf = useRef(0);
  const strand = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Last value of the hand-over, which only moves over the first frames of
   *  the turn: it is set on the page, where a custom property costs the
   *  computed style of the whole document, so it is written only when it has
   *  actually changed. */
  const faced = useRef(-1);
  /** Window width, and the crease's place in it at rest. */
  const split = useRef(0);
  /** How far the row of tabs has to travel, and which way round — see the
   *  hand-over in measure(). */
  const navShift = useRef(0);
  /** Where the crease comes to rest, and how wide the near face is measured
   *  from there — see the hinge in measure(). */
  const hinge = useRef(0);
  const faceW = useRef(0);
  const viewW = useRef(1);
  const camera = useRef(1600);

  /* ---------------------------------------------------------------- paint */

  // Every animated value feeds a transform or an opacity, so a turn costs a
  // style recalculation and compositing and no layout at all.
  //
  // The near face's transform is written straight to the element rather than
  // through a custom property: it is the live page, and an inherited property
  // set there would invalidate the computed style of every node in the
  // document on every frame.
  const paint = useCallback((v: number) => {
    const page = pageRef.current;
    const stage = stageRef.current;
    if (!page || !stage) return;

    const theta = v * 90;
    const sin = Math.sin(theta * DEG);
    const cos = Math.cos(theta * DEG);
    /** The crease: where the faces meet, and what the rest is measured from.
     *  It runs through the gap between the Publications and Side quests tabs,
     *  and the row of tabs is on its way to the left margin, so the crease goes
     *  with it — it comes to rest in that same gap rather than at the edge of
     *  the window. See the hinge in measure(); when the row is not travelling
     *  the hinge is 0 and this is the plain sweep across the window. */
    const edge = hinge.current + faceW.current * cos;
    const view = viewW.current || 1;
    /** Holds the shading — and the face coming round — off for the first
     *  sliver of the turn, so the page still looks untouched at the moment
     *  the edge appears. */
    const ramp = Math.min(1, v / RAMP);
    /** And the mirror of it at the other end: what is left of the crease. */
    const out = Math.min(1, (1 - v) / EDGE_OUT);
    const set = (name: string, value: string) => stage.style.setProperty(name, value);

    // The near face, hinged along the line the crease is making for. Pushing it
    // back by exactly the depth its near edge gained puts that edge on the
    // camera plane: it keeps its size and the crease stays at
    // hinge + width * cos(theta), while everything behind it draws smaller.
    // There is nothing to the left of the hinge but the page's own margin, so
    // nothing of what is being read swings the wrong way round it.
    page.style.transform =
      `perspective(${camera.current.toFixed(0)}px) ` +
      `translateZ(${(-faceW.current * sin).toFixed(2)}px) ` +
      `rotateY(${(-theta).toFixed(3)}deg)`;

    set("--turn-edge-x", `${edge.toFixed(2)}px`);
    if (ramp !== faced.current) {
      faced.current = ramp;
      set("--turn-face", `${ramp.toFixed(4)}`);
      page.style.setProperty("--turn-face", `${ramp.toFixed(4)}`);
    }
    // The far face leans away from the same edge, deepest side-on.
    set("--turn-tilt", `${(TILT * 2 * sin * cos).toFixed(3)}deg`);
    // The two halves the crease divides the window into, as scale factors: the
    // shading is a window-sized gradient, and squashing one is far cheaper
    // than rasterising a differently-sized one every frame.
    set("--turn-near-s", `${(edge / view).toFixed(5)}`);
    set("--turn-far-s", `${Math.max(0, (view - edge) / view).toFixed(5)}`);

    // The near face turns away into the light, so it only darkens into the
    // crease; the far one starts in shadow and lifts out of it.
    // Both of the near face's are spent with the crease: it is the only thing
    // they are describing, and by the last frame there is no near face left to
    // shade. The far face's own two go out with the turn already — cos and
    // sin * cos are nothing at a right angle.
    set("--turn-shade-near", `${(0.13 * sin * out).toFixed(4)}`);
    set("--turn-shade-far", `${(0.36 * cos * ramp).toFixed(4)}`);
    set("--turn-veil-near", `${(0.5 * sin * out).toFixed(4)}`);
    set("--turn-veil-far", `${(0.7 * sin * cos * ramp).toFixed(4)}`);
    // Up over the first frames, and out again over the last: at the end of the
    // turn the crease has arrived between the two tabs, which is where the new
    // page's own column begins, and a line drawn there would stay behind after
    // everything that explained it had gone.
    set("--turn-edge", `${(Math.min(1, v * 9) * out).toFixed(4)}`);
    // The nav travels by the same law as the crease, between the two places
    // its own two layouts put it: level with the crease at rest, and level
    // with the start of the body text once side quests fills the window.
    set("--turn-nav-x", `${(navShift.current * cos).toFixed(2)}px`);
    // And the sections it is carrying, which only make sense once it is nearly
    // there: at the start of the turn the row is still standing at the right of
    // the window, and they would reach off the edge of it.
    set("--turn-subs", `${Math.max(0, Math.min(1, (v - SUBS_AT) / 0.3)).toFixed(4)}`);
  }, []);

  /** Where the crease sits, and where the axis it turns about runs. */
  const measure = useCallback(() => {
    const page = pageRef.current;
    const stage = stageRef.current;
    if (!page || !stage) return;

    // Read with the rotation off: every rect below would otherwise come back
    // projected. paint() puts it straight back before the frame is drawn.
    page.style.transform = "";

    viewW.current = window.innerWidth;
    // The crease halves the gap between the two tabs, rather than sitting
    // against either of them: it is the line those two words are written
    // either side of.
    split.current = seam(page) ?? viewW.current;

    // Where that same gap ends up. The stage's copy of the nav is drawn as side
    // quests draws it — the row standing in the left margin — and the live one
    // as the page being left draws it, so the distance between the two gaps is
    // the whole of the journey, whichever way round the turn is going and
    // whether the window is wide enough for the row to move at all. Read with
    // the carriage at rest, for the same reason the rotation is cleared above.
    stage.style.setProperty("--turn-nav-x", "0px");
    const lands = seam(stage) ?? split.current;

    // The nav travels exactly as far as the crease, because it is the same
    // journey: taking the row's shift from the two gaps rather than from the
    // tabs either side of them is what glues the crease to the gap for every
    // frame in between, whatever else differs between the two layouts.
    navShift.current = split.current - lands;

    // The hinge is that gap read in the layout the turn is landing in — the
    // start of the new page's column, give or take half a gap — and the near
    // face is what is left of the window between the two.
    //
    // Only when the row really does cross the page, which is what the far side
    // of the window asks: on a window too narrow or too upright for the row to
    // stand in the left margin, the gap stays where it is and the crease
    // sweeps the whole window, hinged at its edge, as it always did.
    hinge.current = lands < viewW.current / 2 ? lands : 0;
    faceW.current = Math.max(1, split.current - hinge.current);
    camera.current = Math.max(1200, faceW.current * CAMERA);

    // The axis runs down the left of the window, through its middle: the page
    // is document-tall, so the vanishing point has to be carried down to
    // wherever the reader is.
    const top = page.getBoundingClientRect().top + window.scrollY;
    page.style.transformOrigin =
      `${hinge.current.toFixed(2)}px ` +
      `${(window.scrollY + window.innerHeight / 2 - top).toFixed(2)}px`;
    page.style.willChange = "transform";
    stage.style.setProperty("--turn-camera", `${camera.current.toFixed(0)}px`);
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
      page.style.removeProperty("--turn-face");
      page.style.willChange = "";
    }
    faced.current = -1;
    phase.current = "idle";
    setTurning(false);
    setActive(false);
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
    phase.current = href === SIDE ? "out" : "inWait";
    setTurning(true);
    setActive(true);
  }, []);

  // The stage is mounted: measure both layouts and put the first frame up
  // before the browser draws one.
  useLayoutEffect(() => {
    if (!active) return;
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
  }, [active, measure, paint, run, handOver]);

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
          <div className={styles.face} inert>
            <SideQuestsBody still />
          </div>

          {/* Over the window, not over the faces — see .tint. */}
          <span className={`${styles.near} ${styles.veilNear}`} />
          <span className={`${styles.near} ${styles.shadeNear}`} />
          <span className={`${styles.far} ${styles.veilFar}`} />
          <span className={`${styles.far} ${styles.shadeFar}`} />

          <span className={styles.edge} />

          {/* Above the shading and outside both faces — see .chrome. */}
          <div className={styles.chrome} inert>
            <Nav current={SIDE} />
          </div>
        </div>
      ) : null}
    </>
  );
}
