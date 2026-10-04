"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COLS,
  FONT,
  GAP,
  bottomOf,
  mediaAspect,
  textHeight,
  tidy,
  type Piece,
} from "@/components/projectLayout";
import type { LayoutItem, Project } from "@/content";
import own from "./ProjectEditor.module.css";
import styles from "./TableEditor.module.css";

/**
 * Laying out a project's spread in the browser, in development only:
 * ProjectSpread leaves it out of every other build.
 *
 * On the page, drag a piece to move it and its handles to size it — a picture
 * is cropped to whatever shape its box is, and Shift keeps it the shape of the
 * picture. Double-click a picture to move the picture inside its box instead,
 * and scroll over it to zoom. Everything lands on the grid and lines up with
 * the edges of the pieces around it, with a guide drawn while it does. Save
 * writes the layout to content/projectLayouts.ts — see app/api/projects.
 */

type Props = {
  project: Project;
  pieces: Map<string, Piece>;
  editing: boolean;
  setEditing: (on: boolean) => void;
  draft: LayoutItem[];
  setDraft: (next: LayoutItem[]) => void;
  /** The spread as the file has it, to tell whether there is anything to save. */
  saved: LayoutItem[];
  /** How many units tall the window is: where the fold is, and what a saved
   *  layout is stretched from on a window of another height. */
  rows: number;
  /** The automatic layout, fitted to this window. */
  relayout: () => LayoutItem[];
  /** Whether the file has a layout for this project at all, or it is made up. */
  hasFile: boolean;
  canvas: HTMLDivElement | null;
};

type Mode = "move" | "crop" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Mode[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
/** Units within which an edge is drawn to another's. */
const PULL = 0.8;
const MIN = 2;

const NOCROP = { x: 0.5, y: 0.5, zoom: 1 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What a piece is called in the panel. */
function nameOf(key: string, piece: Piece | undefined) {
  if (key === "title") return "Headline";
  if (key === "dek") return "Dek";
  if (key === "cover") return "Cover";
  if (key.startsWith("p")) return `Paragraph ${Number(key.slice(1)) + 1}`;
  const n = Number(key.slice(1)) + 1;
  return piece?.kind === "media" && piece.media.kind === "video" ? `Video (${n})` : `Picture ${n}`;
}

/** A number field that only commits when it holds a number. */
function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className={styles.num}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

/** Lines one axis of a box up with the edges around it: whichever of its
 *  start, end or middle is nearest an edge within PULL goes to it; failing
 *  that, its start goes to the grid. */
function snapSpan(start: number, size: number, targets: number[]) {
  let best: number | null = null;
  for (const t of targets)
    for (const off of [0, size, size / 2]) {
      const d = t - (start + off);
      if (Math.abs(d) < PULL && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  return best === null ? Math.round(start) : start + best;
}

/** One edge on its own, for sizing: to an edge near it, or to the grid. */
function snapEdge(v: number, targets: number[]) {
  let best: number | null = null;
  for (const t of targets) {
    const d = t - v;
    if (Math.abs(d) < PULL && (best === null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best === null ? Math.round(v) : v + best;
}

/** Every edge and middle of the pieces other than `key`, and of the page. */
function targetsOf(items: LayoutItem[], key: string) {
  const xs = [0, COLS, COLS / 2];
  const ys: number[] = [0];
  for (const it of items) {
    if (it.key === key) continue;
    xs.push(it.x, it.x + it.w, it.x + it.w / 2, it.x - GAP, it.x + it.w + GAP);
    ys.push(it.y, it.y + it.h, it.y + it.h / 2, it.y - GAP, it.y + it.h + GAP);
  }
  return { xs, ys };
}

/** Where a box's edges or middle meet another's, to draw a guide along. */
function guidesFor(it: LayoutItem, items: LayoutItem[]) {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const o of items) {
    if (o.key === it.key) continue;
    for (const a of [it.x, it.x + it.w, it.x + it.w / 2])
      for (const b of [o.x, o.x + o.w, o.x + o.w / 2]) if (near(a, b)) xs.add(a);
    for (const a of [it.y, it.y + it.h, it.y + it.h / 2])
      for (const b of [o.y, o.y + o.h, o.y + o.h / 2]) if (near(a, b)) ys.add(a);
  }
  return { xs: [...xs], ys: [...ys] };
}

export default function ProjectEditor({ project, pieces, editing, setEditing, draft, setDraft, saved, rows, relayout, hasFile, canvas }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [past, setPast] = useState<LayoutItem[][]>([]);
  const [future, setFuture] = useState<LayoutItem[][]>([]);
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });
  const [status, setStatus] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");
  /** Text pieces whose words run out of the bottom of their box. */
  const [spilling, setSpilling] = useState<string[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const commit = useCallback(
    (next: LayoutItem[]) => {
      setPast((p) => [...p.slice(-100), draftRef.current]);
      setFuture([]);
      setDraft(next);
    },
    [setDraft],
  );
  const update = useCallback(
    (key: string, change: Partial<LayoutItem>) =>
      commit(draftRef.current.map((it) => (it.key === key ? { ...it, ...change } : it))),
    [commit],
  );
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [draftRef.current, ...f]);
      setDraft(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [setDraft]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, draftRef.current]);
      setDraft(f[0]);
      return f.slice(1);
    });
  }, [setDraft]);

  useEffect(() => {
    if (!editing) {
      setSelected(null);
      setCropping(false);
      setPast([]);
      setFuture([]);
    }
  }, [editing]);
  useEffect(() => setCropping(false), [selected]);

  /** Window pixels to units. */
  const unit = useCallback(() => (canvas ? canvas.getBoundingClientRect().width / COLS : 1), [canvas]);

  /** The text pieces, as the page has drawn them, measured against their boxes. */
  useEffect(() => {
    if (!editing || !canvas) return;
    const raf = requestAnimationFrame(() => {
      const out: string[] = [];
      canvas.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
        // Down the bottom, or — set in columns — out to the side in another.
        if (el.tagName !== "FIGURE" && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2))
          out.push(el.dataset.key!);
      });
      setSpilling(out);
    });
    return () => cancelAnimationFrame(raf);
  }, [editing, canvas, draft]);

  /** The height, in units, a text piece's words actually take. */
  const fitted = useCallback(
    (it: LayoutItem) => {
      const el = canvas?.querySelector<HTMLElement>(`[data-key="${it.key}"]`);
      if (!el) return it.h;
      const was = el.style.height;
      el.style.height = "auto";
      const h = el.getBoundingClientRect().height;
      el.style.height = was;
      return Math.max(MIN, Math.ceil(h / unit()));
    },
    [canvas, unit],
  );

  /* ------------------------------------------------------- the pointer */

  const drag = useRef<{
    key: string;
    mode: Mode;
    x: number;
    y: number;
    item: LayoutItem;
    before: LayoutItem[];
    u: number;
  } | null>(null);

  const down = (e: React.PointerEvent, key: string, mode: Mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(key);
    const item = draftRef.current.find((it) => it.key === key);
    if (!item) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      key,
      mode: mode === "move" && cropping && key === selected ? "crop" : mode,
      x: e.clientX,
      y: e.clientY,
      item,
      before: draftRef.current,
      u: unit(),
    };
  };

  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x) / g.u;
    const dy = (e.clientY - g.y) / g.u;
    const it = g.item;
    const others = g.before;
    const { xs, ys } = targetsOf(others, it.key);
    let next: LayoutItem;

    if (g.mode === "crop") {
      const piece = pieces.get(it.key);
      if (piece?.kind !== "media") return;
      const crop = it.crop ?? NOCROP;
      const ar = mediaAspect(piece.media);
      const bw = it.w * g.u;
      const bh = it.h * g.u;
      // How far the picture overhangs its box, which is how far it can move.
      const spareX = Math.max(bw, bh * ar) * crop.zoom - bw;
      const spareY = Math.max(bh, bw / ar) * crop.zoom - bh;
      next = {
        ...it,
        crop: {
          ...crop,
          x: spareX > 1 ? clamp(crop.x - (dx * g.u) / spareX, 0, 1) : crop.x,
          y: spareY > 1 ? clamp(crop.y - (dy * g.u) / spareY, 0, 1) : crop.y,
        },
      };
    } else if (g.mode === "move") {
      next = { ...it, x: snapSpan(it.x + dx, it.w, xs), y: snapSpan(it.y + dy, it.h, ys) };
    } else {
      let l = it.x;
      let r = it.x + it.w;
      let t = it.y;
      let b = it.y + it.h;
      if (g.mode.includes("w")) l = Math.min(snapEdge(l + dx, xs), r - MIN);
      if (g.mode.includes("e")) r = Math.max(snapEdge(r + dx, xs), l + MIN);
      if (g.mode.includes("n")) t = Math.min(snapEdge(t + dy, ys), b - MIN);
      if (g.mode.includes("s")) b = Math.max(snapEdge(b + dy, ys), t + MIN);
      // Shift: the box stays the shape of the picture in it, so nothing is
      // cropped away.
      const piece = pieces.get(it.key);
      if (e.shiftKey && piece?.kind === "media") {
        const ar = mediaAspect(piece.media);
        if (g.mode === "n" || g.mode === "s") {
          r = l + (b - t) * ar;
        } else {
          const h = (r - l) / ar;
          if (g.mode.includes("n")) t = b - h;
          else b = t + h;
        }
      }
      next = { ...it, x: l, y: t, w: r - l, h: b - t };
    }
    const items = others.map((o) => (o.key === it.key ? next : o));
    setGuides(g.mode === "crop" ? { xs: [], ys: [] } : guidesFor(next, items));
    setDraft(items);
  };

  const up = () => {
    const g = drag.current;
    drag.current = null;
    setGuides({ xs: [], ys: [] });
    if (g && JSON.stringify(g.before) !== JSON.stringify(draftRef.current)) {
      setPast((p) => [...p.slice(-100), g.before]);
      setFuture([]);
    }
  };

  // Zoom, over the picture being cropped. Not a React handler: it has to be
  // able to keep the window from scrolling.
  const cropBox = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = cropBox.current;
    if (!el || !cropping || !selected) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const it = draftRef.current.find((i) => i.key === selected);
      if (!it) return;
      const crop = it.crop ?? NOCROP;
      const zoom = clamp(crop.zoom * Math.exp(-e.deltaY * 0.002), 1, 4);
      setDraft(draftRef.current.map((i) => (i.key === selected ? { ...i, crop: { ...crop, zoom } } : i)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cropping, selected, setDraft]);

  /* ----------------------------------------------------- the keyboard */

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        if (cropping) setCropping(false);
        else setSelected(null);
        return;
      }
      if (!selected) return;
      const it = draftRef.current.find((i) => i.key === selected);
      if (!it) return;
      const step = e.shiftKey ? 4 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        update(selected, { x: it.x + dx, y: Math.max(0, it.y + dy) });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(draftRef.current.filter((i) => i.key !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selected, cropping, undo, redo, update, commit]);

  /* ------------------------------------------------------------- save */

  const save = async (items: LayoutItem[] | null) => {
    const layout = items && { rows, items };
    setStatus("Saving…");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: project.slug, layout }),
      });
      const out = await res.json().catch(() => ({}));
      setStatus(
        res.ok
          ? layout
            ? "Saved to content/projectLayouts.ts"
            : "Back to the automatic layout"
          : `Not saved: ${out.error ?? res.status}`,
      );
    } catch {
      setStatus("Not saved: the dev server did not answer");
    }
  };

  /* ------------------------------------------------------------ drawn */

  if (!editing)
    return (
      <button type="button" className={`${styles.toggle} ${own.toggle}`} onClick={() => setEditing(true)}>
        Edit project
      </button>
    );

  const sel = draft.find((it) => it.key === selected) ?? null;
  const selPiece = sel ? pieces.get(sel.key) : undefined;
  const missing = [...pieces.keys()].filter((k) => !draft.some((it) => it.key === k));

  const add = (key: string) => {
    const piece = pieces.get(key);
    const w = piece?.kind === "media" ? 16 : 13;
    const h =
      piece?.kind === "media"
        ? Math.round(w / mediaAspect(piece.media))
        : piece
          ? Math.ceil(textHeight(piece.kind, piece.text, w) + 1)
          : 4;
    commit([...draft, { key, x: piece?.kind === "media" ? 0 : 2, y: bottomOf(draft) + 2, w, h }]);
    setSelected(key);
  };

  const overlay = canvas
    ? createPortal(
        <div className={own.overlay} onPointerDown={() => setSelected(null)}>
          <span className={own.fold} style={{ "--at": rows } as React.CSSProperties}>
            <span>bottom of the window</span>
          </span>
          {guides.xs.map((x) => (
            <span key={`x${x}`} className={own.guideX} style={{ "--at": x } as React.CSSProperties} />
          ))}
          {guides.ys.map((y) => (
            <span key={`y${y}`} className={own.guideY} style={{ "--at": y } as React.CSSProperties} />
          ))}
          {draft
            .filter((it) => pieces.has(it.key))
            .map((it) => {
              const on = it.key === selected;
              const piece = pieces.get(it.key);
              return (
                <div
                  key={it.key}
                  ref={on && cropping ? cropBox : undefined}
                  className={own.box}
                  data-on={on || undefined}
                  data-crop={(on && cropping) || undefined}
                  data-spill={spilling.includes(it.key) || undefined}
                  style={{ "--x": it.x, "--y": it.y, "--w": it.w, "--h": it.h } as React.CSSProperties}
                  onPointerDown={(e) => down(e, it.key, "move")}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  onDoubleClick={() => piece?.kind === "media" && piece.media.kind === "image" && setCropping((c) => !c)}
                >
                  <span className={own.tag}>{nameOf(it.key, piece)}</span>
                  {on && !cropping
                    ? HANDLES.map((h) => (
                        <span
                          key={h}
                          className={own.handle}
                          data-h={h}
                          onPointerDown={(e) => down(e, it.key, h)}
                          onPointerMove={move}
                          onPointerUp={up}
                          onPointerCancel={up}
                        />
                      ))
                    : null}
                </div>
              );
            })}
        </div>,
        canvas,
      )
    : null;

  return (
    <>
      {overlay}
      <aside className={`${styles.panel} ${own.panel}`} data-side={side}>
        <div className={styles.head}>
          <strong>Edit {project.title}</strong>
          <div className={styles.row}>
            <button type="button" onClick={() => setSide(side === "right" ? "left" : "right")} title="Move this panel">
              ⇄
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Done
            </button>
          </div>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>
            The page is the window: keep everything above the dashed line and nothing has to be scrolled to. Drag a piece to move it, its handles to size it; a picture is cropped to its box, and Shift keeps it the
            picture&apos;s shape. Double-click a picture to move it inside its box, and scroll to zoom. Pieces land on
            the grid and line up with the edges around them. Arrows nudge, Delete takes a piece off the page.
          </p>

          {sel ? (
            <section>
              <h3>
                {nameOf(sel.key, selPiece)} <span>{sel.key}</span>
              </h3>
              <div className={styles.grid}>
                <Num label="Across" value={sel.x} onChange={(v) => update(sel.key, { x: v })} />
                <Num label="Down" value={sel.y} onChange={(v) => update(sel.key, { y: Math.max(0, v) })} />
                <Num label="Width" value={sel.w} onChange={(v) => update(sel.key, { w: Math.max(MIN, v) })} />
                <Num label="Height" value={sel.h} onChange={(v) => update(sel.key, { h: Math.max(MIN, v) })} />
              </div>
              {selPiece?.kind === "media" ? (
                <>
                  <p className={styles.sub}>The picture in its box</p>
                  {selPiece.media.kind === "image" ? (
                    <>
                      <label className={own.slider}>
                        <span>Zoom</span>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={0.01}
                          value={(sel.crop ?? NOCROP).zoom}
                          onChange={(e) =>
                            update(sel.key, { crop: { ...(sel.crop ?? NOCROP), zoom: parseFloat(e.target.value) } })
                          }
                        />
                      </label>
                      <div className={styles.grid}>
                        <Num
                          label="Focus across"
                          step={0.05}
                          value={(sel.crop ?? NOCROP).x}
                          onChange={(v) => update(sel.key, { crop: { ...(sel.crop ?? NOCROP), x: clamp(v, 0, 1) } })}
                        />
                        <Num
                          label="Focus down"
                          step={0.05}
                          value={(sel.crop ?? NOCROP).y}
                          onChange={(v) => update(sel.key, { crop: { ...(sel.crop ?? NOCROP), y: clamp(v, 0, 1) } })}
                        />
                      </div>
                    </>
                  ) : null}
                  <div className={`${styles.row} ${own.wrap}`}>
                    {selPiece.media.kind === "image" ? (
                      <button type="button" data-on={cropping || undefined} onClick={() => setCropping(!cropping)}>
                        Move picture
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => update(sel.key, { h: Math.max(MIN, Math.round(sel.w / mediaAspect(selPiece.media))) })}
                    >
                      Uncrop height
                    </button>
                    <button type="button" onClick={() => update(sel.key, { crop: undefined })}>
                      Reset crop
                    </button>
                  </div>
                </>
              ) : selPiece ? (
                <>
                  <p className={styles.sub}>Type</p>
                  <div className={styles.grid}>
                    <Num
                      label={`Size (× ${FONT[selPiece.kind]})`}
                      step={0.05}
                      value={sel.size ?? 1}
                      onChange={(v) => update(sel.key, { size: clamp(v, 0.4, 3) })}
                    />
                  </div>
                  <div className={`${styles.row} ${own.wrap}`}>
                    <button type="button" onClick={() => update(sel.key, { h: fitted(sel) })}>
                      Fit height to text
                    </button>
                  </div>
                </>
              ) : null}
              <div className={`${styles.row} ${own.wrap}`}>
                <button
                  type="button"
                  onClick={() => {
                    commit(draft.filter((i) => i.key !== sel.key));
                    setSelected(null);
                  }}
                >
                  Take off the page
                </button>
              </div>
            </section>
          ) : (
            <p className={styles.sub}>Click a piece to choose it.</p>
          )}

          {spilling.length ? (
            <section>
              <h4>Text running out of its box</h4>
              <div className={`${styles.row} ${own.wrap}`}>
                {spilling.map((k) => (
                  <button key={k} type="button" onClick={() => setSelected(k)}>
                    {nameOf(k, pieces.get(k))}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {missing.length ? (
            <section>
              <h4>Not on the page</h4>
              <div className={`${styles.row} ${own.wrap}`}>
                {missing.map((k) => (
                  <button key={k} type="button" onClick={() => add(k)}>
                    + {nameOf(k, pieces.get(k))}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h4>The whole page</h4>
            <div className={`${styles.row} ${own.wrap}`}>
              <button
                type="button"
                title="Fits every text to its words, then closes every gap"
                onClick={() =>
                  commit(
                    tidy(
                      draft.map((it) => (pieces.get(it.key)?.kind === "media" ? it : { ...it, h: fitted(it) })),
                    ),
                  )
                }
              >
                Tidy
              </button>
              <button
                type="button"
                onClick={() => commit(draft.map((it) => (pieces.get(it.key)?.kind === "media" ? it : { ...it, h: fitted(it) })))}
              >
                Fit all text
              </button>
              <button type="button" onClick={() => commit(relayout())}>
                Lay out again
              </button>
            </div>
          </section>
        </div>
        <div className={styles.foot}>
          <div className={styles.row}>
            <button type="button" onClick={undo} disabled={!past.length}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!future.length}>
              Redo
            </button>
            <button type="button" onClick={() => commit(saved)} disabled={!dirty}>
              Revert
            </button>
            <button type="button" className={styles.primary} onClick={() => save(draft)} disabled={!dirty && hasFile}>
              Save
            </button>
          </div>
          {hasFile ? (
            <div className={`${styles.row} ${own.wrap}`}>
              <button type="button" onClick={() => save(null)}>
                Forget the saved layout
              </button>
            </div>
          ) : null}
          <p className={styles.status}>
            {dirty
              ? "Unsaved changes"
              : (status ??
                (hasFile ? "Matches content/projectLayouts.ts" : "Laid out to fit this window — not saved yet"))}
          </p>
        </div>
      </aside>
    </>
  );
}
