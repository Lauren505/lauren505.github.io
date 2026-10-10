"use client";

import Image from "next/image";
import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import Drawn from "@/components/Drawn";
import { garamond } from "@/components/recipeFonts";
import { decorations, type Recipe } from "@/content";
import styles from "./RecipePaper.module.css";

/** How far in from the box the sheet's edge is, in pixels: room for its torn
 *  edge to wander out, and for its shadow. */
const BLEED = 12;
/** How far in from the sheet's edge the words are, at the sides. */
const PAD_X = BLEED + 36;

/** The sprig tucked under the twine. */
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

/** A little random number generator, so the same twine is drawn the same
 *  every time. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

/** A cubic curve, walked about a pixel at a time: where each step is, and
 *  which way the curve goes there. */
const walk = ([a, b, c, d]: Curve) => {
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    };
  };
  const fine: Pt[] = [];
  for (let i = 0; i <= 400; i++) fine.push(at(i / 400));
  const steps: { p: Pt; tx: number; ty: number; s: number }[] = [];
  let s = 0;
  let next = 0;
  for (let i = 1; i < fine.length; i++) {
    const dx = fine[i].x - fine[i - 1].x;
    const dy = fine[i].y - fine[i - 1].y;
    const l = Math.hypot(dx, dy) || 1e-6;
    while (next <= s + l) {
      const f = (next - s) / l;
      steps.push({ p: { x: fine[i - 1].x + dx * f, y: fine[i - 1].y + dy * f }, tx: dx / l, ty: dy / l, s: next });
      next += 1;
    }
    s += l;
  }
  return steps;
};

const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * One length of jute twine along `curve`, as path data: three plies wound
 * round each other — the half of each turn that is behind, darker, and the
 * half in front, lighter, over it — and the loose hairs jute is covered in,
 * most lying along it, a few standing off it.
 */
function rope(curve: Curve, seed: number) {
  const rnd = random(seed);
  const steps = walk(curve);
  const R = 2.2;
  const PITCH = 8 + rnd() * 1.5;
  // Jute is uneven: thicker and thinner, and the twist tighter and looser.
  const wob = [rnd() * 6, rnd() * 6, 0.02 + rnd() * 0.02, 0.05 + rnd() * 0.03];
  const thick = (s: number) => 1 + 0.18 * Math.sin(s * wob[2] + wob[0]) + 0.08 * Math.sin(s * wob[3] + wob[1]);
  const back: string[] = [];
  const front: string[] = [];
  const groove: string[] = [];
  for (let ply = 0; ply < 3; ply++) {
    let was: boolean | null = null;
    for (const { p, tx, ty, s } of steps) {
      const a = (2 * Math.PI * s) / PITCH + (2 * Math.PI * ply) / 3 + 0.5 * Math.sin(s * wob[3] + wob[0]);
      const off = R * thick(s) * Math.sin(a);
      const x = n1(p.x - ty * off);
      const y = n1(p.y + tx * off);
      const facing = Math.cos(a) > 0;
      const into = facing ? front : back;
      into.push(`${was === facing ? "L" : "M"}${x} ${y}`);
      was = facing;
      // Where one ply goes under the next, a shadow.
      if (Math.abs(Math.cos(a)) < 0.1 && !facing && rnd() < 0.6) groove.push(`M${x} ${y}l${n1(-ty * 0.5 + tx * 0.6)} ${n1(tx * 0.5 + ty * 0.6)}`);
    }
  }
  const hairs: string[] = [];
  const strays: string[] = [];
  for (const { p, tx, ty } of steps) {
    if (rnd() < 0.6) {
      // Lying along the twine, a little off it.
      const side = rnd() < 0.5 ? -1 : 1;
      const o = R * (0.6 + rnd() * 0.9) * side;
      const len = 2 + rnd() * 5;
      const tilt = (rnd() - 0.3) * 0.7 * side;
      const sx = p.x - ty * o;
      const sy = p.y + tx * o;
      const dx = (tx * Math.cos(tilt) - ty * Math.sin(tilt)) * len * (rnd() < 0.5 ? -1 : 1);
      const dy = (ty * Math.cos(tilt) + tx * Math.sin(tilt)) * len * (Math.sign(dx) === Math.sign(tx * len) ? 1 : -1);
      hairs.push(`M${n1(sx)} ${n1(sy)}l${n1(dx)} ${n1(dy)}`);
    }
    if (rnd() < 0.05) {
      // Standing off it, curling.
      const side = rnd() < 0.5 ? -1 : 1;
      const len = 5 + rnd() * 9;
      const ang = (0.35 + rnd() * 0.8) * side;
      const dir = rnd() < 0.5 ? -1 : 1;
      const ux = (tx * Math.cos(ang) - ty * Math.sin(ang)) * dir;
      const uy = (ty * Math.cos(ang) + tx * Math.sin(ang)) * dir;
      const sx = p.x - ty * R * side * 0.8;
      const sy = p.y + tx * R * side * 0.8;
      const curl = (rnd() - 0.5) * len * 0.6;
      strays.push(
        `M${n1(sx)} ${n1(sy)}q${n1(ux * len * 0.5 - uy * curl)} ${n1(uy * len * 0.5 + ux * curl)} ${n1(ux * len)} ${n1(uy * len)}`,
      );
    }
  }
  return { back: back.join(""), front: front.join(""), groove: groove.join(""), hairs: hairs.join(""), strays: strays.join("") };
}

/** A length of jute twine across the card, twice round it, tied in a bow
 *  at `knot` — `width` long, `at` down from the top. */
function Twine({ width, at, knot }: { width: number; at: number; knot: number }) {
  const id = useId().replace(/:/g, "");
  const y = at;
  const k = knot;
  const P = (x: number, yy: number) => ({ x, y: yy });
  const curves: Curve[] = [
    [P(0, y - 1.5), P(width * 0.3, y + 1.5), P(width * 0.6, y - 4.5), P(width, y)],
    [P(0, y + 1.5), P(width * 0.3, y - 0.5), P(width * 0.6, y + 3.5), P(width, y + 0.5)],
    [P(k, y), P(k - 30, y - 26), P(k - 40, y + 6), P(k, y + 1)],
    [P(k, y), P(k + 30, y - 24), P(k + 42, y + 8), P(k, y + 1)],
    [P(k, y + 1), P(k - 6, y + 16), P(k - 16, y + 26), P(k - 22, y + 44)],
    [P(k, y + 1), P(k + 8, y + 14), P(k + 12, y + 30), P(k + 24, y + 40)],
    // The knot, the twine wound tight on itself.
    [P(k - 4, y - 3), P(k + 3, y - 5), P(k + 5, y + 4), P(k - 3, y + 4)],
    [P(k + 4, y - 2), P(k - 4, y - 4), P(k - 5, y + 5), P(k + 3, y + 5)],
  ];
  const ropes = curves.map((c, i) => rope(c, 17 + i * 31));
  return (
    <svg className={styles.twine} width={width} height={y + 60} aria-hidden>
      <defs>
        <filter id={`${id}-jute`} x="-2%" y="-20%" width="104%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur" />
          <feOffset in="blur" dx="0.8" dy="1.6" result="drop" />
          <feColorMatrix in="drop" type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.16  0 0 0 0 0.09  0 0 0 0.45 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="rough" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-jute)`}>
        {/* Each length whole before the next goes over it. */}
        {ropes.map((r, i) => (
          <g key={i}>
            <path d={r.strays} className={styles.stray} />
            <path d={r.back} className={styles.plyBack} />
            <path d={r.groove} className={styles.groove} />
            <path d={r.front} className={styles.plyFront} />
            <path d={r.hairs} className={styles.hair} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The square of brown card a photo is mounted on: board with a fine, even,
 *  sandy grain — specks a little darker and lighter than it, a few pale
 *  fibres, a felted surface — cut clean. It also has the filter
 *  that tears the photo's edges — `torn` — for the photo to use. */
function Kraft({ torn }: { torn: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={styles.kraftSheet} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        {/* The photo torn out, not cut: its edge eaten in a little and
            pushed about, and a thin rim of the white core of the print
            showing where it tore. */}
        <filter id={torn} x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="8" result="wave" />
          <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="14" result="tear" />
          <feComposite in="wave" in2="tear" operator="arithmetic" k2="0.6" k3="0.4" result="noise" />
          <feMorphology in="SourceAlpha" operator="erode" radius="2.5" result="in1" />
          <feDisplacementMap in="in1" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" result="rimShape" />
          <feMorphology in="rimShape" operator="erode" radius="1.2" result="in2" />
          <feFlood floodColor="#f4f0e8" result="white" />
          <feComposite in="white" in2="rimShape" operator="in" result="rim" />
          <feComposite in="SourceGraphic" in2="in2" operator="in" result="print" />
          <feMerge>
            <feMergeNode in="rim" />
            <feMergeNode in="print" />
          </feMerge>
        </filter>
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
          <feComposite in="tooth" in2="cut" operator="in" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="#9e8263" filter={`url(#${id}-kraft)`} />
    </svg>
  );
}

/** A gem paper clip, in two halves: the loop that lies over the paper,
 *  and the loop that goes behind it — seen through it, onion skin being as
 *  thin as it is. Drawn 16 by 66, the paper's edge 20 down. */
const CLIP = {
  front: "M4 18 V52 A4 4 0 0 0 12 52 V6 A5.5 5.5 0 0 0 1 6",
  back: "M1 6 V58 A7 7 0 0 0 15 58 V22",
};

function Clip({ part, id }: { part: "front" | "back"; id: string }) {
  return (
    <svg className={styles.clip} data-part={part} width="23" height="92" viewBox="-1 -1 18 68" aria-hidden>
      {part === "front" ? (
        <defs>
          <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0.15">
            <stop offset="0" stopColor="#5d6269" />
            <stop offset="0.45" stopColor="#c9ced4" />
            <stop offset="0.6" stopColor="#eef1f4" />
            <stop offset="1" stopColor="#80868e" />
          </linearGradient>
        </defs>
      ) : null}
      <path d={CLIP[part]} className={styles.wire} stroke={`url(#${id}-steel)`} />
      <path d={CLIP[part]} className={styles.glint} />
    </svg>
  );
}

/**
 * A sheet of onion skin clipped over the foot of the card: so thin the card
 * shows through it, with a fine grain and the faint cockle that thin paper
 * takes on — and a paper clip on its top edge, holding it on.
 */
function Onion({ children }: { children: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={styles.onionLay}>
      <Clip part="back" id={id} />
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
        <Clip part="front" id={id} />
        <div className={styles.onionWords}>{children}</div>
      </div>
    </div>
  );
}

/** The recipe's photos, each on a square of kraft card, tied to the card
 *  with twine and a sprig, hanging off it on the side `toward`. */
function Photos({ photos, width, toward }: { photos: Recipe["photos"]; width: number; toward: "left" | "right" }) {
  const w = Math.round(Math.min(width * 0.42, 300));
  const h = Math.round(w * 0.8);
  const over = w * 0.24;
  const left = toward === "right" ? width - w + over : -over;
  const fan = 16;
  const high = h + 40 + (photos.length - 1) * fan;
  const knot = toward === "right" ? left + w * 0.22 : left + w * 0.78;
  const span = { x0: Math.min(left, BLEED), x1: Math.max(left + w, width - BLEED) };
  const tornId = useId().replace(/:/g, "") + "torn";
  return (
    <div className={styles.photos} style={{ height: high, marginLeft: -PAD_X, width }}>
      {[...photos].reverse().map((p, n) => {
        const k = photos.length - 1 - n;
        const inward = (toward === "right" ? -1 : 1) * k * w * 0.14;
        return (
          <figure
            key={k}
            className={styles.kraft}
            style={{
              left: left + inward,
              top: 14 + (photos.length - 1 - k) * fan,
              width: w,
              height: h,
              transform: `rotate(${[-2.5, 3, -1.2, 2][k % 4]}deg)`,
            }}
          >
            <Kraft torn={`${tornId}-${k}`} />
            <div className={styles.photo} style={{ filter: `url(#${tornId}-${k})` }}>
              <Image src={p.image} alt={p.alt} fill sizes={`${w}px`} />
            </div>
          </figure>
        );
      })}
      {SPRIG ? (
        <div
          className={styles.sprig}
          style={{
            left: knot - h * 0.5,
            top: 14 + h * 0.1,
            width: h * 0.75,
            transform: `rotate(${toward === "right" ? -38 : 38}deg) scaleX(${toward === "right" ? 1 : -1})`,
          }}
        >
          <Drawn image={SPRIG} width={h * 0.75} />
        </div>
      ) : null}
      <div className={styles.tie} style={{ left: span.x0 }}>
        <Twine width={span.x1 - span.x0} at={14 + h * 0.46} knot={knot - span.x0} />
      </div>
    </div>
  );
}

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
  toward = "right",
  textured = true,
  onHeight,
}: {
  recipe: Recipe;
  title: string;
  width: number;
  minHeight?: number;
  /** How far down the card the words start, if not the usual. */
  lead?: number;
  toward?: "left" | "right";
  /** Whether to draw the paper yet — it is slow to: the words come first. */
  textured?: boolean;
  onHeight?: (h: number) => void;
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

  return (
    <div
      ref={box}
      className={`${styles.paper} ${garamond.className}`}
      style={{ width, minHeight, "--bleed": `${BLEED}px`, "--pad-x": `${PAD_X}px` } as React.CSSProperties}
    >
      {height && textured ? <Sheet width={width} height={height} /> : null}
      <div className={styles.words} style={lead === undefined ? undefined : { paddingTop: lead }}>
        <h2 className={styles.name}>{inline(recipe.name || title)}</h2>
        {recipe.portion ? (
          <p className={styles.portion}>
            {recipe.portionLabel ? `${recipe.portionLabel}: ` : null}
            {inline(recipe.portion)}
          </p>
        ) : null}

        {recipe.ingredients.some((g) => g.items.length) ? (
          <section>
            <h3 className={styles.heading}>Ingredients</h3>
            <div className={styles.shopping} data-grouped={recipe.ingredients.length > 1 || undefined}>
              {recipe.ingredients.map((g, i) => (
                <div key={i} className={styles.group}>
                  {g.heading ? <h4 className={styles.sub}>{inline(g.heading)}</h4> : null}
                  <ul className={styles.items}>
                    {g.items.map((item, k) => (
                      <li key={k}>{inline(item)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {recipe.steps.length || recipe.notes.length ? (
          <Onion>
            {recipe.steps.length ? (
              <section>
                <h3 className={styles.heading}>Steps</h3>
                <ol className={styles.steps}>
                  {recipe.steps.map((step, k) => (
                    <li key={k}>{inline(step)}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {recipe.notes.length ? (
              <section>
                {recipe.notes.map((n, k) => (
                  <Fragment key={k}>
                    {n.heading ? <h3 className={styles.heading}>{inline(n.heading)}</h3> : null}
                    <p className={styles.note}>{inline(n.text)}</p>
                  </Fragment>
                ))}
              </section>
            ) : null}
          </Onion>
        ) : null}

        {recipe.photos.length ? <Photos photos={recipe.photos} width={width} toward={toward} /> : null}
      </div>
    </div>
  );
}
