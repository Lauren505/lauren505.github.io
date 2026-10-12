// Measures every frame under public/models/gallery/frames/ and writes what the
// gallery needs to know about each before it has loaded one: how big it is,
// how big the opening in it is, and how deep it stands off the wall — see
// content/frames.ts, which this writes. Run it after adding or changing a
// frame:
//
//   npm run frames
//
// Each .glb is read with glTF-Transform, which undoes the compression the
// frames are shipped with (meshopt geometry, WebP textures). The opening is found the way you would find it by
// hand — by looking through the middle of the frame and walking outwards until
// there is wood in the way. A frame with no opening (a canvas block) is solid:
// the artwork goes on its face.

import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "public", "models", "gallery", "frames");
const OUT = path.join(ROOT, "content", "frames.ts");

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/** Every triangle in the file, in the scene's own space: each mesh node's
 *  whole transform applied, and compressed or quantized geometry read back
 *  as the numbers it stands for — and turned half way round about the
 *  vertical, as the gallery hangs every frame (Blender's exporter leaves a
 *  frame facing into the wall; see FrameModel). So +z here is towards the
 *  room, and what is measured is the side that is seen. */
async function triangles(file) {
  const doc = await io.read(file);
  const tris = [];
  const apply = (m, [x, y, z]) => [
    -(m[0] * x + m[4] * y + m[8] * z + m[12]),
    m[1] * x + m[5] * y + m[9] * z + m[13],
    -(m[2] * x + m[6] * y + m[10] * z + m[14]),
  ];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const at = (k) => apply(world, pos.getElement(idx ? idx.getScalar(k) : k, []));
      for (let k = 0; k + 2 < n; k += 3) tris.push([at(k), at(k + 1), at(k + 2)]);
    }
  }
  return tris;
}

/** The z of every face a ray straight into the wall at (x, y) passes through. */
const through = (tris, x, y) => {
  const zs = [];
  for (const [A, B, C] of tris) {
    const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / d;
    const w = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / d;
    if (u >= 0 && w >= 0 && u + w <= 1) zs.push(A[2] + u * (B[2] - A[2]) + w * (C[2] - A[2]));
  }
  return zs;
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const specs = {};
for (const name of readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort()) {
  const tris = await triangles(path.join(DIR, name));
  let [l, r, b, t, back, front] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const tri of tris)
    for (const [x, y, z] of tri) {
      [l, r, b, t] = [Math.min(l, x), Math.max(r, x), Math.min(b, y), Math.max(t, y)];
      [back, front] = [Math.min(back, z), Math.max(front, z)];
    }
  const [cx, cy] = [(l + r) / 2, (b + t) / 2];
  const solid = through(tris, cx, cy).length > 0;

  // Out from the middle until the ray meets the frame, to a hundredth of a
  // percent of its width: halved each step.
  const edge = (dx, dy, reach) => {
    let lo = 0;
    let hi = reach;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (through(tris, cx + dx * m, cy + dy * m).length) hi = m;
      else lo = m;
    }
    return lo;
  };
  const opening = solid
    ? null
    : [r3(edge(1, 0, (r - l) / 2) + edge(-1, 0, (r - l) / 2)), r3(edge(0, 1, (t - b) / 2) + edge(0, -1, (t - b) / 2))];

  // The face round an opening — a mount, or the inside edge of a moulding —
  // as how high off the wall it is, just outside the opening on each side: the
  // lowest of the four, should one side's moulding run higher.
  let lip = null;
  if (opening) {
    const top = (x, y) => Math.max(-Infinity, ...through(tris, x, y));
    const out = 0.01;
    const sides = [
      top(cx + opening[0] / 2 + out, cy),
      top(cx - opening[0] / 2 - out, cy),
      top(cx, cy + opening[1] / 2 + out),
      top(cx, cy - opening[1] / 2 - out),
    ].filter(Number.isFinite);
    if (sides.length) lip = r3(Math.min(...sides) - back);
  }

  // A solid block's face: the part of its front level with the middle of it,
  // which is the whole front for a plain block, and the panel for one with a
  // rim or a board round it, raised or sunk. Walked out to the same way as an
  // opening, to where the front steps up or down.
  let face = null;
  if (solid) {
    const top = (x, y) => Math.max(-Infinity, ...through(tris, x, y));
    const level = top(cx, cy);
    const flat = (dx, dy, reach) => {
      let lo = 0;
      let hi = reach;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (Math.abs(top(cx + dx * m, cy + dy * m) - level) > 0.002) hi = m;
        else lo = m;
      }
      return lo;
    };
    face = {
      size: [r3(flat(1, 0, (r - l) / 2) + flat(-1, 0, (r - l) / 2)), r3(flat(0, 1, (t - b) / 2) + flat(0, -1, (t - b) / 2))],
      height: r3(level - back),
    };
  }

  specs[name] = {
    size: [r3(r - l), r3(t - b)],
    opening,
    depth: r3(front - back),
    ...(lip !== null ? { lip } : {}),
    ...(face ? { face } : {}),
  };
  console.log(name, JSON.stringify(specs[name]));
}

const body = Object.entries(specs)
  .map(
    ([k, s]) =>
      `  ${JSON.stringify(k)}: { size: ${JSON.stringify(s.size).replace(",", ", ")}, opening: ${
        s.opening ? JSON.stringify(s.opening).replace(",", ", ") : "null"
      }, depth: ${s.depth}${s.lip !== undefined ? `, lip: ${s.lip}` : ""}${
        s.face ? `, face: { size: ${JSON.stringify(s.face.size).replace(",", ", ")}, height: ${s.face.height} }` : ""
      } },`,
  )
  .join("\n");
writeFileSync(
  OUT,
  `// Written by scripts/frame-specs.mjs — run \`npm run frames\` after adding or
// changing a frame in public/models/gallery/frames/. Do not edit by hand.

/**
 * What the gallery knows about each frame before it has loaded it, in the
 * frame file's own units: its outside \`size\`, the \`opening\` an artwork is
 * seen through, and how \`depth\` it stands off the wall, with how high the
 * face round the opening is (\`lip\`: a mount, or a moulding's inside edge),
 * which an artwork hung \`flush\` is lifted to. A solid block has no
 * opening but a \`face\` the artwork goes on: the part of its front level with
 * its middle — all of it, or a panel set in a rim or raised on a board —
 * and how high off the wall that is.
 */
export type FrameSpec = {
  size: [number, number];
  opening: [number, number] | null;
  depth: number;
  lip?: number;
  face?: { size: [number, number]; height: number };
};

export const FRAME_SPECS: Record<string, FrameSpec> = {
${body}
};
`,
);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
