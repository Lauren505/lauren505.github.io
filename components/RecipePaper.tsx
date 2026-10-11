"use client";

import Image from "next/image";
import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import Drawn from "@/components/Drawn";
import { garamond } from "@/components/recipeFonts";
import { KINDS, decorations, type Box, type Item, type Layer, type Line, type Recipe, type RecipeCard } from "@/content";
import handles from "./TableSetting.module.css";
import styles from "./RecipePaper.module.css";

/** How far in from the box the sheet's edge is, in pixels: room for its torn
 *  edge to wander out, and for its shadow. */
const BLEED = 12;
/** How far in from the sheet's edge the words are, at the sides. */
const PAD_X = BLEED + 36;

/** The flower that can be laid on the card. */
const SPRIG = decorations.find((d) => d.id === "flower3")?.image;

/** *Italic* and **bold**, which is all a recipe needs of markdown in a line. */
const inline = (text: string) =>
  text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g).map((bit, i) =>
    /^\*\*.+\*\*$/.test(bit) ? (
      <strong key={i}>{bit.slice(2, -2)}</strong>
    ) : /^(\*|_).+\1$/.test(bit) ? (
      <em key={i}>{bit.slice(1, -1)}</em>
    ) : (
      <Fragment key={i}>{bit}</Fragment>
    ),
  );

/**
 * The sheet of handmade paper behind the words: cotton rag, its edges torn
 * rather than cut — a rectangle pushed about by three sizes of noise: the
 * wander of the edge, its tears, and the fibres — and its surface mottled
 * like cotton rag, so it has a tooth to it.
 */
function Sheet({ width, height }: { width: number; height: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={styles.sheet} width={width} height={height} aria-hidden>
      <defs>
        <filter id={`${id}-paper`} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="7" result="wave" />
          <feDisplacementMap in="SourceGraphic" in2="wave" scale="5" xChannelSelector="R" yChannelSelector="G" result="wavy" />
          <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="3" seed="11" result="tear" />
          <feDisplacementMap in="wavy" in2="tear" scale="13" xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" result="fibre" />
          <feDisplacementMap in="torn" in2="fibre" scale="4" xChannelSelector="R" yChannelSelector="G" result="sheet" />

          {/* The cotton, mottled: a relief lit from the top left, taken at
              a third of its strength over the sheet's own colour. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" seed="3" result="grain" />
          <feDiffuseLighting in="grain" surfaceScale="1.6" diffuseConstant="1.15" lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth="225" elevation="55" />
          </feDiffuseLighting>
          <feComposite in="lit" in2="sheet" operator="arithmetic" k1="0.3" k3="0.7" result="tooth" />

          {/* The torn edge is thinner than the rest of the sheet, and the
              light comes through it. */}
          <feMorphology in="sheet" operator="erode" radius="4" result="inner" />
          <feGaussianBlur in="inner" stdDeviation="2.5" result="soft" />
          <feComponentTransfer in="soft" result="body">
            <feFuncA type="linear" slope="0.4" intercept="0.6" />
          </feComponentTransfer>
          <feComposite in="tooth" in2="body" operator="in" result="paper" />

          <feGaussianBlur in="sheet" stdDeviation="3" result="blur" />
          <feOffset in="blur" dx="1" dy="2.5" result="drop" />
          <feColorMatrix
            in="drop"
            type="matrix"
            values="0 0 0 0 0.29  0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0.3 0"
            result="shadow"
          />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="paper" />
          </feMerge>
        </filter>
      </defs>
      <rect
        x={BLEED}
        y={BLEED}
        width={Math.max(0, width - BLEED * 2)}
        height={Math.max(0, height - BLEED * 2)}
        fill="#f6f4ef"
        filter={`url(#${id}-paper)`}
      />
    </svg>
  );
}

/** The square of brown card under a photo: board with a fine, even, sandy
 *  grain — specks a little darker and lighter than it, a few pale fibres, a
 *  felted surface — cut clean, with a soft edge and a side to it. */
function Kraft() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={styles.kraftSheet} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id={`${id}-kraft`} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
          {/* Cut clean, only a little furred where the knife went through. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="21" result="fur" />
          <feDisplacementMap in="SourceGraphic" in2="fur" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="cut" />

          {/* Barely uneven: the faintest drift of light and dark across it. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="9" result="drift" />
          <feColorMatrix in="drift" type="matrix" values="0 0 0 0 0.44  0 0 0 0 0.34  0 0 0 0 0.24  0.5 0 0 0 -0.18" result="tone" />
          <feComposite in="tone" in2="cut" operator="atop" result="toned" />

          {/* The grain of the board: close all over, like sand, soft — specks
              a shade darker and a shade lighter than it, some bigger, some
              smaller, which goes unevenly across it. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.48" numOctaves="2" seed="2" result="big" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="27" result="small" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="15" result="mix" />
          <feComposite in="big" in2="mix" operator="arithmetic" k1="1.1" k3="-0.05" result="bigHere" />
          <feComposite in="small" in2="mix" operator="arithmetic" k1="-1.1" k2="1" k3="0.05" result="smallHere" />
          <feComposite in="bigHere" in2="smallHere" operator="arithmetic" k2="1" k3="1" result="sandSharp" />
          <feGaussianBlur in="sandSharp" stdDeviation="0.25" result="sand" />
          <feColorMatrix in="sand" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.31  0 0 0 0 0.22  -2 0 0 0 0.92" result="dark" />
          <feColorMatrix in="sand" type="matrix" values="0 0 0 0 0.75  0 0 0 0 0.66  0 0 0 0 0.55  0 2 0 0 -1.05" result="light" />
          <feMerge result="grains">
            <feMergeNode in="dark" />
            <feMergeNode in="light" />
          </feMerge>
          <feComposite in="grains" in2="toned" operator="atop" result="sanded" />

          {/* A few longer fibres, a little paler, caught in the surface. */}
          <feTurbulence type="turbulence" baseFrequency="0.06 0.05" numOctaves="3" seed="13" result="thread" />
          <feColorMatrix in="thread" type="matrix" values="0 0 0 0 0.74  0 0 0 0 0.66  0 0 0 0 0.55  -7 0 0 0 0.2" result="threads" />
          <feComposite in="threads" in2="sanded" operator="atop" result="fibred" />

          {/* And the felt of it, lit from the top left. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="6" result="felt" />
          <feDiffuseLighting in="felt" surfaceScale="0.9" diffuseConstant="1.05" lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth="225" elevation="62" />
          </feDiffuseLighting>
          <feComposite in="lit" in2="fibred" operator="arithmetic" k1="0.2" k3="0.83" result="tooth" />

          {/* It is board, not paper: its edges rounded a little by the cut,
              catching the light along the top and left and falling away
              into shade along the bottom and right — and soft. */}
          <feGaussianBlur in="cut" stdDeviation="0.6" result="soft" />
          <feGaussianBlur in="soft" stdDeviation="1.6" result="height" />
          <feDiffuseLighting in="height" surfaceScale="0.4" diffuseConstant="1" lightingColor="#ffffff" result="bevel">
            <feDistantLight azimuth="225" elevation="45" />
          </feDiffuseLighting>
          <feComposite in="tooth" in2="bevel" operator="arithmetic" k1="1.38" result="rounded" />
          <feComposite in="rounded" in2="soft" operator="in" result="face" />

          {/* And thick enough that its cut side shows, along the bottom and
              right, a shade darker. */}
          <feOffset in="soft" dx="0.2" dy="0.3" result="under" />
          <feFlood floodColor="#977b5d" result="side" />
          <feComposite in="side" in2="under" operator="in" result="thickness" />
          <feMerge>
            <feMergeNode in="thickness" />
            <feMergeNode in="face" />
          </feMerge>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="#9e8263" filter={`url(#${id}-kraft)`} />
    </svg>
  );
}


/**
 * The paper a photo is printed on: white cotton card, cut clean and straight
 * — and along some stretches of its edges, torn by hand against a rule, so
 * beyond the straight edge, a little ridge there, is the tear: thinner,
 * fibrous, ragged, the light coming through it. Which stretches goes by
 * `seed`.
 */
function Mount({ seed = 1 }: { seed?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={styles.mountSheet} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id={`${id}-mount`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="3" result="wave" />
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="17" result="swayNoise" />
          <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="3" seed="8" result="tearNoise" />
          <feTurbulence type="turbulence" baseFrequency="0.7" numOctaves="2" seed="5" result="fibreNoise" />

          {/* The torn edge: pulled about at three sizes — wider and narrower
              along its length, its tears, and the fibres at its very edge. */}
          <feDisplacementMap in="SourceAlpha" in2="swayNoise" scale="9" xChannelSelector="R" yChannelSelector="G" result="sway" />
          <feDisplacementMap in="sway" in2="tearNoise" scale="7" xChannelSelector="R" yChannelSelector="G" result="tear" />
          <feDisplacementMap in="tear" in2="fibreNoise" scale="4" xChannelSelector="R" yChannelSelector="G" result="outer" />

          {/* The card at its full thickness, cut straight, a few pixels in
              from the edge of its box: the tear, where there is one, is
              beyond it. */}
          <feMorphology in="SourceAlpha" operator="erode" radius="5" result="core" />

          {/* Between them, the tear: thin, so only partly there, more where
              the fibres are. */}
          <feComposite in="outer" in2="core" operator="out" result="fringe0" />
          <feColorMatrix in="fibreNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.2" result="fibres" />
          <feComposite in="fringe0" in2="fibres" operator="arithmetic" k1="0.12" k2="0.9" result="fringe" />
          {/* Where it was torn, and where left as cut: long stretches of
              each, unevenly. Cut, it is the card whole to its edge. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="1" seed={seed} result="stretch" />
          <feColorMatrix in="stretch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  14 0 0 0 -6.9" result="torn" />
          <feComposite in="fringe" in2="torn" operator="in" result="tornFringe" />
          <feMerge result="shape">
            <feMergeNode in="tornFringe" />
            <feMergeNode in="core" />
          </feMerge>

          {/* Cotton white, with a tooth to it, lit from the top left. */}
          <feFlood floodColor="#f6f3ec" result="white" />
          <feComposite in="white" in2="shape" operator="in" result="paper" />
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="4" seed="11" result="grain" />
          <feDiffuseLighting in="grain" surfaceScale="1.2" diffuseConstant="1.12" lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth="225" elevation="58" />
          </feDiffuseLighting>
          <feComposite in="lit" in2="paper" operator="arithmetic" k1="0.25" k3="0.76" result="tooth" />
          <feComposite in="tooth" in2="shape" operator="in" result="card" />

          {/* The ridge where the full thickness stops: a soft line of shade
              just past it, more along the bottom and right. */}
          <feGaussianBlur in="core" stdDeviation="0.9" result="coreSoft" />
          <feOffset in="coreSoft" dx="0.5" dy="0.8" result="coreDown" />
          <feComposite in="coreDown" in2="core" operator="out" result="lip1" />
          <feComposite in="lip1" in2="torn" operator="in" result="lip0" />
          <feFlood floodColor="#7d7262" floodOpacity="0.42" result="lipShade" />
          <feComposite in="lipShade" in2="lip0" operator="in" result="lip" />

          <feMerge>
            <feMergeNode in="card" />
            <feMergeNode in="lip" />
          </feMerge>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="#fff" filter={`url(#${id}-mount)`} />
    </svg>
  );
}

/** A part of the card the editor can take hold of: one of the things laid
 *  on it, the steps, or the name. */
export type CardPart = { part: "item"; id: string } | { part: "steps" } | { part: "notes" } | { part: "name" };

/** Making up the card in the editor, in development only — see
 *  RecipeEditor: which part is chosen, and the card as it is changed. */
export type CardEdit = {
  selected: CardPart | null;
  select: (part: CardPart | null) => void;
  change: (card: RecipeCard) => void;
};

/** How a part is taken hold of: dragged, sized from its corner, turned from
 *  the stalk above it — or, for a photo, the picture moved in its box. */
type Grip = "move" | "size" | "turn" | "crop";
type Grab = (part: CardPart, grip: Grip, e: React.PointerEvent<HTMLElement>) => void;

export const samePart = (a: CardPart | null | undefined, b: CardPart) =>
  !!a && a.part === b.part && (a.part !== "item" || (b.part === "item" && a.id === b.id));
const same = samePart;

/** The corner and the stalk a chosen part is sized and turned by. */
function Handles({ part, grab }: { part: CardPart; grab: Grab }) {
  return (
    <>
      <span className={handles.turn} onPointerDown={(e) => grab(part, "turn", e)} />
      <span className={handles.size} onPointerDown={(e) => grab(part, "size", e)} />
    </>
  );
}

/** What the editor puts on a part it can take hold of. */
const holdable = (
  part: CardPart,
  grab: Grab | undefined,
  chosen: CardPart | null | undefined,
  grip: (e: React.PointerEvent<HTMLElement>) => Grip = () => "move",
) => ({
  "data-grab": "",
  "data-editing": grab ? "" : undefined,
  "data-selected": (grab && same(chosen, part)) || undefined,
  onPointerDown: grab ? (e: React.PointerEvent<HTMLElement>) => grab(part, grip(e), e) : undefined,
});

/** A box on the card, `width` wide, as a place on it — mirrored if `flip`. */
const placeOf = (b: Box, width: number, flip = false): React.CSSProperties => ({
  left: (flip ? 1 - b.x - b.width : b.x) * width,
  top: b.y * width,
  width: b.width * width,
  height: b.height * width,
  transform: `rotate(${flip ? -b.rotate : b.rotate}deg)`,
});

/** The clips, each in two halves: the wire that lies over the paper, and the
 *  wire that goes behind it — seen through it, onion skin being as thin as
 *  it is. `box` is what it is drawn in, `edge` how far down it the paper's
 *  edge comes, and `scale` how big it is drawn. */
const CLIPS = {
  gem: {
    front: "M4 18 V52 A4 4 0 0 0 12 52 V6 A5.5 5.5 0 0 0 1 6",
    back: "M1 6 V58 A7 7 0 0 0 15 58 V22",
    box: [16, 66],
    edge: 20,
    scale: 1.35,
    metal: ["#5d6269", "#c9ced4", "#eef1f4", "#80868e"],
  },
  // One wire bent into a drop — round over the top, a point at the foot —
  // its two ends crossing at the top, one of them run on down behind.
  drop: {
    front: "M17 3.5 C 7 0.5, 0.5 8, 3 15.5 L 14.5 41 L 26 15.5 C 28.5 9, 24 2.5, 15.5 2.8",
    back: "M15.5 2.8 C 13 9, 12.5 18, 13.5 29",
    box: [29, 44],
    edge: 11,
    scale: 1.25,
    metal: ["#9a7631", "#e2c47c", "#f6e6b4", "#b18b3c"],
  },
} as const;

/** One half of a clip: the wire over the papers it holds, or the wire
 *  behind them — seen through onion skin, as thin as it is, and hidden by
 *  anything thicker. */
function ClipArt({ kind, id, half }: { kind: "gem" | "drop"; id: string; half: "front" | "back" }) {
  const c = CLIPS[kind];
  const [w, h] = c.box;
  return (
    <svg width="100%" height="100%" viewBox={`-1 -1 ${w + 2} ${h + 2}`} preserveAspectRatio="none" overflow="visible" aria-hidden>
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0" stopColor={c.metal[0]} />
          <stop offset="0.45" stopColor={c.metal[1]} />
          <stop offset="0.6" stopColor={c.metal[2]} />
          <stop offset="1" stopColor={c.metal[3]} />
        </linearGradient>
      </defs>
      {half === "back" ? (
        <path d={c.back} className={styles.wire} stroke={`url(#${id}-metal)`} />
      ) : (
        <>
          <path d={c.front} className={styles.wire} stroke={`url(#${id}-metal)`} />
          <path d={c.front} className={styles.glint} />
        </>
      )}
    </svg>
  );
}

/** A gold stud pin through the paper into the card: a small domed head,
 *  lit from the top left. */
function StudArt({ id }: { id: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 11 11" overflow="visible" aria-hidden>
      <defs>
        <radialGradient id={`${id}-dome`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fbf0c8" />
          <stop offset="0.3" stopColor="#e2c26f" />
          <stop offset="0.75" stopColor="#b48f3e" />
          <stop offset="1" stopColor="#86672a" />
        </radialGradient>
      </defs>
      <circle cx="5.5" cy="5.5" r="4.8" fill={`url(#${id}-dome)`} />
      <circle cx="5.5" cy="5.5" r="4.6" fill="none" stroke="rgba(110, 80, 25, 0.35)" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * A sheet of onion skin: so thin the card shows through it, with a fine
 * grain and the faint cockle that thin paper takes on.
 */
function OnionArt() {
  const id = useId().replace(/:/g, "");
  return (
    <div className={styles.onion}>
        <svg className={styles.onionSkin} width="100%" height="100%" aria-hidden>
          <defs>
            <filter id={`${id}-skin`} x="-4%" y="-8%" width="108%" height="120%" colorInterpolationFilters="sRGB">
              {/* Its edge: cut straight, against the torn card under it, but
                  soft, the paper being so thin. */}
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.7" result="sheet" />

              {/* Thicker and thinner in patches, as it was made: how much of
                  the card shows through goes with them. */}
              <feTurbulence type="fractalNoise" baseFrequency="0.018 0.026" numOctaves="4" seed="31" result="cloud" />
              <feColorMatrix
                in="cloud"
                type="matrix"
                values="0 0 0 0 0.937  0 0 0 0 0.941  0 0 0 0 0.929  0.5 0 0 0 0.22"
                result="density"
              />
              <feComposite in="density" in2="sheet" operator="in" result="body" />

              {/* The cockle: long, low swells, lit from the top left. */}
              <feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves="3" seed="12" result="swell" />
              <feDiffuseLighting in="swell" surfaceScale="3" diffuseConstant="1" lightingColor="#ffffff" result="lit">
                <feDistantLight azimuth="225" elevation="50" />
              </feDiffuseLighting>
              <feColorMatrix
                in="lit"
                type="matrix"
                values="0 0 0 0 0.35  0 0 0 0 0.33  0 0 0 0 0.3  -0.35 0 0 0 0.27"
                result="swells"
              />
              <feComposite in="swells" in2="sheet" operator="in" result="shade" />

              {/* The grain: fine, lighter streaks running across it, the way
                  the fibres lie — a coarser grain and a finer one, stronger in
                  some places than others. */}
              <feTurbulence type="fractalNoise" baseFrequency="0.1 0.8" numOctaves="3" seed="4" result="coarse" />
              <feTurbulence type="fractalNoise" baseFrequency="0.3 1.5" numOctaves="2" seed="19" result="fine" />
              <feComposite in="coarse" in2="fine" operator="arithmetic" k2="0.6" k3="0.4" result="streak" />
              <feColorMatrix
                in="streak"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.99  2.4 0 0 0 -1.0"
                result="streaks"
              />
              <feTurbulence type="fractalNoise" baseFrequency="0.015 0.04" numOctaves="2" seed="7" result="where" />
              <feColorMatrix in="where" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.8 0 0 0 -0.35" result="strength" />
              <feComposite in="streaks" in2="strength" operator="arithmetic" k1="1" result="grainy" />
              <feComposite in="grainy" in2="sheet" operator="in" result="grain" />

              {/* And the shadow it casts, as soft as its edge — only beyond
                  it: under the sheet, it would show through it. */}
              <feGaussianBlur in="sheet" stdDeviation="3" result="blur" />
              <feOffset in="blur" dx="0" dy="2.5" result="drop" />
              <feColorMatrix
                in="drop"
                type="matrix"
                values="0 0 0 0 0.24  0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0.22 0"
                result="dark"
              />
              <feComposite in="dark" in2="sheet" operator="out" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="body" />
                <feMergeNode in="shade" />
                <feMergeNode in="grain" />
              </feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="#fff" filter={`url(#${id}-skin)`} />
        </svg>
    </div>
  );
}

/**
 * "RECIPE" across the top of the card, blind debossed: pressed into the
 * paper without ink, so it is the paper's own colour, seen only by the light
 * — the upper and left walls of each letter in shade, the lower and right
 * ones catching the light, and the floor of it a shade deeper.
 */
function Deboss({ text, crest }: { text: string; crest?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={styles.deboss}
      width="100%"
      height="1.5em"
      role="img"
      aria-label={text}
      // The middle of the capitals is about 0.77em down it.
      style={crest === undefined ? undefined : { top: `calc(${crest}px - 0.77em)` }}
    >
      <defs>
        <filter id={`${id}-press`} x="-5%" y="-30%" width="110%" height="160%" colorInterpolationFilters="sRGB">
          {/* The floor: the paper pressed down, a shade deeper. */}
          <feFlood floodColor="#5a4c40" floodOpacity="0.07" result="deep" />
          <feComposite in="deep" in2="SourceAlpha" operator="in" result="floor" />

          {/* The walls in shade: where the letter, moved down and right,
              no longer covers itself. */}
          <feOffset in="SourceAlpha" dx="0.75" dy="0.95" result="down" />
          <feComposite in="SourceAlpha" in2="down" operator="out" result="upper" />
          <feGaussianBlur in="upper" stdDeviation="0.4" result="upperSoft" />
          <feFlood floodColor="#3f342b" floodOpacity="0.55" result="shade" />
          <feComposite in="shade" in2="upperSoft" operator="in" result="shaded" />

          {/* The walls in the light: the same, the other way. */}
          <feOffset in="SourceAlpha" dx="-0.55" dy="-0.7" result="up" />
          <feComposite in="SourceAlpha" in2="up" operator="out" result="lower" />
          <feGaussianBlur in="lower" stdDeviation="0.35" result="lowerSoft" />
          <feFlood floodColor="#ffffff" floodOpacity="0.9" result="light" />
          <feComposite in="light" in2="lowerSoft" operator="in" result="lit" />

          <feMerge result="pressed">
            <feMergeNode in="floor" />
            <feMergeNode in="shaded" />
            <feMergeNode in="lit" />
          </feMerge>
          <feComposite in="pressed" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <text x="50%" dx="0.21em" y="1.1em" textAnchor="middle" className={styles.debossText} filter={`url(#${id}-press)`}>
        {text}
      </text>
    </svg>
  );
}

/**
 * One thing laid on the card, where its `box` says — mirrored if `flip` —
 * and `z` in front of the card: in the editor it can be taken hold of. A
 * clip is drawn in its two halves, the back one `under` in front of the
 * card, behind the papers it holds.
 */
function Thing({
  item,
  photos,
  width,
  flip,
  z,
  under,
  grab,
  chosen,
}: {
  item: Item;
  photos: Recipe["photos"];
  width: number;
  flip: boolean;
  z: number;
  under: number;
  grab?: Grab;
  chosen?: CardPart | null;
}) {
  const id = useId().replace(/:/g, "");
  const me = { part: "item", id: item.id } as const;
  const b = item.box;
  let art: React.ReactNode = null;
  if (item.kind === "onion") art = <OnionArt />;
  else if (item.kind === "kraft") art = <Kraft />;
  else if (item.kind === "white") art = <Mount seed={item.seed ?? 7} />;
  else if (item.kind === "gem" || item.kind === "drop") art = <ClipArt kind={item.kind} id={id} half="front" />;
  else if (item.kind === "stud") art = <StudArt id={id} />;
  else if (item.kind === "flower" && SPRIG && b)
    art = (
      <div style={{ transform: !!item.mirror !== flip ? "scaleX(-1)" : undefined }}>
        <Drawn image={SPRIG} width={b.width * width} />
      </div>
    );
  else if (item.kind === "photo") {
    const photo = photos[item.photo ?? 0];
    const c = item.crop ?? { zoom: 1, x: 50, y: 50 };
    if (photo && b)
      art = (
        <div className={styles.photo}>
          <Image
            src={photo.image}
            alt={photo.alt}
            fill
            sizes={`${Math.round(b.width * width * c.zoom)}px`}
            style={{
              objectPosition: `${c.x}% ${c.y}%`,
              transform: c.zoom === 1 ? undefined : `scale(${c.zoom})`,
              transformOrigin: `${c.x}% ${c.y}%`,
            }}
          />
        </div>
      );
  }
  const place = b ? placeOf(b, width, flip) : {};
  return (
    <>
      {(item.kind === "gem" || item.kind === "drop") && b ? (
        <div className={styles.thing} data-kind={item.kind} data-half="back" style={{ ...place, zIndex: under }}>
          <ClipArt kind={item.kind} id={`${id}b`} half="back" />
        </div>
      ) : null}
      <div
        className={styles.thing}
        data-kind={item.kind}
        data-thing={item.id}
        data-fitted={!b || undefined}
        {...holdable(me, grab, chosen, (e) => (item.kind === "photo" && e.altKey ? "crop" : "move"))}
        style={{ ...place, zIndex: z }}
      >
        {art}
        {grab && same(chosen, me) ? <Handles part={me} grab={grab} /> : null}
      </div>
    </>
  );
}

/** Lines of a list as the file has them: each run of items one list — the
 *  steps numbered from where the file numbers them — and any other line
 *  words of its own between them. */
function Lines({ lines, numbered = false }: { lines: Line[]; numbered?: boolean }) {
  const runs: (Line | Line[])[] = [];
  for (const l of lines) {
    const last = runs[runs.length - 1];
    if (l.item && Array.isArray(last)) last.push(l);
    else runs.push(l.item ? [l] : l);
  }
  return (
    <>
      {runs.map((r, k) =>
        !Array.isArray(r) ? (
          <p key={k} className={numbered ? styles.stepWords : styles.itemWords}>
            {inline(r.text)}
          </p>
        ) : numbered ? (
          <ol key={k} className={styles.steps} start={r[0].n ?? 1}>
            {r.map((l, j) => (
              <li key={j} value={l.n}>
                {inline(l.text)}
              </li>
            ))}
          </ol>
        ) : (
          <ul key={k} className={styles.items}>
            {r.map((l, j) => (
              <li key={j}>{inline(l.text)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/** Which kinds of things are paper, for a clip or pin to hold. */
const PAPER = new Set<Item["kind"]>(["onion", "kraft", "white", "photo"]);

/**
 * A recipe, printed on a card of handmade paper the way a menu is: the name,
 * what it makes, then the ingredients and the steps, and
 * its photos tied on at the foot, hanging off the side `toward`. It is
 * `width` wide and as long as the recipe, or `minHeight` if that is longer;
 * `onHeight` is told how long it is.
 */
export default function RecipePaper({
  recipe,
  title,
  width,
  minHeight = 0,
  lead,
  crest,
  toward = "right",
  textured = true,
  onHeight,
  card,
  edit,
}: {
  recipe: Recipe;
  title: string;
  width: number;
  minHeight?: number;
  /** How far down the card the words start, if not the usual. */
  lead?: number;
  /** How far down the card the middle of "RECIPE" is, if not the usual. */
  crest?: number;
  toward?: "left" | "right";
  /** Whether to draw the paper yet — it is slow to: the words come first. */
  textured?: boolean;
  onHeight?: (h: number) => void;
  /** How the card is made up: where its photos and its sheet lie. */
  card: RecipeCard;
  /** In the editor: the parts of the card can be taken hold of. */
  edit?: CardEdit;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const told = useRef(onHeight);
  told.current = onHeight;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const h = el.offsetHeight;
      setHeight(h);
      told.current?.(h);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    // The faces arriving change how long it is.
    document.fonts?.ready.then(read);
    return () => watch.disconnect();
  }, [width]);

  const flipFoot = toward === "left";

  /** Taking hold of a part: drag it, size it from its corner or turn it from
   *  its stalk, until the pointer lets go. Moves are in fractions of the
   *  card's width — mirrored, under the steps, when things hang off the
   *  left. */
  const grab: Grab | undefined = edit
    ? (part, grip, e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        edit.select(part);
        const el = (e.currentTarget.closest("[data-grab]") as HTMLElement | null) ?? e.currentTarget;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const x0 = e.clientX;
        const y0 = e.clientY;
        const angle = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
        const a0 = angle(x0, y0);
        const start = card;
        // Where it is drawn as it is taken hold of, for onion skin that is
        // just round the steps, and so has no box of its own yet.
        const drawn: Box = {
          x: el.offsetLeft / width,
          y: el.offsetTop / width,
          width: el.offsetWidth / width,
          height: el.offsetHeight / width,
          rotate: -1.1,
        };
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - x0) / width;
          const dy = (ev.clientY - y0) / width;
          const turn = angle(ev.clientX, ev.clientY) - a0;
          if (part.part === "item") {
            const it = start.items.find((x): x is Item => typeof x !== "string" && x.id === part.id);
            if (!it) return;
            const f = it.at === "foot" && flipFoot ? -1 : 1;
            const b = it.box ?? drawn;
            let next: Item;
            if (grip === "crop") {
              // The picture moved in its box: dragging it right shows more
              // of its left.
              const c = it.crop ?? { zoom: 1, x: 50, y: 50 };
              const k = 100 / c.zoom;
              const clamp = (v: number) => Math.max(0, Math.min(100, v));
              next = { ...it, crop: { ...c, x: clamp(c.x - (dx / b.width) * k * f), y: clamp(c.y - (dy / b.height) * k) } };
            } else if (grip === "move") next = { ...it, box: { ...b, x: b.x + dx * f, y: b.y + dy } };
            else if (grip === "size") {
              const w = Math.max(0.01, b.width + dx);
              // Clips, pins and the flower keep their shape.
              const h = KINDS[it.kind].keepShape ? (w * b.height) / b.width : Math.max(0.01, b.height + dy);
              // Its near edge stays where it is, whichever way it is drawn.
              next = { ...it, box: { ...b, width: w, height: h, x: f < 0 ? b.x - (w - b.width) : b.x } };
            } else next = { ...it, box: { ...b, rotate: b.rotate + turn * f } };
            edit.change({ ...start, items: start.items.map((x) => (x === it ? next : x)) });
          } else if (part.part === "steps" || part.part === "notes") {
            const st = start[part.part];
            edit.change({
              ...start,
              [part.part]:
                grip === "move"
                  ? { ...st, x: st.x + dx, y: st.y + dy }
                  : grip === "size"
                    ? { ...st, width: Math.max(0.2, (st.width ?? drawn.width) + dx) }
                    : { ...st, rotate: st.rotate + turn },
            });
          } else {
            edit.change({ ...start, nameDrop: start.nameDrop + dy });
          }
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }
    : undefined;
  const chosen = edit?.selected;

  // What is laid on the card, each in its place in front of the one before
  // — two apart, so a clip's back half can go between — and how far down
  // under the steps it reaches, so the card is long enough.
  const order = card.items;
  const zOf = (x: Layer) => 2 * (order.indexOf(x) + 1);

  // A clip holds every paper it is over: its back half behind the furthest
  // back of them, its front half in front of the furthest forward — and a
  // pin goes through them all, its head in front. Found from where they are
  // drawn.
  const [grips, setGrips] = useState<Record<string, { under: number; over: number }>>({});
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const rectOf = (id: string) => root.querySelector(`[data-thing="${id}"]`)?.getBoundingClientRect();
    const papers = order
      .filter((x): x is Item => typeof x !== "string" && PAPER.has(x.kind))
      .map((p) => ({ z: zOf(p), r: rectOf(p.id) }));
    const next: Record<string, { under: number; over: number }> = {};
    for (const x of order) {
      if (typeof x === "string" || PAPER.has(x.kind) || x.kind === "flower") continue;
      const r = rectOf(x.id);
      const own = zOf(x);
      const held = r
        ? papers.filter((p) => p.r && p.r.left < r.right && p.r.right > r.left && p.r.top < r.bottom && p.r.bottom > r.top)
        : [];
      next[x.id] = held.length
        ? { under: Math.min(...held.map((p) => p.z)) - 1, over: Math.max(own, ...held.map((p) => p.z + 1)) }
        : { under: own - 1, over: own };
    }
    if (JSON.stringify(next) !== JSON.stringify(grips)) setGrips(next);
  });
  const things = (at: Item["at"]) =>
    order
      .filter((x): x is Item => typeof x !== "string" && x.at === at)
      .map((it) => (
        <Thing
          key={it.id}
          item={it}
          photos={recipe.photos}
          width={width}
          flip={at === "foot" && flipFoot}
          z={grips[it.id]?.over ?? zOf(it)}
          under={grips[it.id]?.under ?? zOf(it) - 1}
          grab={grab}
          chosen={chosen}
        />
      ));
  const footItems = order.filter((x): x is Item => typeof x !== "string" && x.at === "foot" && !!x.box);
  const footHigh = footItems.length ? Math.max(0, ...footItems.map((it) => (it.box!.y + it.box!.height) * width)) + 26 : 0;

  /** The steps, or the notes, where the card has them and in their place
   *  among what is laid on it. */
  const words = (part: "steps" | "notes", children: React.ReactNode) => (
    <div
      className={styles.stepsText}
      data-words={part}
      {...holdable({ part }, grab, chosen)}
      style={{
        transform: `translate(${card[part].x * width}px, ${card[part].y * width}px) rotate(${card[part].rotate}deg)`,
        width: card[part].width === undefined ? undefined : card[part].width * width,
        zIndex: order.includes(part) ? zOf(part) : 2,
      }}
    >
      {children}
      {grab && same(chosen, { part }) ? <Handles part={{ part }} grab={grab} /> : null}
    </div>
  );

  return (
    <div
      ref={box}
      className={`${styles.paper} ${garamond.className}`}
      style={{ width, minHeight, "--bleed": `${BLEED}px`, "--pad-x": `${PAD_X}px` } as React.CSSProperties}
    >
      {height && textured ? <Sheet width={width} height={height} /> : null}
      <div className={styles.words} style={lead === undefined ? undefined : { paddingTop: lead }}>
        <Deboss text="RECIPE" crest={crest} />
        <h2
          className={styles.name}
          {...holdable({ part: "name" }, grab, chosen)}
          style={{ marginTop: card.nameDrop * width }}
        >
          {inline(recipe.name || title)}
        </h2>
        {recipe.portion ? (
          <p className={styles.portion}>
            {recipe.portionLabel ? `${recipe.portionLabel}: ` : null}
            {inline(recipe.portion)}
          </p>
        ) : null}

        {recipe.ingredients.some((g) => g.lines.length) ? (
          <section>
            <h3 className={styles.heading}>Ingredients</h3>
            <div className={styles.shopping} data-grouped={recipe.ingredients.length > 1 || undefined}>
              {recipe.ingredients.map((g, i) => (
                <div key={i} className={styles.group}>
                  {g.heading ? <h4 className={styles.sub}>{inline(g.heading)}</h4> : null}
                  <Lines lines={g.lines} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Where the steps are — and where what is laid round them is
            measured from, whether there are any steps or not. */}
        <div className={styles.stepsArea}>
          <div className={styles.layer}>{things("steps")}</div>
          {recipe.steps.length
            ? words(
                "steps",
                <section>
                  <h3 className={styles.heading}>Steps</h3>
                  <Lines lines={recipe.steps} numbered />
                </section>,
              )
            : null}
          {recipe.notes.length
            ? words(
                "notes",
                <section>
                  {recipe.notes.map((n, k) => (
                    <Fragment key={k}>
                      {n.heading ? <h3 className={styles.heading}>{inline(n.heading)}</h3> : null}
                      <p className={styles.note}>{inline(n.text)}</p>
                    </Fragment>
                  ))}
                </section>,
              )
            : null}
        </div>

        {/* Under the steps, at the foot of the card: the photos, as a rule. */}
        <div className={styles.foot} style={{ height: footHigh, marginLeft: -PAD_X, width, paddingTop: footHigh ? undefined : 0 }}>
          <div className={styles.layer} style={{ left: 0 }}>
            {things("foot")}
          </div>
        </div>
      </div>
    </div>
  );
}
