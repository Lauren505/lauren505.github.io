import type { StaticImageData } from "next/image";
import { FRAME_SPECS } from "./frames";
// @gallery-pictures-start — written by the gallery editor from the `image`
// names below; add an import by hand and it will be kept as long as a frame
// uses it.
import altar from "./media/gallery/altar.jpg";
import echoWorld from "./media/gallery/echo_world.jpg";
import appleFilm from "./media/gallery/stills/apple-film.jpg";
import apples from "./media/gallery/stills/apples.jpg";
import chicagoJazz from "./media/gallery/stills/chicago-jazz.jpg";
import echoGate from "./media/gallery/stills/echo-gate.jpg";
import espressoFilm from "./media/gallery/stills/espresso-film.jpg";
import espresso from "./media/gallery/stills/espresso.jpg";
import kiwi from "./media/gallery/stills/kiwi.jpg";

/** Every picture a frame can name, by its path under content/media/gallery/. */
export const pictures: Record<string, StaticImageData> = {
  "altar.jpg": altar,
  "echo_world.jpg": echoWorld,
  "stills/apple-film.jpg": appleFilm,
  "stills/apples.jpg": apples,
  "stills/chicago-jazz.jpg": chicagoJazz,
  "stills/echo-gate.jpg": echoGate,
  "stills/espresso-film.jpg": espressoFilm,
  "stills/espresso.jpg": espresso,
  "stills/kiwi.jpg": kiwi,
};
// @gallery-pictures-end

export type Portal = {
  id: string;
  /** Read out beside the frame, and the alt text of the flat copy of it. */
  title: string;
  /**
   * The flat picture of this frame: what the server renders, what the sideways
   * turn carries round on its far face, and what is under the canvas until
   * WebGL has something to show.
   *
   * There are three kinds of frame, and which one this is is which of `model`
   * and `video` is set. With neither, this picture is the whole of it: it hangs
   * flat and does nothing when pressed. With a `video`, it is the frame shown
   * until the film has one of its own to show. With a `model`, it is a still of
   * the model at its `modelView`, since the two are cross-faded; left out, the
   * frame is its `bg` until the model is in.
   */
  image?: StaticImageData;
  /**
   * A file under public/models/gallery/, as a path from the site root —
   * "/models/gallery/altar.glb". The only kind of frame that is a window: it
   * has a room behind it, double-clicking steps into it, and it is captioned
   * to say so.
   */
  model?: string | null;
  /**
   * How a model is staged in its room, in the model's own units — which is the
   * only frame of reference a .glb comes with, and the one Blender's numbers
   * are already in.
   *
   * `modelSpan` is how tall a slice of it should fill the room; `modelFocus`
   * is the point of it that should be in the middle. Left out, the whole thing
   * is fitted and centred, which is right for a model that is only its
   * subject, and wrong for one that brings a backdrop with it — a backdrop is
   * meant to be behind you, not in view.
   *
   * `modelView` is where you are standing to look at it, in degrees: how far
   * round from the front the file was built with, and how far above it. [0, 0]
   * is straight on and level, which is the angle a scene built around a camera
   * usually wants; [90, 15] is a quarter of the way round it and a little
   * above. There is only one camera and a wall of frames, so it is the model that
   * turns — but the number to reach for is the one you would have walked.
   *
   * `modelScale` and `modelOffset` are the last word, in room units, for when
   * the numbers above got it nearly right.
   */
  modelSpan?: number;
  modelFocus?: [number, number, number];
  modelView?: [around: number, above: number];
  modelScale?: number;
  modelOffset?: [number, number, number];
  /**
   * A film, in the same folder and given the same way. It hangs flat and plays
   * on a loop, muted, from the moment it can, with a pause control under the
   * pointer — there is nowhere to step into. Set this or `model`, not both.
   */
  video?: string | null;
  /**
   * Whether the film has a soundtrack worth hearing, which puts a sound toggle
   * in its corner. Said here rather than found out, because a browser will not
   * say whether a video has sound in it, and a file can carry a track of pure
   * silence — kiwi.mp4 does.
   */
  sound?: boolean;
  /**
   * How a picture or a film is cropped into its frame, when the two are not
   * one shape or it is zoomed: `focus` is the point of it that is kept, as
   * fractions across and down — [0.5, 0.5], the middle, when left out — and
   * `zoom` how far in, from 1, which is the whole of it that fits. These are
   * `object-position` and a scale, and are drawn as exactly that on the flat
   * copy of the wall.
   */
  focus?: [x: number, y: number];
  zoom?: number;
  /**
   * A frame round it: a file in public/models/gallery/frames/ — "frame1.glb".
   * The frame is fitted to the footprint below, so the wall's gaps are the
   * same framed or not, and the artwork hangs in its opening, a little smaller
   * than the footprint; a frame with no opening (a canvas block) carries the
   * artwork on its face instead — the panel in it, raised or sunk, with the
   * rim or board round it as a margin. See `framing`.
   */
  frame?: string;
  /**
   * Lifts the artwork from the back of its frame to the face round the
   * opening — level with a mount, so it reads as mounted rather than behind
   * one. Not for a moulding with no mount, whose inside edge is its front.
   */
  flush?: boolean;
  /**
   * The wall label: a slip of paper beside the frame, the way a museum puts
   * one. `label` is which side of the frame it hangs on, and which end of that
   * side — "right" is beside it, level with its bottom; "right-top" level with
   * its top; "below" under it, from its left; "below-right" from its right.
   * "none" hangs no label. The title is the first line; `medium` the second
   * (what it is made with, and when); `about` a paragraph under those.
   */
  label?: LabelSide;
  medium?: string;
  about?: string;
  /** The wall of the room behind it. */
  bg: string;
  /**
   * Where the frame hangs, in wall units: the centre of it, then its size.
   * The unit is arbitrary — the whole wall is fitted to the window — so these
   * are only ever read against each other. Hung by hand, ragged on purpose —
   * no two frames the same size and few edges in line — but evenly spaced:
   * every frame is GUTTER from each of its neighbours, which is what the
   * editor snaps to.
   */
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Where the frames are served from. */
const FRAME_DIR = "/models/gallery/frames/";

/** How far off the wall an artwork hangs inside a frame's opening: just
 *  enough to sit in front of whatever backs the frame. */
const SEAT = 0.01;

/**
 * How a frame is fitted to a footprint, and where that leaves the artwork:
 * the frame scaled to the footprint (across and up separately, which for a
 * frame cut to its artwork's shape is a few percent at most, and in depth by
 * their average), the artwork's rectangle in its opening — or on its face, for
 * a canvas block, on the panel inside its rim — and how far off the wall it
 * is. Null for no frame, or one that has not been measured — see
 * content/frames.ts.
 */
export const framing = (p: Pick<Portal, "frame" | "flush" | "w" | "h">) => {
  const spec = p.frame ? FRAME_SPECS[p.frame] : undefined;
  if (!spec) return null;
  const sx = p.w / spec.size[0];
  const sy = p.h / spec.size[1];
  const sz = (sx + sy) / 2;
  const depth = spec.depth * sz;
  // In the opening; or, for a solid block, on its face.
  const [w, h] = spec.opening ?? spec.face?.size ?? spec.size;
  return {
    url: FRAME_DIR + p.frame,
    scale: [sx, sy, sz] as [number, number, number],
    depth,
    w: w * sx,
    h: h * sy,
    z: spec.opening
      ? p.flush && spec.lip !== undefined
        ? spec.lip * sz + 0.002
        : SEAT
      : (spec.face?.height ?? spec.depth) * sz + 0.002,
  };
};

export type LabelSide =
  | "right"
  | "right-top"
  | "left"
  | "left-top"
  | "below"
  | "below-right"
  | "above"
  | "above-right"
  | "none";

/** A wall label's size, and how far from its frame it hangs, in wall units —
 *  a slip about fifty pixels by forty on a laptop, which is a museum label's
 *  shape and, at that size, a label you walk up to rather than read across
 *  the room: double-click the artwork to zoom in on it and its label. */
export const LABEL_W = 0.5;
export const LABEL_H = 0.34;
const LABEL_GAP = 0.08;

/** Where a frame's label hangs, as a rectangle in wall units, or null for
 *  none. */
export const labelOf = (p: Pick<Portal, "x" | "y" | "w" | "h" | "label">) => {
  const side = p.label ?? "right";
  if (side === "none") return null;
  const l = p.x - p.w / 2;
  const r = p.x + p.w / 2;
  const b = p.y - p.h / 2;
  const t = p.y + p.h / 2;
  const box = (x0: number, y0: number) => ({
    l: x0,
    r: x0 + LABEL_W,
    b: y0,
    t: y0 + LABEL_H,
    x: x0 + LABEL_W / 2,
    y: y0 + LABEL_H / 2,
  });
  switch (side) {
    case "right":
      return box(r + LABEL_GAP, b);
    case "right-top":
      return box(r + LABEL_GAP, t - LABEL_H);
    case "left":
      return box(l - LABEL_GAP - LABEL_W, b);
    case "left-top":
      return box(l - LABEL_GAP - LABEL_W, t - LABEL_H);
    case "below":
      return box(l, b - LABEL_GAP - LABEL_H);
    case "below-right":
      return box(r - LABEL_W, b - LABEL_GAP - LABEL_H);
    case "above":
      return box(l, t + LABEL_GAP);
    case "above-right":
      return box(r - LABEL_W, t + LABEL_GAP);
  }
};

/** A frame and its label together: the rectangle it takes up on the wall. */
export const footprintOf = (p: Pick<Portal, "x" | "y" | "w" | "h" | "label">) => {
  const k = labelOf(p);
  const l = p.x - p.w / 2;
  const r = p.x + p.w / 2;
  const b = p.y - p.h / 2;
  const t = p.y + p.h / 2;
  return k
    ? { l: Math.min(l, k.l), r: Math.max(r, k.r), b: Math.min(b, k.b), t: Math.max(t, k.t) }
    : { l, r, b, t };
};

/**
 * A frame as it is written down: the same as a Portal, except that its picture
 * is named — a path under content/media/gallery/ — rather than imported. The
 * names are what the gallery editor reads and writes; `pictures` above is what
 * turns them into pictures.
 *
 * In development, the "Edit gallery" button under the wall edits this list in
 * the browser and saves it back here — see GalleryEditor. It rewrites the list
 * and the imports, and keeps the comments that sit above a field, by frame.
 */
export type Entry = Omit<Portal, "image"> & { image?: string };

export const entries: Entry[] = [
  // ---------------------------------------------------------------- rooms
  {
    id: "espresso",
    title: "Espresso",
    image: "stills/espresso.jpg",
    model: "/models/gallery/Espresso_anim.glb",
    // The kettle and the steam off it are about eight units tall together and
    // stand off to one side of the file's origin; the rest of it — a wall, a
    // spice rack, a stove and a cube round the whole lot — is the room they
    // are standing in, not the thing in the room.
    modelSpan: 21.3,
    modelFocus: [6, 1.4, 4],
    // Round to the left of the hob and a little above it, which is where the
    // stove, the rack behind it and the run of the counter are all in the frame
    // at once.
    modelView: [55, 23],
    frame: "frame1.glb",
    bg: "#ded6ca",
    label: "right-top",
    x: -4.144,
    y: 1.616,
    w: 5,
    h: 3.35,
  },
  {
    id: "echo-gate",
    title: "Echo gate",
    image: "stills/echo-gate.jpg",
    model: "/models/gallery/echo_gate.glb",
    // The doors and the four pillars round them. The sphere and the rock shelf
    // the whole thing is built on are its sky and its ground.
    modelSpan: 11,
    modelFocus: [-0.7, 1.3, 1],
    // From above and off to one side, so the arch is seen at an angle and the
    // outer stones of it — the ones that face away from a head-on view — show.
    modelView: [2, -5],
    frame: "frame7.glb",
    bg: "#d9d4cb",
    label: "below-right",
    x: -8.109,
    y: -1.635,
    w: 3.54,
    h: 2.525,
  },
  {
    id: "apples",
    title: "Apples",
    image: "stills/apples.jpg",
    model: "/models/gallery/Apples.glb",
    // Three apples in a line inside a sphere of their own colour. The file
    // lines them up front to back, so the front of the picture is its side: a
    // quarter turn round, level, and the three stand in a row across a frame
    // cut wide for them.
    modelSpan: 5,
    modelFocus: [0, 0.1, 0],
    modelView: [90, 0],
    frame: "frame2.glb",
    bg: "#e4dacd",
    x: 0.256,
    y: -3.643,
    w: 3.2,
    h: 1.75,
  },

  // ---------------------------------------------------------------- films
  {
    id: "apple-film",
    title: "Apples, animated",
    image: "stills/apple-film.jpg",
    // Every film here is a -web copy at 720p — see the README in that folder.
    // This one's original is 165 MB.
    video: "/models/gallery/apple_anim-web.mp4",
    sound: true,
    frame: "frame9.glb",
    bg: "#f4f2ee",
    x: 1.346,
    y: -0.956,
    w: 5.38,
    h: 3.025,
  },
  {
    id: "chicago-jazz",
    title: "Green Mill",
    image: "stills/chicago-jazz.jpg",
    video: "/models/gallery/chicago_jazz-web.mp4",
    sound: true,
    frame: "frame6.glb",
    bg: "#f4f2ee",
    label: "below-right",
    x: 3.353,
    y: 1.859,
    w: 3.565,
    h: 2.005,
  },
  {
    id: "espresso-film",
    title: "Espresso, drawn",
    image: "stills/espresso-film.jpg",
    video: "/models/gallery/espresso_greasepencil-web.mp4",
    frame: "frame5.glb",
    bg: "#dad5cc",
    label: "above-right",
    x: -0.037,
    y: 1.722,
    w: 2.615,
    h: 1.73,
  },
  {
    id: "kiwi",
    title: "Kiwi",
    image: "stills/kiwi.jpg",
    video: "/models/gallery/kiwi-web.mp4",
    frame: "frame3.glb",
    bg: "#f4f2ee",
    x: 3.338,
    y: -3.433,
    w: 2.365,
    h: 1.33,
  },

  // ------------------------------------------------------------- pictures
  {
    id: "echo-world",
    title: "Echo world",
    image: "echo_world.jpg",
    frame: "frame4.glb",
    flush: true,
    bg: "#e6ddd2",
    label: "left",
    x: -3.842,
    y: -2.096,
    w: 4.395,
    h: 3.475,
  },
  {
    id: "altar",
    title: "Altar",
    image: "altar.jpg",
    focus: [0.48, 0.5],
    frame: "frame8.glb",
    bg: "#1a1716",
    label: "left",
    x: -7.832,
    y: 0.94,
    w: 1.775,
    h: 2.025,
  },
];

/** A frame with its picture looked up. A name with no picture behind it — one
 *  the editor has only just been given — is drawn by `preview` instead. */
export const resolve = (
  e: Entry,
  preview?: (name: string) => StaticImageData | undefined,
): Portal => ({
  ...e,
  image: e.image ? (pictures[e.image] ?? preview?.(e.image)) : undefined,
});

export const portals: Portal[] = entries.map((e) => resolve(e));

export type Wall = {
  l: number;
  r: number;
  b: number;
  t: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

/** The smallest rectangle the frames and their labels all fit in, in wall units. Both the flat
 *  copy and the scene fit this same rectangle into the window, which is why
 *  one can be laid over the other. */
export const wallOf = (frames: Pick<Portal, "x" | "y" | "w" | "h" | "label">[]): Wall => {
  if (!frames.length) return { l: -1, r: 1, b: -1, t: 1, w: 2, h: 2, cx: 0, cy: 0 };
  const feet = frames.map(footprintOf);
  const l = Math.min(...feet.map((f) => f.l));
  const r = Math.max(...feet.map((f) => f.r));
  const b = Math.min(...feet.map((f) => f.b));
  const t = Math.max(...feet.map((f) => f.t));
  return { l, r, b, t, w: r - l, h: t - b, cx: (l + r) / 2, cy: (b + t) / 2 };
};

export const wall = wallOf(portals);

/** How tall a room's caption is set, in wall units — the type is on the wall,
 *  so it is measured in what the wall is. About thirteen pixels on a laptop.
 *  On a phone, where it sits inside the frame's corner instead, it is set
 *  twice that, which is still small. */
export const CUE = 0.16;
export const CUE_NARROW = 0.32;

/** The gap between frames, in wall units, and what the editor snaps a frame
 *  that far from another to. */
export const GUTTER = 0.5;

/** Air left around the wall when it is fitted to the window. */
export const WALL_PAD = 1.3;
