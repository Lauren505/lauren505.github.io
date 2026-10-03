"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StaticImageData } from "next/image";
import Drawn from "@/components/Drawn";
import RecipePaper from "@/components/RecipePaper";
import { outOf, type Laid, type Shift, type Vec } from "@/components/bakeryLayout";
import { hand as handwriting } from "@/components/recipeFonts";
import { TABLE_WIDTH, decorations, type Recipe } from "@/content";
import styles from "./RecipeReveal.module.css";

/** Which drawings do the work: one to push the plate where it goes, and one
 *  pressing down, to set the paper on the table. */
const PUSH = "hand4";
const CARRY = "hand2";

/** How things move. Settling: quick, then slowing to a stop. Leaving: slow
 *  to start, then away. Hauling: both, for a plate pushed along. */
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVE = "cubic-bezier(0.5, 0, 0.75, 0)";
const HAUL = "cubic-bezier(0.55, 0, 0.3, 1)";

/** The words around a plate: how long after one letter the next is begun,
 *  and how long each takes to write — see .letter in the stylesheet. */
const PER_LETTER = 42;
const LETTER = 460;

type Pose = { x: number; y: number; r: number; ms: number; ease: string };

const handDrawing = (id: string): StaticImageData | undefined =>
  (decorations.find((d) => d.id === id) ?? decorations.find((d) => d.kind === "hand"))?.image;

const at = (p: Pose): React.CSSProperties => ({
  transform: `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`,
  transition: p.ms ? `transform ${p.ms}ms ${p.ease}` : "none",
});

const along = (c: Vec, v: Vec, k: number): Vec => ({ x: c.x + v.x * k, y: c.y + v.y * k });

/**
 * What clicking a dessert brings: its recipe, if it has one, or else a
 * sentence written around its plate.
 *
 * For a recipe the table is cleared — everything else on it slides off the
 * window (`onAway`; TableSetting moves it) — and a hand pushes the plate to
 * the middle of the window, where a second, from below, slides the recipe in
 * beside it, on a sheet of paper: the two side by side, the plate on the side
 * of the table it came from. On a window too narrow for both, the plate goes
 * above the paper instead. `leave` puts it all back the other way: the paper
 * taken away, the plate pushed back to where it was, and the table laid
 * again around it. `onShift` is how the plate is moved, `onGone` is told
 * once everything is back.
 *
 * Everything here is in the window's pixels, on the table — the layout's
 * numbers times `scale` — and `top` is where the window is on it.
 */
export default function RecipeReveal({
  setting,
  scale,
  view,
  length,
  top,
  least,
  recipe,
  line,
  leave,
  onShift,
  onAway,
  onGone,
}: {
  setting: Laid;
  scale: number;
  view: { width: number; height: number };
  /** How long the table is, in the window's pixels. */
  length: number;
  /** Where the top of the window is on the table. */
  top: number;
  /** The highest anything can go: below the nav. */
  least: number;
  recipe?: Recipe;
  line: string;
  leave: boolean;
  onShift: (s: Shift | null) => void;
  /** Whether the rest of the table is to be off the window. */
  onAway: (away: boolean) => void;
  onGone: () => void;
}) {
  const calm = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  /** Every time and length, as it plays: none at all, for a reader who has
   *  asked for less motion. */
  const T = calm ? 0 : 1;

  const W = view.width;
  const plate = setting.plate;
  const px = plate.x * scale;
  const py = plate.y * scale;
  const R = (Math.max(plate.width, plate.height) / 2) * scale;
  /** Which side of the table it is on, and so which side of the paper it
   *  goes. */
  const side = plate.x < TABLE_WIDTH / 2 ? -1 : 1;

  const [paperH, setPaperH] = useState(0);
  const [stage, setStage] = useState<"opening" | "open" | "closing">("opening");

  /* -------------------------------------------------------- the recipe */

  const paperW = Math.round(Math.min(W - 32, Math.max(300, Math.min(440, W * 0.3))));
  const gap = Math.max(20, 44 * scale);

  const g = useMemo(() => {
    const high = Math.max(top + 16, least + 8);
    const low = top + view.height - 16;
    const room = low - high;
    const both = 2 * R + gap + paperW;

    // Side by side, the pair in the middle of the window, the plate level
    // with the middle of as much of the paper as is in it…
    let plateX: number, plateY: number, left: number, y: number;
    if (both <= W - 32) {
      const x0 = (W - both) / 2;
      plateX = side < 0 ? x0 + R : x0 + paperW + gap + R;
      left = side < 0 ? x0 + 2 * R + gap : x0;
      y = high + Math.max(0, (room - paperH) / 2);
      y = Math.max(12, Math.min(y, length - 12 - paperH));
      plateY = Math.max(high + R, (y + Math.min(y + paperH, low)) / 2);
    } else {
      // …or the plate above the paper, on a window too narrow for that.
      plateX = W / 2;
      plateY = high + R;
      left = (W - paperW) / 2;
      y = Math.max(12, Math.min(plateY + R + gap / 2, length - 12 - paperH));
    }
    const d = { x: plateX - px, y: plateY - py };
    const far = Math.hypot(d.x, d.y);
    /** Which way the plate goes, and so where the hand pushes it from. */
    const m = far > 1 ? { x: d.x / far, y: d.y / far } : { x: -side, y: 0 };
    const box = { x0: 0, y0: top, x1: W, y1: top + view.height };

    // The pushing hand, fingers on the rim, pointing the way the plate goes:
    // behind it on the way there, and in front of it, pushing it home, on
    // the way back.
    const push = handDrawing(PUSH);
    const pushL = 2.1 * R;
    const pushW = push ? pushL * (push.width / push.height) : 0;
    const turn = (Math.atan2(m.x, -m.y) * 180) / Math.PI;
    const reach = R * 0.86 + pushL / 2;
    const behind = along({ x: px, y: py }, m, -reach);
    const behindOut = outOf(box, behind, { x: -m.x, y: -m.y }, pushL / 2 + 40);
    const ahead = along({ x: plateX, y: plateY }, m, reach);
    const aheadOut = outOf(box, ahead, m, pushL / 2 + 40);

    // The carrying hand: from below, its fingers on the foot of the paper.
    const carry = handDrawing(CARRY);
    const carryL = paperW * 0.8;
    const carryW = carry ? carryL * (carry.width / carry.height) : 0;
    const carryX = left + paperW * 0.64;
    const carryY = y + paperH - carryL * 0.22 + carryL / 2;
    const below = top + view.height + 30;
    const rise = Math.max(0, below - y);
    const drop = Math.max(0, below - (carryY - carryL / 2));
    const lean = side < 0 ? 1.2 : -1.2;

    /** Out of the window from `c`, along `v`, for the pushing hand. */
    const off = (c: Vec, v: Vec) => along(c, v, outOf(box, c, v, pushL / 2 + 40));

    return {
      d,
      m,
      off,
      left,
      y,
      lean,
      rise,
      push,
      pushL,
      pushW,
      turn,
      behind,
      behindOut,
      ahead,
      aheadOut,
      carry,
      carryL,
      carryW,
      carryX,
      carryY,
      drop,
    };
  }, [W, paperW, gap, R, side, px, py, paperH, top, least, view.height, length]);

  // Each pose is where the middle of the thing is, less half its size —
  // so a translate puts it there — and how it gets there.
  const pose = (c: Vec, w: number, h: number, r: number, ms = 0, ease = SETTLE): Pose => ({
    x: c.x - w / 2,
    y: c.y - h / 2,
    r,
    ms: ms * T,
    ease,
  });
  const pushAt = (c: Vec, r: number, ms?: number, ease?: string) => pose(c, g.pushW, g.pushL, r, ms, ease);
  const carryAt = (dy: number, ms?: number, ease?: string) =>
    pose({ x: g.carryX, y: g.carryY + dy }, g.carryW, g.carryL, 0, ms, ease);
  const paperAt = (dy: number, r: number, ms = 0, ease = SETTLE): Pose => ({ x: g.left, y: g.y + dy, r, ms: ms * T, ease });

  const [pushPose, setPushPose] = useState<Pose | null>(null);
  const [carryPose, setCarryPose] = useState<Pose | null>(null);
  const [paperPose, setPaperPose] = useState<Pose | null>(null);

  const gRef = useRef(g);
  gRef.current = g;
  const timers = useRef<number[]>([]);
  const later = (ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms * T));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const shift = useRef(onShift);
  shift.current = onShift;
  const away = useRef(onAway);
  away.current = onAway;
  const gone = useRef(onGone);
  gone.current = onGone;

  // Brought in, once the paper knows how long it is.
  const measured = recipe ? paperH > 0 : true;
  useEffect(() => {
    if (!measured || !recipe) return;
    let off = false;
    const go = () => {
      if (off) return;
      const s = gRef.current;
      const out = along(s.behind, s.m, -s.behindOut);
      setPushPose(pushAt(out, s.turn));
      setPaperPose(paperAt(s.rise, s.lean * 4));
      setCarryPose(carryAt(s.rise));
      // The table is cleared, and a hand reaches in for the plate…
      away.current(true);
      later(40, () => setPushPose(pushAt(s.behind, s.turn, 650)));
      // …and pushes it to the middle…
      later(760, () => {
        setPushPose(pushAt(along(s.behind, s.d, 1), s.turn, 900, HAUL));
        shift.current({ dx: s.d.x, dy: s.d.y, ms: 900 * T, ease: HAUL });
      });
      // …and goes back the way it came; the paper comes in as it does…
      const done = along(s.behind, s.d, 1);
      later(1720, () => setPushPose(pushAt(s.off(done, { x: -s.m.x, y: -s.m.y }), s.turn, 600, LEAVE)));
      later(1800, () => {
        setPaperPose(paperAt(0, s.lean, 950));
        setCarryPose(carryAt(0, 950));
      });
      // …and is let go of in turn.
      later(2900, () => setCarryPose(carryAt(s.drop, 650, LEAVE)));
      later(3560, () => setStage("open"));
    };
    // The faces are what the paper is measured in.
    if (document.fonts) document.fonts.ready.then(go);
    else go();
    return () => {
      off = true;
    };
    // Once, when it can.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  // Taken away again, once it is all there.
  useEffect(() => {
    if (!leave || stage !== "open") return;
    setStage("closing");
    if (!recipe) {
      later(450, () => gone.current());
      return;
    }
    const s = gRef.current;
    const turn = s.turn + 180;
    const out = along(s.ahead, s.m, s.aheadOut);
    // The hand comes back for the paper, and takes it…
    later(0, () => setCarryPose(carryAt(0, 600)));
    later(700, () => {
      setPaperPose(paperAt(s.rise, s.lean * 4, 750, LEAVE));
      setCarryPose(carryAt(s.rise, 750, LEAVE));
    });
    // …and the other, for the plate, pushes it back where it was, and the
    // table is laid again around it.
    later(780, () => setPushPose(pushAt(out, turn)));
    later(820, () => setPushPose(pushAt(s.ahead, turn, 650)));
    later(1540, () => {
      setPushPose(pushAt(along(s.ahead, s.d, -1), turn, 900, HAUL));
      shift.current({ dx: 0, dy: 0, ms: 900 * T, ease: HAUL });
    });
    later(1900, () => away.current(false));
    later(2500, () => setPushPose(pushAt(s.off(along(s.ahead, s.d, -1), s.m), turn, 600, LEAVE)));
    later(3150, () => gone.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave, stage]);

  /* -------------------------------------------- the words, for the rest */

  const ring = useRef<SVGTextElement>(null);
  const fit = Math.min(24, Math.max(16, R * 0.14));
  const [size, setSize] = useState(fit);
  const [len, setLen] = useState(0);
  const r = R + 8;
  const circ = 2 * Math.PI * r;
  useLayoutEffect(() => {
    if (recipe) return;
    const measure = () => {
      const t = ring.current;
      if (!t) return;
      const l = t.getComputedTextLength();
      const most = circ * 0.86;
      if (l > most && size === fit) {
        setSize(fit * (most / l));
        return;
      }
      setLen(Math.min(l, circ));
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [recipe, size, fit, circ]);

  // Written out, and then there until it is put away.
  const letters = useMemo(() => [...line], [line]);
  const writing = !recipe && len > 0;
  useEffect(() => {
    if (!writing) return;
    later(letters.length * PER_LETTER + LETTER, () => setStage("open"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing]);

  if (!recipe) {
    const box = 2 * (r + size * 2);
    const c = box / 2;
    const path = `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`;
    const id = `ring-${setting.id}`;
    return (
      <div className={styles.reveal}>
        <svg
          className={`${styles.ring} ${handwriting.className}`}
          data-leaving={stage === "closing" || undefined}
          data-writing={(writing && !calm) || undefined}
          data-calm={calm || undefined}
          width={box}
          height={box}
          style={{ left: px - c, top: py - c, visibility: len ? "visible" : "hidden" }}
          role="note"
          aria-label={line}
        >
          <defs>
            <path id={`${id}-path`} d={path} />
          </defs>
          {/* Clockwise over the top, centred on it — one letter at a time,
              each drawn round its outline and then inked in. */}
          <text ref={ring} className={styles.words} fontSize={size} aria-hidden>
            <textPath href={`#${id}-path`} startOffset="25%" textAnchor="middle">
              {letters.map((ch, k) => (
                <tspan key={k} className={styles.letter} style={{ animationDelay: `${k * PER_LETTER}ms` }}>
                  {ch}
                </tspan>
              ))}
            </textPath>
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={styles.reveal}>
      <div className={styles.paper} data-recipe-keep="" style={paperPose ? at(paperPose) : { visibility: "hidden" }}>
        <RecipePaper recipe={recipe} title={setting.bake.title} width={paperW} onHeight={setPaperH} />
      </div>
      {!calm && carryPose && g.carry ? (
        <div className={styles.hand} style={{ width: g.carryW, height: g.carryL, ...at(carryPose) }}>
          <Drawn image={g.carry} width={g.carryW} openFoot />
        </div>
      ) : null}
      {!calm && pushPose && g.push ? (
        <div className={styles.hand} style={{ width: g.pushW, height: g.pushL, ...at(pushPose) }}>
          <Drawn image={g.push} width={g.pushW} openFoot />
        </div>
      ) : null}
    </div>
  );
}
