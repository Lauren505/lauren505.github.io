"use client";

import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { garamond, script } from "@/components/recipeFonts";
import type { Recipe } from "@/content";
import styles from "./RecipePaper.module.css";

/** How far in from the box the sheet's edge is, in pixels: room for its torn
 *  edge to wander out, and for its shadow. */
const BLEED = 12;

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
 * A recipe, printed on a card of handmade paper the way a menu is: the name
 * under a flourish, what it makes, then the ingredients and the steps. It is
 * `width` wide and as long as the recipe; `onHeight` is told how long that is.
 */
export default function RecipePaper({
  recipe,
  title,
  width,
  onHeight,
}: {
  recipe: Recipe;
  title: string;
  width: number;
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
      style={{ width, "--bleed": `${BLEED}px` } as React.CSSProperties}
    >
      {height ? <Sheet width={width} height={height} /> : null}
      <div className={styles.words}>
        <p className={`${styles.the} ${script.className}`} aria-hidden>
          the
        </p>
        <h2 className={styles.name}>{inline(recipe.name || title)}</h2>
        {recipe.portion ? <p className={styles.portion}>{inline(recipe.portion)}</p> : null}

        {recipe.ingredients.some((g) => g.items.length) ? (
          <section>
            <h3 className={styles.heading}>Ingredients</h3>
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
      </div>
    </div>
  );
}
