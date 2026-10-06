"use client";

import Image, { type StaticImageData } from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ProjectSpread from "@/components/ProjectSpread";
import { dateKey, monthYear, projects as listed, type Project } from "@/content";
import styles from "./ProjectReel.module.css";

/** In the order they happened, the newest where the reel opens. */
const projects = [...listed].sort((a, b) => dateKey(a.date) - dateKey(b.date));
const N = projects.length;
/** How much bigger the picture in the middle is than the rest. */
const LIFT = 0.6;
/** Slots drawn either side of the middle — enough to run past both fades. */
const REACH = 6;
/** Covers are cropped to no narrower or wider than this. */
const aspectOf = (i: number) => {
  const { width, height } = projects[i].cover;
  return Math.min(1.6, Math.max(0.78, width / height));
};
const wrap = (k: number) => ((k % N) + N) % N;

/**
 * The projects as a reel of covers, endless in both directions: the one in the
 * middle is the one selected, a size up from the rest, with its title above
 * the reel and its line below. Wheel, drag, the arrow keys or a click on a
 * cover moves it; a click on the middle one, or Enter, opens it — see
 * ProjectSpread.
 *
 * The position is a float `p` — slot k is centred when p is k — eased toward a
 * target that always comes to rest on a whole slot. Each cover's size follows
 * from how far it is from the middle, so the one arriving grows as the one
 * leaving shrinks, and the row is laid out edge to edge around them every
 * frame, straight onto the elements: React only hears about it when the
 * middle changes.
 *
 * `still` is the reel as a picture of itself, for the faces of a turn.
 */
export default function ProjectReel({ still = false }: { still?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<number, HTMLElement>());
  const p = useRef(N - 1);
  const target = useRef(N - 1);
  /** The whole slot nearest the middle: which covers are drawn, and whose
   *  title shows. */
  const [base, setBase] = useState(N - 1);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<{ index: number; from: DOMRect } | null>(null);

  const layout = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const H = el.clientHeight;
    // A little short of the stage's height, so the focus ring round the middle
    // one is not cut off.
    const h0 = (H * 0.95) / (1 + LIFT);
    const gap = h0 * 0.12;
    const at = p.current;
    const k0 = Math.floor(at);
    const size = (k: number) => {
      const s = 1 + LIFT * Math.max(0, 1 - Math.abs(k - at));
      return { w: h0 * aspectOf(wrap(k)) * s, h: h0 * s };
    };
    // Centres, chained outward from the slot at or just left of the middle.
    const centre = new Map<number, number>([[k0, 0]]);
    let prev = size(k0);
    for (let k = k0 + 1, c = 0; k <= k0 + REACH + 1; k++) {
      const s = size(k);
      c += prev.w / 2 + gap + s.w / 2;
      centre.set(k, c);
      prev = s;
    }
    prev = size(k0);
    for (let k = k0 - 1, c = 0; k >= k0 - REACH - 1; k--) {
      const s = size(k);
      c -= prev.w / 2 + gap + s.w / 2;
      centre.set(k, c);
      prev = s;
    }
    const focus = (1 - (at - k0)) * centre.get(k0)! + (at - k0) * centre.get(k0 + 1)!;
    for (const [k, node] of slots.current) {
      const c = centre.get(k);
      if (c === undefined) continue;
      const { w, h } = size(k);
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      node.style.transform = `translate(${c - focus - w / 2}px, ${-h / 2}px)`;
    }
  }, []);

  // The loop: ease toward the target, lay out, and tell React when the middle
  // has moved to another slot.
  useEffect(() => {
    layout();
    setReady(true);
    if (still) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const d = target.current - p.current;
      if (Math.abs(d) > 0.0005) {
        p.current += d * (1 - Math.exp(-dt * 11));
        layout();
      } else if (d !== 0) {
        p.current = target.current;
        layout();
      }
      setBase(Math.round(p.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [layout, still]);

  // New slots come in at the wrong place until they are laid out.
  useLayoutEffect(layout, [base, layout]);

  const root = useRef<HTMLDivElement>(null);
  /** The shove that sent the other covers off, kept to play backwards. */
  const shoved = useRef<Animation[]>([]);

  /** The other covers shoved off either side, out of the way of the pictures
   *  coming in, and the words round the reel faded. */
  const scatter = useCallback((k: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const vw = window.innerWidth;
    const runs: Animation[] = [];
    for (const [j, node] of slots.current) {
      if (j === k) continue;
      const dir = Math.sign(j - k);
      // The nearer ones are hit first and go furthest.
      const near = 1 / Math.abs(j - k);
      const lift = (Math.random() - 0.5) * 120;
      const spin = dir * (8 + Math.random() * 14);
      const timing = { duration: 820, delay: 90 + (1 - near) * 160, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "both" } as const;
      // Added to the transform the layout gives each cover, not in place of it.
      runs.push(
        node.animate(
          [{ transform: "translate(0, 0)" }, { transform: `translate(${dir * vw * (0.45 + near * 0.3)}px, ${lift}px) rotate(${spin}deg)` }],
          { ...timing, composite: "add" },
        ),
        // Seen going, and only gone once well on its way.
        node.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], timing),
      );
    }
    root.current?.querySelectorAll<HTMLElement>("[data-chrome]").forEach((el) =>
      runs.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "both" })),
    );
    shoved.current = runs;
  }, []);

  /** And back, as the project closes. */
  const gather = useCallback(() => {
    for (const a of shoved.current) {
      a.reverse();
      a.finished.then(() => a.cancel(), () => {});
    }
    shoved.current = [];
  }, []);

  const openAt = useCallback(
    (k: number) => {
      const node = slots.current.get(k);
      if (!node) return;
      target.current = p.current = k;
      layout();
      scatter(k);
      setOpen({ index: wrap(k), from: node.getBoundingClientRect() });
    },
    [layout, scatter],
  );

  const step = (by: number) => {
    target.current = Math.round(target.current) + by;
  };

  // Wheel and trackpad, either axis, and a settle onto the nearest slot once
  // they stop.
  useEffect(() => {
    const el = stage.current;
    if (!el || still) return;
    let settle = 0;
    const onWheel = (e: WheelEvent) => {
      if (open) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? d * 16 : d;
      target.current += px / (el.clientHeight * 0.9);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        target.current = Math.round(target.current);
      }, 120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settle);
    };
  }, [open, still]);

  // Arrow keys step, Enter opens — while nothing is open over the reel.
  useEffect(() => {
    if (still || open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") target.current = Math.round(target.current) + 1;
      else if (e.key === "ArrowLeft") target.current = Math.round(target.current) - 1;
      else if (e.key === "Enter" && (t === document.body || stage.current?.contains(t)))
        openAt(Math.round(target.current));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openAt, still]);

  // Drag, with a flick carrying on past where the pointer let go. A press that
  // barely moves is a click: on the middle cover it opens, on any other it
  // brings that one to the middle.
  const drag = useRef<{ x: number; p: number; t: number; v: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (still || e.button !== 0) return;
    drag.current = { x: e.clientX, p: p.current, t: performance.now(), v: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    const el = stage.current;
    if (!g || !el) return;
    const dx = e.clientX - g.x;
    if (!g.moved && Math.abs(dx) < 6) return;
    if (!g.moved) {
      g.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const next = g.p - dx / (el.clientHeight * 0.9);
    g.v = (next - target.current) / Math.max(1, now - g.t);
    g.t = now;
    p.current = target.current = next;
    layout();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    if (g.moved) {
      target.current = Math.round(target.current + g.v * 220);
      return;
    }
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!hit) return;
    const k = Number(hit.dataset.slot);
    if (k === Math.round(target.current)) openAt(k);
    else target.current = k;
  };

  const active = wrap(base);
  const project = projects[active];
  const ks: number[] = [];
  for (let k = base - REACH; k <= base + REACH; k++) ks.push(k);

  return (
    <div ref={root} className={styles.reel}>
      <Strewn active={active} still={still} />
      <h2 key={`t${active}`} className={styles.title} data-chrome>
        {project.title}
      </h2>
      <div className={styles.track}>
      <div
        ref={stage}
        className={`${styles.stage} ${ready ? styles.ready : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        role="listbox"
        aria-label="Projects"
        aria-activedescendant={`reel-${active}`}
        tabIndex={still ? -1 : 0}
      >
        <span className={styles.line} aria-hidden />
        {ks.map((k) => {
          const i = wrap(k);
          const hidden = open !== null && k === base;
          return (
            <figure
              key={k}
              ref={(node) => {
                if (node) slots.current.set(k, node);
                else slots.current.delete(k);
              }}
              data-slot={k}
              id={k === base ? `reel-${i}` : undefined}
              role="option"
              aria-selected={k === base}
              aria-label={projects[i].title}
              className={`${styles.slot} ${k === base ? styles.centre : ""}`}
              style={hidden ? { visibility: "hidden" } : undefined}
            >
              <Image
                src={projects[i].cover}
                alt=""
                fill
                sizes="(max-width: 760px) 60vw, 30vw"
                draggable={false}
                className={styles.cover}
              />
            </figure>
          );
        })}
      </div>
      {still ? null : (
        <>
          <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => step(-1)} aria-label="Previous project" data-chrome>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 4 7 12l8 8" />
            </svg>
          </button>
          <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => step(1)} aria-label="Next project" data-chrome>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="m9 4 8 8-8 8" />
            </svg>
          </button>
        </>
      )}
      </div>
      <p key={`d${active}`} className={styles.description} data-chrome>
        {project.description}
      </p>
      <p key={`m${active}`} className={styles.date} data-chrome>
        {monthYear(project.date)}
      </p>
      {open ? (
        <ProjectSpread
          project={projects[open.index]}
          from={open.from}
          // Back to wherever the cover is now, which is where it was.
          home={() => slots.current.get(base)?.getBoundingClientRect() ?? open.from}
          onClosing={gather}
          onClosed={() => {
            setOpen(null);
            stage.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}


/** The same few numbers for the same project every time. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** At most this many of a project's pictures lie about at once. */
const STREWN = 6;

/** A project's pictures other than its cover, as something to draw: its
 *  photographs, and its videos by their thumbnails. */
function picturesOf(p: Project) {
  const out: { src: string | StaticImageData; w: number; h: number }[] = [];
  for (const block of p.blocks) {
    if (typeof block === "string") continue;
    for (const m of block) {
      if (m.kind === "image") {
        if (m.image !== p.cover) out.push({ src: m.image, w: m.image.width, h: m.image.height });
      } else out.push({ src: `https://i.ytimg.com/vi/${m.youtube}/hqdefault.jpg`, w: 16, h: 9 });
    }
  }
  return out.slice(0, STREWN);
}

type Strewn = { pic: ReturnType<typeof picturesOf>[number]; x: number; y: number; w: number; h: number; turn: number; outX: number; outY: number };

/**
 * Where a project's pictures lie in a window W by H pixels: in loose runs
 * along the top and the foot, each overlapping the last by a little more or a
 * little less, now and then a gap, the run starting wherever it starts — not
 * spread out evenly. Each is large, and reaches only a short way into the
 * window, so all the rest of it, its far edge included, is out past the edge
 * of the window whatever way it is turned. They reach no further in than the
 * room above the title and below the line under the reel.
 */
function strew(p: Project, W: number, H: number): Strewn[] {
  const rand = seeded(p.slug);
  const pics = picturesOf(p);
  // An upright window has less width for them than height: smaller, there.
  const scale = Math.min(1, (W / H) * 0.9);
  const runs: Strewn[][] = [[], []];
  const firstTop = rand() < 0.5;
  pics.forEach((pic, i) => runs[(i % 2 === 0) === firstTop ? 0 : 1].push({ pic } as Strewn));
  runs.forEach((run, band) => {
    const top = band === 0;
    let x = W * (-0.08 + rand() * 0.3);
    for (const piece of run) {
      const aspect = piece.pic.w / piece.pic.h;
      let h = H * (0.34 + rand() * 0.14) * scale;
      let w = h * aspect;
      if (w > W * 0.62) {
        w = W * 0.62;
        h = w / aspect;
      }
      const turn = (rand() - 0.5) * 28;
      const t = (turn * Math.PI) / 180;
      // How tall it stands, turned.
      const tall = w * Math.abs(Math.sin(t)) + h * Math.abs(Math.cos(t));
      const reach = Math.min(H * (top ? 0.15 + rand() * 0.09 : 0.13 + rand() * 0.07), tall * 0.8);
      Object.assign(piece, {
        w,
        h,
        turn,
        x: x + w / 2,
        y: top ? reach - tall / 2 : H - reach + tall / 2,
        outX: (rand() - 0.5) * 80,
        outY: (top ? -1 : 1) * tall * 0.5,
      });
      x += w * (0.6 + rand() * 0.25) + (rand() < 0.3 ? W * (0.06 + rand() * 0.14) : 0);
    }
  });
  return runs.flat();
}

/**
 * The middle project's other pictures, strewn faintly round the reel behind
 * everything, tilted, overlapping and running off the top and foot of the
 * window, as if the rest of its photographs were lying about on the table
 * under it. Where each lies is the project's own, the same every time it
 * comes round — see strew.
 *
 * They change once the reel comes to rest on a project, not with every one
 * it passes: the last lot drift out and fade as the next drift in.
 *
 * The layer is the window, whatever the section is: it is measured, and set
 * from the top of the window to the foot of it, so the fade at its edges is
 * the window's edges.
 */
function Strewn({ active, still }: { active: number; still: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = useState<{ i: number; leaving: boolean }[]>([{ i: active, leaving: false }]);

  useLayoutEffect(() => {
    const el = layer.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const place = () => {
      el.style.top = `${-host.getBoundingClientRect().top}px`;
      el.style.height = `${window.innerHeight}px`;
      setWin((v) => (v && v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  useEffect(() => {
    if (still) {
      setShown([{ i: active, leaving: false }]);
      return;
    }
    const settle = window.setTimeout(() => {
      setShown((now) => {
        if (now.some((s) => s.i === active && !s.leaving)) return now;
        return [...now.filter((s) => !s.leaving && s.i !== active).map((s) => ({ ...s, leaving: true })), { i: active, leaving: false }];
      });
    }, 220);
    return () => window.clearTimeout(settle);
  }, [active, still]);

  // The ones that have gone, gone.
  useEffect(() => {
    if (!shown.some((s) => s.leaving)) return;
    const t = window.setTimeout(() => setShown((now) => now.filter((s) => !s.leaving)), 700);
    return () => window.clearTimeout(t);
  }, [shown]);

  return (
    <div ref={layer} className={styles.strewn} aria-hidden data-chrome>
      {win
        ? shown.map(({ i, leaving }) =>
            strew(projects[i], win.w, win.h).map((piece, j) => (
              <div
                key={`${projects[i].slug}-${j}`}
                className={styles.strewnPiece}
                data-leaving={leaving || undefined}
                style={
                  {
                    left: `${piece.x}px`,
                    top: `${piece.y}px`,
                    width: `${piece.w}px`,
                    height: `${piece.h}px`,
                    "--turn": `${piece.turn}deg`,
                    "--out-x": `${piece.outX}px`,
                    "--out-y": `${piece.outY}px`,
                    animationDelay: leaving ? "0s" : `${j * 70}ms`,
                  } as React.CSSProperties
                }
              >
                {typeof piece.pic.src === "string" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a video's thumbnail, from YouTube
                  <img src={piece.pic.src} alt="" loading="lazy" draggable={false} />
                ) : (
                  <Image src={piece.pic.src} alt="" fill sizes="45vw" draggable={false} />
                )}
              </div>
            )),
          )
        : null}
    </div>
  );
}
