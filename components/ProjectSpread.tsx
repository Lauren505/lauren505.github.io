"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import RichText from "@/components/RichText";
import type { Project, ProjectMedia } from "@/content";
import styles from "./ProjectSpread.module.css";

const aspect = (m: ProjectMedia) =>
  m.kind === "video" ? 16 / 9 : m.image.width / m.image.height;

/** The reel crops covers to this range, so the spread does too: the cover
 *  then only has to grow on its way from one to the other, never stretch. */
const coverAspect = (p: Project) =>
  Math.min(1.6, Math.max(0.78, p.cover.width / p.cover.height));

type Group = { text: string | null; rows: ProjectMedia[][] };

/** A run of pictures as rows: the old page's row, unless it is so wide that
 *  everything in it would come out a sliver — `most` is how many widths of
 *  height fit in one, which is fewer when there is a column beside it. */
function rowsOf(media: ProjectMedia[], most: number) {
  const rows: ProjectMedia[][] = [];
  let row: ProjectMedia[] = [];
  let sum = 0;
  for (const m of media) {
    const a = aspect(m);
    if (row.length && sum + a > most) {
      rows.push(row);
      row = [];
      sum = 0;
    }
    row.push(m);
    sum += a;
  }
  if (row.length) rows.push(row);
  return rows;
}

/**
 * The write-up, set as a magazine sets it. The first paragraph goes beside the
 * cover under the headline; after that every paragraph is a column beside the
 * row of pictures that followed it on the old page, swapping sides as it goes,
 * and any other row takes the full width. Every picture in a row is the same
 * height. The cover is already at the top, so it is not shown twice.
 */
function arrange(project: Project) {
  let lead: string | null = null;
  const groups: Group[] = [];
  let text: string | null = null;
  for (const block of project.blocks) {
    if (typeof block === "string") {
      if (lead === null) lead = block;
      else {
        if (text) groups.push({ text, rows: [] });
        text = block;
      }
      continue;
    }
    const media = block.filter((m) => !(m.kind === "image" && m.image === project.cover));
    if (!media.length) continue;
    groups.push({ text, rows: rowsOf(media, text ? 2.9 : 4.8) });
    text = null;
  }
  if (text) groups.push({ text, rows: [] });
  return { lead, groups };
}

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

function Figure({ m, title }: { m: ProjectMedia; title: string }) {
  const a = aspect(m);
  return (
    <figure className={styles.cell} style={{ flexGrow: a }} data-fly>
      <div className={styles.frame} style={{ aspectRatio: a }}>
        {m.kind === "video" ? (
          <Video id={m.youtube} title={m.caption ?? title} />
        ) : (
          <Image
            className={styles.fill}
            src={m.image}
            alt={m.caption ?? ""}
            sizes="(max-width: 760px) 100vw, 45vw"
            placeholder="blur"
          />
        )}
      </div>
      {m.caption ? <figcaption className={styles.caption}>{m.caption}</figcaption> : null}
    </figure>
  );
}

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";

/** The transform that puts `to` where `from` is. */
const flip = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

/**
 * A project, opened from the reel. The cover lifts off the reel and settles at
 * the head of the page, and every other picture and video comes in from
 * whichever side of the window it is going to sit nearest — off the left edge
 * for the left of the spread, up from below for the ones further down — at a
 * tilt, and straightens as it lands. Closing sends them back out the way they
 * came and the cover back to its place on the reel; `home` says where that is.
 *
 * It is drawn over the whole window, nav and all, in a portal: the page's own
 * turns transform the tree it would otherwise be in.
 */
export default function ProjectSpread({
  project,
  number,
  from,
  home,
  onClosed,
}: {
  project: Project;
  number: number;
  from: DOMRect;
  home: () => DOMRect;
  onClosed: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  /** Where each flying piece came in from, so it can leave the same way. */
  const offsets = useRef(new Map<Element, string>());
  const closing = useRef(false);
  const [mounted, setMounted] = useState(false);
  const { lead, groups } = arrange(project);
  const ca = coverAspect(project);

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

  useLayoutEffect(() => {
    if (!mounted) return;
    closeBtn.current?.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease-out" });

    if (hero.current) {
      hero.current.animate([{ transform: flip(from, hero.current.getBoundingClientRect()) }, { transform: "none" }], {
        duration: 820,
        easing: EASE_OUT,
      });
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pieces = root.current?.querySelectorAll("[data-fly]") ?? [];
    pieces.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - vw / 2;
      const dy = r.top + r.height / 2 - vh / 2;
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.1;
      const far = Math.hypot(vw, vh) * 0.75;
      const tilt = (Math.random() - 0.5) * 36;
      const out = `translate(${Math.cos(angle) * far}px, ${Math.sin(angle) * far}px) rotate(${tilt}deg) scale(0.82)`;
      offsets.current.set(el, out);
      el.animate(
        [
          { transform: out, opacity: 0 },
          { opacity: 1, offset: 0.35 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 1000, delay: 160 + i * 70, easing: EASE_OUT, fill: "backwards" },
      );
    });

    root.current?.querySelectorAll("[data-rise]").forEach((el, i) => {
      el.animate(
        [
          { transform: "translateY(1.2rem)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 700, delay: 260 + i * 90, easing: EASE_OUT, fill: "backwards" },
      );
    });
  }, [mounted, from]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
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
          { duration: 520, delay: i * 30, easing: EASE_IN, fill: "forwards" },
        ).finished,
      );
    });
    if (hero.current) {
      const to = home();
      runs.push(
        hero.current.animate([{ transform: "none" }, { transform: flip(to, hero.current.getBoundingClientRect()) }], {
          duration: 620,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "forwards",
        }).finished,
      );
    }
    if (backdrop.current)
      runs.push(
        backdrop.current.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 420,
          delay: 200,
          easing: "ease-in",
          fill: "forwards",
        }).finished,
      );
    Promise.all(runs).then(onClosed, onClosed);
  }, [home, onClosed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

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

        <article className={styles.page}>
          <section className={styles.opening}>
            <div className={styles.heroWrap}>
              <div ref={hero} className={styles.hero} style={{ aspectRatio: ca, "--ca": ca } as React.CSSProperties}>
                <Image
                  className={styles.fill}
                  src={project.cover}
                  alt={project.title}
                  sizes="(max-width: 760px) 100vw, 60vw"
                  preload
                />
              </div>
            </div>
            <div className={styles.head}>
              <h1 className={styles.headline} data-rise>
                {project.title}
              </h1>
              <p className={styles.dek} data-rise>
                {project.description}
              </p>
              {lead ? (
                <p className={`${styles.body} ${styles.lede}`} data-rise>
                  <RichText text={lead} />
                </p>
              ) : null}
            </div>
          </section>

          {groups.map((g, gi) => {
            const media = g.rows.length ? (
              <div className={styles.media}>
                {g.rows.map((row, ri) => {
                  const sum = row.reduce((s, m) => s + aspect(m), 0);
                  return (
                    <div
                      key={ri}
                      className={styles.row}
                      style={{ "--sum": sum, "--count": row.length } as React.CSSProperties}
                    >
                      {row.map((m, mi) => (
                        <Figure key={mi} m={m} title={project.title} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null;
            return (
              <section
                key={gi}
                className={`${styles.group} ${g.text ? (gi % 2 ? styles.textRight : styles.textLeft) : styles.full}`}
              >
                {g.text ? (
                  <p className={`${styles.body} ${styles.column}`} data-rise>
                    <RichText text={g.text} />
                  </p>
                ) : null}
                {media}
              </section>
            );
          })}

          <footer className={styles.foot} data-rise>
            <button type="button" className={styles.back} onClick={close}>
              ← Back to all projects
            </button>
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}
