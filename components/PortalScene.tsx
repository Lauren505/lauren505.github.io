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
import { RoundedPlaneGeometry } from "maath/geometry";
import { CORNER, CUE, CUE_NARROW, WALL_PAD, type Portal, type Wall } from "@/content";
import { modelBoxes } from "./galleryProbe";
import wallStyles from "./PortalWall.module.css";

const DEG = Math.PI / 180;

/** Narrow, because the frames are flat against one wall: a wide lens would
 *  splay the ones at the ends outwards before anything had been turned. */
const FOV = 35;
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

/** The corner is in wall units, so a frame cannot be a scaled unit plane —
 *  scaling it would scale the corner with it. One geometry each, made once. */
function useCard(p: Portal) {
  const geometry = useMemo(() => new RoundedPlaneGeometry(p.w, p.h, CORNER), [p.w, p.h]);
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
}: {
  p: Portal;
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
    const video = document.createElement("video");
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = p.video as string;

    const reel = new THREE.VideoTexture(video);
    // Told what it is before it is ever drawn — see useLaid, which crops it.
    reel.colorSpace = THREE.SRGBColorSpace;

    const first = () => setRolling(true);
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
    // Only the film itself: a frame resized or a crop moved re-crops the
    // texture below, and does not start the film again from nothing.
  }, [p.video]);

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
  return (
    <Html
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
}: { p: Portal; dist: number; eye: Eye; editing?: boolean } & OpenProps) {
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
            <Suspense fallback={null}>
              <Model p={p} room={s} inside={inside} />
            </Suspense>
          </group>
        </MeshPortalMaterial>
      </mesh>

      <Cue p={p} hidden={open !== null} />
    </>
  );
}

type Voice = { voiced: string | null; onVoice: (id: string | null) => void };

/** A model is a window, a film plays, and a picture hangs. */
function Frame({
  voiced,
  onVoice,
  room,
  editing,
  ...props
}: { p: Portal; dist: number; eye: Eye; room: boolean; editing: boolean } & OpenProps & Voice) {
  const { p, open, onOpen } = props;
  if (p.model) return <Window {...props} editing={editing} />;
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
      />
    );
  return p.image ? <Still p={p} image={p.image} aside={aside} zoomed={open === p.id} onOpen={onOpen} /> : null;
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
  // window is not one of the two things this is for.
  useEffect(() => {
    if (!controls) return;
    const { ACTION } = CameraControlsImpl;
    controls.mouseButtons.right = ACTION.NONE;
    controls.mouseButtons.middle = ACTION.NONE;
    controls.mouseButtons.wheel = ACTION.DOLLY;
    controls.touches.two = ACTION.TOUCH_DOLLY;
    controls.touches.three = ACTION.NONE;
  }, [controls]);

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
      const near = fitBox(p.w * ZOOM_PAD, p.h * ZOOM_PAD, aspect);
      locking.current = false;
      stops(false);
      controls.minDistance = near * 0.5;
      controls.maxDistance = dist * FAR;
      controls.normalizeRotations();
      controls.setLookAt(p.x, p.y, near, p.x, p.y, 0, move);
    } else if (p) {
      const s = standing(p, dist);
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
          />
        ))}
        <Ready onReady={onReady} />
      </Suspense>

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
 * corners cut to the four pixels the old site's gallery cards had.
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
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, localClippingEnabled: true }}
      camera={{ fov: FOV, position: [wall.cx, wall.cy, 12], near: 0.05, far: 200 }}
    >
      <Stage {...props} />
    </Canvas>
  );
}
