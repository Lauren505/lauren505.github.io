"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  GUTTER,
  WALL_PAD,
  entries as saved,
  footprintOf,
  labelOf,
  type Entry,
  type LabelSide,
  type Portal,
  type Wall,
} from "@/content";
import { modelBoxes } from "@/components/galleryProbe";
import { FRAME_SPECS } from "@/content/frames";
import panel from "./TableEditor.module.css";
import wallStyles from "./PortalWall.module.css";
import styles from "./GalleryEditor.module.css";

/**
 * Hanging the gallery in the browser, in development only: GalleryPortals
 * leaves it out of every other build. The bakery's table editor, for a wall.
 *
 * On the wall itself: drag a frame to move it, and its corner to size it
 * (shift keeps its shape). Both snap to an even gap — an edge comes to rest a
 * GUTTER from the facing edge of a neighbour beside, above or below it — with
 * a guide drawn where it does; hold ⌘ (Ctrl) to place it freely. Nothing
 * snaps edges into line: the wall is ragged on purpose, and only its spacing
 * is even. In framing mode — the button, F, or ⌥ held down —
 * dragging inside a frame moves what is in it instead: a picture or a film is
 * panned across its crop, a model is walked round (shift: the point it is
 * centred on is moved), and the wheel zooms either. In the panel: what hangs
 * in each frame, its still, its numbers, and frames added and taken down. Save
 * writes it all to content/gallery.ts — see app/api/gallery.
 */

type Media = { pictures: string[]; models: string[]; videos: string[] };
export type Preview = { src: string; width: number; height: number };

type Props = {
  editing: boolean;
  setEditing: (on: boolean) => void;
  draft: Entry[];
  setDraft: (next: Entry[]) => void;
  /** The draft, resolved — what is actually drawn, with its pictures. */
  shown: Portal[];
  /** The rectangle the wall is fitted by right now, held still mid-drag. */
  fit: Wall;
  setDragging: (on: boolean) => void;
  previews: Record<string, Preview>;
  addPreview: (name: string, p: Preview) => void;
};

/** The fields that are what hangs in a frame, as opposed to where. Swapped
 *  whole when two frames trade artworks. */
const CONTENT = [
  "title",
  "image",
  "model",
  "modelSpan",
  "modelFocus",
  "modelView",
  "modelScale",
  "modelOffset",
  "video",
  "sound",
  "focus",
  "zoom",
  "bg",
  "medium",
  "about",
] as const;

/** Which side of its frame a label can hang on, as the panel names them. */
const SIDES: [LabelSide, string][] = [
  ["right", "right, level with the bottom"],
  ["right-top", "right, level with the top"],
  ["left", "left, level with the bottom"],
  ["left-top", "left, level with the top"],
  ["below", "below, from the left"],
  ["below-right", "below, from the right"],
  ["above", "above, from the left"],
  ["above-right", "above, from the right"],
  ["none", "no label"],
];

type Kind = "model" | "video" | "picture";
const kindOf = (e: Pick<Entry, "model" | "video">): Kind => (e.model ? "model" : e.video ? "video" : "picture");
/** An artwork, as one string: what it is and which file. */
const keyOf = (e: Entry) => (e.model ? `model:${e.model}` : e.video ? `video:${e.video}` : `picture:${e.image ?? ""}`);
const fileName = (s: string) => s.split("/").pop() ?? s;
const titleFrom = (s: string) =>
  fileName(s)
    .replace(/\.\w+$/, "")
    .replace(/-web$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

const round = (v: number, step = 0.005) => Math.round(v / step) * step;

/** A wall as the file would have it, for telling whether there is anything to
 *  save: numbers to the three places the file keeps, fields that mean nothing
 *  left out, and keys in one order — a crop added here lands after `h`, and
 *  the file writes it before `bg`. */
const norm = (list: Entry[]) =>
  JSON.stringify(
    list.map((e) => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(e).sort()) {
        let v = (e as Record<string, unknown>)[k];
        if (typeof v === "number") v = Math.round(v * 1000) / 1000;
        if (Array.isArray(v)) v = v.map((x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x));
        const idle =
          v === undefined ||
          v === null ||
          (k === "zoom" && v === 1) ||
          (k === "modelScale" && v === 1) ||
          (k === "sound" && v === false) ||
          (k === "flush" && v === false) ||
          (k === "label" && v === "right") ||
          ((k === "medium" || k === "about") && v === "") ||
          (k === "focus" && Array.isArray(v) && v[0] === 0.5 && v[1] === 0.5);
        if (!idle) out[k] = v;
      }
      return out;
    }),
  );
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A number field that only commits when it holds a number. */
function Num({
  label,
  value,
  placeholder,
  onChange,
  step = 0.05,
}: {
  label: string;
  value: number | undefined;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
  step?: number;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(Math.round(value * 1000) / 1000)), [value]);
  return (
    <label className={panel.num}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === "") return onChange(undefined);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

/** How near, in pixels on screen, an edge has to come to be snapped. */
const SNAP_PX = 8;

type Guides = { x: number[]; y: number[] };
const noGuides: Guides = { x: [], y: [] };

/** One axis of a snap: each pair is an edge of the frame being dragged, where
 *  it would be, and a line it may land on. The nearest within reach wins. */
function nearest(pairs: [moving: number, target: number][], reach: number) {
  let best: { d: number; at: number } | null = null;
  for (const [m, t] of pairs) {
    const d = t - m;
    if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
  }
  return best;
}

/** Another frame's edges, with its label: the label is part of what a
 *  neighbour keeps its distance from. */
const linesOf = (q: Entry) => footprintOf(q);

/** How far a frame's label takes its footprint past the frame on each side —
 *  0, or how far out the label reaches. */
const reachOf = (q: Entry) => {
  const f = footprintOf(q);
  return { l: q.x - q.w / 2 - f.l, r: f.r - (q.x + q.w / 2), b: q.y - q.h / 2 - f.b, t: f.t - (q.y + q.h / 2) };
};

/** A drag in progress: what it is doing, where it started, and the frame as
 *  it was when it did. */
type Drag = {
  i: number;
  how: "move" | "size" | "pan" | "orbit" | "aim";
  x: number;
  y: number;
  /** Wall units to the pixel, for the whole drag — the fit is held still. */
  u: number;
  /** The frame's size on screen, for framing. */
  pw: number;
  ph: number;
  start: Entry;
  aspect: number | null;
};

export default function GalleryEditor({
  editing,
  setEditing,
  draft,
  setDraft,
  shown,
  fit,
  setDragging,
  previews,
  addPreview,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [framing, setFraming] = useState(false);
  const [alt, setAlt] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [status, setStatus] = useState<string | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [guides, setGuides] = useState<Guides>(noGuides);
  const past = useRef<Entry[][]>([]);
  const future = useRef<Entry[][]>([]);
  const drag = useRef<Drag | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const dirty = norm(draft) !== norm(saved);
  const reframing = framing || alt;

  /* ----------------------------------------------------------- history */

  const commit = useCallback(
    (next: Entry[]) => {
      past.current.push(draft);
      if (past.current.length > 200) past.current.shift();
      future.current = [];
      setDraft(next);
    },
    [draft, setDraft],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(draft);
    setDraft(prev);
  }, [draft, setDraft]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(draft);
    setDraft(next);
  }, [draft, setDraft]);
  const revert = () => {
    commit(saved);
    setSelected(null);
  };

  /** Changes one frame. */
  const change = useCallback(
    (i: number, patch: Partial<Entry>, live = false) => {
      const next = draft.map((e, j) => (j === i ? { ...e, ...patch } : e));
      if (live) setDraft(next);
      else commit(next);
    },
    [draft, commit, setDraft],
  );

  /* ------------------------------------------------------------- media */

  useEffect(() => {
    if (!editing || media) return;
    fetch("/api/gallery")
      .then((r) => r.json())
      .then(setMedia)
      .catch(() => setStatus("Could not list the gallery folders."));
  }, [editing, media]);

  /** A picture the page has not imported yet, drawn from the dev server until
   *  it is saved and is. */
  const preview = useCallback(
    (name: string) => {
      if (previews[name]) return;
      const src = `/api/gallery?file=${encodeURIComponent(name)}`;
      const img = new Image();
      img.onload = () => addPreview(name, { src, width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    },
    [previews, addPreview],
  );
  useEffect(() => {
    for (const e of draft) if (e.image && !shown.find((p) => p.id === e.id)?.image) preview(e.image);
  }, [draft, shown, preview]);

  /* -------------------------------------------------------------- save */

  const save = useCallback(async () => {
    setStatus("Saving…");
    try {
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const out = await res.json().catch(() => ({}));
      setStatus(res.ok ? "Saved to content/gallery.ts" : `Not saved: ${out.error ?? res.status}`);
    } catch (err) {
      setStatus(`Not saved: ${String(err)}`);
    }
  }, [draft]);

  /* ---------------------------------------------------------- keyboard */

  useEffect(() => {
    if (!editing) return;
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && !!e.target.closest("input, select, textarea");
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAlt(true);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing(e)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") return setSelected(null);
      if (e.key.toLowerCase() === "f" && !mod) return setFraming((f) => !f);
      if (selected === null) return;
      const step = e.shiftKey ? 0.25 : 0.05;
      const e0 = draft[selected];
      const moves: Record<string, Partial<Entry>> = {
        ArrowLeft: { x: round(e0.x - step) },
        ArrowRight: { x: round(e0.x + step) },
        ArrowUp: { y: round(e0.y + step) },
        ArrowDown: { y: round(e0.y - step) },
      };
      if (moves[e.key]) {
        e.preventDefault();
        change(selected, moves[e.key]);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(draft.filter((_, j) => j !== selected));
        setSelected(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAlt(false);
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const blur = () => setAlt(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", leave);
    };
  }, [editing, selected, draft, change, commit, undo, redo, save, dirty]);

  /* ----------------------------------------------------- the wall drags */

  /** The artwork's own shape, where it has one to keep. */
  const aspectOf = (i: number) => {
    const im = shown[i]?.image;
    return im ? im.width / im.height : null;
  };

  const begin = (e: React.PointerEvent, i: number, how: Drag["how"]) => {
    e.preventDefault();
    e.stopPropagation();
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setSelected(i);
    const frameEl = (e.currentTarget as HTMLElement).closest("[data-frame]") as HTMLElement | null;
    const fr = frameEl?.getBoundingClientRect();
    drag.current = {
      i,
      how,
      x: e.clientX,
      y: e.clientY,
      u: fit.w / r.width,
      pw: fr?.width ?? 1,
      ph: fr?.height ?? 1,
      start: draft[i],
      aspect: aspectOf(i),
    };
    past.current.push(draft);
    future.current = [];
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const s = d.start;

    const others = draft.filter((_, j) => j !== d.i).map(linesOf);
    /** Whether two spans share any of their length, which is what makes two
     *  frames neighbours across the other axis. */
    const share = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
    const reach = SNAP_PX * d.u;
    const free = e.metaKey || e.ctrlKey;

    if (d.how === "move") {
      let x = s.x + dx * d.u;
      let y = s.y - dy * d.u;
      const hw = s.w / 2;
      const hh = s.h / 2;
      // Its edges as its neighbours see them: with its label.
      const k = reachOf(s);
      const [L, R, B, T] = [x - hw - k.l, x + hw + k.r, y - hh - k.b, y + hh + k.t];
      // Beside: frames that share some of its height; above or below:
      // frames that share some of its width.
      const sx = free
        ? null
        : nearest(
            others
              .filter((q) => share(B, T, q.b, q.t))
              .flatMap((q) => [
                [L, q.r + GUTTER],
                [R, q.l - GUTTER],
              ]) as [number, number][],
            reach,
          );
      const sy = free
        ? null
        : nearest(
            others
              .filter((q) => share(L, R, q.l, q.r))
              .flatMap((q) => [
                [T, q.b - GUTTER],
                [B, q.t + GUTTER],
              ]) as [number, number][],
            reach,
          );
      // Snapped, it lands exactly; free, it lands on a tidy number.
      x = sx ? x + sx.d : round(x);
      y = sy ? y + sy.d : round(y);
      setGuides({ x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] });
      change(d.i, { x: round(x, 0.0005), y: round(y, 0.0005) }, true);
    } else if (d.how === "size") {
      // From the top left corner, which stays put; the edges being dragged
      // are the right and the bottom, and those are what snap.
      const left = s.x - s.w / 2;
      const top = s.y + s.h / 2;
      let w = Math.max(0.3, s.w + dx * d.u);
      let h = Math.max(0.3, s.h + dy * d.u);
      const a = d.aspect ?? s.w / s.h;
      const byWidth = Math.abs(dx) > Math.abs(dy);
      if (e.shiftKey) {
        if (byWidth) h = w / a;
        else w = h * a;
      }
      const k = reachOf(s);
      const sx =
        free || (e.shiftKey && !byWidth)
          ? null
          : nearest(
              others
                .filter((q) => share(top - h - k.b, top + k.t, q.b, q.t) && q.l > left)
                .map((q) => [left + w + k.r, q.l - GUTTER]) as [number, number][],
              reach,
            );
      const sy =
        free || (e.shiftKey && byWidth)
          ? null
          : nearest(
              others
                .filter((q) => share(left - k.l, left + w + k.r, q.l, q.r) && q.t < top)
                .map((q) => [top - h - k.b, q.t + GUTTER]) as [number, number][],
              reach,
            );
      if (sx) w += sx.d;
      else w = round(w);
      if (sy) h -= sy.d;
      else h = round(h);
      if (e.shiftKey) {
        if (sx) h = w / a;
        if (sy) w = h * a;
      }
      setGuides({ x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] });
      change(
        d.i,
        { w: round(w, 0.0005), h: round(h, 0.0005), x: round(left + w / 2, 0.0005), y: round(top - h / 2, 0.0005) },
        true,
      );
    } else if (d.how === "pan") {
      // The picture follows the pointer: the crop's window moves against it.
      // How much of the picture the frame shows across, and so how far a
      // pixel of drag is across the picture — see `cover` in PortalScene.
      const a = d.aspect ?? s.w / s.h;
      const fa = s.w / s.h;
      const z = s.zoom ?? 1;
      const rx = (a > fa ? fa / a : 1) / z;
      const ry = (a > fa ? 1 : a / fa) / z;
      const [fx, fy] = s.focus ?? [0.5, 0.5];
      const nx = rx < 1 ? fx - ((dx / d.pw) * rx) / (1 - rx) : 0.5;
      const ny = ry < 1 ? fy - ((dy / d.ph) * ry) / (1 - ry) : 0.5;
      change(d.i, { focus: [round(clamp(nx, 0, 1), 0.001), round(clamp(ny, 0, 1), 0.001)] }, true);
    } else if (d.how === "orbit") {
      const [around, above] = s.modelView ?? [0, 0];
      change(
        d.i,
        { modelView: [round(around - dx * 0.35, 0.5), round(clamp(above + dy * 0.35, -89, 89), 0.5)] },
        true,
      );
    } else {
      // Moving the point the model is centred on, across the screen as it is
      // seen: the screen's right and up, carried back into the model's own
      // axes through the turn it is drawn with.
      const auto = modelBoxes.get(s.id);
      const span = (s.modelSpan ?? auto?.span ?? 10) / (s.modelScale ?? 1);
      const per = span / d.ph;
      const [around, above] = s.modelView ?? [0, 0];
      const turn = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-above * (Math.PI / 180), around * (Math.PI / 180), 0, "YXZ"),
      );
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(turn);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn);
      const f0 = new THREE.Vector3(...(s.modelFocus ?? auto?.focus ?? [0, 0, 0]));
      const f = f0.addScaledVector(right, -dx * per).addScaledVector(up, dy * per);
      change(d.i, { modelFocus: [round(f.x, 0.01), round(f.y, 0.01), round(f.z, 0.01)] }, true);
    }
  };

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setGuides(noGuides);
    setDragging(false);
  };

  /** Zooming what is in a frame. One step of history per burst of scrolling. */
  const lastWheel = useRef(0);
  const wheel = (e: React.WheelEvent, i: number) => {
    if (selected !== i) return;
    e.stopPropagation();
    const now = performance.now();
    const fresh = now - lastWheel.current > 400;
    lastWheel.current = now;
    const e0 = draft[i];
    const k = Math.exp(e.deltaY * 0.0015);
    const patch: Partial<Entry> = e0.model
      ? {
          modelSpan: round(
            clamp((e0.modelSpan ?? modelBoxes.get(e0.id)?.span ?? 10) * k, 0.05, 1000),
            0.01,
          ),
        }
      : { zoom: round(clamp((e0.zoom ?? 1) / k, 1, 8), 0.01) };
    change(i, patch, !fresh);
  };

  /* ------------------------------------------------------------ panel */

  const e = selected !== null ? draft[selected] : undefined;
  const p = selected !== null ? shown[selected] : undefined;

  /** Puts an artwork in the selected frame. If another frame has it, the two
   *  trade; if none does, the one that was here comes down. */
  const hang = (key: string) => {
    if (selected === null || !e) return;
    const [kind, file] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const there = draft.findIndex((q, j) => j !== selected && keyOf(q) === key);
    const contentOf = (q: Entry) => Object.fromEntries(CONTENT.map((k) => [k, q[k]])) as Partial<Entry>;
    if (there >= 0) {
      const mine = contentOf(e);
      const theirs = contentOf(draft[there]);
      commit(
        draft.map((q, j) => (j === selected ? { ...q, ...theirs } : j === there ? { ...q, ...mine } : q)),
      );
      return;
    }
    const cleared = Object.fromEntries(CONTENT.map((k) => [k, undefined])) as Partial<Entry>;
    const fresh: Partial<Entry> = {
      ...cleared,
      title: titleFrom(file),
      bg: e.bg,
      ...(kind === "model" ? { model: file } : kind === "video" ? { video: file } : { image: file }),
    };
    if (kind === "picture") preview(file);
    change(selected, fresh);
  };

  /** A new frame for an artwork: in the middle of the wall, cut to its shape. */
  const add = (key: string) => {
    if (!key) return;
    const [kind, file] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const base = fileName(file)
      .replace(/\.\w+$/, "")
      .replace(/-web$/, "")
      .replace(/[^\w-]+/g, "-")
      .toLowerCase();
    let id = base;
    for (let k = 2; draft.some((q) => q.id === id); k++) id = `${base}-${k}`;
    const a =
      kind === "picture" && previews[file]
        ? previews[file].width / previews[file].height
        : kind === "video"
          ? 16 / 9
          : 4 / 3;
    const w = 2.4;
    const entry: Entry = {
      id,
      title: titleFrom(file),
      ...(kind === "model" ? { model: file } : kind === "video" ? { video: file } : { image: file }),
      bg: "#e6ddd2",
      x: round(fit.cx),
      y: round(fit.cy),
      w,
      h: round(w / a),
    };
    if (kind === "picture") preview(file);
    commit([...draft, entry]);
    setSelected(draft.length);
  };

  const hungKeys = new Set(draft.map(keyOf));
  const choices = media
    ? [
        ...media.models.map((m) => ({ key: `model:${m}`, label: fileName(m), group: "Models" })),
        ...media.videos.map((v) => ({ key: `video:${v}`, label: fileName(v), group: "Films" })),
        ...media.pictures.map((f) => ({ key: `picture:${f}`, label: f, group: "Pictures" })),
      ]
    : [];
  const options = (keys: { key: string; label: string; group: string }[]) =>
    (["Models", "Films", "Pictures"] as const).map((g) => (
      <optgroup key={g} label={g}>
        {keys
          .filter((c) => c.group === g)
          .map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
              {hungKeys.has(c.key) ? " ·" : ""}
            </option>
          ))}
      </optgroup>
    ));

  /* ----------------------------------------------------------- render */

  const style = useMemo(
    () =>
      ({
        "--wall-aspect": fit.w / fit.h,
        "--wall-pad": WALL_PAD,
      }) as React.CSSProperties,
    [fit],
  );

  if (!editing) {
    return (
      <button type="button" className={panel.toggle} onClick={() => setEditing(true)}>
        Edit gallery
      </button>
    );
  }

  const kind = e ? kindOf(e) : null;

  return (
    <>
      {/* Over the wall, on the same fit as the flat copy of it — see
          PortalWall — so a frame here is exactly over the frame it moves. */}
      <div
        className={`${wallStyles.wall} ${styles.overlay}`}
        style={style}
        data-framing={reframing || undefined}
        onPointerDown={() => setSelected(null)}
      >
        <div ref={box} className={wallStyles.frames}>
          {draft.map((q, i) => (
            <div
              key={q.id}
              data-frame
              className={styles.frame}
              data-selected={selected === i || undefined}
              data-kind={kindOf(q)}
              style={{
                left: `${((q.x - q.w / 2 - fit.l) / fit.w) * 100}%`,
                top: `${((fit.t - (q.y + q.h / 2)) / fit.h) * 100}%`,
                width: `${(q.w / fit.w) * 100}%`,
                height: `${(q.h / fit.h) * 100}%`,
              }}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                const how: Drag["how"] = !reframing
                  ? "move"
                  : q.model
                    ? ev.shiftKey
                      ? "aim"
                      : "orbit"
                    : "pan";
                begin(ev, i, how);
              }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onWheel={(ev) => wheel(ev, i)}
            >
              <span className={styles.tag}>{q.title}</span>
              <span
                className={styles.corner}
                title="Drag to size (shift keeps the shape)"
                onPointerDown={(ev) => begin(ev, i, "size")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              />
            </div>
          ))}

          {/* Where each frame's label hangs. Pressing one picks its frame. */}
          {draft.map((q, i) => {
            const k = labelOf(q);
            return k ? (
              <div
                key={`label-${q.id}`}
                className={styles.label}
                data-selected={selected === i || undefined}
                style={{
                  left: `${((k.l - fit.l) / fit.w) * 100}%`,
                  top: `${((fit.t - k.t) / fit.h) * 100}%`,
                  width: `${((k.r - k.l) / fit.w) * 100}%`,
                  height: `${((k.t - k.b) / fit.h) * 100}%`,
                }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  setSelected(i);
                }}
              />
            ) : null;
          })}

          {/* Where the frame being dragged has snapped to. */}
          {guides.x.map((g) => (
            <span key={`x${g}`} className={styles.guideX} style={{ left: `${((g - fit.l) / fit.w) * 100}%` }} />
          ))}
          {guides.y.map((g) => (
            <span key={`y${g}`} className={styles.guideY} style={{ top: `${((fit.t - g) / fit.h) * 100}%` }} />
          ))}
        </div>
      </div>

      <aside
        className={panel.panel}
        data-side={side}
        onPointerDown={(ev) => ev.stopPropagation()}
        onWheel={(ev) => ev.stopPropagation()}
      >
        <header className={panel.head}>
          <strong>Gallery</strong>
          <span className={panel.row}>
            <button
              type="button"
              title="Move this panel to the other side"
              onClick={() => setSide(side === "right" ? "left" : "right")}
            >
              {side === "right" ? "⇤" : "⇥"}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Done
            </button>
          </span>
        </header>

        <div className={panel.body}>
          <section>
            <div className={panel.row}>
              <button type="button" data-on={!reframing || undefined} className={styles.mode} onClick={() => setFraming(false)}>
                Arrange
              </button>
              <button type="button" data-on={reframing || undefined} className={styles.mode} onClick={() => setFraming(true)}>
                Framing
              </button>
            </div>
          </section>

          {e && p && selected !== null ? (
            <>
              <h3>
                {e.title} <span>· {kind}</span>
              </h3>

              <section>
                <h4>Artwork</h4>
                <select value={keyOf(e)} onChange={(ev) => hang(ev.target.value)}>
                  {!choices.some((c) => c.key === keyOf(e)) ? <option value={keyOf(e)}>{keyOf(e)}</option> : null}
                  {options(choices)}
                </select>
                <label className={panel.num}>
                  <span>title</span>
                  <input value={e.title} onChange={(ev) => change(selected, { title: ev.target.value })} />
                </label>
                {kind !== "picture" ? (
                  <label className={panel.num}>
                    <span>still (shown until it loads)</span>
                    <select
                      value={e.image ?? ""}
                      onChange={(ev) => {
                        const v = ev.target.value || undefined;
                        if (v) preview(v);
                        change(selected, { image: v });
                      }}
                    >
                      <option value="">none</option>
                      {(media?.pictures ?? []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {kind === "video" ? (
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={!!e.sound}
                      onChange={(ev) => change(selected, { sound: ev.target.checked || undefined })}
                    />
                    has sound (shows the sound toggle)
                  </label>
                ) : null}
                <label className={styles.check}>
                  <input type="color" value={e.bg} onChange={(ev) => change(selected, { bg: ev.target.value })} />
                  {kind === "model" ? "the room's wall" : "behind it"} · {e.bg}
                </label>
              </section>

              <section>
                <h4>Presentation</h4>
                <label className={panel.num}>
                  <span>frame (public/models/gallery/frames)</span>
                  <select
                    value={e.frame ?? ""}
                    onChange={(ev) => change(selected, { frame: ev.target.value || undefined })}
                  >
                    <option value="">none — a bare card</option>
                    {Object.keys(FRAME_SPECS).map((k) => (
                      <option key={k} value={k}>
                        {k}
                        {draft.some((q, j) => j !== selected && q.frame === k) ? " ·" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {e.frame && FRAME_SPECS[e.frame]?.lip !== undefined ? (
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={!!e.flush}
                      onChange={(ev) => change(selected, { flush: ev.target.checked || undefined })}
                    />
                    level with the frame&apos;s mount
                  </label>
                ) : null}
                <label className={panel.num}>
                  <span>label</span>
                  <select
                    value={e.label ?? "right"}
                    onChange={(ev) => change(selected, { label: ev.target.value as LabelSide })}
                  >
                    {SIDES.map(([v, name]) => (
                      <option key={v} value={v}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {(e.label ?? "right") !== "none" ? (
                  <>
                    <label className={panel.num}>
                      <span>medium, year</span>
                      <input
                        value={e.medium ?? ""}
                        placeholder="Blender, 2025"
                        onChange={(ev) => change(selected, { medium: ev.target.value || undefined })}
                      />
                    </label>
                    <label className={panel.num}>
                      <span>about</span>
                      <textarea
                        className={styles.about}
                        rows={4}
                        value={e.about ?? ""}
                        placeholder="A few lines about the piece."
                        onChange={(ev) => change(selected, { about: ev.target.value || undefined })}
                      />
                    </label>
                  </>
                ) : null}
              </section>

              <section>
                <h4>Frame</h4>
                <div className={panel.grid}>
                  <Num label="x" value={e.x} onChange={(v) => v !== undefined && change(selected, { x: v })} />
                  <Num label="y" value={e.y} onChange={(v) => v !== undefined && change(selected, { y: v })} />
                  <Num label="width" value={e.w} onChange={(v) => v && v > 0 && change(selected, { w: v })} />
                  <Num label="height" value={e.h} onChange={(v) => v && v > 0 && change(selected, { h: v })} />
                </div>
                {aspectOf(selected) ? (
                  <p className={panel.sub}>
                    <button
                      type="button"
                      onClick={() => change(selected, { h: round(e.w / (aspectOf(selected) as number), 0.001) })}
                    >
                      Fit to artwork
                    </button>
                  </p>
                ) : null}
              </section>

              <section>
                <h4>Framing</h4>
                {kind === "model" ? (
                  <>
                    <div className={panel.grid}>
                      <Num
                        label="around°"
                        step={1}
                        value={e.modelView?.[0] ?? 0}
                        onChange={(v) => change(selected, { modelView: [v ?? 0, e.modelView?.[1] ?? 0] })}
                      />
                      <Num
                        label="above°"
                        step={1}
                        value={e.modelView?.[1] ?? 0}
                        onChange={(v) => change(selected, { modelView: [e.modelView?.[0] ?? 0, v ?? 0] })}
                      />
                      <Num
                        label="span"
                        step={0.1}
                        value={e.modelSpan}
                        placeholder={modelBoxes.get(e.id)?.span.toFixed(2) ?? "auto"}
                        onChange={(v) => change(selected, { modelSpan: v })}
                      />
                      <Num
                        label="scale"
                        step={0.05}
                        value={e.modelScale}
                        placeholder="1"
                        onChange={(v) => change(selected, { modelScale: v })}
                      />
                      {(["x", "y", "z"] as const).map((axis, k) => (
                        <Num
                          key={axis}
                          label={`focus ${axis}`}
                          step={0.1}
                          value={e.modelFocus?.[k]}
                          placeholder={modelBoxes.get(e.id)?.focus[k].toFixed(2) ?? "auto"}
                          onChange={(v) => {
                            const f = [...(e.modelFocus ?? modelBoxes.get(e.id)?.focus ?? [0, 0, 0])] as [
                              number,
                              number,
                              number,
                            ];
                            f[k] = v ?? 0;
                            change(selected, { modelFocus: f });
                          }}
                        />
                      ))}
                    </div>
                    <p className={panel.hint}>
                      In framing mode: drag to walk round it, shift-drag to move the point it is centred on,
                      scroll to zoom. A model&apos;s still is not re-rendered for you — see the README in
                      public/models/gallery.
                    </p>
                  </>
                ) : (
                  <>
                    <div className={panel.grid}>
                      <Num
                        label="focus x (0–1)"
                        step={0.01}
                        value={e.focus?.[0] ?? 0.5}
                        onChange={(v) => change(selected, { focus: [clamp(v ?? 0.5, 0, 1), e.focus?.[1] ?? 0.5] })}
                      />
                      <Num
                        label="focus y (0–1)"
                        step={0.01}
                        value={e.focus?.[1] ?? 0.5}
                        onChange={(v) => change(selected, { focus: [e.focus?.[0] ?? 0.5, clamp(v ?? 0.5, 0, 1)] })}
                      />
                      <Num
                        label="zoom"
                        step={0.05}
                        value={e.zoom ?? 1}
                        onChange={(v) => change(selected, { zoom: Math.max(1, v ?? 1) })}
                      />
                    </div>
                    <p className={panel.hint}>
                      In framing mode: drag to move the crop, scroll to zoom. A crop only moves along a side
                      the frame cuts off — fit the frame to the artwork and there is nothing to move.
                    </p>
                  </>
                )}
                <p className={panel.sub}>
                  <button
                    type="button"
                    onClick={() =>
                      change(
                        selected,
                        kind === "model"
                          ? { modelView: undefined, modelSpan: undefined, modelFocus: undefined, modelScale: undefined }
                          : { focus: undefined, zoom: undefined },
                      )
                    }
                  >
                    Reset framing
                  </button>
                </p>
              </section>

              <section>
                <p className={panel.sub}>
                  <button
                    type="button"
                    onClick={() => {
                      commit(draft.filter((_, j) => j !== selected));
                      setSelected(null);
                    }}
                  >
                    Take this frame down
                  </button>
                </p>
              </section>
            </>
          ) : (
            <p className={panel.hint}>
              Click a frame to choose it. Drag to move it, drag its corner to size it (shift keeps its
              shape); both snap to an even gap from the neighbouring frames — hold ⌘ to place
              freely. Switch to framing — or hold ⌥ — and dragging moves what is inside instead; scroll
              zooms it.
              <br />
              <br />
              Arrows nudge (shift: 5×), F switches mode, Delete takes a frame down, ⌘Z undoes, ⌘S saves.
            </p>
          )}

          <section>
            <h4>Hang another</h4>
            <select value="" onChange={(ev) => add(ev.target.value)}>
              <option value="">Choose an artwork…</option>
              {options(choices.filter((c) => !hungKeys.has(c.key)))}
            </select>
          </section>
        </div>

        <footer className={panel.foot}>
          <div className={panel.row}>
            <button type="button" className={panel.primary} disabled={!dirty} onClick={save}>
              Save
            </button>
            <button type="button" onClick={undo}>
              Undo
            </button>
            <button type="button" onClick={redo}>
              Redo
            </button>
            <button type="button" disabled={!dirty} onClick={revert}>
              Revert
            </button>
          </div>
          <p className={panel.status}>{dirty ? "Unsaved changes" : (status ?? "Matches content/gallery.ts")}</p>
        </footer>
      </aside>
    </>
  );
}
