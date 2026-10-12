/**
 * The tablecloth on the bakery page, as a drawing: a grid of crayon lines on
 * cream, drawn by hand — which is to say no two gaps the same, no line quite
 * straight, and the odd thread doubled.
 *
 * It is drawn from a fixed seed, so the same window always gets the same cloth.
 * That is what lets the flat picture (the far face of a turn, a reader who has
 * asked for less motion) and the texture the falling cloth is printed with be
 * the same pixels: the cloth lands flat on the window, and the picture it lands
 * as is this one.
 */

/** The cloth itself, a shade lighter than the page it is laid on. */
export const CLOTH = "#f8f4ec";
const INK = "#d98a7b";
const SEED = 0x5eed;
/** How far the tassels hang past the ends of the cloth, in CSS pixels. The
 *  cloth is the window less this much at the left and at the right. */
const FRINGE = 30;

/** Mulberry32: small, fast, and the same numbers in every browser. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Rand = () => number;

/** Capped, since the cloth is the whole window and past two the texture is
 *  larger than anything could tell apart. Both the picture and the scene read
 *  it from here, so they are drawn at the same resolution. */
export const clothDpr = () => Math.min(window.devicePixelRatio || 1, 2);

/** Where the lines fall along one side: roughly a cell apart, never exactly,
 *  and now and then a second line close beside the first. */
const stops = (len: number, cell: number, r: Rand) => {
  const out: { at: number; width: number }[] = [];
  let at = r() * cell * 0.45;
  while (at < len + cell * 0.5) {
    out.push({ at, width: 2.8 + r() * 1.1 });
    if (r() < 0.3) out.push({ at: at + 5 + r() * 4, width: 1.8 + r() * 0.8 });
    at += cell * (0.62 + r() * 0.76);
  }
  return out;
};

/** One line, drawn the way a hand draws it: leaning a little over its length,
 *  bowed a little in the middle, and wandering either side of both. `place`
 *  turns a distance along the line and an offset across it into a point. */
const line = (
  ctx: CanvasRenderingContext2D,
  len: number,
  width: number,
  place: (along: number, off: number) => [number, number],
  r: Rand,
) => {
  const lean = (r() - 0.5) * len * 0.012;
  const bow = (r() - 0.5) * 7;
  const f1 = 1.2 + r() * 2.2;
  const f2 = 5 + r() * 7;
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const a1 = 0.7 + r() * 1.5;
  const a2 = 0.25 + r() * 0.5;
  const steps = Math.ceil(len / 9);

  // Two passes, the second thinner and a hair off the first, so the line has
  // the uneven body of a crayon rather than the even one of a pen.
  for (const [w, alpha, shift] of [
    [width, 0.86, 0],
    [width * 0.55, 0.5, 0.6 + r() * 0.5],
  ]) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const off =
        shift +
        lean * s +
        bow * Math.sin(Math.PI * s) +
        a1 * Math.sin(s * f1 * Math.PI * 2 + p1) +
        a2 * Math.sin(s * f2 * Math.PI * 2 + p2) +
        (r() - 0.5) * 0.5;
      const [x, y] = place(-10 + s * (len + 20), off);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = w;
    ctx.globalAlpha = alpha;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** Speckle to rub the lines back with, so they have the tooth of crayon on
 *  rough paper. A tile rather than the whole window: it is only noise. */
const grain = (r: Rand) => {
  const size = 256;
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const g = tile.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const a = r();
    img.data[i * 4 + 3] = a < 0.4 ? Math.round((1 - a / 0.4) * 210) : 0;
  }
  g.putImageData(img, 0, 0);
  return tile;
};

/** A fringe along one end of the cloth, drawn by hand: each tassel a couple
 *  of strands from the hem, gathered into a little knot, none quite the same
 *  length or quite the same distance from the next. `dir` is which way out of
 *  the cloth the end faces. */
const tassels = (
  ctx: CanvasRenderingContext2D,
  edge: number,
  dir: 1 | -1,
  h: number,
  r: Rand,
) => {
  let y = 10 + r() * 8;
  while (y < h - 4) {
    const len = 15 + r() * 7;
    const lean = (r() - 0.5) * 5;
    const kx = edge + dir * len;
    const ky = y + lean;

    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.3 + r() * 0.5;
    for (const spread of [-2.2, 0.1, 2.3]) {
      ctx.beginPath();
      ctx.moveTo(edge - dir * 1.5, y + spread * 0.9);
      ctx.quadraticCurveTo(
        edge + dir * len * 0.5,
        y + spread * 0.8 + (r() - 0.5) * 2,
        kx - dir * 2,
        ky + spread * 0.35,
      );
      ctx.stroke();
    }

    // The knot: a small, lumpy round.
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 3.4 + r() * 1.2, 2.8 + r() * 1.1, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    y += 19 + r() * 7;
  }
  ctx.globalAlpha = 1;
};

/** How far the cloth runs past the top and the bottom of a window `view`
 *  pixels tall, so that neither edge comes into sight while it is drawn in and
 *  lifted up in the air. A multiple of four, so the part of it the window
 *  shows starts on a whole device pixel at any usual pixel ratio. */
export const clothOver = (view: number) => Math.round((view * 0.12) / 4) * 4;

/**
 * Draws part of the cloth into `target`, at the cloth's resolution.
 *
 * The cloth is `w` wide and runs the length of the table — `length`, from the
 * top of the page — and past both ends of it by clothOver() of the window, so
 * neither end is ever seen. `from` and `to` are the stretch of it to draw, in
 * the same page coordinates: the whole table, for the cloth lying on it, or
 * the window's worth the falling cloth is printed with. Either way it is the
 * same cloth, so where the two overlap they are the same pixels.
 */
export function drawCloth(
  target: HTMLCanvasElement,
  w: number,
  length: number,
  from: number,
  to: number,
) {
  const dpr = clothDpr();
  const over = clothOver(window.innerHeight);
  /** The cloth's own height, which is what everything below is drawn in. */
  const h = length + over * 2;
  const top = -(over + from);
  target.width = Math.max(1, Math.round(w * dpr));
  target.height = Math.max(1, Math.round((to - from) * dpr));
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const r = rng(SEED);

  // The cloth stops short of the window at both ends, where the tassels hang
  // onto the table. Everything else about it is inside [x0, x1].
  const x0 = FRINGE;
  const x1 = w - FRINGE;
  const bw = x1 - x0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.fillStyle = CLOTH;
  ctx.fillRect(Math.round(x0 * dpr), 0, Math.round(bw * dpr), target.height);

  // The lines go on a layer of their own, so the grain can rub at them and not
  // at the cloth, and so they can be multiplied in: where two cross, the
  // colour deepens, as it does where two threads of a gingham do.
  const layer = document.createElement("canvas");
  layer.width = target.width;
  layer.height = target.height;
  const lc = layer.getContext("2d")!;
  lc.setTransform(dpr, 0, 0, dpr, 0, top * dpr);
  lc.strokeStyle = INK;
  lc.fillStyle = INK;
  lc.lineCap = "round";
  lc.lineJoin = "round";

  // The grid and the hem are the cloth's, so they stop where it does.
  lc.save();
  lc.beginPath();
  lc.rect(x0, 0, bw, h);
  lc.clip();

  const cell = Math.min(104, Math.max(52, Math.min(bw, h) / 9.5));
  for (const { at, width } of stops(bw, cell, r)) {
    line(lc, h, width, (along, off) => [x0 + at + off, along], r);
  }
  for (const { at, width } of stops(h, cell, r)) {
    line(lc, bw, width, (along, off) => [x0 + along, at + off], r);
  }

  // A hem, just in from the edge — which is only ever really seen while the
  // cloth is in the air, and along the two ends the tassels hang from.
  const hem = 8;
  line(lc, bw, 1.6, (along, off) => [x0 + along, hem + off * 0.4], r);
  line(lc, bw, 1.6, (along, off) => [x0 + along, h - hem + off * 0.4], r);
  line(lc, h, 1.8, (along, off) => [x0 + hem * 0.6 + off * 0.4, along], r);
  line(lc, h, 1.8, (along, off) => [x1 - hem * 0.6 + off * 0.4, along], r);
  lc.restore();

  // The tassels, on the table beyond the two ends — see tassels().
  tassels(lc, x0, -1, h, r);
  tassels(lc, x1, 1, h, r);

  lc.globalCompositeOperation = "destination-out";
  lc.fillStyle = lc.createPattern(grain(r), "repeat")!;
  lc.fillRect(0, 0, w, h);

  // Multiplied onto the cloth, and laid plainly over the bare table beyond it:
  // multiply over nothing is just the colour, but only where the cloth is.
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}
