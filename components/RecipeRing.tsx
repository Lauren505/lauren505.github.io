"use client";

import { getImageProps } from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Laid, Piece } from "@/components/bakeryLayout";
import { hand as handwriting } from "@/components/bakeryFonts";
import styles from "./RecipeRing.module.css";

/** How long after one letter the next is begun — see .letter in the
 *  stylesheet for how long each takes. */
const PER_LETTER = 42;
/** How long the words take to fade, once they are put away. */
const FADE = 450;
/** How far out from the edge of the plate the words go, in pixels. */
const GAP = 8;
/** How many ways round the plate its edge is looked for. */
const WAYS = 180;

/** How far a drawing or a photo reaches every way round from its middle —
 *  WAYS distances, as fractions of its width — and how tall it is for how
 *  wide; found once for each. */
type Reach = { far: number[]; tall: number };
const reaches = new Map<string, Promise<Reach | null>>();

const reachOf = (image: Piece["image"]) => {
  let got = reaches.get(image.src);
  if (got) return got;
  got = new Promise<Reach | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || image.width;
      const nh = img.naturalHeight || image.height;
      const k = 200 / Math.max(nw, nh);
      const w = Math.max(1, Math.round(nw * k));
      const h = Math.max(1, Math.round(nh * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      const a = ctx.getImageData(0, 0, w, h).data;
      const far = new Array<number>(WAYS).fill(-1);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (a[(y * w + x) * 4 + 3] < 60) continue;
          const dx = (x + 0.5 - w / 2) / w;
          const dy = (y + 0.5 - h / 2) / w;
          const way = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * WAYS) % WAYS;
          far[way] = Math.max(far[way], Math.hypot(dx, dy));
        }
      if (far.every((r) => r < 0)) return resolve(null);
      resolve({ far, tall: h / w });
    };
    img.onerror = () => resolve(null);
    // A small copy is all the outline needs: it is read at 200 pixels, and
    // the photo itself can run to megabytes. Same origin, so the canvas can
    // read it back; a drawing comes through as it is.
    img.src = getImageProps({ src: image, alt: "", width: 256 }).props.src;
  });
  reaches.set(image.src, got);
  return got;
};

/** Any way round with nothing in it, as the ways either side of it; then
 *  smoothed, so a wobble in a line, or a scallop, is not followed — but
 *  only after each way has taken the furthest of those near it, so a corner
 *  sticking out is gone round, not cut across. */
const evenOut = (far: number[]) => {
  const filled = far.map((r, i) => {
    if (r >= 0) return r;
    for (let d = 1; d < WAYS; d++) {
      const l = far[(i - d + WAYS) % WAYS];
      const r2 = far[(i + d) % WAYS];
      if (l >= 0 || r2 >= 0) return Math.max(l, r2);
    }
    return 0;
  });
  const SPAN = 5;
  const outer = filled.map((_, i) => {
    let most = 0;
    for (let d = -SPAN; d <= SPAN; d++) most = Math.max(most, filled[(i + d + WAYS) % WAYS]);
    return most;
  });
  return outer.map((_, i) => {
    let sum = 0;
    for (let d = -SPAN; d <= SPAN; d++) sum += outer[(i + d + WAYS) % WAYS];
    return sum / (SPAN * 2 + 1);
  });
};

/** How far the plate and what is on it reach together, every way round from
 *  the middle of the plate, in pixels on the window: each piece's own reach,
 *  as big as it is drawn, turned as it is and moved to where it is. */
const together = (pieces: { piece: Piece; reach: Reach }[], from: Piece, scale: number) => {
  const far = new Array<number>(WAYS).fill(-1);
  for (const { piece, reach } of pieces) {
    // Drawn as wide as its box, or as tall, whichever it meets first.
    const w = Math.min(piece.width, piece.height / reach.tall) * scale;
    const turn = ((piece.rotate || 0) * Math.PI) / 180;
    const ox = (piece.x - from.x) * scale;
    const oy = (piece.y - from.y) * scale;
    reach.far.forEach((f, i) => {
      if (f < 0) return;
      const a = ((i + 0.5) / WAYS) * 2 * Math.PI + turn;
      const x = ox + f * w * Math.cos(a);
      const y = oy + f * w * Math.sin(a);
      const way = Math.floor(((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * WAYS) % WAYS;
      far[way] = Math.max(far[way], Math.hypot(x, y));
    });
  }
  return evenOut(far);
};

/**
 * What clicking a dessert with no recipe brings: a sentence, written around
 * its plate by hand — clockwise over the top, one letter at a time, each
 * inked in — following the edge of the plate, whatever its shape. `leave` fades it, written or not, and
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
  const r = R + GAP;

  // The way round: round the edge of the plate, and of the dessert where it
  // comes over it — a circle, if neither can be read.
  const dessert = setting.dessert;
  const [reach, setReach] = useState<number[] | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    Promise.all([reachOf(plate.image), reachOf(dessert.image)]).then(([p, d]) => {
      if (off) return;
      const pieces = [
        ...(p ? [{ piece: plate, reach: p }] : []),
        ...(d ? [{ piece: dessert, reach: d }] : []),
      ];
      setReach(p ? together(pieces, plate, scale) : null);
    });
    return () => {
      off = true;
    };
  }, [plate, dessert, scale]);
  const round = useMemo(() => {
    if (!reach) return null;
    const pts = reach.map((f, i) => {
      const a = ((i + 0.5) / WAYS) * 2 * Math.PI;
      // Out far enough that the tails of the letters clear it too.
      const d = f + GAP + size * 0.45;
      return { x: d * Math.cos(a), y: d * Math.sin(a) };
    });
    // From the foot of it, round clockwise.
    const foot = pts.reduce((b, p, i) => (Math.abs(Math.atan2(p.y, p.x) - Math.PI / 2) < Math.abs(Math.atan2(pts[b].y, pts[b].x) - Math.PI / 2) ? i : b), 0);
    const ring = [...pts.slice(foot), ...pts.slice(0, foot)];
    let len = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const half = {
      x: Math.max(...ring.map((p) => Math.abs(p.x))),
      y: Math.max(...ring.map((p) => Math.abs(p.y))),
    };
    return { ring, len, half };
  }, [reach, size]);
  const circ = round ? round.len : 2 * Math.PI * r;

  useLayoutEffect(() => {
    // Not until the way round is known, so it is written once, in place.
    if (reach === undefined) return;
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
  }, [size, fit, circ, reach]);

  const letters = useMemo(() => [...line], [line]);
  const gone = useRef(onGone);
  gone.current = onGone;
  const leaving = leave;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => gone.current(), calm ? 0 : FADE);
    return () => window.clearTimeout(t);
  }, [leaving, calm]);

  const bw = 2 * ((round ? round.half.x : r) + size * 2);
  const bh = 2 * ((round ? round.half.y : r) + size * 2);
  const cx = bw / 2;
  const cy = bh / 2;
  // Round from the foot of the plate, clockwise, so the words — centred
  // over the top — have the whole way round to run either side.
  const path = round
    ? `M ${round.ring.map((p) => `${(cx + p.x).toFixed(1)} ${(cy + p.y).toFixed(1)}`).join(" L ")} Z`
    : `M ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r}`;
  const id = `ring-${setting.id}`;
  return (
    <div className={styles.layer}>
      <svg
        className={`${styles.ring} ${handwriting.className}`}
        data-leaving={leaving || undefined}
        data-writing={(len > 0 && !calm) || undefined}
        data-calm={calm || undefined}
        width={bw}
        height={bh}
        style={{ left: plate.x * scale - cx, top: plate.y * scale - cy, visibility: len ? "visible" : "hidden" }}
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
