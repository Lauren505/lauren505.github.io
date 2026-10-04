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

/** How things move. Zooming: slow away, then easing in to where it goes.
 *  Settling: quick, then slowing to a stop. Leaving: slow to start, then
 *  away. */
const ZOOM = "cubic-bezier(0.55, 0, 0.25, 1)";
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVE = "cubic-bezier(0.5, 0, 0.75, 0)";

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
    const D = Math.min(W * 0.36, H * 0.6);
    const width = Math.round(Math.min(470, Math.max(300, W * 0.3)));
    return {
      at: { x: side < 0 ? W * 0.3 : W * 0.7, y: H * 0.52 },
      k: D / (2 * R),
      paper: { x: (side < 0 ? W * 0.68 : W * 0.32) - width / 2, y: -RUN_OFF, width, min: H + 2 * RUN_OFF },
    };
  }, [narrow, W, H, R, side]);

  /** The hand, in the plate's own pixels as it was on the table: its
   *  fingertips over the near rim of the plate, the arm running down. */
  const handL = 2 * R * 0.95;
  const handW = GRAB ? handL * (GRAB.width / GRAB.height) : 0;
  const tip = R * 0.78;
  /** How far down it has to go, in those pixels, to be below the window,
   *  with the plate at `y` and `k` times its size. */
  const below = (y: number, k: number) => (H + 30 - (y + k * tip)) / k;

  /* -------------------------------------------------------- the moves */

  type Pose = { at: Vec; k: number } & Move;
  const [plateAt, setPlateAt] = useState<Pose>(() => ({ at: locate(), k: 1, ms: 0, ease: SETTLE }));
  const [handDown, setHandDown] = useState<{ dy: number } & Move>(() => ({
    dy: below(plateAt.at.y, 1),
    ms: 0,
    ease: SETTLE,
  }));
  const [ground, setGround] = useState<{ on: boolean } & Move>({ on: false, ms: 0, ease: SETTLE });
  const [paperUp, setPaperUp] = useState<{ up: boolean } & Move>({ up: false, ms: 0, ease: SETTLE });
  const [paperH, setPaperH] = useState(0);
  const [stage, setStage] = useState<"opening" | "open" | "closing">("opening");

  const gRef = useRef(g);
  gRef.current = g;
  const timers = useRef<number[]>([]);
  const later = (ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms * T));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const zoom = useRef(onZoom);
  zoom.current = onZoom;
  const gone = useRef(onGone);
  gone.current = onGone;

  // Brought up.
  useEffect(() => {
    const s = gRef.current;
    // The hand reaches up and takes hold…
    later(40, () => setHandDown({ dy: 0, ms: 600 * T, ease: SETTLE }));
    // …and brings it up close, the table falling away behind…
    later(700, () => {
      setPlateAt({ at: s.at, k: s.k, ms: 1100 * T, ease: ZOOM });
      setGround({ on: true, ms: 900 * T, ease: "ease-in", delay: 120 * T });
      zoom.current(true);
    });
    // …and lets go; the recipe comes up beside it.
    later(1850, () => setHandDown({ dy: below(s.at.y, s.k), ms: 600 * T, ease: LEAVE }));
    later(1950, () => setPaperUp({ up: true, ms: 900 * T, ease: SETTLE }));
    later(2850, () => setStage("open"));
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Put back, once it is all there.
  useEffect(() => {
    if (!leave || stage !== "open") return;
    setStage("closing");
    const s = gRef.current;
    later(0, () => setPaperUp({ up: false, ms: 600 * T, ease: LEAVE }));
    later(400, () => setHandDown({ dy: 0, ms: 600 * T, ease: SETTLE }));
    later(1050, () => {
      const home = locate();
      setPlateAt({ at: home, k: 1, ms: 1000 * T, ease: ZOOM });
      setGround({ on: false, ms: 900 * T, ease: "ease-out" });
      zoom.current(false);
      later(1050, () => setHandDown({ dy: below(home.y, 1), ms: 550 * T, ease: LEAVE }));
    });
    later(2700, () => gone.current());
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
          transform: `translate(${plateAt.at.x}px, ${plateAt.at.y}px) scale(${plateAt.k})`,
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
              left: R * 0.12 - handW / 2,
              top: tip - handL * 0.04,
              width: handW,
              height: handL,
              transform: `translateY(${handDown.dy}px)`,
              transition: moving(handDown),
            }}
          >
            <Drawn image={GRAB} width={handW} openFoot />
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
