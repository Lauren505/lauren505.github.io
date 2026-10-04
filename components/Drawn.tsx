"use client";

import { useLayoutEffect, useRef } from "react";
import type { StaticImageData } from "next/image";
import { CLOTH } from "@/components/clothPattern";
import styles from "./Drawn.module.css";

/** The size the silhouette is worked out at, along the drawing's longer side,
 *  whatever size it is shown at — so every drawing is filled the same way at
 *  every size. It is only ever under the lines, which cover its edge, so it
 *  needs no more resolution than that. */
const WORK = 480;
/** The widest gap in a drawing's outline that still counts as closed, as a
 *  fraction of its longer side. Past this the fill leaks out through the gap
 *  and the drawing is left empty; much more and the gaps between a fork's
 *  tines start filling in. 2% is what every drawing uploaded so far needs. */
const GAP = 0.022;

/**
 * Closes a drawing that is open at its foot — a hand, whose arm is two lines
 * running off the bottom of it — with a line from the end of one to the end of
 * the other, so the arm is filled with the hand. The ends are the lowest ink
 * there is, and the lowest ink at least a tenth of the drawing away from it
 * sideways: the other line, rather than more of the same one.
 */
const seal = (ink: Uint8Array, w: number, h: number) => {
  const low = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      if (ink[y * w + x]) {
        low[x] = y;
        break;
      }
    }
  }
  let a = 0;
  for (let x = 1; x < w; x++) if (low[x] > low[a]) a = x;
  if (low[a] < 0) return;
  const apart = Math.round(Math.max(w, h) * 0.1);
  let b = -1;
  for (let x = 0; x < w; x++) {
    if (Math.abs(x - a) > apart && low[x] >= 0 && (b < 0 || low[x] > low[b])) b = x;
  }
  if (b < 0) return;
  const steps = Math.max(Math.abs(b - a), Math.abs(low[b] - low[a]));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(a + ((b - a) * s) / steps);
    const y = Math.round(low[a] + ((low[b] - low[a]) * s) / steps);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < w && py >= 0 && py < h) ink[py * w + px] = 1;
      }
    }
  }
};

/**
 * Everything inside a line drawing's outline, as a mask: the drawing's own
 * strokes, thickened by `close` pixels to bridge the gaps a crayon leaves in
 * them, then everything the outside cannot reach, then thinned by the same
 * amount again so the edge is back under the line it came from. `openFoot`
 * closes it at the bottom first — see seal.
 */
const silhouette = (alpha: Uint8ClampedArray, w: number, h: number, close: number, openFoot: boolean) => {
  let ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = alpha[i * 4 + 3] > 40 ? 1 : 0;
  if (openFoot) seal(ink, w, h);

  // A square window either way, one axis at a time: `grow` takes the max of
  // it, and a shrink is the same pass over the inverse.
  const grow = (src: Uint8Array, r: number) => {
    const mid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      // Forwards and backwards: the nearest set pixel on either side.
      let last = -Infinity;
      for (let x = 0; x < w; x++) {
        if (src[y * w + x]) last = x;
        if (x - last <= r) mid[y * w + x] = 1;
      }
      last = Infinity;
      for (let x = w - 1; x >= 0; x--) {
        if (src[y * w + x]) last = x;
        if (last - x <= r) mid[y * w + x] = 1;
      }
    }
    const out = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let last = -Infinity;
      for (let y = 0; y < h; y++) {
        if (mid[y * w + x]) last = y;
        if (y - last <= r) out[y * w + x] = 1;
      }
      last = Infinity;
      for (let y = h - 1; y >= 0; y--) {
        if (mid[y * w + x]) last = y;
        if (last - y <= r) out[y * w + x] = 1;
      }
    }
    return out;
  };

  ink = grow(ink, close);

  // Flood the outside in from the border; whatever it does not reach is the
  // drawing's inside, strokes included.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!ink[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }

  // Thinned back: growing the outside is shrinking the inside.
  const inside = grow(outside, close);
  for (let i = 0; i < w * h; i++) inside[i] = inside[i] ? 0 : 1;
  return inside;
};

/** Every drawing's fill, once worked out — it takes a moment — so the same
 *  drawing shown again, as a plate's copy brought up close is, is filled from
 *  its very first frame, and never shows the cloth through it. */
const fills = new Map<string, ImageData>();

const paint = (canvas: HTMLCanvasElement, fill: ImageData) => {
  canvas.width = fill.width;
  canvas.height = fill.height;
  canvas.getContext("2d")?.putImageData(fill, 0, 0);
};

/**
 * One of the uploaded line drawings — a plate, a fork, a hand — filled with the cloth's
 * colour inside its outline, so it lies on top of the tablecloth rather than
 * the grid showing through it.
 *
 * The drawings are outlines only, so the fill is worked out from the lines
 * themselves (see silhouette) rather than drawn: any drawing added to the
 * folder is filled the same way. A hand's arm runs off the bottom of its
 * drawing, open, so it is closed there first — `openFoot`.
 */
export default function Drawn({
  image,
  width,
  openFoot = false,
}: {
  image: StaticImageData;
  width: number;
  openFoot?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = (width * image.height) / image.width;

  // Before it is first painted, if it has been worked out already.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const key = `${image.src}|${openFoot}`;
    const known = fills.get(key);
    if (known) {
      paint(canvas, known);
      return;
    }
    let gone = false;
    const img = new Image();
    img.onload = () => {
      if (gone) return;
      const scale = WORK / Math.max(image.width, image.height);
      const close = Math.max(2, Math.round(WORK * GAP));
      // A margin all round, wider than the gaps being closed, so the outside
      // can be flooded right round the drawing even where it touches its edge.
      const pad = close + 3;
      const w = Math.max(1, Math.round(image.width * scale)) + pad * 2;
      const h = Math.max(1, Math.round(image.height * scale)) + pad * 2;
      const work = document.createElement("canvas");
      work.width = w;
      work.height = h;
      const wc = work.getContext("2d", { willReadFrequently: true });
      if (!wc) return;
      wc.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
      const px = wc.getImageData(0, 0, w, h);
      const inside = silhouette(px.data, w, h, close, openFoot);

      const [r, g, b] = [1, 3, 5].map((i) => parseInt(CLOTH.slice(i, i + 2), 16));
      for (let i = 0; i < w * h; i++) {
        px.data[i * 4] = r;
        px.data[i * 4 + 1] = g;
        px.data[i * 4 + 2] = b;
        px.data[i * 4 + 3] = inside[i] ? 255 : 0;
      }
      const fill = new ImageData(w - pad * 2, h - pad * 2);
      for (let y = 0; y < fill.height; y++) {
        const from = ((y + pad) * w + pad) * 4;
        fill.data.set(px.data.subarray(from, from + fill.width * 4), y * fill.width * 4);
      }
      fills.set(key, fill);
      paint(canvas, fill);
    };
    img.src = image.src;
    return () => {
      gone = true;
    };
  }, [image, openFoot]);

  return (
    <span className={styles.drawn} style={{ width, height }}>
      <canvas ref={ref} className={styles.fill} aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- a vector drawing,
          drawn at whatever size it is asked for; there is nothing to optimise. */}
      <img src={image.src} alt="" className={styles.line} draggable={false} />
    </span>
  );
}
