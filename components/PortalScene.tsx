"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CameraControls,
  CameraControlsImpl,
  Html,
  MeshPortalMaterial,
  Preload,
  useAnimations,
  useCursor,
  useGLTF,
  useTexture,
} from "@react-three/drei";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { easing } from "maath";
import { CUE, CUE_NARROW, WALL_PAD, footprintOf, framing, type Portal, type Wall } from "@/content";
import { modelBoxes } from "./galleryProbe";
import { WallLabel } from "./WallLabel";
import wallStyles from "./PortalWall.module.css";

const DEG = Math.PI / 180;

/** Narrow, because the frames are flat against one wall: a wide lens would
 *  splay the ones at the ends outwards before anything had been turned. */
const FOV = 60;
const TAN = Math.tan((FOV / 2) * DEG);

/** How far behind its frame each room stands. Everything in the room is drawn
 *  that much larger to make up for the distance (see `standing`), so head-on
 *  the two cancel out and the picture sits square in its frame. What is left is
 *  the parallax, which only shows once the wall is turned — which is the whole
 *  reason the rooms are back there and not in the frame. */
const ROOM_Z = 1.1;

/** How far the wall can be swung and tipped, in degrees, either way. Fifteen
 *  is enough to see round the edge of a frame and nowhere near enough to reach
 *  the back of one.
 *
 *  Only the wall. Inside a portal there is no frame to get behind and nothing
 *  the room is hiding, so the stops come off entirely — see `stops`. */
const SWING = 15;
const TILT = 15;

/** How near the poles the camera may get once it is free to go round. Straight
 *  up and straight down are the two angles where which way is up stops being a
 *  question with an answer. */
const POLE = 0.01;

/** How close and how far the wall can be pulled, against the distance it hangs
 *  at. Close enough to read one picture; only just far enough to notice the
 *  wall is being pushed away, because past that it is a small thing in a large
 *  empty room. Inside a portal these are replaced — by then the wall is behind
 *  the camera and the only thing to keep away from is what is in there. */
const NEAR = 0.5;
const FAR = 1.25;

/** The window itself, as a plane. Nothing in a room is allowed in front of its
 *  own window: a model that brings its own backdrop brings one that wraps
 *  round where the camera is standing, and the camera is out here, on the wall
 *  side. What would be in the way is cut away instead. */
const PANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), -ROOM_Z);

/** Air left around whatever is in the room once you are in there with it. */
const ROOM_PAD = 1.08;

/** How long a portal takes to open, as a time constant. */
const OPEN = 0.25;

/** Air left round a picture or a film once it has been zoomed in on. */
const ZOOM_PAD = 1.2;

/** How long a press on a film waits to find out whether it is the first of a
 *  double-click — which zooms, and should not also have paused it. */
const CLICK_WAIT = 260;

/** How far the view turns with a mouse in a room, where there are no stops,
 *  in degrees each way; on the wall it is SWING and TILT. */
const ROOM_SWING = 40;
const ROOM_TILT = 25;
/** Radians turned per pixel of two-finger slide, and the share of the distance
 *  zoomed per pixel of wheel and of pinch. */
const SLIDE_TURN = 0.0025;
/** The share of the distance slid across per pixel of shifted slide. */
const SLIDE_PAN = 0.0012;
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;

/**
 * Whether a wheel event is a trackpad's two-finger slide rather than a mouse
 * wheel turning. A wheel scrolls by whole lines (Firefox) or, in Chrome and
 * Safari, by notches whose legacy `wheelDeltaY` is a multiple of 120; a
 * trackpad scrolls by pixels, sideways as well as up and down, with a
 * `wheelDeltaY` of exactly −3 times its delta.
 */
const fromTrackpad = (e: WheelEvent) => {
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  return !!legacy && legacy === -3 * e.deltaY;
};

/** The distance a box of this size has to be at to sit inside a window of this
 *  shape — the camera's version of `object-fit: contain`. */
const fitBox = (w: number, h: number, aspect: number) =>
  Math.max(h / 2 / TAN, w / 2 / (TAN * aspect));

/** What a frame's mesh does with a ray while the wall is frozen: nothing. The
 *  wall you came through is behind you and, being right in front of the camera
 *  now, most of the screen — leaving it pickable means every press meant for
 *  the room you are standing in lands on a picture instead. */
const untouchable = () => null;

/** A picture's crop when it is laid on a frame of a different shape: the same
 *  sum as `object-fit: cover` with an `object-position` of `focus`, scaled in
 *  by `zoom` about that same point — which is how the flat copy of the wall
 *  draws it, so the two crop alike. */
const cover = (
  texAspect: number,
  w: number,
  h: number,
  focus: readonly [number, number] = [0.5, 0.5],
  zoom = 1,
) => {
  const a = w / h;
  const z = Math.max(1, zoom);
  const rx = (texAspect > a ? a / texAspect : 1) / z;
  const ry = (texAspect > a ? 1 : texAspect / a) / z;
  return {
    repeat: [rx, ry] as const,
    // A texture is read from the bottom up, and `focus` is from the top down.
    offset: [focus[0] * (1 - rx), (1 - focus[1]) * (1 - ry)] as const,
  };
};

/**
 * What is standing in a portal: how big it is in wall units, how far behind the
 * frame it stands, and `k`, the factor it is drawn up by to pay for standing
 * back there. The three are chosen together so that whatever the depth, the
 * thing fills the frame by exactly as much as it would have at the glass.
 *
 * A model has depth, and the window is a plane that cuts: anything of it in
 * front of the glass is sliced off, and a sliced mesh is a hollow one. So a
 * model stands its own height further back again, which is room enough for
 * anything that is not the room's own walls — those are what the cut is for.
 * Standing back costs apparent size, and the height below is the one that pays
 * it back exactly: `h * dist / (dist + depth)` comes to the height of the
 * frame.
 */
const standing = (p: Portal, dist: number) => {
  const h = (p.h * (dist + ROOM_Z)) / Math.max(0.1, dist - p.h);
  const z = -(ROOM_Z + h);
  return { w: h * (p.w / p.h), h, z, k: (dist - z) / dist };
};

type OpenProps = { open: string | null; onOpen: (id: string | null) => void };
/** …plus the rectangle of the window the wall is hung on, in the window's own
 *  pixels: where it is as well as how big, since the canvas is the whole window
 *  and the two have no reason to share a centre. */
type Staged = OpenProps & {
  frame: { x: number; y: number; w: number; h: number };
  /** What is on the wall, and the rectangle it is fitted by — both handed
   *  down rather than read from content/gallery.ts, so that the editor can
   *  show a wall that has not been saved yet. */
  portals: Portal[];
  wall: Wall;
  /** Being edited: the camera is held at rest, and nothing is pressable. */
  editing?: boolean;
};

/** Where the camera stands, and so where on the wall everything is measured
 *  from: not the wall's own middle, but the point of it the camera is looking
 *  down the axis of. */
type Eye = { x: number; y: number };

/** Where something on the wall ends up once it has been pushed `z` back and
 *  drawn `k` up to pay for it: further from the camera's axis by exactly as
 *  much as the perspective brings it back in, so head-on it has not moved. */
const at = (v: number, eye: number, k: number) => eye + (v - eye) * k;

/**
 * Something for a model's metal to reflect.
 *
 * A glTF's materials are physically based, and a physically based metal has no
 * diffuse colour at all — it is only what is around it. Lit by lamps alone and
 * standing in an empty room, a kettle is black except for the one band where a
 * lamp happens to reflect. So each room with a model in it gets three's own
 * little studio, prefiltered once and shared by all of them, hung on the
 * portal's scene rather than on the model: nothing else in there is lit.
 *
 * Kept per renderer, not per page. What PMREM hands back is a render target:
 * its pixels live on one WebGL context and nowhere else. The canvas is made
 * anew whenever the gallery is — on coming back to the tab, and twice over on
 * any load React's development mode double-mounts it — and a studio cached
 * from the last one is a texture with nothing in it on the next, which is a
 * room lit by its two lamps alone: half as bright, and its metal black.
 */
const studios = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const map = useMemo(() => {
    let studio = studios.get(gl);
    if (!studio) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const room = new RoomEnvironment();
      studio = pmrem.fromScene(room, 0.04).texture;
      room.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.dispose();
        (o as THREE.Mesh).geometry?.dispose();
      });
      pmrem.dispose();
      studios.set(gl, studio);
    }
    return studio;
  }, [gl]);

  useEffect(() => {
    scene.environment = map;
    return () => {
      scene.environment = null;
    };
  }, [scene, map]);

  return null;
}

/* ------------------------------------------------------------------ rooms */

/**
 * A model in its room.
 *
 * Everything a .glb carries is in its own units, so that is what it is staged
 * in: `modelSpan` of it fills the room's height and `modelFocus` sits in the
 * middle of the room — see content/gallery.ts. Left out, the whole file is
 * fitted and centred, which is what a model with nothing else in it wants.
 *
 * Every clip in the file is played, on a loop, from the moment it has loaded:
 * a model that moves is moving whether or not anybody is standing in the room
 * with it, the same way the picture in the next frame along is a picture.
 */
function Model({ p, room, inside }: { p: Portal; room: { w: number; h: number }; inside: boolean }) {
  const { scene, animations } = useGLTF(p.model as string);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    for (const action of Object.values(actions)) action?.reset().fadeIn(0.4).play();
    return () => {
      for (const action of Object.values(actions)) action?.stop();
    };
  }, [actions]);

  // Glass, as plain see-through. Transmission is three re-drawing everything
  // behind the glass into a picture of its own — full size, mipmapped, every
  // frame, for every room that has any — so that the glass can bend it. The
  // gate's gems and vines are glass: that one pass was most of what the wall
  // cost to draw, and what made every film on it stutter. They are already
  // blended at 60 per cent, which with the bend taken out looks the same at
  // the size they are.
  useMemo(() => {
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        const glass = mat as THREE.MeshPhysicalMaterial;
        if (glass.transmission > 0) {
          glass.transmission = 0;
          glass.transparent = true;
          glass.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  // Only while it is a window. Once you are through it the pane is not there
  // any more, and a model that came with its own sky wants you standing under
  // the whole of it.
  useEffect(() => {
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        mat.clippingPlanes = inside ? null : [PANE];
        mat.needsUpdate = true;
      }
    });
  }, [scene, inside]);

  const box = useMemo(() => new THREE.Box3().setFromObject(scene), [scene]);
  const auto = useMemo(
    () => ({
      span: Math.max(1e-3, box.max.y - box.min.y),
      focus: box.getCenter(new THREE.Vector3()).toArray() as [number, number, number],
    }),
    [box],
  );
  useEffect(() => {
    modelBoxes.set(p.id, auto);
  }, [p.id, auto]);
  const span = p.modelSpan ?? auto.span;
  const focus = p.modelFocus ?? auto.focus;
  const k = (room.h / span) * (p.modelScale ?? 1);

  // Where you are standing to look at it. The camera cannot move — there is one
  // of it and a wall of frames — so the model turns instead, by as much as walking
  // round it would have come to: a quarter turn the one way, and a tip the
  // other, in that order, which is what leaves it upright rather than rolled.
  const [around, above] = p.modelView ?? [0, 0];

  return (
    <group position={p.modelOffset} scale={k}>
      <group rotation={[above * DEG, 0, 0]}>
        <group rotation={[0, -around * DEG, 0]}>
          <group position={[-focus[0], -focus[1], -focus[2]]}>
            <primitive object={scene} />
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------- flat cards */

/** A frame's card: square-cornered, one geometry each, made once. */
function useCard(p: Portal) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(p.w, p.h), [p.w, p.h]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** A texture laid on a card the way the flat copy lays its picture: sRGB, and
 *  cropped like `object-fit: cover` in case the two are not quite one shape.
 *
 *  Before the first frame is drawn, not after: three allocates a picture's
 *  storage the first time it is drawn, in whatever colour space it says it is
 *  in then, and keeps it. One drawn before it was told it is sRGB is kept as
 *  linear and then read as linear — which is the picture under a white haze,
 *  for good. A passive effect can land after the first frame or before it,
 *  depending on the load; a layout effect is always before. */
function useLaid(t: THREE.Texture | null | undefined, aspect: number, p: Portal) {
  // Memoised, so a re-render — a hover, say — is not a new crop, and not a
  // fresh upload of the whole picture.
  const [fx, fy] = p.focus ?? [0.5, 0.5];
  const zoom = p.zoom ?? 1;
  const crop = useMemo(() => cover(aspect, p.w, p.h, [fx, fy], zoom), [aspect, p.w, p.h, fx, fy, zoom]);
  useLayoutEffect(() => {
    if (!t) return;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.repeat.set(crop.repeat[0], crop.repeat[1]);
    t.offset.set(crop.offset[0], crop.offset[1]);
    t.needsUpdate = true;
  }, [t, crop.repeat, crop.offset]);
}

/**
 * A picture on the wall: a card with the picture on it, and no room behind it.
 * Double-clicking it zooms in on it — see Stage — which is all there is to do
 * with a picture.
 */
function Still({
  p,
  image,
  aside,
  zoomed,
  onOpen,
}: {
  p: Portal;
  image: NonNullable<Portal["image"]>;
  aside: boolean;
  /** This is the one zoomed in on, so there is no further in to go. */
  zoomed: boolean;
  onOpen: (id: string) => void;
}) {
  const geometry = useCard(p);
  const map = useTexture(image.src);
  useLaid(map, image.width / image.height, p);
  const [hovered, hover] = useState(false);
  useCursor(hovered && !aside && !zoomed, "zoom-in");
  return (
    <mesh
      position={[p.x, p.y, 0]}
      geometry={geometry}
      raycast={aside ? untouchable : THREE.Mesh.prototype.raycast}
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(p.id);
      }}
    >
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

/** How big the play control is drawn across a film's short side, the sound
 *  toggle against it, and how quickly either comes and goes. */
const PLAY = 0.3;
const SOUND = 0.48;
const FADE = 0.16;

/** A glyph for a control, drawn once onto a little canvas of its own: the
 *  speaker, with its waves or with a cross through it. */
const glyphs = new Map<string, THREE.CanvasTexture>();
function glyph(kind: "on" | "off") {
  let t = glyphs.get(kind);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = g.strokeStyle = "#f4efe8";
  g.lineWidth = 9;
  g.lineCap = g.lineJoin = "round";
  g.fill(new Path2D("M22 50 H40 L64 28 V100 L40 78 H22 Z"));
  if (kind === "on") {
    g.stroke(new Path2D("M78 46 Q90 64 78 82"));
    g.stroke(new Path2D("M90 34 Q110 64 90 94"));
  } else {
    g.stroke(new Path2D("M80 50 L104 78 M104 50 L80 78"));
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glyphs.set(kind, t);
  return t;
}

/** Fade every material under a group towards `to`, each by the share of it
 *  it was given when it was made — in `userData.alpha`. */
function useFade(group: React.RefObject<THREE.Group | null>, to: number) {
  useFrame((_, dt) => {
    group.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) easing.damp(m, "opacity", to * ((m.userData.alpha as number) ?? 1), FADE, dt);
    });
  });
}

/** Play or pause, in the middle of the card: a triangle is a three-sided
 *  circle, and a pause is a pair of bars. Both are drawn on the same disc. */
function Control({ r, playing, shown }: { r: number; playing: boolean; shown: number }) {
  const group = useRef<THREE.Group>(null);
  useFade(group, shown);
  const ink = { color: "#f4efe8", transparent: true, opacity: 0, toneMapped: false, userData: { alpha: 0.95 } };
  return (
    <group ref={group} position={[0, 0, 0.012]}>
      <mesh>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color="#14110e" transparent opacity={0} toneMapped={false} userData={{ alpha: 0.55 }} />
      </mesh>
      {/* Nudged right by a hair: a triangle's centre of area is not the middle
          of the circle it is sitting in, and the eye reads the gap. */}
      <mesh visible={!playing} position={[r * 0.07, 0, 0.001]}>
        <circleGeometry args={[r * 0.46, 3]} />
        <meshBasicMaterial {...ink} />
      </mesh>
      <group visible={playing} position={[0, 0, 0.001]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * r * 0.17, 0, 0]}>
            <planeGeometry args={[r * 0.15, r * 0.62]} />
            <meshBasicMaterial {...ink} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Sound on or off, in the bottom right corner. Its own press, so it does not
 *  also pause the film it is on. */
function Speaker({
  r,
  at,
  on,
  shown,
  onPress,
}: {
  r: number;
  at: [number, number];
  on: boolean;
  shown: number;
  onPress: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  useFade(group, shown);
  return (
    <group ref={group} position={[at[0], at[1], 0.012]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.detail > 1) return;
          onPress();
        }}
      >
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial color="#14110e" transparent opacity={0} toneMapped={false} userData={{ alpha: 0.55 }} />
      </mesh>
      <mesh position={[0, 0, 0.001]} raycast={untouchable}>
        <planeGeometry args={[r * 1.25, r * 1.25]} />
        <meshBasicMaterial map={glyph(on ? "on" : "off")} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * A film on the wall.
 *
 * Hung flat and played on a loop from the moment it can, muted, which is the
 * only way a browser lets a film start by itself. Until the first frame of it
 * has been decoded it shows its still, which is already on the wall's flat
 * copy underneath — a video texture with nothing in it yet is black.
 *
 * Under the pointer it shows its controls: pause or play in the middle, where
 * a press anywhere on the card works it, and — for a film with a soundtrack —
 * sound on or off in the corner. The wall has one soundtrack at a time, so
 * turning one film's on turns whichever was on off; see `voiced` in Stage.
 *
 * Double-clicking it zooms in on it, with the controls still working once you
 * are there; a single press waits a moment first, to be sure it is not the
 * start of that double-click.
 *
 * It stops while you are in a room, where it is behind you, and picks up where
 * it left off when you come out — unless it was you that stopped it.
 */
function Film({
  p,
  frozen,
  aside,
  voiced,
  onVoice,
  onOpen,
  later,
  onRolling,
}: {
  p: Portal;
  /** The frames are in, and the film may start coming down — until then it is
   *  its still. See the loading order in Stage. */
  later: boolean;
  /** Told once the film is playing, which is when the rooms may load. */
  onRolling: (id: string) => void;
  /** A room is open: the film is behind you, and stops. */
  frozen: boolean;
  /** Something else is open or zoomed in on: the film is not pressable. */
  aside: boolean;
  voiced: boolean;
  onVoice: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const geometry = useCard(p);
  const still = useTexture(p.image?.src ?? EMPTY);
  const [rolling, setRolling] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hovered, hover] = useState(false);
  useCursor(hovered && !aside);
  /** Paused by a press rather than by stepping into a room. */
  const held = useRef(false);
  /** A single press, waiting to see whether a second one follows. */
  const pending = useRef(0);
  useEffect(() => () => window.clearTimeout(pending.current), []);

  const aspect = p.image ? p.image.width / p.image.height : p.w / p.h;
  useLaid(still, aspect, p);

  /**
   * The film and the texture it is drawn through, made by the effect that
   * also takes them down — not by the render, and never one without the other.
   *
   * A render can be thrown away and tried again while the stills load, and an
   * element made there starts downloading the film on every attempt. And an
   * effect can be run, taken down and run again on the same render — React
   * does exactly that in development — so whatever its cleanup disposes has to
   * be something the next run makes afresh: disposing a VideoTexture cancels
   * the callback that tells it a new frame has arrived, and a texture made once
   * in a memo and disposed by the first cleanup is a film frozen on its first
   * frame for good, moving only when something else happens to redraw it.
   */
  const [film, setFilm] = useState<{ video: HTMLVideoElement; reel: THREE.VideoTexture } | null>(
    null,
  );
  useEffect(() => {
    if (!later) return;
    const video = document.createElement("video");
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = p.video as string;

    const reel = new THREE.VideoTexture(video);
    // Told what it is before it is ever drawn — see useLaid, which crops it.
    reel.colorSpace = THREE.SRGBColorSpace;

    const first = () => {
      setRolling(true);
      onRolling(p.id);
    };
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    video.addEventListener("playing", first, { once: true });
    video.addEventListener("play", on);
    video.addEventListener("pause", off);
    setFilm({ video, reel });

    return () => {
      video.removeEventListener("playing", first);
      video.removeEventListener("play", on);
      video.removeEventListener("pause", off);
      video.pause();
      video.removeAttribute("src");
      video.load();
      reel.dispose();
      setFilm(null);
      setRolling(false);
    };
    // Only the film itself, and its turn to load: a frame resized or a crop
    // moved re-crops the texture below, and does not start the film again
    // from nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.video, later]);

  useLaid(film?.reel, aspect, p);

  useEffect(() => {
    if (!film) return;
    if (frozen) film.video.pause();
    // Turned down by the browser — a data saver, or a phone in low-power mode —
    // it stays on its still, which is the same picture standing still.
    else if (!held.current) void film.video.play().catch(() => {});
  }, [film, frozen]);

  // Whichever film the wall says has the sound. Set here as well as in the
  // press, so that the one that loses it goes quiet the same moment.
  useEffect(() => {
    if (film) film.video.muted = !voiced;
  }, [film, voiced]);

  const showing = rolling && film ? film.reel : still;

  const short = Math.min(p.w, p.h);
  const r = short * PLAY * 0.5;
  const rs = r * SOUND;
  const inset = rs * 1.7;
  const live = hovered && !aside;

  return (
    <group position={[p.x, p.y, 0]}>
      <mesh
        geometry={geometry}
        raycast={aside ? untouchable : THREE.Mesh.prototype.raycast}
        onPointerOver={() => hover(true)}
        onPointerOut={() => hover(false)}
        onClick={(e) => {
          e.stopPropagation();
          window.clearTimeout(pending.current);
          // The second press of a double-click: it is a zoom, not a pause.
          if (e.nativeEvent.detail > 1 || !film) return;
          const { video } = film;
          pending.current = window.setTimeout(() => {
            if (video.paused) {
              held.current = false;
              void video.play().catch(() => {});
            } else {
              held.current = true;
              video.pause();
            }
          }, CLICK_WAIT);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.clearTimeout(pending.current);
          // Only ever the way in, like a room's: the way out is heard by the
          // element — see GalleryPortals.
          if (!aside) onOpen(p.id);
        }}
      >
        {/* A new material when the film takes over from its still, not the
            same one handed a new map. three keeps a video's frames as they
            come and turns them from sRGB in the shader — but only in a shader
            built for a video. One built for the still never does, and the film
            is drawn encoded twice over: a white haze over every frame. */}
        <meshBasicMaterial key={showing === still ? "still" : "reel"} map={showing} toneMapped={false} />
      </mesh>

      {/* Out of the way while it plays; left up while it is paused by hand, so
          a stopped film says how to start it again. */}
      <Control r={r} playing={playing} shown={live || (!playing && held.current && !aside) ? 1 : 0} />

      {p.sound ? (
        <Speaker
          r={rs}
          at={[p.w / 2 - inset, -p.h / 2 + inset]}
          on={voiced}
          // Shown while it is the one making the noise, too, so the film the
          // sound is coming out of can always be found.
          shown={aside ? 0 : live ? 1 : voiced ? 0.6 : 0}
          onPress={() => {
            // Inside the press, so it counts as the reader's own doing: a
            // browser will not let a film find its voice any other way.
            if (film) film.video.muted = voiced;
            onVoice(voiced ? null : p.id);
          }}
        />
      ) : null}
    </group>
  );
}

/** A one-pixel transparent picture, for a film given no still of its own:
 *  `useTexture` has to be called with something. */
const EMPTY =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/* ------------------------------------------------------------------ frame */

/** The size the caption's type is set at before the 3D transform scales it
 *  down onto the wall. Large, so that what is scaled is sharp. */
const CUE_PX = 40;

/** Whether the window is a phone's — where the caption is set inside its
 *  frame's corner. The same query as the stylesheet's. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 760px)");
    const read = () => setNarrow(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);
  return narrow;
}

/**
 * What a room says about itself: that it is one. Lying on the wall, in the
 * wall's plane, under the frame's bottom left corner, so it swings, tips and
 * zooms with the wall like the frame does. The flat copy of the wall has the
 * same caption in the same place — see .cue in PortalWall.module.css, whose
 * box this is.
 *
 * drei draws it with a CSS 3D transform centred on the point it is pinned to,
 * at `distanceFactor / 400` world units to the pixel. The box is 20 ems by 4
 * with its middle on the frame's bottom edge, so it is pinned ten ems along.
 */
function Cue({ p, hidden }: { p: Portal; hidden: boolean }) {
  const cue = useNarrow() ? CUE_NARROW : CUE;
  // Where drei puts the caption, fixed from the first frame. Left to itself it
  // takes the canvas's parent until the pointer events are connected and the
  // events' element after — and on that change it mounts the caption's React
  // root again on the same node while the first is still being taken down,
  // which then fails to remove what the second has already cleared away. The
  // two are the same size in the same place, so this only keeps it still.
  const gl = useThree((s) => s.gl);
  const host = useMemo(() => ({ current: gl.domElement.parentElement as HTMLElement }), [gl]);
  return (
    <Html
      portal={host}
      transform
      distanceFactor={(400 * cue) / CUE_PX}
      position={[p.x - p.w / 2 + 10 * cue, p.y - p.h / 2, 0.002]}
      className={wallStyles.cue}
      // The box's own size, in place of the wall's measure — it is the 3D
      // transform that brings it down to the wall's — and in the flow, so
      // the element drei centres is the size of the box.
      style={{ fontSize: CUE_PX, position: "relative", marginTop: 0, opacity: hidden ? 0 : 1 }}
      // Under the nav, which is over the whole canvas, and out of the way of
      // the pointer: the wall under it is what is being pressed.
      zIndexRange={[1, 0]}
      pointerEvents="none"
    >
      <span className={wallStyles.label}>
        <span className={wallStyles.fine}>double-click to step in</span>
        <span className={wallStyles.coarse}>double-tap to enter</span>
      </span>
    </Html>
  );
}

/**
 * What a room is drawn into, cut down to the part of it anybody can see.
 *
 * drei renders a portal's room into a render target the size of the whole
 * canvas, at its full pixel density, every frame — and samples it only where
 * the frame is. A room's own sky and walls cover all of it, so three rooms are
 * three full-window passes of lit, physically based shading a frame, nearly
 * all of it thrown away: on a laptop's screen that is the frame rate halved,
 * and the films are what show it, since they are the things on the wall that
 * are meant to move smoothly. So each room is scissored to its frame's
 * rectangle on screen, with a little over for the frame in between a turn and
 * the next clip. While one is opening or open it fills the window, and the
 * scissor comes off.
 */
const corner = new THREE.Vector3();
const CLIP_PAD = 0.04;
function clip(
  target: THREE.WebGLRenderTarget,
  mesh: THREE.Object3D,
  p: Portal,
  camera: THREE.Camera,
  whole: boolean,
) {
  const { width: W, height: H } = target;
  if (whole) {
    target.scissor.set(0, 0, W, H);
    target.scissorTest = false;
    return;
  }
  let [l, b, r, t] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corner.set((sx * p.w) / 2, (sy * p.h) / 2, 0).applyMatrix4(mesh.matrixWorld).project(camera);
    // Behind the camera, the projection turns inside out — clip nothing.
    if (corner.z > 1) return clip(target, mesh, p, camera, true);
    l = Math.min(l, corner.x);
    r = Math.max(r, corner.x);
    b = Math.min(b, corner.y);
    t = Math.max(t, corner.y);
  }
  const padX = (r - l) * CLIP_PAD;
  const padY = (t - b) * CLIP_PAD;
  const x0 = Math.max(0, Math.floor(((l - padX + 1) / 2) * W));
  const y0 = Math.max(0, Math.floor(((b - padY + 1) / 2) * H));
  const x1 = Math.min(W, Math.ceil(((r + padX + 1) / 2) * W));
  const y1 = Math.min(H, Math.ceil(((t + padY + 1) / 2) * H));
  target.scissor.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  target.scissorTest = true;
}

function Window({
  p,
  dist,
  eye,
  open,
  onOpen,
  editing = false,
  outer,
  later,
}: { p: Portal; dist: number; eye: Eye; editing?: boolean; outer?: Portal; later: boolean } & OpenProps) {
  /** The model is in, and its snapshot can go. */
  const [arrived, setArrived] = useState(false);
  // drei types the handle as the element's own props, so this is the shape of
  // the one uniform on it that moves.
  const material = useRef<ComponentRef<typeof MeshPortalMaterial>>(null);
  const [hovered, hover] = useState(false);
  // Not once a room is open: the frame stops hearing the pointer then, so it
  // never hears it leave, and the hand would stay up over a room you are in.
  useCursor(hovered && !open);
  const inside = open === p.id;

  const geometry = useCard(p);
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    const m = material.current as unknown as { blend: number } | null;
    if (m) easing.damp(m, "blend", inside ? 1 : 0, OPEN, dt);
  });

  // Ahead of drei's own pass, so the clip is the one for this frame.
  useFrame(({ camera }) => {
    const m = material.current as unknown as
      | { blend: number; map: THREE.Texture | null }
      | null;
    const target = m?.map?.renderTarget as THREE.WebGLRenderTarget | null | undefined;
    if (m && target && mesh.current) clip(target, mesh.current, p, camera, m.blend > 0);
  }, -1);

  const s = standing(p, dist);

  return (
    <>
      <mesh
        ref={mesh}
        name={p.id}
        position={[p.x, p.y, 0]}
        geometry={geometry}
        raycast={open || editing ? untouchable : THREE.Mesh.prototype.raycast}
        // Only ever the way in. The way out is the same gesture, but by then the
        // wall is frozen and it is the element that hears it — see
        // GalleryPortals.
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpen(p.id);
        }}
        onPointerOver={() => hover(true)}
        onPointerOut={() => hover(false)}
      >
        {/* The portal's scene is carried by this mesh's transform, so everything
            below is placed against the frame rather than against the wall. */}
        <MeshPortalMaterial ref={material} blend={0} blur={0} resolution={512} events={inside}>
          <color attach="background" args={[p.bg]} />

          {/* A key, a fill, and a room for the metal to reflect: a model
              arrives with its own materials and no idea what room it is going
              to be standing in. */}
          <Studio />
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 6, 5]} intensity={1.6} />
          <directionalLight position={[-4, 1, -3]} intensity={0.5} />

          {/* Pushed back, drawn up, and slid out by as much as the perspective
              slides it in — see `standing`. */}
          <group
            position={[at(p.x, eye.x, s.k) - p.x, at(p.y, eye.y, s.k) - p.y, s.z]}
          >
            {/* Last of everything on the wall — see the loading order in
                Stage — and its snapshot hung over the window until then. */}
            {later ? (
              <Suspense fallback={null}>
                <Model p={p} room={s} inside={inside} />
                <Arrived onArrive={() => setArrived(true)} />
              </Suspense>
            ) : null}
          </group>
        </MeshPortalMaterial>
      </mesh>

      {p.image && !SNAPSHOTS ? <Snapshot p={p} image={p.image} shown={!arrived && !inside} /> : null}

      {/* Under the frame round it, if it has one, rather than under the
          window inside the frame. */}
      <Cue p={outer ?? p} hidden={open !== null} />
    </>
  );
}

/**
 * `?snapshots`, in development: the rooms alone, for photographing — no
 * frames, labels, room shading or snapshots over them, and nothing held back
 * in the loading order. The stills in content/media/gallery/stills/ are shot
 * this way; see the README in public/models/gallery/.
 */
const SNAPSHOTS =
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("snapshots");

/**
 * A room's snapshot, laid over its window until the model is in: the still in
 * content/media/gallery/stills/, which is the room as it is seen from the wall,
 * so the one gives way to the other with nothing moving. Faded out rather than
 * cut, in case the model's first frame is not quite the snapshot's.
 */
function Snapshot({
  p,
  image,
  shown,
}: {
  p: Portal;
  image: NonNullable<Portal["image"]>;
  shown: boolean;
}) {
  const geometry = useCard(p);
  const map = useTexture(image.src);
  useLaid(map, image.width / image.height, p);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    const m = material.current;
    if (!m || !mesh.current) return;
    easing.damp(m, "opacity", shown ? 1 : 0, 0.18, dt);
    mesh.current.visible = m.opacity > 0.005;
  });
  return (
    <mesh ref={mesh} position={[p.x, p.y, 0.001]} geometry={geometry} raycast={untouchable}>
      <meshBasicMaterial ref={material} map={map} transparent toneMapped={false} />
    </mesh>
  );
}

/** Says so once whatever is beside it in a Suspense boundary has loaded. */
function Arrived({ onArrive }: { onArrive: () => void }) {
  useEffect(() => onArrive(), [onArrive]);
  return null;
}

type Voice = { voiced: string | null; onVoice: (id: string | null) => void };

/** A model is a window, a film plays, and a picture hangs. */
function Frame({
  voiced,
  onVoice,
  room,
  editing,
  outer,
  later,
  last,
  onRolling,
  ...props
}: {
  p: Portal;
  dist: number;
  eye: Eye;
  room: boolean;
  editing: boolean;
  outer?: Portal;
  /** Films may load. */
  later: boolean;
  /** Rooms may load: last of all. */
  last: boolean;
  onRolling: (id: string) => void;
} & OpenProps &
  Voice) {
  const fit = framing(props.p);
  if (fit) {
    // The artwork in its frame's opening, at the height the frame seats it.
    // The frame itself is hung by Stage, in its own turn.
    const p = props.p;
    return (
      <>
        <group position={[0, 0, fit.z]}>
          <Frame
            {...props}
            p={{ ...p, w: fit.w, h: fit.h, frame: undefined }}
            outer={p}
            later={later}
            last={last}
            onRolling={onRolling}
            voiced={voiced}
            onVoice={onVoice}
            room={room}
            editing={editing}
          />
        </group>
      </>
    );
  }
  const { p, open, onOpen } = props;
  if (p.model) return <Window {...props} editing={editing} outer={outer} later={last} />;
  // While anything is open, everything else on the wall is out of reach; a
  // film stops only for a room, since only a room puts it behind you. While
  // the wall is being edited, nothing on it is pressed: the editor is over it.
  const aside = editing || (open !== null && open !== p.id);
  if (p.video)
    return (
      <Film
        p={p}
        frozen={room}
        aside={aside}
        voiced={voiced === p.id}
        onVoice={onVoice}
        onOpen={onOpen}
        later={later}
        onRolling={onRolling}
      />
    );
  return p.image ? <Still p={p} image={p.image} aside={aside} zoomed={open === p.id} onOpen={onOpen} /> : null;
}

/* ----------------------------------------------------------------- frames */

/**
 * A frame from public/models/gallery/frames/, fitted to its footprint: turned
 * to face the room, its middle on the footprint's, its back on the wall, and scaled to the
 * footprint's size — see `framing` in content/gallery.ts, which says where the
 * artwork goes in it. Each file is its own copy, so one frame file can be
 * hung on two artworks.
 *
 * It casts the light's shadow onto the wall, and onto the artwork through a
 * sheet laid over it that is nothing but that shadow: the artwork itself is
 * drawn unlit, as it is.
 */
function FrameModel({ p }: { p: Portal }) {
  const fit = framing(p)!;
  const { scene } = useGLTF(fit.url);
  const made = useMemo(() => {
    // Turned half way round: Blender's exporter leaves a frame's face looking
    // down −z, which is into the wall. A turn, not a mirror, so nothing on it
    // is reversed — it is only the other way round on its hook.
    const copy = new THREE.Group();
    copy.add(scene.clone(true));
    copy.rotation.y = Math.PI;
    copy.updateMatrixWorld(true);
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.raycast = untouchable;
    });
    const box = new THREE.Box3().setFromObject(copy);
    const c = box.getCenter(new THREE.Vector3());
    return { copy, offset: [-c.x, -c.y, -box.min.z] as [number, number, number] };
  }, [scene]);

  return (
    <>
      <group position={[p.x, p.y, 0]} scale={fit.scale}>
        <primitive object={made.copy} position={made.offset} />
      </group>
      <mesh position={[p.x, p.y, fit.z + 0.0015]} receiveShadow raycast={untouchable}>
        <planeGeometry args={[fit.w, fit.h]} />
        <shadowMaterial opacity={0.4} color="#1e140c" depthWrite={false} />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ light */

/** Where the gallery's light comes from: high above the wall and a little in
 *  front of it, the way track lights are hung — so anything standing off the
 *  wall throws its shadow straight down it. */
const LIGHT_UP = 9;
const LIGHT_OUT = 6.5;

/**
 * The light on the wall itself, as opposed to in the rooms behind it.
 *
 * Only what is solid is lit — today, the labels; the frames, once there are
 * frames. The artworks are drawn as they are, so the light never changes their
 * colour.
 *
 * The wall is the page behind the canvas, so there is no wall here to fall on:
 * a sheet as big as the wall stands in for it, invisible except where it is in
 * shadow. The shadow is sharp-edged, the way a single spot makes one, and is on
 * the wall's plane while what casts it stands off it — so turning the wall
 * slides each shadow against what casts it, as a real one would.
 */
/** How much of the studio the frames see, against the rooms' whole of it:
 *  the frames' materials were painted for a softer room than a model's. */
const WALL_ENVIRONMENT = 0.4;
/** Each track light's strength, and the room's light without them: dim, as
 *  a gallery is, so that what is lit is the art. */
const TRACK = 2.4;

function GalleryLight({ wall }: { wall: Wall }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.environmentIntensity = WALL_ENVIRONMENT;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene]);
  const reach = Math.max(wall.w, wall.h) / 2 + 1.5;

  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(wall.cx, wall.cy, 0);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 1;
    cam.far = 30;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [wall.cx, wall.cy, reach]);

  return (
    <>
      {/* A room for the frames' gilt and paint to reflect, the same little
          studio the rooms have. */}
      <Studio />
      <hemisphereLight args={["#fff8ee", "#6b6058", 0.25]} />
      <directionalLight
        ref={light}
        position={[wall.cx, wall.cy + LIGHT_UP, LIGHT_OUT]}
        color="#fff8f0"
        intensity={0.85}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-radius={2}
        shadow-blurSamples={12}
        shadow-bias={-0.0004}
        shadow-normalBias={0.003}
      />
      <mesh position={[wall.cx, wall.cy, -0.001]} receiveShadow raycast={untouchable}>
        <planeGeometry args={[wall.w + 4, wall.h + 4]} />
        <shadowMaterial opacity={0.3} color="#2a1d12" depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * A track light over every artwork, aimed down at it from the ceiling in
 * front of the wall: what lights the frames from above, so their top edges
 * catch it and their bottoms fall into shade. The artworks themselves are
 * drawn as they are; the pool each light makes on the wall is drawn by Space.
 * No shadows of their own — the gallery's one shadow-casting light does that.
 */
function TrackLights({ portals }: { portals: Portal[] }) {
  return (
    <>
      {portals.map((p) => (
        <TrackLight key={p.id} p={p} />
      ))}
    </>
  );
}

function TrackLight({ p }: { p: Portal }) {
  const light = useRef<THREE.SpotLight>(null);
  const reach = Math.max(p.w, p.h) / 2 + 0.6;
  const [x, y, z] = [p.x, p.y + p.h / 2 + 2.4, 3.2];
  const far = Math.hypot(y - p.y, z);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(p.x, p.y, 0);
    l.target.updateMatrixWorld();
  }, [p.x, p.y]);
  return (
    <spotLight
      ref={light}
      position={[x, y, z]}
      color="#fff1dc"
      intensity={TRACK}
      angle={Math.atan(reach / far)}
      penumbra={0.65}
      decay={0}
    />
  );
}

/* ------------------------------------------------------------------ floor */

/** How far below the bottom of the window, at rest, the floor is laid — as a
 *  share of the view's half-height there. Just out of sight, so that looking
 *  straight at the wall shows no floor, and the least turn from above does. */
const FLOOR_DROP = 1.08;

/* The cube's own colours — see PageTurn.module.css — so that the corner of the
   gallery and the corner the page turns on are one material. */
const CUBE_SHADE = "vec3(74.0, 56.0, 34.0) / 255.0";
const CUBE_EDGE = new THREE.Color("rgb(60, 44, 26)");

/**
 * The gallery's light on its wall, in shares of the cube's warm brown laid
 * over the page: the whole wall a little down from the page's own colour —
 * a lit room, not a lit screen — and back up to it in a pool round each
 * artwork, where a track light above is aimed; and falling away into the
 * brown at the far ends, left and right, past where anything hangs.
 */
const DIM = 0.11;
const FAR_ENDS = 0.32;
/** How many pools the wall's shader has room for. */
const POOLS = 24;

/** A pool of light round an artwork: its middle, a little above the
 *  artwork's, where a light angled down from the ceiling lands brightest,
 *  and how far it reaches across and up and down. */
const poolOf = (p: Portal) =>
  new THREE.Vector4(p.x, p.y + p.h * 0.1, p.w / 2 + 0.55, p.h / 2 + 0.8);

/** The far ends: nothing over the wall, rising into the brown past its left
 *  and right ends over a third of its width again — and a little above its
 *  top, where a gallery's ceiling is out of the lights' reach. `uWall` is the
 *  wall's left, right, bottom and top. */
const ROOM_GLSL = /* glsl */ `
  float farEnds(float x, float y) {
    float w = uWall.y - uWall.x;
    float side = max(uWall.x - x, x - uWall.y) / (w * 0.4);
    float above = (y - uWall.w) / (w * 0.35);
    // Begun well inside the ends and squared in, so there is no edge to it:
    // a falloff that starts at the wall's end reads as a line drawn there.
    float s = clamp((side + 0.5) / 1.5, 0.0, 1.0);
    return ${FAR_ENDS.toFixed(3)} * s * s + 0.5 * ${FAR_ENDS.toFixed(3)} * smoothstep(0.0, 1.0, above);
  }
`;

const SPACE_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 v = viewMatrix * w;
    vDepth = -v.z;
    gl_Position = projectionMatrix * v;
  }
`;

/**
 * The room the wall is in: a floor meeting it at the bottom, drawn the way
 * the sideways page turn draws its cube — the corner here is the inside of one
 * of that cube's edges.
 *
 * Same three things as there (PageTurn.module.css):
 *
 * - The face turned away from you — the floor, seen at a slant — is tinted the
 *   cube's warm brown, by how edge-on it is: deepest where it creases into the
 *   edge, lifting to about two thirds of that away from it.
 * - The face turned towards you — the wall — only darkens where it creases
 *   into the edge, and by little, and only as far as it is turned.
 * - The edge itself is a hairline of the cube's edge colour.
 *
 * And distance is not shadow, there as here: what swings away from you loses
 * itself in the page rather than going dark.
 *
 * The wall is the page behind the canvas, so all that is drawn over it is the
 * tint — none at all head on. The floor is the page's own colour under its
 * tint, laid just below the bottom of the window at rest (FLOOR_DROP), so it is
 * out of sight until the wall is turned from above or stepped back from.
 */
function Space({ eye, dist, portals, wall }: { eye: Eye; dist: number; portals: Portal[]; wall: Wall }) {
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null;
  const floorY = eye.y - dist * TAN * FLOOR_DROP;
  /** How deep a face is, for the gradients across it: the height of the view
   *  at rest, which is what the page turn's faces are the width of. */
  const span = 2 * dist * TAN;

  const [wallMat, floorMat] = useMemo(() => {
    const shared = () => ({
      uRef: { value: 1 },
      uFloor: { value: 0 },
      uSpan: { value: 1 },
      uTurn: { value: 0 },
      uWall: { value: new THREE.Vector4() },
    });
    const wallMat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared(),
        uPools: { value: Array.from({ length: POOLS }, () => new THREE.Vector4()) },
        uCount: { value: 0 },
      },
      vertexShader: SPACE_VERTEX,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        uniform float uFloor;
        uniform float uSpan;
        uniform float uTurn;
        uniform vec4 uWall;
        uniform vec4 uPools[${POOLS}];
        uniform int uCount;
        ${ROOM_GLSL}
        void main() {
          // .shadeNear: nothing for the first 60% of the face, 0.7 at the
          // crease, by 0.13 of how far it is turned.
          float up = (vWorld.y - uFloor) / uSpan;
          float crease = 0.7 * clamp(1.0 - up / 0.4, 0.0, 1.0) * 0.13 * uTurn;
          // The track lights: the brightest pool wins where two overlap.
          float lit = 0.0;
          for (int i = 0; i < ${POOLS}; i++) {
            if (i >= uCount) break;
            vec2 d = (vWorld.xy - uPools[i].xy) / uPools[i].zw;
            lit = max(lit, 1.0 - smoothstep(0.45, 1.0, length(d)));
          }
          float a = crease + ${DIM.toFixed(3)} * (1.0 - lit) + farEnds(vWorld.x, vWorld.y);
          // Dithered by a little under one step of eight-bit colour: a wash
          // this gentle otherwise comes out in bands, and a band's edge reads
          // as a line drawn on the wall.
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          a += (grain - 0.5) * 1.5 / 255.0;
          gl_FragColor = vec4(${CUBE_SHADE}, clamp(a, 0.0, 0.6));
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uColor: { value: new THREE.Vector3(0.94, 0.92, 0.9) } },
      vertexShader: SPACE_VERTEX,
      // The page's colour in the page's own numbers, written out as it is, so
      // the floor's far reaches are the same colour CSS draws the wall.
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vDepth;
        uniform vec3 uColor;
        uniform float uRef;
        uniform float uSpan;
        uniform vec4 uWall;
        ${ROOM_GLSL}
        void main() {
          // .shadeFar: by how edge-on the floor is seen, 1 at the crease to
          // 0.62 across the face, at 0.36.
          float facing = abs(normalize(cameraPosition - vWorld).y);
          float across = mix(1.0, 0.62, clamp(vWorld.z / uSpan, 0.0, 1.0));
          vec3 c = mix(uColor, ${CUBE_SHADE}, 0.36 * (1.0 - facing) * across);
          // .veilFar: what has swung furthest away goes back into the page.
          float veil = clamp((vDepth / uRef - 1.0) * 1.6, 0.0, 0.7);
          c = mix(c, uColor, veil);
          // And the room's light: as dim as the wall away from the pools,
          // and as dark towards the far ends.
          c = mix(c, ${CUBE_SHADE}, ${DIM.toFixed(3)} + farEnds(vWorld.x, uWall.w));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    return [wallMat, floorMat];
  }, []);

  const edge = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-300, 0, 0), new THREE.Vector3(300, 0, 0)]);
    const m = new THREE.LineBasicMaterial({ color: CUBE_EDGE, transparent: true, opacity: 0.3, depthWrite: false });
    return new THREE.Line(g, m);
  }, []);

  useEffect(
    () => () => {
      wallMat.dispose();
      floorMat.dispose();
      edge.geometry.dispose();
      (edge.material as THREE.Material).dispose();
    },
    [wallMat, floorMat, edge],
  );

  // The page's background, for the floor to be.
  useEffect(() => {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.body).backgroundColor);
    const [r, g, b, a] = (m?.[1] ?? "").split(",").map((v) => parseFloat(v));
    if (m && a !== 0) floorMat.uniforms.uColor.value.set(r / 255, g / 255, b / 255);
  }, [floorMat]);

  const forward = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const ref = Math.max(0.01, controls?.distance ?? dist);
    // How far the wall is turned from straight on: the sine of the angle
    // between where the camera looks and straight at the wall.
    camera.getWorldDirection(forward);
    const turn = Math.sqrt(Math.max(0, 1 - forward.z * forward.z));
    for (const m of [wallMat, floorMat]) {
      m.uniforms.uRef.value = ref;
      m.uniforms.uFloor.value = floorY;
      m.uniforms.uSpan.value = span;
      m.uniforms.uTurn.value = turn;
      m.uniforms.uWall.value.set(wall.l, wall.r, wall.b, wall.t);
    }
  });

  // A pool for every artwork, as they are hung right now.
  useEffect(() => {
    const pools = wallMat.uniforms.uPools.value as THREE.Vector4[];
    const hung = portals.slice(0, POOLS);
    hung.forEach((p, i) => pools[i].copy(poolOf(p)));
    wallMat.uniforms.uCount.value = hung.length;
  }, [wallMat, portals]);

  return (
    <>
      <mesh position={[eye.x, eye.y, -0.004]} material={wallMat} raycast={untouchable} renderOrder={-1}>
        <planeGeometry args={[600, 600]} />
      </mesh>
      <mesh
        position={[eye.x, floorY, 150]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={floorMat}
        raycast={untouchable}
      >
        <planeGeometry args={[600, 300]} />
      </mesh>
      <primitive object={edge} position={[eye.x, floorY + 0.002, 0.002]} raycast={untouchable} />
    </>
  );
}

/* ------------------------------------------------------------------ stage */

/** One frame after the pictures are in, which is when the flat copy of the
 *  wall underneath can be let go of. */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(onReady);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [onReady]);
  return null;
}

function Stage({
  frame,
  open,
  onOpen,
  onReady,
  portals,
  wall,
  editing = false,
}: Staged & { onReady: () => void }) {
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null;

  // Rounded, so a scrollbar or a phone's address bar sliding away does not
  // count as a new window to fit the wall into.
  const aspect = Math.round((size.width / Math.max(1, size.height)) * 1000) / 1000;

  // The canvas is the whole window and the wall belongs on the column, so the
  // wall is fitted as though it were that much bigger: blown up by as much as
  // the window is bigger than the rectangle it is hung on. The margins are then
  // window the wall simply does not reach — which is what there is to zoom into
  // and what a room, once you are in one, spreads out over.
  const dist = useMemo(
    () =>
      fitBox(
        wall.w * WALL_PAD * (size.width / Math.max(1, frame.w)),
        wall.h * WALL_PAD * (size.height / Math.max(1, frame.h)),
        aspect,
      ),
    [aspect, size.width, size.height, frame.w, frame.h, wall.w, wall.h],
  );

  // …and where it stands. The wall is hung on the middle of that rectangle, not
  // on the middle of the window, so the camera is slid off the axis by the
  // distance between the two — which on an upright window, where the section is
  // cut down to the wall's own height, is most of the page.
  const eye = useMemo(() => {
    const perPixel = (2 * dist * TAN) / Math.max(1, size.height);
    return {
      x: wall.cx - (frame.x + frame.w / 2 - size.width / 2) * perPixel,
      y: wall.cy + (frame.y + frame.h / 2 - size.height / 2) * perPixel,
    };
  }, [dist, size.width, size.height, frame.x, frame.y, frame.w, frame.h, wall.cx, wall.cy]);

  /** The first fit is where the wall is hung, not a move towards it. */
  const hung = useRef(false);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Rotate and zoom, and nothing else: dragging the wall sideways out of the
  // window is not one of the two things this is for. Nothing is pressed for
  // either with a mouse or a trackpad — see the listeners below — so the
  // buttons and the wheel are all taken off camera-controls; a finger on a
  // touch screen still drags to turn and pinches to zoom.
  useEffect(() => {
    if (!controls) return;
    const { ACTION } = CameraControlsImpl;
    controls.mouseButtons.left = ACTION.NONE;
    controls.mouseButtons.right = ACTION.NONE;
    // The wheel held down and dragged slides the view — see `slide`.
    controls.mouseButtons.middle = ACTION.NONE;
    controls.mouseButtons.wheel = ACTION.NONE;
    controls.touches.two = ACTION.TOUCH_DOLLY;
    controls.touches.three = ACTION.NONE;
  }, [controls]);

  /**
   * Slides the view across the wall by `x` and `y` of the camera's own right
   * and down, in wall units — how camera-controls' truck reads them — but no
   * further than keeps the point it looks at over the wall, so some of the
   * wall is always in view (anywhere at all in a room, which is all round
   * you). The step is cut short before it is taken: camera-controls' own
   * boundary stops the point and lets the camera run on, which turns the view
   * as you slide rather than sliding it.
   */
  const roomOpen = portals.some((q) => q.id === open && q.model);
  const slide = useRef((x: number, y: number) => {});
  slide.current = (x, y) => {
    if (!controls) return;
    if (roomOpen) return void controls.truck(x, y, true);
    const cam = controls.camera;
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const from = controls.getTarget(new THREE.Vector3(), true);
    const to = from.clone().addScaledVector(right, x).addScaledVector(up, -y);
    to.x = Math.min(wall.r, Math.max(wall.l, to.x));
    to.y = Math.min(wall.t, Math.max(wall.b, to.y));
    const step = to.sub(from);
    controls.truck(step.dot(right), -step.dot(up), true);
  };

  const gl = useThree((s) => s.gl);
  const inRoom = useRef(false);
  inRoom.current = portals.some((q) => q.id === open && q.model);

  /**
   * Turning and zooming without pressing anything.
   *
   * With a mouse, the view follows the pointer: the pointer's place across the
   * canvas is the angle the wall is seen from, to its stops at the edges and
   * straight on in the middle, and back to straight on when the pointer
   * leaves. The wheel zooms.
   *
   * With a trackpad, the pointer is only a pointer: a two-finger slide turns
   * the view and a pinch zooms. The browser hands both over as wheel events —
   * a pinch with ctrlKey set — so a trackpad is told from a mouse wheel by the
   * shape of its events (`fromTrackpad`), and once one has been seen the
   * pointer stops turning the view, until a mouse wheel is seen again. A
   * trackpad that has not scrolled yet is taken for a mouse.
   */
  useEffect(() => {
    if (!controls || editing) return;
    const el = gl.domElement;
    let pad = false;

    const look = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || pad) return;
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      const [swing, tilt] = inRoom.current ? [ROOM_SWING, ROOM_TILT] : [SWING, TILT];
      controls.rotateTo(nx * swing * DEG, Math.PI / 2 + ny * tilt * DEG, true);
    };
    const home = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !pad) controls.rotateTo(0, Math.PI / 2, true);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift and a two-finger slide: the view slides across the wall, the
        // wall following the fingers. (A browser may hand a shifted scroll
        // over as sideways, so both deltas are taken, whichever came.)
        const k = SLIDE_PAN * controls.distance;
        slide.current(e.deltaX * k, e.deltaY * k);
        return;
      }
      if (e.ctrlKey) {
        controls.dolly(-e.deltaY * PINCH_ZOOM * controls.distance, true);
      } else if (fromTrackpad(e)) {
        pad = true;
        controls.rotate(e.deltaX * SLIDE_TURN, e.deltaY * SLIDE_TURN, true);
      } else {
        pad = false;
        controls.dolly(-e.deltaY * WHEEL_ZOOM * controls.distance, true);
      }
    };

    // The wheel held down and dragged: the wall follows the pointer, a pixel
    // of drag a pixel of wall where the camera is looking.
    let grab: { x: number; y: number } | null = null;
    const press = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      grab = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const drag = (e: PointerEvent) => {
      if (!grab || !(e.buttons & 4)) return void (grab = null);
      const perPixel = (2 * controls.distance * TAN) / Math.max(1, el.clientHeight);
      slide.current(-(e.clientX - grab.x) * perPixel, -(e.clientY - grab.y) * perPixel);
      grab = { x: e.clientX, y: e.clientY };
    };
    const lift = (e: PointerEvent) => {
      if (e.button === 1) grab = null;
    };

    el.addEventListener("pointermove", look);
    el.addEventListener("pointerleave", home);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointermove", drag);
    el.addEventListener("pointerup", lift);
    return () => {
      el.removeEventListener("pointermove", look);
      el.removeEventListener("pointerleave", home);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", press);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("pointerup", lift);
    };
  }, [controls, gl, editing]);

  /**
   * The stops, on or off. They are set on the instance rather than passed as
   * props because when they come back on matters: camera-controls clamps the
   * moment a limit is narrowed, so tightening them while the camera is still
   * somewhere round the back of a room would snap it rather than fly it home.
   * Coming out, they go back on once the flight has landed — see `locking`.
   */
  const stops = useCallback(
    (free: boolean) => {
      if (!controls) return;
      controls.minAzimuthAngle = free ? -Infinity : -SWING * DEG;
      controls.maxAzimuthAngle = free ? Infinity : SWING * DEG;
      controls.minPolarAngle = free ? POLE : Math.PI / 2 - TILT * DEG;
      controls.maxPolarAngle = free ? Math.PI - POLE : Math.PI / 2 + TILT * DEG;
    },
    [controls],
  );

  /** Waiting for the way out to land before the wall's stops come back. */
  const locking = useRef(false);

  /** The one film with its sound on, if any. One, because two soundtracks at
   *  once is neither of them. */
  const [voiced, setVoiced] = useState<string | null>(null);

  /**
   * The order the wall comes down the wire in, so that what is seen first
   * arrives first rather than sharing the line with what is not:
   *
   * 0. The pictures — the artworks' own and the stills of the films and the
   *    rooms. The wall is shown once these are in (`Ready`).
   * 1. The frames, all together, so they go up on the wall at once.
   * 2. The films, each its still until it plays.
   * 3. Once every film is playing — or three seconds on, for a browser that
   *    will not autoplay — the rooms' models, the heaviest things here; each
   *    room is its snapshot until its model is in.
   */
  const [phase, setPhase] = useState(SNAPSHOTS ? 3 : 0);
  const pictured = useCallback(() => {
    setPhase((v) => Math.max(v, 1));
    onReady();
  }, [onReady]);
  const framed = useCallback(() => setPhase((v) => Math.max(v, 2)), []);
  const films = useMemo(() => portals.filter((q) => q.video).map((q) => q.id), [portals]);
  const rolled = useRef(new Set<string>());
  const onRolling = useCallback(
    (id: string) => {
      rolled.current.add(id);
      if (films.every((f) => rolled.current.has(f))) setPhase((v) => Math.max(v, 3));
    },
    [films],
  );
  useEffect(() => {
    if (phase !== 2) return;
    if (films.every((f) => rolled.current.has(f))) return setPhase(3);
    const late = window.setTimeout(() => setPhase((v) => Math.max(v, 3)), 3000);
    return () => window.clearTimeout(late);
  }, [phase, films]);

  // Where the camera stands: in front of the whole wall, or in the room behind
  // one frame. Both are the same fit, one of the wall and one of what is in
  // the room, so entering reads as the frame growing to the size of the window.
  useEffect(() => {
    if (!controls) return;
    const move = hung.current && !reduced.current;
    const p = portals.find((q) => q.id === open);

    // Held where the wall is hung, so what is dragged in the editor lands
    // where the flat copy under it says it will.
    controls.enabled = !editing;

    if (p && !p.model) {
      // A picture or a film, zoomed in on: the same fit the wall gets, of the
      // one card, straight on. It is still the wall, so its stops stay on.
      // With its label beside it, which is what there is to read up close.
      const f = footprintOf(p);
      const [fx, fy] = [(f.l + f.r) / 2, (f.b + f.t) / 2];
      const near = fitBox((f.r - f.l) * ZOOM_PAD, (f.t - f.b) * ZOOM_PAD, aspect);
      locking.current = false;
      stops(false);
      controls.minDistance = near * 0.5;
      controls.maxDistance = dist * FAR;
      controls.normalizeRotations();
      controls.setLookAt(fx, fy, near, fx, fy, 0, move);
    } else if (p) {
      // A framed room is the size of the frame's opening.
      const fit = framing(p);
      const s = standing(fit ? { ...p, w: fit.w, h: fit.h } : p, dist);
      const room = fitBox(s.w * ROOM_PAD, s.h * ROOM_PAD, aspect);
      const [cx, cy, cz] = [at(p.x, eye.x, s.k), at(p.y, eye.y, s.k), s.z];
      locking.current = false;
      // Off before the flight, so the way in can already be a way round.
      stops(true);
      controls.minDistance = room * 0.25;
      controls.maxDistance = room * 2.2;
      controls.setLookAt(cx, cy, cz + room, cx, cy, cz, move);
    } else {
      controls.minDistance = dist * NEAR;
      controls.maxDistance = dist * FAR;
      // Whole turns thrown away first, so coming home from three times round a
      // room is the short way back and not three times round again.
      controls.normalizeRotations();
      controls.setLookAt(eye.x, eye.y, dist, eye.x, eye.y, 0, move);
      // The flight home is made with the stops still off, however far round the
      // room it is coming from; they go back on when it lands.
      if (move) locking.current = true;
      else stops(false);
    }

    hung.current = true;
    // `portals` for what is open only: a frame edited is not a reason to fly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, stops, open, dist, aspect, eye, editing]);

  const room = portals.some((q) => q.id === open && q.model);

  return (
    <>
      <CameraControls
        makeDefault
        smoothTime={0.42}
        draggingSmoothTime={0.14}
        dollySpeed={0.6}
        onRest={() => {
          if (!locking.current) return;
          locking.current = false;
          stops(false);
        }}
      />

      <GalleryLight wall={wall} />
      {SNAPSHOTS ? null : <Space eye={eye} dist={dist} portals={portals} wall={wall} />}
      {SNAPSHOTS ? null : <TrackLights portals={portals} />}
      {SNAPSHOTS ? null : portals.map((p) => <WallLabel key={p.id} p={p} />)}

      <Suspense fallback={null}>
        {portals.map((p) => (
          <Frame
            key={p.id}
            p={p}
            dist={dist}
            eye={eye}
            open={open}
            onOpen={onOpen}
            voiced={voiced}
            onVoice={setVoiced}
            room={room}
            editing={editing}
            later={phase >= 2}
            last={phase >= 3}
            onRolling={onRolling}
          />
        ))}
        <Ready onReady={pictured} />
      </Suspense>

      {phase >= 1 && !SNAPSHOTS ? (
        <Suspense fallback={null}>
          {portals.map((p) => (framing(p) ? <FrameModel key={p.id} p={p} /> : null))}
          <Arrived onArrive={framed} />
        </Suspense>
      ) : null}

      <Preload all />
    </>
  );
}

/**
 * The gallery wall: pictures, films, and portals.
 *
 * Every frame with a model in it is a window onto a room of its own — drei's
 * MeshPortalMaterial renders each room into a texture and masks it to the shape
 * of the frame — and double-clicking one dissolves its mask and flies the
 * camera in. The films and the pictures beside them hang flat and are only
 * looked at. It is the
 * pmndrs "Enter portals" demo laid flat: no tilt on the frames, the swing
 * stopped at fifteen degrees so the backs of them can never be reached, and the
 * corners square.
 *
 * The stop is on the wall and not on the room. Once you are through a frame
 * there is no back of it to get to, so the camera goes all the way round
 * whatever is in there; coming out puts the stops back, after the flight home
 * rather than before it.
 *
 * Client-only, and dynamically imported: three and drei are the largest thing
 * on the site by a wide margin, and no other page needs them.
 */
export default function PortalScene(props: Staged & { onReady: () => void }) {
  const { wall } = props;
  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, localClippingEnabled: true }}
      camera={{ fov: FOV, position: [wall.cx, wall.cy, 12], near: 0.05, far: 200 }}
    >
      <Stage {...props} />
    </Canvas>
  );
}
