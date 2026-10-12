import * as THREE from "three";
import { CLOTH, clothDpr, clothOver, drawCloth } from "@/components/clothPattern";

const DEG = Math.PI / 180;
/** Narrow, so the cloth lying flat is barely touched by perspective and the
 *  height of it in the air reads as nearness rather than as distortion. */
const FOV = 30;
/** The whole throw, from the hands to the last ripple. */
const DROP_MS = 2500;
/** How far through the throw the table starts being laid — see `onSet`: 1 is
 *  once the cloth is lying still, less is while it is still settling, the
 *  plates coming in over it. */
const SET_AT = 0.7;
/** How high the cloth is carried, as a fraction of the camera's distance from
 *  the table: at the top of the throw it is drawn about a third larger. */
const LIFT = 0.15;

/**
 * The cloth's shape at a moment, as a height field over the table: flicked out
 * from hands just off the left of the window, carried across it on a pocket of
 * air, and let down as the air leaks out — the edges first, the middle last —
 * until it is lying flat, running off the top and the bottom of the window.
 *
 * Every term is enveloped to nothing by uT = 1, so the last frame is the flat
 * rectangle and nothing else: that is the picture in clothPattern, to the
 * pixel. It is a choreography rather than a simulation for the same reason — a
 * simulated cloth never quite lands where you want it.
 */
const DRAPE = /* glsl */ `
uniform float uT;
uniform vec2 uSize;
uniform float uLift;
const float PI = 3.14159265;

vec3 drape(vec2 uv) {
  // v runs along the throw, from the hands at the left edge out to the far
  // edge at the right; u runs across it, top to bottom.
  float u = uv.y, v = uv.x, t = uT;
  float side = sin(PI * clamp(u, 0.0, 1.0));
  float end = sin(PI * clamp(v, 0.0, 1.0));

  // The throw: bunched in the hands just off the left, then unrolled across.
  float reach = 1.0 - pow(1.0 - clamp(t / 0.4, 0.0, 1.0), 3.0);
  float x = mix(-0.5 * uSize.x - 0.16 * uSize.y, (v - 0.5) * uSize.x, reach);

  // Drawn in at the top and bottom while it hangs in the air, spread out as it
  // lands.
  float held = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.3, 0.85, t));
  float y = (u - 0.5) * uSize.y * (1.0 - 0.1 * held * (1.0 - 0.4 * end));

  // The air under it. All of it is up with the throw; then the edges come down
  // onto the table and pin it, and what is left is a pocket that drifts away
  // from the hands as it empties.
  float air = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.32, 0.9, t));
  // Never an even roll: the pocket sits further out on one side than the
  // other, and is fuller in some places than others.
  float c = mix(0.3, 0.6, smoothstep(0.1, 0.8, t)) + 0.07 * sin(u * 5.2 + 1.1);
  float d = v - c;
  float pocket = exp(-d * d / 0.12) * (0.8 + 0.2 * sin(u * 7.3 + v * 3.1 + 0.4));
  float pinned = smoothstep(0.22, 0.6, t);
  // Easing down to the table rather than dropping onto it: flat where it
  // meets the table, so there is no steep, dark rim along the edges.
  float sideR = smoothstep(0.0, 0.4, u) * smoothstep(1.0, 0.6, u);
  float endR = smoothstep(0.0, 0.28, v) * smoothstep(1.0, 0.72, v);
  float shape = mix(0.65 + 0.35 * end, pocket * sideR * endR, pinned);
  float z = uLift * air * shape;

  // The flick itself, running out along the cloth away from the hands.
  float fly = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.2, 0.62, t));
  z += uLift * fly * (0.3 + 0.7 * v) *
    (0.1 * sin(v * 10.0 - t * 26.0) + 0.06 * sin(u * 8.0 + v * 4.0 - t * 19.0));

  // And the last of the air, a few soft lumps drifting out towards the edges
  // and flattening as they go.
  float settle = smoothstep(0.5, 0.68, t) * (1.0 - smoothstep(0.76, 1.0, t));
  float lumps = sin(u * 6.1 - t * 5.0 + 0.7) * sin(v * 4.7 + t * 6.0 + 2.3)
    + 0.5 * sin(u * 11.0 + v * 9.0 - t * 8.0);
  z += uLift * settle * 0.022 * max(lumps, 0.0) * side * end;

  // It cannot go through the table.
  return vec3(x, y, max(z, 0.0));
}
`;

const CLOTH_VERT = /* glsl */ `
${DRAPE}
uniform vec2 uStep;
varying vec2 vUv;
varying vec3 vN;
varying float vH;

void main() {
  vec3 p = drape(uv);
  vec3 du = drape(uv + vec2(uStep.x, 0.0)) - p;
  vec3 dv = drape(uv + vec2(0.0, uStep.y)) - p;
  // Nudged off zero: at the very start the cloth is a single line, and a
  // normal of nothing would be NaN.
  vN = normalize(cross(du, dv) + vec3(0.0, 0.0, 1e-6));
  vUv = uv;
  vH = p.z / uLift;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const CLOTH_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uSize;
uniform vec3 uCloth;
uniform float uWeave;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
const float PI = 3.14159265;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  // Premultiplied, and clear between the tassels: the table shows through.
  vec4 print = texture2D(uMap, vUv);
  if (print.a < 0.004) discard;
  vec3 base = print.rgb;
  vec3 n = normalize(vN);
  // The underside, if a fold ever shows it: the print only bleeds through.
  if (!gl_FrontFacing) {
    n = -n;
    base = mix(uCloth * print.a, base, 0.3);
  }

  // Lit from the top left, and normalised so a face lying flat is exactly 1:
  // at rest the cloth is the drawing and nothing but.
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  float lit = dot(n, L) / L.z;
  // Soft: it is cloth in daylight, not a sculpture under a lamp.
  float shade = 1.0 + (clamp(lit, 0.55, 1.15) - 1.0) * 0.55;
  // A little nearer the light the higher it is.
  shade *= 1.0 + 0.025 * vH;

  // The weave, which is only there while the cloth is moving: over and under
  // threads a couple of pixels apart, each a slightly different weight, and a
  // slub to the yarn at a larger scale.
  vec2 q = vUv * uSize / 2.4;
  float over = sin(q.x * PI) * sin(q.y * PI);
  float thread = hash(floor(q)) - 0.5;
  float slub = noise(vUv * uSize / 40.0) - 0.5;
  float weave = 1.0 + uWeave * (0.05 * over + 0.035 * thread + 0.05 * slub);

  // A soft sheen where a fold turns towards the light.
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  float sheen = uWeave * 0.04 * pow(max(dot(n, h), 0.0), 12.0) * smoothstep(0.0, 0.05, vH);

  gl_FragColor = vec4(base * shade * weave + sheen * print.a, print.a);
}
`;

/** The cloth's shadow on the table: the same shape pushed away from the light
 *  by its height, grown past the cloth's edges by uMargin and fading out
 *  across that margin — a penumbra, wider the higher the edge above it is, so
 *  there is never a hard line where the shadow stops. */
const SHADOW_VERT = /* glsl */ `
${DRAPE}
uniform float uMargin;
varying vec2 vPast;
varying float vH;

void main() {
  vec2 st = (uv - 0.5) * (1.0 + 2.0 * uMargin / uSize) + 0.5;
  vec2 inside = clamp(st, 0.0, 1.0);
  vec3 p = drape(inside);
  // How far past the cloth's edge this point of the shadow is, in pixels.
  vPast = (st - inside) * uSize;
  vH = p.z / uLift;
  vec2 thrown = vec2(0.35, -0.55) * p.z * 0.6;
  gl_Position = projectionMatrix * viewMatrix * vec4(p.xy + vPast + thrown, -0.5, 1.0);
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform float uMargin;
varying vec2 vPast;
varying float vH;

void main() {
  float high = clamp(vH * 4.0, 0.0, 1.0);
  float blur = uMargin * (0.35 + 0.65 * high);
  float fall = 1.0 - smoothstep(0.0, blur, length(vPast));
  float a = 0.16 * clamp(vH * 3.0, 0.0, 1.0) * fall * fall;
  gl_FragColor = vec4(vec3(0.27, 0.2, 0.13), a);
}
`;

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Throws the cloth onto the table in `canvas`, which covers the window, and
 * says so through `onDown` once it is lying still. `onSet` is told a little
 * before that — SET_AT of the way through — which is when the table starts
 * being laid. Returns the way to take it down again.
 *
 * The table is longer than the window when there is more on it than fits, and
 * the cloth with it. Only the window's worth of it is thrown — `at` is where
 * that is, down the table — printed with that stretch of the same long cloth
 * clothPattern draws; the rest is only ever seen lying down.
 *
 * Nothing is colour-managed: the texture is the drawing's own sRGB and goes to
 * the screen as it is, so the cloth at rest is that drawing exactly.
 */
export function layCloth(
  canvas: HTMLCanvasElement,
  { length, at }: { length: number; at: number },
  onDown?: () => void,
  onSet?: () => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10);

  const uniforms = {
    uT: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) },
    uLift: { value: 1 },
    uStep: { value: new THREE.Vector2(0.01, 0.01) },
    uMap: { value: null as THREE.Texture | null },
    uCloth: { value: rgb(CLOTH) },
    uWeave: { value: 1 },
    uMargin: { value: 90 },
  };

  let geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const cloth = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CLOTH_VERT,
      fragmentShader: CLOTH_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      premultipliedAlpha: true,
    }),
  );
  const shadow = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  // The geometry is a unit square the shader moves anywhere, so its bounds
  // say nothing about where it is.
  cloth.frustumCulled = shadow.frustumCulled = false;
  shadow.renderOrder = 0;
  cloth.renderOrder = 1;
  scene.add(shadow, cloth);

  const size = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(clothDpr());
    renderer.setSize(w, h, false);

    // Far enough back that the table at z = 0 fills the window exactly.
    const dist = h / 2 / Math.tan((FOV / 2) * DEG);
    camera.aspect = w / h;
    camera.near = dist * 0.05;
    camera.far = dist * 2;
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();

    // The cloth is taller than the window — see clothOver — and hangs off
    // the top and the bottom of it by the same amount, so it is centred.
    const over = clothOver(window.innerHeight);
    const ch = h + over * 2;
    uniforms.uSize.value.set(w, ch);
    uniforms.uLift.value = dist * LIFT;
    uniforms.uMargin.value = Math.min(w, h) * 0.1;

    // Enough rows and columns for the folds, in the window's own proportion.
    const cols = 110;
    const rows = Math.min(180, Math.max(40, Math.round((cols * ch) / w)));
    geometry.dispose();
    geometry = new THREE.PlaneGeometry(1, 1, cols, rows);
    cloth.geometry = shadow.geometry = geometry;
    uniforms.uStep.value.set(1 / cols, 1 / rows);

    const print = document.createElement("canvas");
    drawCloth(print, w, length, at - over, at + h + over);
    uniforms.uMap.value?.dispose();
    const tex = new THREE.CanvasTexture(print);
    tex.colorSpace = THREE.NoColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    uniforms.uMap.value = tex;
  };

  let raf = 0;
  let t0 = 0;
  let t = 0;
  let set = false;

  const draw = () => {
    uniforms.uT.value = t;
    uniforms.uWeave.value = 1 - THREE.MathUtils.smoothstep(t, 0.78, 1);
    renderer.render(scene, camera);
  };

  const frame = (now: number) => {
    if (!t0) t0 = now;
    t = Math.min(1, (now - t0) / DROP_MS);
    draw();
    raf = t < 1 ? requestAnimationFrame(frame) : 0;
    if (!set && t >= SET_AT) {
      set = true;
      onSet?.();
    }
    if (!raf) onDown?.();
  };

  // Once it is down it is a picture, so a resize is one frame, not a loop.
  const resize = () => {
    size();
    if (!raf) draw();
  };

  size();
  raf = requestAnimationFrame(frame);
  window.addEventListener("resize", resize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    geometry.dispose();
    cloth.material.dispose();
    shadow.material.dispose();
    uniforms.uMap.value?.dispose();
    renderer.dispose();
  };
}
