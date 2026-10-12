// Written by scripts/frame-specs.mjs — run `npm run frames` after adding or
// changing a frame in public/models/gallery/frames/. Do not edit by hand.

/**
 * What the gallery knows about each frame before it has loaded it, in the
 * frame file's own units: its outside `size`, the `opening` an artwork is
 * seen through, and how `depth` it stands off the wall, with how high the
 * face round the opening is (`lip`: a mount, or a moulding's inside edge),
 * which an artwork hung `flush` is lifted to. A solid block has no
 * opening but a `face` the artwork goes on: the part of its front level with
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
  "frame1.glb": { size: [5.992, 4.124], opening: [5.651, 3.772], depth: 0.203, lip: 0.056 },
  "frame2.glb": { size: [4.134, 2.504], opening: [3.654, 2.024], depth: 0.225, lip: 0.041 },
  "frame3.glb": { size: [2.961, 1.68], opening: [2.683, 1.406], depth: 0.137, lip: 0.129 },
  "frame4.glb": { size: [5.23, 4.124], opening: [4.738, 3.708], depth: 0.1, lip: 0.074 },
  "frame5.glb": { size: [3.127, 2.111], opening: [2.981, 1.964], depth: 0.077, lip: 0.077 },
  "frame6.glb": { size: [4.193, 2.494], opening: [3.706, 2.109], depth: 0.178, lip: 0.054 },
  "frame7.glb": { size: [4.354, 3.248], opening: [3.81, 2.757], depth: 0.148, lip: 0.14 },
  "frame8.glb": { size: [2.072, 2.456], opening: [1.88, 2.274], depth: 0.111, lip: 0.107 },
  "frame9.glb": { size: [6.344, 3.679], opening: null, depth: 0.177, face: { size: [6.093, 3.437], height: 0.154 } },
};
