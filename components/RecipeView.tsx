"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Drawn from "@/components/Drawn";
import RecipePaper, { type CardPart } from "@/components/RecipePaper";
import type { Laid, Vec } from "@/components/bakeryLayout";
import { garamond } from "@/components/recipeFonts";
import { TABLE_WIDTH, cardFor, decorations, usualCard, type Recipe, type RecipeCard } from "@/content";
import styles from "./RecipeView.module.css";

const DEV = process.env.NODE_ENV === "development";
const RecipeEditor = DEV ? dynamic(() => import("@/components/RecipeEditor"), { ssr: false }) : null;

/** The hand that takes hold of the plate and brings it up to the reader. */
const GRAB = decorations.find((d) => d.id === "hand4")?.image ?? decorations.find((d) => d.kind === "hand")?.image;

/** The whole of it, from the table to the plate up close, in milliseconds:
 *  one movement, on one curve — away at once, and slowing all the way in, so
 *  the hand is soon there. */
const BRING = 1500;
const CURVE = [0.25, 0.6, 0.45, 1] as const;
/** Where along it — as a fraction of the way, after the curve — the hand
 *  has hold and the plate starts to come up, the table falling away; and how
 *  long before that the hand starts reaching in. */
const HOLD = 0.45;
const REACH = 0.22;
/** How much further the table seems to come as it falls away. */
const FALL = 1.25;
/** How long the hand takes to let go, or come back for the plate. The card
 *  comes up as the hand reaches in, arriving with the plate, and goes as
 *  the hand comes back for it, gone as the hand is. */
const LET_GO = 600;
/** Coming in: quick, then slowing to a stop. Going: off at once, and on
 *  out of sight. */
const COME = [0.2, 0.7, 0.3, 1] as const;
const GO = [0.3, 0.25, 0.6, 1] as const;
/** Putting it back is quicker than bringing it: every part of it, the hand,
 *  the card and the table, takes this much of the time it took to come. */
const PUT_BACK = 0.6;
const css = (c: readonly number[]) => `cubic-bezier(${c.join(", ")})`;

/** Below this the dessert and its card cannot sit side by side: the dessert
 *  goes at the top, the card under it. */
const NARROW = 760;
/** How far past the top and the foot of the window the card runs, so its
 *  torn ends are out of sight, as in a photograph cropped to the menu. */
const RUN_OFF = 40;

/** A CSS cubic-bezier, as a function: how far along at `u` of the time. */
const bezier = ([x1, y1, x2, y2]: readonly number[]) => {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (u: number) => {
    let lo = 0;
    let hi = 1;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < u) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
};
const ease = bezier(CURVE);
/** When, as a fraction of the time, the hand starts reaching in: where the
 *  curve comes to HOLD - REACH. The card starts coming up then too. */
const REACHED_AT = (() => {
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 24; n++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < HOLD - REACH) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();
const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** From 0 to 1 and still at both ends. */
const smooth = (v: number) => {
  const c = clamp(v);
  return c * c * (3 - 2 * c);
};

type Pose = { x: number; y: number; k: number };

/**
 * A recipe, brought to the reader, in one movement: the table is looked at
 * more and more closely — zoomed in on the dessert, cloth, plates and all —
 * and as it is, a hand reaches in from the nearest edge of the window, takes
 * hold of the plate and brings it on up close, gliding to its side of the
 * window, while the table falls away behind it to a plain ground. The hand
 * only comes once the plate is close enough for its arm to run off the window,
 * so where it is cut off is never seen. Then the recipe slides up beside it,
 * on a tall card of handmade paper that runs off the top and the foot of the
 * window, its photos tied on facing the dessert.
 *
 * `leave` takes it back: the card away, and the same movement backwards, to
 * the very spot it came from — `onGone` is told once it is there.
 *
 * Every frame of the movement is worked out from the one curve — the plate,
 * the table (`table`, zoomed about the plate), the ground and the hand — and
 * played by the browser off the page's own thread, so they cannot drift
 * apart, nor stutter. It is over the
 * whole window, nav and all, and the page under it holds still. `locate` is
 * where the plate is in the window, now: it is asked again on the way back,
 * in case the window has changed.
 */
export default function RecipeView({
  setting,
  scale,
  recipe,
  locate,
  leave,
  onClose,
  table,
  onGone,
}: {
  setting: Laid;
  scale: number;
  recipe: Recipe;
  locate: () => Vec;
  leave: boolean;
  onClose: () => void;
  /** The table behind, which is zoomed in on the plate with it. */
  table: () => HTMLElement | null;
  onGone: () => void;
}) {
  const calm = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

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

  /** Where the plate is on the table, and so where it starts, and where it
   *  goes back to. */
  const [home, setHome] = useState(locate);

  /* ------------------------------------------------- the one movement */

  /** Its fingertips over the plate's rim, `tip` from its middle, in the
   *  plate's own pixels as it was on the table. */
  const tip = R * 0.78;

  /** Everything at `s` of the way, after the curve: the plate, how far the
   *  table is zoomed, how far it has fallen away, and the hand's reach. */
  const m = useMemo(() => {
    const final: Pose = { ...g.at, k: g.k };
    const pose = (s: number): Pose => {
      const k = 1 + (final.k - 1) * s;
      const up = smooth((s - HOLD) / (1 - HOLD));
      return { x: home.x + (final.x - home.x) * up, y: home.y + (final.y - home.y) * up, k };
    };
    const lifted = (s: number) => smooth((s - HOLD) / (1 - HOLD));
    const reached = (s: number) => smooth((s - (HOLD - REACH)) / REACH);

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
    // From the edge nearest the plate where the hand takes hold of it.
    const at = pose(HOLD);
    const e = edges.reduce((a, b) => (gap(at, b) < gap(at, a) ? b : a));
    // Long enough for its arm to run off the window from the moment it
    // reaches in, and how far back it is when it is out of sight.
    const seen = Array.from({ length: 21 }, (_, n) => pose(HOLD - REACH + ((1 - HOLD + REACH) * n) / 20));
    const all = Array.from({ length: 21 }, (_, n) => pose(n / 20));
    const length = Math.max(2 * R * 0.95, ...seen.map((q) => (gap(q, e) + 30) / q.k));
    const off = Math.max(...all.map((q) => (gap(q, e) + 40) / q.k));
    return {
      pose,
      lifted,
      reached,
      e,
      length,
      width: GRAB ? length * (GRAB.width / GRAB.height) : 0,
      turn: (Math.atan2(-e.x, e.y) * 180) / Math.PI,
      off,
    };
  }, [g, home, W, H, R, tip]);

  const dish = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const mRef = useRef(m);
  mRef.current = m;
  const tableOf = useRef(table);
  tableOf.current = table;

  /** Everything as it is at `s` of the way, with the hand `back` of the way
   *  back from where it holds the plate, on top of where it is then. */
  const frameAt = (s: number, back = 0) => {
    const { pose, lifted, reached, e, turn, off } = mRef.current;
    const q = pose(s);
    const by = off * Math.max(1 - reached(s), back);
    return {
      dish: `translate(${q.x}px, ${q.y}px) scale(${q.k})`,
      table: `scale(${q.k * (1 + (FALL - 1) * lifted(s))})`,
      ground: smooth((s - HOLD) / (0.85 - HOLD)),
      hand: `translate(${e.x * by}px, ${e.y * by}px) rotate(${turn}deg)`,
    };
  };

  /** The table under it, zoomed about the plate where it is laid — and,
   *  while it is, a layer of its own, so it is only moved, not painted again:
   *  it is the length of the page. */
  const hold = (on: boolean) => {
    const t = tableOf.current();
    if (!t) return null;
    t.style.transformOrigin = on ? `${plate.x * scale}px ${plate.y * scale}px` : "";
    t.style.willChange = on ? "transform" : "";
    return t;
  };

  /** Everything that moves, moving: played by the browser, off the page's
   *  own thread, from frames worked out here — `at` gives where along it is at
   *  each moment `u` of `ms` — so the plate, the table, the ground and the
   *  hand cannot drift apart, nor stutter when the page is busy. */
  const playing = useRef<Animation[]>([]);
  const play = (ms: number, at: (u: number) => { s: number; back?: number }) => {
    const N = 96;
    const frames = Array.from({ length: N + 1 }, (_, n) => {
      const { s, back } = at(n / N);
      return frameAt(s, back);
    });
    const how: KeyframeAnimationOptions = { duration: calm ? 0 : ms, fill: "forwards", easing: "linear" };
    const moves = [
      // The plate only when it moves: one standing still is left as it is,
      // drawn sharp at the size it is (see settle).
      frames.some((f) => f.dish !== frames[0].dish) ? dish.current?.animate(frames.map((f) => ({ transform: f.dish })), how) : undefined,
      hold(true)?.animate(frames.map((f) => ({ transform: f.table })), how),
      ground.current?.animate(frames.map((f) => ({ opacity: f.ground })), how),
      hand.current?.animate(frames.map((f) => ({ transform: f.hand })), how),
    ].filter((a): a is Animation => !!a);
    playing.current.push(...moves);
    return Promise.all(moves.map((a) => a.finished)).then(
      () => undefined,
      () => undefined,
    );
  };
  /** The plate, brought up, set down where it is: no longer played, nor a
   *  layer of its own — so the browser draws it again at the size it is up
   *  close, not the size it was on the table, which is what the movement
   *  was drawn from. The next movement takes it up again from there. */
  const settle = () => {
    const d = dish.current;
    if (!d) return;
    d.style.transform = frameAt(1).dish;
    for (const a of d.getAnimations()) a.cancel();
    d.style.willChange = "auto";
  };
  const still = () => {
    for (const a of playing.current) a.cancel();
    playing.current = [];
  };

  const off = useRef(false);
  useEffect(() => {
    off.current = false;
    return () => {
      off.current = true;
      // However it is put away, the table is left as it is laid.
      still();
      hold(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, calm ? 0 : ms));
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  // Where it all starts: the plate where it is on the table, the hand out of
  // sight, nothing yet faded.
  useLayoutEffect(() => {
    const f = frameAt(0);
    if (dish.current) dish.current.style.transform = f.dish;
    if (ground.current) ground.current.style.opacity = "0";
    if (hand.current) hand.current.style.transform = f.hand;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [paperUp, setPaperUp] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [paperH, setPaperH] = useState(0);

  // How the card is made up: as content/recipeCards.ts has it — and, while
  // it is being made up in the editor (in development only), as it is.
  const saved = cardFor(recipe.id, recipe.photos.length);
  const [draft, setDraft] = useState<RecipeCard | null>(null);
  const [editing, setEditing] = useState(false);
  const [chosen, choose] = useState<CardPart | null>(null);
  const made = draft ?? saved;

  /** How far down the window the middle of "back to the table" is: the
   *  card's "RECIPE" is set level with it. */
  const backRef = useRef<HTMLButtonElement>(null);
  const [backMid, setBackMid] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const b = backRef.current?.getBoundingClientRect();
    if (b) setBackMid(b.top + b.height / 2);
  }, [W, H]);
  /** Whether the card is dressed in its paper yet: not in the first frames,
   *  as drawing the paper is slow — once the movement is under way, which the
   *  browser plays on its own, it can take its time. */
  const [dressed, setDressed] = useState(false);
  const [stage, setStage] = useState<"opening" | "open" | "closing">("opening");
  const gone = useRef(onGone);
  gone.current = onGone;

  // Brought up — once the copy of the plate is in and drawn, sitting where
  // the plate was, so its first frames are not lost to that…
  useEffect(() => {
    (async () => {
      await frame();
      await frame();
      if (off.current) return;
      const up = play(BRING, (u) => ({ s: ease(u) }));
      // The card coming up as the hand reaches in, and arriving with the
      // plate: on the same clock as the rest, so however long the paper takes
      // to draw, it is where it should be by then.
      const c = card.current?.animate([{ transform: `translateY(${rise}px)` }, { transform: "translateY(0px)" }], {
        duration: calm ? 0 : BRING * (1 - REACHED_AT),
        delay: calm ? 0 : BRING * REACHED_AT,
        easing: css(COME),
        fill: "both",
      });
      if (c) playing.current.push(c);
      // The paper drawn once the movement is under way — the browser has it
      // then, to play on its own — and before the card is in sight.
      await frame();
      await frame();
      if (off.current) return;
      setDressed(true);
      await up;
      if (off.current) return;
      settle();
      setPaperUp(true);
      // Then let go of.
      await play(LET_GO, (u) => ({ s: 1, back: bezier(GO)(u) }));
      if (!off.current) setStage("open");
    })();
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …and put back: the card away, the hand back for the plate, and the same
  // movement backwards, to where the plate is on the table now.
  useEffect(() => {
    if (!leave || stage !== "open") return;
    setStage("closing");
    setHome(locate());
    (async () => {
      // The card starts going as the hand comes back for the plate, and is
      // gone as the hand is.
      for (const a of card.current?.getAnimations() ?? []) if (!(a instanceof CSSTransition)) a.cancel();
      setPaperUp(false);
      await play(LET_GO * PUT_BACK, (u) => ({ s: 1, back: 1 - bezier(COME)(u) }));
      if (off.current) return;
      await play(BRING * PUT_BACK, (u) => ({ s: ease(1 - u) }));
      if (off.current) return;
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
      <div ref={ground} className={styles.ground} />

      <div ref={dish} className={styles.dish}>
        <div className={styles.piece} style={{ left: -pw / 2, top: -ph / 2, width: pw, height: ph, transform: `rotate(${plate.rotate}deg)` }}>
          <Drawn image={plate.image} width={pw} />
        </div>
        {!calm && GRAB ? (
          <div
            ref={hand}
            className={styles.piece}
            style={{
              left: m.e.x * (tip + m.length / 2) - m.width / 2,
              top: m.e.y * (tip + m.length / 2) - m.length / 2,
              width: m.width,
              height: m.length,
            }}
          >
            <Drawn image={GRAB} width={m.width} openFoot />
          </div>
        ) : null}
        <div
          className={`${styles.piece} ${styles.bake}`}
          style={{ left: ddx - dw / 2, top: ddy - dh / 2, width: dw, height: dh, transform: `rotate(${dessert.rotate}deg)` }}
        >
          {/* The picture the table already has, so it is there from the first
              frame; and over it, once it is in, a sharper one for up close. */}
          <Image src={dessert.image} alt="" fill loading="eager" sizes={`${Math.ceil(dw)}px`} className={styles.photo} />
          <Image
            src={dessert.image}
            alt={setting.bake.title}
            fill
            loading="eager"
            sizes={`${Math.ceil(dw * g.k)}px`}
            className={styles.photo}
          />
        </div>
      </div>

      <div
        className={styles.scroller}
        onClick={(e) => {
          if ((e.target as Element).closest("[data-card]")) return;
          // In the editor, a click off the card only lets go of what was
          // chosen.
          if (editing) choose(null);
          else onClose();
        }}
      >
        <div className={styles.reach} style={{ height: reach }} />
        <div
          ref={card}
          className={styles.card}
          data-card=""
          style={{
            left: paper.x,
            top: paper.y,
            transform: `translateY(${paperUp ? 0 : rise}px)`,
            transition: calm || stage === "opening" ? "none" : `transform ${(LET_GO + BRING * (1 - REACHED_AT)) * PUT_BACK}ms ${css(GO)}`,
          }}
        >
          <RecipePaper
            recipe={recipe}
            title={setting.bake.title}
            width={paper.width}
            minHeight={paper.min}
            lead={narrow ? undefined : RUN_OFF + H * 0.15}
            crest={narrow || backMid === undefined ? undefined : backMid - paper.y}
            toward={narrow ? "right" : side < 0 ? "left" : "right"}
            onHeight={setPaperH}
            textured={dressed}
            card={made}
            edit={editing ? { selected: chosen, select: choose, change: setDraft } : undefined}
          />
        </div>
      </div>

      <button
        ref={backRef}
        type="button"
        className={`${styles.back} ${garamond.className}`}
        data-side={side < 0 || narrow ? "left" : "right"}
        style={{ opacity: paperUp ? 1 : 0 }}
        onClick={onClose}
      >
        back to the table
      </button>

      {RecipeEditor && paperUp ? (
        <RecipeEditor
          recipe={recipe}
          editing={editing}
          setEditing={(on) => {
            setEditing(on);
            if (!on) choose(null);
          }}
          card={made}
          saved={saved}
          change={setDraft}
          usual={usualCard(recipe.id, recipe.photos.length)}
          selected={chosen}
          select={choose}
          side={side < 0 && !narrow ? "left" : "right"}
        />
      ) : null}
    </div>,
    document.body,
  );
}
