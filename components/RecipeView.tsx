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

/** The zoom: the plate brought up close, and the table zooming in after it
 *  — or both going back — as one movement, slow away and easing in to where
 *  it goes. Its curve is kept as numbers too, to work out when the plate is
 *  how far along. */
export const ZOOM_MS = 1700;
const CURVE = [0.6, 0, 0.3, 1] as const;
export const ZOOM_EASE = `cubic-bezier(${CURVE.join(", ")})`;
/** Settling: quick, then slowing to a stop. Leaving: slow to start, then
 *  away. */
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVE = "cubic-bezier(0.5, 0, 0.75, 0)";

/** When, as a fraction of the zoom, it is `p` of the way there — the CSS
 *  curve, solved backwards. */
const timeAt = (p: number) => {
  const [x1, y1, x2, y2] = CURVE;
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 30; n++) {
    const mid = (lo + hi) / 2;
    if (at(y1, y2, mid) < p) lo = mid;
    else hi = mid;
  }
  return at(x1, x2, (lo + hi) / 2);
};

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
 * A recipe, brought to the reader. A hand reaches up from the foot of the
 * window, takes hold of the plate and brings it up close — the plate growing
 * as it comes, gliding to its side of the window — while the table behind
 * zooms in after it and fades away, the cloth and every other plate with it,
 * to a plain ground. Then the recipe slides up beside it, on a tall card of
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
  /** Whether the table behind is to zoom in after the plate. */
  onZoom: (on: boolean) => void;
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
  /** The plate `p` of the way up from the table — as the zoom moves it,
   *  straight, and growing evenly. */
  const along = (p: number, from: Vec = home): Pose => ({
    x: from.x + p * (g.at.x - from.x),
    y: from.y + p * (g.at.y - from.y),
    k: 1 + p * (g.k - 1),
  });

  /** Its fingertips over the plate's rim, `tip` from its middle, in the
   *  plate's own pixels as it was on the table. */
  const tip = R * 0.78;

  const h = useMemo(() => {
    const final = along(1);
    /** How far the fingertips are from the window's edge, with the plate at
     *  `q`, coming from the edge `e` is towards. */
    const gap = (q: Pose, e: Vec) => {
      const x = q.x + e.x * q.k * tip;
      const y = q.y + e.y * q.k * tip;
      return e.x < 0 ? x : e.x > 0 ? W - x : e.y > 0 ? H - y : y;
    };
    // From the edge nearest the plate where it ends up, which is where it is
    // held longest.
    const edges: Vec[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const e = edges.reduce((a, b) => (gap(final, b) < gap(final, a) ? b : a));
    // Long enough to reach that edge, at least by the end.
    const length = Math.max(2 * R * 0.95, (gap(final, e) + 60) / final.k);
    /** Whether its arm runs off the window, with the plate at `q`. */
    const reaches = (q: Pose) => gap(q, e) + 30 <= length * q.k;
    // How far up the plate has to be, for that to hold from then on: the
    // hand takes hold there, and not before.
    let from = 1;
    for (let p = 0; p <= 1; p += 0.02) {
      let ok = true;
      for (let q = p; q <= 1 && ok; q += 0.05) ok = reaches(along(q));
      if (ok && reaches(final)) {
        from = p;
        break;
      }
    }
    /** How far back it has to be, in the plate's pixels, to be off the
     *  window altogether, with the plate anywhere from the table to `upTo`. */
    const out = (upTo: number) => {
      let most = 0;
      for (let q = 0; q <= upTo + 1e-6; q += 0.05) {
        const pose = along(q);
        most = Math.max(most, (gap(pose, e) + 40) / pose.k);
      }
      return most;
    };
    return {
      e,
      length,
      width: GRAB ? length * (GRAB.width / GRAB.height) : 0,
      turn: (Math.atan2(-e.x, e.y) * 180) / Math.PI,
      from,
      off: Math.max(out(1), (gap(final, e) + 40) / final.k),
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

  // Brought up: the zoom starts, and the hand comes in from the nearest edge
  // to take hold just as the plate is far enough up for its arm to run off
  // the window — then brings it the rest of the way, and lets go.
  useEffect(() => {
    const { g, h } = now.current;
    const reach = 450;
    const held = 40 + ZOOM_MS * timeAt(h.from);
    later(40, () => {
      setPlateAt({ ...g.at, k: g.k, ms: ZOOM_MS * T, ease: ZOOM_EASE });
      setGround({ on: true, ms: 1000 * T, ease: "ease-in" });
      zoom.current(true);
    });
    later(Math.max(40, held - reach), () => setHandOff({ by: 0, ms: Math.min(reach, held - 40) * T, ease: SETTLE }));
    later(40 + ZOOM_MS + 60, () => setHandOff({ by: h.off, ms: 500 * T, ease: LEAVE }));
    later(40 + ZOOM_MS + 220, () => setPaperUp({ up: true, ms: 900 * T, ease: SETTLE }));
    later(40 + ZOOM_MS + 1120, () => setStage("open"));
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Put back, the same way round: the card taken away, the hand takes hold
  // and brings the plate back down, letting go as it gets too far for its arm
  // to reach, and the plate lands where it was, as the table zooms back out
  // under it.
  useEffect(() => {
    if (!leave || stage !== "open") return;
    setStage("closing");
    const { h } = now.current;
    const back = locate();
    setHome(back);
    later(0, () => setPaperUp({ up: false, ms: 600 * T, ease: LEAVE }));
    later(450, () => setHandOff({ by: 0, ms: 450 * T, ease: SETTLE }));
    const down = 950;
    later(down, () => {
      setPlateAt({ ...back, k: 1, ms: ZOOM_MS * T, ease: ZOOM_EASE });
      setGround({ on: false, ms: 1100 * T, ease: "ease-out", delay: (ZOOM_MS - 1100) * T });
      zoom.current(false);
    });
    later(down + ZOOM_MS * timeAt(1 - h.from) - 150, () => setHandOff({ by: h.off, ms: 450 * T, ease: LEAVE }));
    later(down + ZOOM_MS + 40, () => gone.current());
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
