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

/** A length of garden twine across the card, two strands twisted, tied in
 *  a bow at `knot` — `width` long, its strands `at` down from the top. */
function Twine({ width, at, knot }: { width: number; at: number; knot: number }) {
  const y = at;
  const strand = (dy: number, wob: number) =>
    `M 0 ${y + dy} C ${width * 0.3} ${y + dy + wob}, ${width * 0.6} ${y + dy - wob}, ${width} ${y + dy + wob / 2}`;
  const k = knot;
  const loops = [
    `M ${k} ${y} C ${k - 30} ${y - 26}, ${k - 40} ${y + 6}, ${k} ${y + 1}`,
    `M ${k} ${y} C ${k + 30} ${y - 24}, ${k + 42} ${y + 8}, ${k} ${y + 1}`,
  ];
  const tails = [
    `M ${k} ${y + 1} C ${k - 6} ${y + 16}, ${k - 16} ${y + 26}, ${k - 22} ${y + 44}`,
    `M ${k} ${y + 1} C ${k + 8} ${y + 14}, ${k + 12} ${y + 30}, ${k + 24} ${y + 40}`,
  ];
  const all = [strand(-1.5, 3), strand(1.5, -2), ...loops, ...tails];
  return (
    <svg className={styles.twine} width={width} height={y + 60} aria-hidden>
      {all.map((d, i) => (
        <path key={`b${i}`} d={d} className={styles.strand} />
      ))}
      {/* The twist of it. */}
      {all.map((d, i) => (
        <path key={`t${i}`} d={d} className={styles.twist} />
      ))}
      <circle cx={k} cy={y + 1} r={3.2} className={styles.knot} />
    </svg>
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
            <div className={styles.shopping}>
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

        {recipe.photos.length ? <Photos photos={recipe.photos} width={width} toward={toward} /> : null}
      </div>
    </div>
  );
}
