"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ProjectSpread from "@/components/ProjectSpread";
import { projects } from "@/content";
import styles from "./ProjectReel.module.css";

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
  const p = useRef(0);
  const target = useRef(0);
  /** The whole slot nearest the middle: which covers are drawn, and whose
   *  title shows. */
  const [base, setBase] = useState(0);
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

  const openAt = useCallback((k: number) => {
    const node = slots.current.get(k);
    if (!node) return;
    setOpen({ index: wrap(k), from: node.getBoundingClientRect() });
  }, []);

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
    <div className={styles.reel}>
      <h2 key={`t${active}`} className={styles.title}>
        {project.title}
      </h2>
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
      <p key={`d${active}`} className={styles.description}>
        {project.description}
      </p>
      {still ? null : (
        <p className={styles.hint}>
          <span>
            {String(active + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
          </span>
          <button type="button" className={styles.open} onClick={() => openAt(base)}>
            Open the project
          </button>
        </p>
      )}
      {open ? (
        <ProjectSpread
          project={projects[open.index]}
          number={open.index + 1}
          from={open.from}
          // Back to wherever the cover is now, which is where it was.
          home={() => slots.current.get(base)?.getBoundingClientRect() ?? open.from}
          onClosed={() => {
            setOpen(null);
            stage.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}
