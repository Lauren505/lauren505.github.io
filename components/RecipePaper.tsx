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

/** The sprig laid over the photos. */
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

/**
 * The card a photo is mounted on: white cotton card, its edges torn by hand
 * against a rule — so the full thickness of it stops at a line that is all
 * but straight, a little ridge, and beyond that the tear: thinner, fibrous,
 * ragged at its edge, the light coming through it.
 */
function Mount() {
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

          {/* The card at its full thickness, ending at a line not quite
              straight, a few pixels in from the tear. */}
          <feMorphology in="SourceAlpha" operator="erode" radius="5" result="core0" />
          <feDisplacementMap in="core0" in2="wave" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="core" />

          {/* Between them, the tear: thin, so only partly there, more where
              the fibres are. */}
          <feComposite in="outer" in2="core" operator="out" result="fringe0" />
          <feColorMatrix in="fibreNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.2" result="fibres" />
          <feComposite in="fringe0" in2="fibres" operator="arithmetic" k1="0.25" k2="0.75" result="fringe" />
          <feMerge result="shape">
            <feMergeNode in="fringe" />
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
          <feComposite in="coreDown" in2="core" operator="out" result="lip0" />
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

/** What holds the onion skin on: a steel gem clip, a gold teardrop clip, or
 *  a gold stud pin through it. */
export type Fastener = "gem" | "drop" | "stud";

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

function Clip({ kind, part, id }: { kind: "gem" | "drop"; part: "front" | "back"; id: string }) {
  const c = CLIPS[kind];
  const [w, h] = c.box;
  return (
    <svg
      className={styles.clip}
      data-part={part}
      data-kind={kind}
      width={(w + 2) * c.scale}
      height={(h + 2) * c.scale}
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      style={{ top: -(c.edge + 1) * c.scale }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-${part}-metal`} x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0" stopColor={c.metal[0]} />
          <stop offset="0.45" stopColor={c.metal[1]} />
          <stop offset="0.6" stopColor={c.metal[2]} />
          <stop offset="1" stopColor={c.metal[3]} />
        </linearGradient>
      </defs>
      <path d={c[part]} className={styles.wire} stroke={`url(#${id}-${part}-metal)`} />
      <path d={c[part]} className={styles.glint} />
    </svg>
  );
}

/** A gold stud pin through the sheet into the card: a small domed head,
 *  lit from the top left. */
function Stud({ id }: { id: string }) {
  return (
    <svg className={styles.stud} width="11" height="11" viewBox="0 0 11 11" aria-hidden>
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

/** Which fastener a recipe's sheet has: one of them, by its name, so it is
 *  always the same one. */
const fastenerFor = (id: string): Fastener => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (["gem", "drop", "stud"] as const)[h % 3];
};

/**
 * A sheet of onion skin clipped over the foot of the card: so thin the card
 * shows through it, with a fine grain and the faint cockle that thin paper
 * takes on — and held on by `fastener`: a clip on its top edge, or a pin
 * through it.
 */
function Onion({ fastener, children }: { fastener: Fastener; children: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={styles.onionLay}>
      {fastener !== "stud" ? <Clip kind={fastener} part="back" id={id} /> : null}
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
        {fastener !== "stud" ? <Clip kind={fastener} part="front" id={id} /> : <Stud id={id} />}
        <div className={styles.onionWords}>{children}</div>
      </div>
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

/** The recipe's photos, each on a square of torn white card, with a sprig laid
 *  over them, hanging off the card on the side `toward`. */
function Photos({ photos, width, toward }: { photos: Recipe["photos"]; width: number; toward: "left" | "right" }) {
  const w = Math.round(Math.min(width * 0.42, 300));
  const h = Math.round(w * 0.8);
  const over = w * 0.24;
  const left = toward === "right" ? width - w + over : -over;
  const fan = 16;
  const high = h + 40 + (photos.length - 1) * fan;
  const tuck = toward === "right" ? left + w * 0.22 : left + w * 0.78;
  return (
    <div className={styles.photos} style={{ height: high, marginLeft: -PAD_X, width }}>
      {[...photos].reverse().map((p, n) => {
        const k = photos.length - 1 - n;
        const inward = (toward === "right" ? -1 : 1) * k * w * 0.14;
        return (
          <figure
            key={k}
            className={styles.mount}
            style={{
              left: left + inward,
              top: 14 + (photos.length - 1 - k) * fan,
              width: w,
              height: h,
              transform: `rotate(${[-2.5, 3, -1.2, 2][k % 4]}deg)`,
            }}
          >
            <Mount />
            <div className={styles.photo}>
              <Image src={p.image} alt={p.alt} fill sizes={`${w}px`} />
            </div>
          </figure>
        );
      })}
      {SPRIG ? (
        <div
          className={styles.sprig}
          style={{
            left: tuck - h * 0.5,
            top: 14 + h * 0.1,
            width: h * 0.75,
            transform: `rotate(${toward === "right" ? -38 : 38}deg) scaleX(${toward === "right" ? 1 : -1})`,
          }}
        >
          <Drawn image={SPRIG} width={h * 0.75} />
        </div>
      ) : null}
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
  crest,
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
  /** How far down the card the middle of "RECIPE" is, if not the usual. */
  crest?: number;
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
        <Deboss text="RECIPE" crest={crest} />
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
          <Onion fastener={fastenerFor(recipe.id)}>
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
