"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COLS,
  FONT,
  LINE,
  bottomOf,
  fitLayout,
  fitSaved,
  makeMeasure,
  piecesOf,
  type Piece,
  type View,
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
  title,
  heroRef,
}: {
  item: LayoutItem;
  piece: Piece;
  title: string;
  heroRef: React.Ref<HTMLElement>;
}) {
  const place = {
    "--x": item.x,
    "--y": item.y,
    "--w": item.w,
    "--h": item.h,
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
            sizes={`${Math.ceil((item.w / COLS) * 100 * (crop.zoom ?? 1))}vw`}
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
    columnCount: item.cols && item.cols > 1 ? item.cols : undefined,
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

/** Where a picture landing at `r` starts from: off whichever edge of the
 *  window it lands nearest — roughly. The way in leans to one side or the
 *  other by up to half a right angle's worth, and starts a little further out
 *  or a little nearer, at random, so the pictures do not all arrive square;
 *  but it is always the short way, never across the window. A picture across
 *  most of the window's width comes from above or below rather than from one
 *  side of it. */
function offEdge(r: DOMRect, vw: number, vh: number) {
  const clear = 40 + Math.random() * 120;
  // Below the fold, where only scrolling would show it: up from under it.
  if (r.top >= vh) return { x: (Math.random() - 0.5) * vw * 0.3, y: vh * 0.5 };
  const sides = [
    { d: r.top, x: 0, y: -(r.bottom + clear) },
    { d: vh - r.bottom, x: 0, y: vh - r.top + clear },
  ];
  if (r.width < vw * 0.8)
    sides.push({ d: r.left, x: -(r.right + clear), y: 0 }, { d: vw - r.right, x: vw - r.left + clear, y: 0 });
  const { x, y } = sides.reduce((a, b) => (b.d < a.d ? b : a));
  // Leaned off square, along the edge it comes through: tan of up to 28°.
  const lean = (Math.random() - 0.5) * 1.06;
  return x ? { x, y: Math.abs(x) * lean } : { x: Math.abs(y) * lean, y };
}

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
 * gather in, each from the edge of the window nearest its place on the page,
 * tilted a little, and straighten as they settle into it. Closing sends them back out the way they came and the
 * cover back to its place on the reel; `home` says where that is.
 *
 * The page fits the window, so nothing has to be scrolled to: it is laid out
 * for the window it opens in, and again whenever that changes size — see
 * fitLayout. A project arranged by hand in content/projectLayouts.ts is drawn
 * as it was arranged, stretched to the window's height, on a wide window; an
 * upright one is always laid out afresh, in one column. In development the
 * page can be rearranged in place — see ProjectEditor.
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
  /** The window, as the page is fitted to it — measured, so unknown until
   *  the page is up. */
  const [view, setView] = useState<View | null>(null);
  /** Counts the face finishing loading, which changes how long every text is. */
  const [fonts, setFonts] = useState(0);
  const measure = useMemo(
    () => (mounted ? makeMeasure(getComputedStyle(document.body).fontFamily) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured again in the face once it is in
    [mounted, fonts],
  );
  const auto = useMemo(
    () => (view && measure ? fitLayout(project, view, measure) : null),
    [project, view, measure],
  );
  const saved = useMemo(
    () => (view ? (fromFile && !view.portrait ? fitSaved(fromFile, view.rows) : auto) : null),
    [view, fromFile, auto],
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[]>([]);
  const layout = ((editing ? draft : saved) ?? []).filter((it) => pieces.has(it.key));
  // The window's height — or more, where an upright window could not hold it
  // all, and while editing, to drag things below the fold.
  const rows = Math.max(view?.rows ?? 0, bottomOf(layout) + (editing ? 8 : 0));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    document.fonts?.ready.then(() => setFonts((n) => n + 1));
  }, []);

  // The room the page has: the window under the masthead, less a margin at
  // the foot, in units of the page's width.
  useLayoutEffect(() => {
    if (!mounted || !canvas) return;
    const read = () => {
      const box = canvas.getBoundingClientRect();
      const u = box.width / COLS;
      const top = box.top + (root.current?.scrollTop ?? 0);
      const rows = Math.max(12, (window.innerHeight - top - Math.max(16, u * 1.2)) / u);
      const portrait = window.innerHeight > window.innerWidth;
      setView((v) =>
        v && Math.abs(v.u - u) < 0.01 && Math.abs(v.rows - rows) < 0.05 && v.portrait === portrait
          ? v
          : { u, rows, portrait },
      );
    };
    read();
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [mounted, canvas]);

  // Nothing under the spread scrolls while it is open.
  useEffect(() => {
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = was;
    };
  }, []);

  // In once there is somewhere for everything to land — before the first
  // paint, which is the page laid out.
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!mounted || !saved || arrived.current) return;
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
      const { x, y } = offEdge(el.getBoundingClientRect(), vw, vh);
      const tilt = (Math.random() - 0.5) * 24;
      const out = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
      offsets.current.set(el, out);
      el.animate(
        [
          { transform: out },
          // Over the mark a touch, as a pile of prints pushed together does,
          // and back.
          { transform: `rotate(${-tilt * 0.06}deg) scale(1.015)`, offset: 0.82 },
          { transform: "none" },
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
  }, [mounted, saved, from]);

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
            // Back out past the edge they came in from.
            { transform: "none" },
            { transform: out },
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
      if (on && saved) setDraft(saved);
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
                title={project.title}
                heroRef={hero}
              />
            ))}
          </div>
        </article>

      </div>
      {ProjectEditor && view && saved ? (
        <ProjectEditor
          project={project}
          pieces={pieces}
          editing={editing}
          setEditing={startEditing}
          draft={draft}
          setDraft={setDraft}
          saved={saved}
          rows={view.rows}
          relayout={() => (measure ? fitLayout(project, view, measure) : saved)}
          hasFile={!!fromFile}
          canvas={canvas}
        />
      ) : null}
    </div>,
    document.body,
  );
}
