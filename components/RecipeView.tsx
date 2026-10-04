"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Drawn from "@/components/Drawn";
import RecipePaper from "@/components/RecipePaper";
import type { Laid, Vec } from "@/components/bakeryLayout";
import { garamond } from "@/components/recipeFonts";
import { TABLE_WIDTH, decorations, type Recipe } from "@/content";
import styles from "./RecipeView.module.css";

/** The hand that takes hold of the plate and brings it up to the reader. */
const GRAB = decorations.find((d) => d.id === "hand4")?.image ?? decorations.find((d) => d.kind === "hand")?.image;

/** A zoom on the table, about the plate: TableSetting's table and the plate
 *  brought up close are moved by the same one, so they keep together. */
export type Zoom = { scale: number; ms: number; ease: string };

/** How it goes, in milliseconds. First the table is looked at more closely —
 *  zoomed in on the dessert, cloth and all — then the hand reaches in and
 *  lifts the plate up to the reader, the table fading away behind it as it
 *  does. */
const LOOK = 1300;
const REACH = 520;
const LIFT = 1250;
/** Looking closer: unhurried, either way. Lifting: slow away, and easing in
 *  to where it goes. Settling: quick, then slowing to a stop. Leaving: slow
 *  to start, then away. */
const LOOK_EASE = "cubic-bezier(0.45, 0, 0.3, 1)";
const LIFT_EASE = "cubic-bezier(0.55, 0, 0.25, 1)";
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVE = "cubic-bezier(0.5, 0, 0.75, 0)";
/** How close the table is looked at, at least and at most, before the hand
 *  comes — as close as its arm needs to run off the window — and how much
 *  closer still it seems to come as it falls away. */
const LOOK_LEAST = 1.35;
const LOOK_MOST = 2.2;
const FALL = 1.2;

/** Below this the dessert and its card cannot sit side by side: the dessert
 *  goes at the top, the card under it. */
const NARROW = 760;
/** How far past the top and the foot of the window the card runs, so its
 *  torn ends are out of sight, as in a photograph cropped to the menu. */
const RUN_OFF = 40;

type Move = { ms: number; ease: string; delay?: number };
const moving = (m: Move, what = "transform") =>
  m.ms ? `${what} ${m.ms}ms ${m.ease} ${m.delay ?? 0}ms` : "none";

/**
 * A recipe, brought to the reader. First the table is looked at more closely
 * — zoomed in on the dessert, cloth, plates and all. Then a hand reaches in
 * from the nearest edge of the window, takes hold of the plate and brings it
 * up close — the plate growing as it comes, gliding to its side of the window
 * — and only then does the table fall away behind it, to a plain ground. The
 * hand only comes once the plate is close enough for its arm to run off the
 * window, so where it is cut off is never seen. Then the recipe slides up
 * beside it, on a tall card of
 * handmade paper that runs off the top and the foot of the window, its photos
 * tied on facing the dessert. `leave` takes it all back the way it came;
 * `onGone` is told once the plate is down again.
 *
 * It is over the whole window — over the nav too — and the page under it
 * holds still. `locate` is where the plate is in the window, now: it is
 * asked again on the way back, in case the window has changed.
 */
export default function RecipeView({
  setting,
  scale,
  recipe,
  locate,
  leave,
  onClose,
  onZoom,
  onGone,
}: {
  setting: Laid;
  scale: number;
  recipe: Recipe;
  locate: () => Vec;
  leave: boolean;
  onClose: () => void;
  /** How the table behind is zoomed, about the plate; null for not at all. */
  onZoom: (z: Zoom | null) => void;
  onGone: () => void;
}) {
  const calm = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  /** Every time and length, as it plays: none at all, for a reader who has
   *  asked for less motion. */
  const T = calm ? 0 : 1;

  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const read = () => setView({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  // The page holds still under it — keeping the room its scrollbar takes, so
  // the table under it does not change size.
  useEffect(() => {
    const html = document.documentElement;
    const was = [html.style.overflow, html.style.scrollbarGutter];
    html.style.scrollbarGutter = "stable";
    html.style.overflow = "hidden";
    return () => {
      [html.style.overflow, html.style.scrollbarGutter] = was;
    };
  }, []);

  /* ----------------------------------------------------------- layout */

  const { width: W, height: H } = view;
  const plate = setting.plate;
  const dessert = setting.dessert;
  /** The plate as it is on the table, in the window's pixels: the clone
   *  starts the same size, and grows from there. */
  const R = (Math.max(plate.width, plate.height) / 2) * scale;
  const side = plate.x < TABLE_WIDTH / 2 ? -1 : 1;
  const narrow = W < NARROW;

  const g = useMemo(() => {
    if (narrow) {
      // Under the way back, at the top.
      const D = Math.min(W * 0.6, H * 0.34);
      const top = 64 + D + 16;
      return {
        at: { x: W / 2, y: 64 + D / 2 },
        k: D / (2 * R),
        paper: { x: 20, y: top, width: W - 40, min: H - top + RUN_OFF },
      };
    }
    const D = Math.min(W * 0.32, H * 0.6);
    const width = Math.round(Math.min(705, Math.max(450, W * 0.45)));
    return {
      at: { x: side < 0 ? W * 0.27 : W * 0.73, y: H * 0.52 },
      k: D / (2 * R),
      paper: { x: (side < 0 ? W * 0.7 : W * 0.3) - width / 2, y: -RUN_OFF, width, min: H + 2 * RUN_OFF },
    };
  }, [narrow, W, H, R, side]);

  /* -------------------------------------------------------- the hand */

  /** Where the plate is on the table, and so where it starts, and where it
   *  comes back to. */
  const [home, setHome] = useState(locate);
  type Pose = { x: number; y: number; k: number };

  /** Its fingertips over the plate's rim, `tip` from its middle, in the
   *  plate's own pixels as it was on the table. */
  const tip = R * 0.78;

  const h = useMemo(() => {
    const final: Pose = { ...g.at, k: g.k };
    const looked = (k: number): Pose => ({ ...home, k });
    /** How far the fingertips are from the window's edge, with the plate at
     *  `q`, coming from the edge `e` is towards. */
    const gap = (q: Pose, e: Vec) => {
      const x = q.x + e.x * q.k * tip;
      const y = q.y + e.y * q.k * tip;
      return e.x < 0 ? x : e.x > 0 ? W - x : e.y > 0 ? H - y : y;
    };
    const edges: Vec[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const nearest = (q: Pose) => edges.reduce((a, b) => (gap(q, b) < gap(q, a) ? b : a));
    const base = 2 * R * 0.95;
    // As close as the table has to be looked at for the hand, from the
    // nearest edge, to reach the plate with its arm still running off.
    let look = LOOK_MOST;
    for (let z = LOOK_LEAST; z <= LOOK_MOST + 1e-6; z += 0.05) {
      const q = looked(z);
      if (gap(q, nearest(q)) + 30 <= base * z) {
        look = z;
        break;
      }
    }
    const from = looked(look);
    const e = nearest(from);
    /** Every pose it holds the plate in: where it takes hold, on the way up,
     *  and where it lets go. */
    const held = Array.from({ length: 11 }, (_, n): Pose => {
      const p = n / 10;
      return { x: from.x + p * (final.x - from.x), y: from.y + p * (final.y - from.y), k: from.k + p * (final.k - from.k) };
    });
    // Long enough for its arm to run off the window in all of them.
    const length = Math.max(base, ...held.map((q) => (gap(q, e) + 40) / q.k));
    return {
      look,
      e,
      length,
      width: GRAB ? length * (GRAB.width / GRAB.height) : 0,
      turn: (Math.atan2(-e.x, e.y) * 180) / Math.PI,
      /** How far back it is, the way it came, when it is out of sight. */
      off: Math.max(...held.map((q) => (gap(q, e) + 40) / q.k)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, home, W, H, R, tip]);

  /* -------------------------------------------------------- the moves */

  const [plateAt, setPlateAt] = useState<Pose & Move>(() => ({ ...home, k: 1, ms: 0, ease: SETTLE }));
  /** How far the hand is back from the plate, the way it came. */
  const [handOff, setHandOff] = useState<{ by: number } & Move>({ by: h.off, ms: 0, ease: SETTLE });
  const [ground, setGround] = useState<{ on: boolean } & Move>({ on: false, ms: 0, ease: SETTLE });
  const [paperUp, setPaperUp] = useState<{ up: boolean } & Move>({ up: false, ms: 0, ease: SETTLE });
  const [paperH, setPaperH] = useState(0);
  const [stage, setStage] = useState<"opening" | "open" | "closing">("opening");

  const now = useRef({ g, h });
  now.current = { g, h };
  const timers = useRef<number[]>([]);
  const later = (ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms * T));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const zoom = useRef(onZoom);
  zoom.current = onZoom;
  const gone = useRef(onGone);
  gone.current = onGone;
  const dish = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);

  /** The table and the plate on it looked at `k` times closer, about the
   *  plate — the same move for both, so they keep together. */
  const look = (k: number, at: Vec, ms: number, ease: string) => {
    setPlateAt({ ...at, k, ms: ms * T, ease });
    zoom.current({ scale: k, ms: ms * T, ease });
  };

  /** Once `el`'s own move has ended — not a move inside it — or, if it
   *  never does (no motion, or the move already over), after `most`. */
  const off = useRef(false);
  useEffect(() => {
    off.current = false;
    return () => {
      off.current = true;
    };
  }, []);
  const ended = (el: React.RefObject<HTMLElement | null>, most: number) =>
    new Promise<void>((resolve) => {
      const node = el.current;
      let t = 0;
      const done = (e?: TransitionEvent) => {
        if (e && (e.target !== node || e.propertyName !== "transform")) return;
        node?.removeEventListener("transitionend", done);
        window.clearTimeout(t);
        if (!off.current) resolve();
      };
      if (!node || !T) return done();
      node.addEventListener("transitionend", done);
      t = window.setTimeout(() => done(), most);
    });
  const wait = (ms: number) => new Promise<void>((r) => later(ms, r));

  // Brought up, each move after the last has ended — so they keep their
  // order, however slow the frames.
  useEffect(() => {
    const { g, h } = now.current;
    (async () => {
      await wait(40);
      // Looked at more closely, the hand reaching in as that slows…
      look(h.look, home, LOOK, LOOK_EASE);
      await wait(LOOK - REACH * 0.6);
      setHandOff({ by: 0, ms: REACH * T, ease: SETTLE });
      await ended(hand, REACH + 600);
      await wait(60);
      // …and once it has hold, lifting the plate up close, the table falling
      // away behind it.
      setPlateAt({ ...g.at, k: g.k, ms: LIFT * T, ease: LIFT_EASE });
      zoom.current({ scale: h.look * FALL, ms: LIFT * T, ease: LIFT_EASE });
      setGround({ on: true, ms: LIFT * 0.8 * T, ease: "ease-in-out" });
      await ended(dish, LIFT + 600);
      await wait(60);
      setHandOff({ by: h.off, ms: 500 * T, ease: LEAVE });
      await wait(160);
      setPaperUp({ up: true, ms: 900 * T, ease: SETTLE });
      await wait(900);
      setStage("open");
    })();
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Put back, the same way round: the card taken away; the hand takes hold
  // and sets the plate back down, the table coming back around it; and the
  // table is looked at from where it was again — handed back to it once the
  // plate is down.
  useEffect(() => {
    if (!leave || stage !== "open") return;
    setStage("closing");
    const { h } = now.current;
    const back = locate();
    setHome(back);
    (async () => {
      setPaperUp({ up: false, ms: 600 * T, ease: LEAVE });
      await wait(450);
      setHandOff({ by: 0, ms: REACH * T, ease: SETTLE });
      await ended(hand, REACH + 600);
      await wait(60);
      setPlateAt({ ...back, k: h.look, ms: LIFT * T, ease: LIFT_EASE });
      zoom.current({ scale: h.look, ms: LIFT * T, ease: LIFT_EASE });
      setGround({ on: false, ms: LIFT * 0.8 * T, ease: "ease-in-out", delay: LIFT * 0.2 * T });
      await ended(dish, LIFT + 600);
      await wait(40);
      setHandOff({ by: h.off, ms: 500 * T, ease: LEAVE });
      await wait(300);
      look(1, back, LOOK, LOOK_EASE);
      await ended(dish, LOOK + 600);
      zoom.current(null);
      gone.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave, stage]);

  /* ---------------------------------------------------------- drawing */

  const pw = plate.width * scale;
  const ph = plate.height * scale;
  const dw = dessert.width * scale;
  const dh = dessert.height * scale;
  const ddx = (dessert.x - plate.x) * scale;
  const ddy = (dessert.y - plate.y) * scale;
  const paper = g.paper;
  /** How far the card has to come up from: below the window. */
  const rise = H + RUN_OFF - paper.y;
  /** How far the card can be scrolled: to its foot, less what runs off. */
  const reach = Math.max(H, paper.y + paperH - RUN_OFF);

  return createPortal(
    <div className={styles.view} data-recipe-keep="" role="dialog" aria-label={`${setting.bake.title}: recipe`}>
      <div
        className={styles.ground}
        style={{ opacity: ground.on ? 1 : 0, transition: moving(ground, "opacity") }}
      />

      <div
        ref={dish}
        className={styles.dish}
        style={{
          transform: `translate(${plateAt.x}px, ${plateAt.y}px) scale(${plateAt.k})`,
          transition: moving(plateAt),
        }}
      >
        <div className={styles.piece} style={{ left: -pw / 2, top: -ph / 2, width: pw, height: ph, transform: `rotate(${plate.rotate}deg)` }}>
          <Drawn image={plate.image} width={pw} />
        </div>
        {!calm && GRAB ? (
          <div
            ref={hand}
            className={styles.piece}
            style={{
              left: h.e.x * (tip + h.length / 2) - h.width / 2,
              top: h.e.y * (tip + h.length / 2) - h.length / 2,
              width: h.width,
              height: h.length,
              transform: `translate(${h.e.x * handOff.by}px, ${h.e.y * handOff.by}px) rotate(${h.turn}deg)`,
              transition: moving(handOff),
            }}
          >
            <Drawn image={GRAB} width={h.width} openFoot />
          </div>
        ) : null}
        <div
          className={`${styles.piece} ${styles.bake}`}
          style={{ left: ddx - dw / 2, top: ddy - dh / 2, width: dw, height: dh, transform: `rotate(${dessert.rotate}deg)` }}
        >
          <Image
            src={dessert.image}
            alt={setting.bake.title}
            fill
            sizes={`${Math.ceil(dw * g.k)}px`}
            className={styles.photo}
          />
        </div>
      </div>

      <div
        className={styles.scroller}
        onClick={(e) => {
          if (!(e.target as Element).closest("[data-card]")) onClose();
        }}
      >
        <div className={styles.reach} style={{ height: reach }} />
        <div
          className={styles.card}
          data-card=""
          style={{
            left: paper.x,
            top: paper.y,
            transform: `translateY(${paperUp.up ? 0 : rise}px)`,
            transition: moving(paperUp),
          }}
        >
          <RecipePaper
            recipe={recipe}
            title={setting.bake.title}
            width={paper.width}
            minHeight={paper.min}
            lead={narrow ? undefined : RUN_OFF + H * 0.15}
            toward={narrow ? "right" : side < 0 ? "left" : "right"}
            onHeight={setPaperH}
          />
        </div>
      </div>

      <button
        type="button"
        className={`${styles.back} ${garamond.className}`}
        data-side={side < 0 || narrow ? "left" : "right"}
        style={{ opacity: paperUp.up ? 1 : 0 }}
        onClick={onClose}
      >
        back to the table
      </button>
    </div>,
    document.body,
  );
}
