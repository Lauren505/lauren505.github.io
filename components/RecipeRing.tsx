"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Laid } from "@/components/bakeryLayout";
import { hand as handwriting } from "@/components/recipeFonts";
import styles from "./RecipeRing.module.css";

/** How long after one letter the next is begun — see .letter in the
 *  stylesheet for how long each takes. */
const PER_LETTER = 42;
/** How long the words take to fade, once they are put away. */
const FADE = 450;

/**
 * What clicking a dessert with no recipe brings: a sentence, written around
 * its plate by hand — clockwise over the top, one letter at a time, each
 * inked in. `leave` fades it, written or not, and
 * `onGone` is told when it has.
 */
export default function RecipeRing({
  setting,
  scale,
  line,
  leave,
  onGone,
}: {
  setting: Laid;
  scale: number;
  line: string;
  leave: boolean;
  onGone: () => void;
}) {
  const calm = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const plate = setting.plate;
  const R = (Math.max(plate.width, plate.height) / 2) * scale;

  // Written smaller, if it is too long to go most of the way round.
  const text = useRef<SVGTextElement>(null);
  const fit = Math.min(21, Math.max(14, R * 0.123));
  const [size, setSize] = useState(fit);
  const [len, setLen] = useState(0);
  const r = R + 8;
  const circ = 2 * Math.PI * r;
  useLayoutEffect(() => {
    const measure = () => {
      const t = text.current;
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
  }, [size, fit, circ]);

  const letters = useMemo(() => [...line], [line]);
  const gone = useRef(onGone);
  gone.current = onGone;
  const leaving = leave;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => gone.current(), calm ? 0 : FADE);
    return () => window.clearTimeout(t);
  }, [leaving, calm]);

  const box = 2 * (r + size * 2);
  const c = box / 2;
  // Round from the foot of the plate, clockwise, so the words — centred
  // over the top — have the whole way round to run either side.
  const path = `M ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r}`;
  const id = `ring-${setting.id}`;
  return (
    <div className={styles.layer}>
      <svg
        className={`${styles.ring} ${handwriting.className}`}
        data-leaving={leaving || undefined}
        data-writing={(len > 0 && !calm) || undefined}
        data-calm={calm || undefined}
        width={box}
        height={box}
        style={{ left: plate.x * scale - c, top: plate.y * scale - c, visibility: len ? "visible" : "hidden" }}
        role="note"
        aria-label={line}
      >
        <defs>
          <path id={`${id}-path`} d={path} />
        </defs>
        <text ref={text} className={styles.words} fontSize={size} aria-hidden>
          <textPath href={`#${id}-path`} startOffset="50%" textAnchor="middle">
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
