"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COLS,
  FONT,
  LINE,
  autoLayout,
  bottomOf,
  piecesOf,
  readingOrder,
  type Piece,
} from "@/components/projectLayout";
import RichText from "@/components/RichText";
import { projectLayouts, type LayoutItem, type Project } from "@/content";
import styles from "./ProjectSpread.module.css";

// The editor, in development and nowhere else — see ProjectEditor.
const DEV = process.env.NODE_ENV === "development";
const ProjectEditor = DEV ? dynamic(() => import("@/components/ProjectEditor"), { ssr: false }) : null;

function Video({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing)
    return (
      <iframe
        className={styles.fill}
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  return (
    <button type="button" className={styles.video} onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.fill} src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
      <span className={styles.play} aria-hidden />
    </button>
  );
}

/** One piece of the spread, where its layout puts it. */
function PieceView({
  item,
  piece,
  order,
  title,
  heroRef,
}: {
  item: LayoutItem;
  piece: Piece;
  order: number;
  title: string;
  heroRef: React.Ref<HTMLElement>;
}) {
  const place = {
    "--x": item.x,
    "--y": item.y,
    "--w": item.w,
    "--h": item.h,
    "--ar": item.w / item.h,
    order,
  } as React.CSSProperties;

  if (piece.kind === "media") {
    const m = piece.media;
    const crop = item.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
    const at = `${crop.x * 100}% ${crop.y * 100}%`;
    return (
      <figure
        ref={piece.cover ? heroRef : undefined}
        className={`${styles.item} ${styles.media}`}
        style={place}
        data-key={item.key}
        data-fly={piece.cover ? undefined : ""}
      >
        {m.kind === "video" ? (
          <Video id={m.youtube} title={m.caption ?? title} />
        ) : (
          <Image
            className={styles.fill}
            src={m.image}
            alt={piece.cover ? title : (m.caption ?? "")}
            sizes={`(max-width: 900px) 100vw, ${Math.ceil((item.w / COLS) * 100 * (crop.zoom ?? 1))}vw`}
            placeholder="blur"
            preload={piece.cover}
            draggable={false}
            style={{
              objectPosition: at,
              transform: crop.zoom !== 1 ? `scale(${crop.zoom})` : undefined,
              transformOrigin: at,
            }}
          />
        )}
        {m.caption ? <figcaption className={styles.caption}>{m.caption}</figcaption> : null}
      </figure>
    );
  }

  const kind = piece.kind;
  const type = {
    ...place,
    "--font": FONT[kind] * (item.size ?? 1),
    "--line": LINE[kind],
  } as React.CSSProperties;
  const cls = `${styles.item} ${styles.text} ${styles[kind]}`;
  if (kind === "title")
    return (
      <h1 className={cls} style={type} data-key={item.key} data-rise>
        {piece.text}
      </h1>
    );
  if (kind === "dek")
    return (
      <p className={cls} style={type} data-key={item.key} data-rise>
        {piece.text}
      </p>
    );
  return (
    <p className={`${cls} ${piece.lead ? styles.lede : ""}`} style={type} data-key={item.key} data-rise>
      <RichText text={piece.text} />
    </p>
  );
}

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";
/** Off-window directions the pictures come in from, taken in turn so they
 *  arrive from every side rather than all from one. */
const SIDES = [
  [-1, -0.2],
  [1, 0.15],
  [0.25, 1],
  [-0.3, -1],
  [-1, 0.6],
  [1, -0.55],
];

/** Moves and sizes an element from the window rectangle `a` to `b` — by its
 *  size rather than a scale, so the picture in it is cropped, not stretched,
 *  on the way. */
const travel = (a: DOMRect, b: DOMRect) => [
  { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`, width: `${a.width}px`, height: `${a.height}px` },
  { transform: "none", width: `${b.width}px`, height: `${b.height}px` },
];

/**
 * A project, opened from the reel, as a newspaper page across the whole
 * window. The cover lifts off the reel to its place on the page, the reel's
 * other covers are shoved off either side, and the project's own pictures
 * gather in from every edge of the window, tilted, and straighten as they
 * settle into the page. Closing sends them back out the way they came and the
 * cover back to its place on the reel; `home` says where that is.
 *
 * Where each piece sits is the project's layout in content/projectLayouts.ts,
 * or one made up for it — see autoLayout. In development the page can be
 * rearranged in place — see ProjectEditor.
 *
 * It is drawn over the whole window, nav and all, in a portal: the page's own
 * turns transform the tree it would otherwise be in.
 */
export default function ProjectSpread({
  project,
  number,
  from,
  home,
  onClosing,
  onClosed,
}: {
  project: Project;
  number: number;
  from: DOMRect;
  home: () => DOMRect;
  /** Closing has begun: the reel can bring its covers back. */
  onClosing: () => void;
  onClosed: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  /** Where each flying piece came in from, so it can leave the same way. */
  const offsets = useRef(new Map<Element, string>());
  const closing = useRef(false);
  const [mounted, setMounted] = useState(false);

  const pieces = useMemo(() => piecesOf(project), [project]);
  const fromFile = projectLayouts[project.slug];
  /** The height each text came to, measured once it is on the page — for the
   *  automatic layout, which can then fit its boxes to the words. A saved
   *  layout is drawn as it was saved, so it has nothing to measure. */
  const [fit, setFit] = useState<Record<string, number> | null>(fromFile ? {} : null);
  const saved = useMemo(() => fromFile ?? autoLayout(project, fit ?? {}), [fromFile, project, fit]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[]>(saved);
  const layout = (editing ? draft : saved).filter((it) => pieces.has(it.key));
  const order = readingOrder(layout);
  // Room under the last piece — more while editing, to drag things into.
  const rows = bottomOf(layout) + (editing ? 14 : 3);

  useEffect(() => setMounted(true), []);

  // Nothing under the spread scrolls while it is open.
  useEffect(() => {
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = was;
    };
  }, []);

  // The texts measured, before anything is painted: the page is laid out a
  // second time from what they came to, and only then does it come in.
  useLayoutEffect(() => {
    if (!mounted || fit || !canvas) return;
    const u = canvas.getBoundingClientRect().width / COLS;
    const out: Record<string, number> = {};
    canvas.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      if (el.tagName === "FIGURE") return;
      el.style.height = "auto";
      out[el.dataset.key!] = el.getBoundingClientRect().height / u + 0.3;
      el.style.height = "";
    });
    setFit(out);
  }, [mounted, fit, canvas]);

  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!mounted || !fit || arrived.current) return;
    arrived.current = true;
    closeBtn.current?.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 520,
      delay: 380,
      easing: "ease-out",
      fill: "backwards",
    });

    if (hero.current) {
      hero.current.animate(travel(from, hero.current.getBoundingClientRect()), { duration: 900, easing: EASE_OUT });
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    root.current?.querySelectorAll("[data-fly]").forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const [sx, sy] = SIDES[i % SIDES.length];
      // Far enough out along that side to start off the window, from wherever
      // the piece is going to land.
      const far = Math.hypot(vw, vh) * (0.7 + Math.random() * 0.25);
      const tx = sx * far - (r.left + r.width / 2 - vw / 2) * 0.3;
      const ty = sy * far - (r.top + r.height / 2 - vh / 2) * 0.3;
      const tilt = (Math.random() - 0.5) * 50;
      const out = `translate(${tx}px, ${ty}px) rotate(${tilt}deg) scale(0.7)`;
      offsets.current.set(el, out);
      el.animate(
        [
          { transform: out, opacity: 0 },
          { opacity: 1, offset: 0.25 },
          // Over the mark a touch, as a pile of prints pushed together does,
          // and back.
          { transform: `rotate(${-tilt * 0.06}deg) scale(1.015)`, offset: 0.82 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 1150, delay: 120 + i * 65, easing: EASE_OUT, fill: "backwards" },
      );
    });

    root.current?.querySelectorAll("[data-rise]").forEach((el, i) => {
      el.animate(
        [
          { transform: "translateY(1.2rem)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 700, delay: 380 + i * 80, easing: EASE_OUT, fill: "backwards" },
      );
    });
  }, [mounted, fit, from]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setEditing(false);
    onClosing();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClosed();
      return;
    }
    const runs: Promise<unknown>[] = [];
    root.current?.querySelectorAll("[data-rise]").forEach((el) => {
      runs.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished);
    });
    root.current?.querySelectorAll("[data-fly]").forEach((el, i) => {
      const out = offsets.current.get(el) ?? "scale(0.8)";
      runs.push(
        el.animate(
          [
            { transform: "none", opacity: 1 },
            { opacity: 1, offset: 0.7 },
            { transform: out, opacity: 0 },
          ],
          { duration: 560, delay: i * 25, easing: EASE_IN, fill: "forwards" },
        ).finished,
      );
    });
    if (hero.current) {
      runs.push(
        hero.current.animate(travel(home(), hero.current.getBoundingClientRect()).reverse(), {
          duration: 650,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "forwards",
        }).finished,
      );
    }
    if (backdrop.current)
      runs.push(
        backdrop.current.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 420,
          delay: 160,
          easing: "ease-in",
          fill: "forwards",
        }).finished,
      );
    Promise.all(runs).then(onClosed, onClosed);
  }, [home, onClosing, onClosed]);

  // Escape closes — unless the editor is open, where it lets go of the piece
  // in hand instead.
  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, editing]);

  const startEditing = useCallback(
    (on: boolean) => {
      if (on) setDraft(saved);
      setEditing(on);
    },
    [saved],
  );

  if (!mounted) return null;

  return createPortal(
    <div className={styles.spread} role="dialog" aria-modal="true" aria-label={project.title}>
      <div ref={backdrop} className={styles.backdrop} aria-hidden />
      <div ref={root} className={styles.scroller}>
        <header className={styles.masthead} data-rise>
          <span>Side quests</span>
          <span className={styles.mastNo}>Projects · No. {String(number).padStart(2, "0")}</span>
          <button ref={closeBtn} type="button" className={styles.close} onClick={close}>
            Close <span aria-hidden>✕</span>
          </button>
        </header>

        <article className={styles.board}>
          <div
            ref={setCanvas}
            className={`${styles.canvas} ${editing ? styles.editing : ""}`}
            style={{ "--rows": rows } as React.CSSProperties}
          >
            {layout.map((it) => (
              <PieceView
                key={it.key}
                item={it}
                piece={pieces.get(it.key)!}
                order={order.get(it.key) ?? 0}
                title={project.title}
                heroRef={hero}
              />
            ))}
          </div>
        </article>

        <footer className={styles.foot} data-rise>
          <button type="button" className={styles.back} onClick={close}>
            ← Back to all projects
          </button>
        </footer>
      </div>
      {ProjectEditor ? (
        <ProjectEditor
          project={project}
          pieces={pieces}
          editing={editing}
          setEditing={startEditing}
          draft={draft}
          setDraft={setDraft}
          saved={saved}
          relayout={() => autoLayout(project, fit ?? {})}
          hasFile={!!fromFile}
          canvas={canvas}
        />
      ) : null}
    </div>,
    document.body,
  );
}
