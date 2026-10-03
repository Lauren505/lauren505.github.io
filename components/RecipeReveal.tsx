"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StaticImageData } from "next/image";
import Drawn from "@/components/Drawn";
import RecipePaper from "@/components/RecipePaper";
import type { Laid } from "@/components/bakeryLayout";
import { garamond } from "@/components/recipeFonts";
import { TABLE_WIDTH, decorations, type Recipe } from "@/content";
import styles from "./RecipeReveal.module.css";

/** Which drawings do the work: one with its fingers curled, to hook the rim of
 *  a plate and pull it, and one pressing down, to set the paper on the table. */
const PULL = "hand4";
const CARRY = "hand2";

/** How things move. Settling: quick, then slowing to a stop. Leaving: slow
 *  to start, then away. Hauling: both, for a plate dragged along. */
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const LEAVE = "cubic-bezier(0.5, 0, 0.75, 0)";
const HAUL = "cubic-bezier(0.55, 0, 0.3, 1)";

/** The plate and what is on it, moved aside: TableSetting moves them, in
 *  window pixels, in step with the hand. */
export type Shift = { dx: number; ms: number; ease: string };

type Pose = { x: number; y: number; r: number; ms: number; ease: string };

const handDrawing = (id: string): StaticImageData | undefined =>
  (decorations.find((d) => d.id === id) ?? decorations.find((d) => d.kind === "hand"))?.image;

const at = (p: Pose): React.CSSProperties => ({
  transform: `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`,
  transition: p.ms ? `transform ${p.ms}ms ${p.ease}` : "none",
});

/**
 * What clicking a dessert brings: its recipe, if it has one, or else a
 * sentence written around its plate.
 *
 * The recipe comes on a sheet of paper. A hand reaches in from the near side
 * of the window, hooks the plate and pulls it towards that edge, out of the
 * way of the rest of the table; then a second, from below, slides the paper
 * into the space that leaves and lets go of it. `leave` puts it all back the
 * other way: the paper taken away, the plate pushed back to where it was.
 * `onShift` is how the plate is moved, `onGone` is told once everything is
 * back.
 *
 * Everything here is in the window's pixels, on the table — the layout's
 * numbers times `scale` — and `top` is where the window is on it, which is
 * where the paper is laid.
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
  onGone,
}: {
  setting: Laid;
  scale: number;
  view: { width: number; height: number };
  /** How long the table is, in the window's pixels. */
  length: number;
  /** Where the top of the window is on the table. */
  top: number;
  /** The highest the paper can go: below the nav. */
  least: number;
  recipe?: Recipe;
  line: string;
  leave: boolean;
  onShift: (s: Shift | null) => void;
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
  /** Which side of the table it is on, and so which way it is pulled. */
  const side = plate.x < TABLE_WIDTH / 2 ? -1 : 1;

  const [paperH, setPaperH] = useState(0);
  const [stage, setStage] = useState<"opening" | "open" | "closing">("opening");

  /* -------------------------------------------------------- the recipe */

  const paperW = Math.round(Math.min(W - 32, Math.max(300, Math.min(440, W * 0.3))));
  const gap = Math.max(14, 28 * scale);

  const g = useMemo(() => {
    // Where the plate goes: near its edge of the window, but further over
    // still if the paper needs the room — over the edge, even, a little.
    const room = W - 16 - paperW - gap;
    let c = R + 16;
    if (c + R > room) c = Math.max(-R * 0.25, room - R);
    let dx = (side < 0 ? c : W - c) - px;
    if (dx * side < 40) dx = side * 40;
    const to = px + dx;
    const left = side < 0 ? Math.min(W - 16 - paperW, to + R + gap) : Math.max(16, to - R - gap - paperW);

    // Beside the plate, as far as the window allows, and on the table.
    let y = Math.min(py - paperH * 0.42, top + view.height - 20 - paperH);
    y = Math.max(y, top + 12, least + 8);
    y = Math.max(12, Math.min(y, length - 12 - paperH));
    const below = top + view.height + 30;
    const lean = side < 0 ? 1.2 : -1.2;

    // The pulling hand: fingers hooked over the plate's outer rim, the arm
    // running back to the edge it came from.
    const pull = handDrawing(PULL);
    const pullL = 2.1 * R;
    const pullW = pull ? pullL * (pull.width / pull.height) : 0;
    const grip = px + side * R * 0.86 + (side * pullL) / 2;
    const outside = side < 0 ? -pullL / 2 - 40 : W + pullL / 2 + 40;
    const pullR = side < 0 ? 90 : -90;

    // The carrying hand: from below, its fingers on the foot of the paper.
    const carry = handDrawing(CARRY);
    const carryL = paperW * 0.8;
    const carryW = carry ? carryL * (carry.width / carry.height) : 0;
    const carryX = left + paperW * 0.64;
    const carryY = y + paperH - carryL * 0.22 + carryL / 2;
    const rise = Math.max(0, below - y);
    const drop = Math.max(0, below - (carryY - carryL / 2));

    return {
      dx,
      left,
      y,
      lean,
      rise,
      pull,
      pullL,
      pullW,
      grip,
      outside,
      pullR,
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
  const pose = (x: number, y: number, w: number, h: number, r: number, ms = 0, ease = SETTLE): Pose => ({
    x: x - w / 2,
    y: y - h / 2,
    r,
    ms: ms * T,
    ease,
  });

  const pullAt = (x: number, ms?: number, ease?: string) => pose(x, py, g.pullW, g.pullL, g.pullR, ms, ease);
  const carryAt = (dy: number, ms?: number, ease?: string) => pose(g.carryX, g.carryY + dy, g.carryW, g.carryL, 0, ms, ease);
  const paperAt = (dy: number, r: number, ms = 0, ease = SETTLE): Pose => ({ x: g.left, y: g.y + dy, r, ms: ms * T, ease });

  const [pullPose, setPullPose] = useState<Pose | null>(null);
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
  const gone = useRef(onGone);
  gone.current = onGone;

  // Brought in, once the paper knows how long it is.
  const measured = recipe ? paperH > 0 : true;
  useEffect(() => {
    if (!measured) return;
    let off = false;
    const go = () => {
      if (off) return;
      if (!recipe) {
        later(1700, () => setStage("open"));
        return;
      }
      const s = gRef.current;
      setPullPose(pullAt(s.outside));
      setPaperPose(paperAt(s.rise, s.lean * 4));
      setCarryPose(carryAt(s.rise));
      // Reach in and take hold…
      later(40, () => setPullPose(pullAt(s.grip, 650)));
      // …pull it over…
      later(760, () => {
        setPullPose(pullAt(s.grip + s.dx, 820, HAUL));
        shift.current({ dx: s.dx, ms: 820 * T, ease: HAUL });
      });
      // …and let go; the paper comes in as it does…
      later(1700, () => setPullPose(pullAt(s.outside, 600, LEAVE)));
      later(1780, () => {
        setPaperPose(paperAt(0, s.lean, 950));
        setCarryPose(carryAt(0, 950));
      });
      // …and is let go of in turn.
      later(2860, () => setCarryPose(carryAt(s.drop, 650, LEAVE)));
      later(3520, () => setStage("open"));
    };
    // The faces are what the paper is measured in.
    if (recipe && document.fonts) document.fonts.ready.then(go);
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
    // The hand comes back for the paper, and takes it…
    later(0, () => setCarryPose(carryAt(0, 600)));
    later(700, () => {
      setPaperPose(paperAt(s.rise, s.lean * 4, 750, LEAVE));
      setCarryPose(carryAt(s.rise, 750, LEAVE));
    });
    // …and the other, for the plate, and pushes it back.
    later(800, () => setPullPose(pullAt(s.grip + s.dx, 650)));
    later(1520, () => {
      setPullPose(pullAt(s.grip, 820, HAUL));
      shift.current({ dx: 0, ms: 820 * T, ease: HAUL });
    });
    later(2440, () => setPullPose(pullAt(s.outside, 600, LEAVE)));
    later(3080, () => gone.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave, stage]);

  /* -------------------------------------------- the words, for the rest */

  const ring = useRef<SVGTextElement>(null);
  const fit = Math.min(18, Math.max(13, R * 0.105));
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

  if (!recipe) {
    const box = 2 * (r + size * 2);
    const c = box / 2;
    const path = `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`;
    // The words run clockwise over the top, centred on it; they are written
    // out from their first letter.
    const from = ((circ * 0.25 - len / 2) / r) * (180 / Math.PI);
    const id = `ring-${setting.id}`;
    return (
      <div className={styles.reveal}>
        <svg
          className={`${styles.ring} ${garamond.className}`}
          data-leaving={stage === "closing" || undefined}
          width={box}
          height={box}
          style={{ left: px - c, top: py - c, visibility: len ? "visible" : "hidden" }}
          role="note"
        >
          <defs>
            <path id={`${id}-path`} d={path} />
            <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={box} height={box}>
              <path
                d={path}
                className={styles.pen}
                data-calm={calm || undefined}
                stroke="#fff"
                strokeWidth={size * 3}
                fill="none"
                transform={`rotate(${from} ${c} ${c})`}
                style={{ strokeDasharray: `${circ}px ${circ}px`, "--circ": `${circ}px` } as React.CSSProperties}
              />
            </mask>
          </defs>
          <text ref={ring} className={styles.words} fontSize={size} mask={`url(#${id}-mask)`}>
            <textPath href={`#${id}-path`} startOffset="25%" textAnchor="middle">
              {line}
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
      {!calm && pullPose && g.pull ? (
        <div className={styles.hand} style={{ width: g.pullW, height: g.pullL, ...at(pullPose) }}>
          <Drawn image={g.pull} width={g.pullW} openFoot />
        </div>
      ) : null}
    </div>
  );
}
