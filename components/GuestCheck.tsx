"use client";

import { Bodoni_Moda, Corinthia, Reenie_Beanie, Roboto_Mono, Source_Serif_4 } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import col0 from "@/content/media/bakery/guest-check/col-0.svg";
import col1 from "@/content/media/bakery/guest-check/col-1.svg";
import foot from "@/content/media/bakery/guest-check/foot.webp";
import leftMid from "@/content/media/bakery/guest-check/left-mid.webp";
import leftTop from "@/content/media/bakery/guest-check/left-top.webp";
import paper from "@/content/media/bakery/guest-check/paper.webp";
import printFoot from "@/content/media/bakery/guest-check/print-foot.svg";
import printHead from "@/content/media/bakery/guest-check/print-head.svg";
import rule0 from "@/content/media/bakery/guest-check/rule-0.svg";
import rule1 from "@/content/media/bakery/guest-check/rule-1.svg";
import rule2 from "@/content/media/bakery/guest-check/rule-2.svg";
import rule3 from "@/content/media/bakery/guest-check/rule-3.svg";
import styles from "./GuestCheck.module.css";

/** The pad's faces: the item written in by hand, the printed headings, the
 *  waiter's name, the check's number, and the cover. */
const hand = Reenie_Beanie({ weight: "400", subsets: ["latin"], display: "swap" });
const print = Source_Serif_4({ subsets: ["latin"], display: "swap" });
const signed = Corinthia({ weight: "400", subsets: ["latin"], display: "swap" });
const stamped = Roboto_Mono({ subsets: ["latin"], display: "swap" });
const cover = Bodoni_Moda({ subsets: ["latin"], display: "swap" });

/*
 * Everything is measured in the units of the drawing it was made from —
 * an Illustrator guest check 809.2 wide — so that it keeps its proportions at
 * any width: see --u in the stylesheet.
 */

/** Where the item rows start, how far apart their rules are, and how many
 *  there are before any are added. */
const ROWS_TOP = 165.79;
const ROW = 64.97;
const ROWS = 3;
/** The sheet's top-left corner on the pad, and its width. */
const SHEET_X = 57.76;
const SHEET_Y = 3.55;
const SHEET_W = 750.07;
/** How far the sheet is pulled before it has torn all the way down. */
const TEAR = 260;
/** Where along its left edge a sheet tears: just right of the stubs of the
 *  sheets torn before it. */
const TEAR_X = 26;

const RULES = [rule0, rule1, rule2, rule3];
const COLS = [
  { src: col0, x: 618.88 },
  { src: col1, x: 684.55 },
];

/** Today, as the check is numbered: year, month and day, two figures each. */
const today = () => {
  const d = new Date();
  return [d.getFullYear() % 100, d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("");
};

/** How many rows a sheet has for what is written on it: never fewer than
 *  the printed three, and always one empty after the last written. */
const rowsFor = (items: string[]) => {
  let last = -1;
  items.forEach((t, i) => {
    if (t.trim()) last = i;
  });
  return Math.max(ROWS, last + 2);
};

/** A ragged line from top to bottom, in units of the drawing, for the left
 *  edge of a sheet as it tears off — and, a little outside it, the edge of
 *  the fibres the tear pulls out of the paper, and of the shadow it casts. */
const tornEdge = (height: number, seed: number) => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const edge: [number, number][] = [];
  const fibres: [number, number][] = [];
  const shade: [number, number][] = [];
  let x = TEAR_X;
  for (let y = 0; y < height; y += 1.5 + rnd() * 4) {
    x += (rnd() - 0.5) * 4.5;
    x += (TEAR_X - x) * 0.2;
    const bite = rnd() < 0.12 ? rnd() * 3.5 : 0;
    edge.push([x + bite, y]);
    const fibre = x - 0.8 - rnd() * 2.2;
    fibres.push([fibre, y]);
    shade.push([Math.min(fibre, x + bite) - 1.2 - rnd() * 0.8, y]);
  }
  edge.push([x, height]);
  fibres.push([x - 1.5, height]);
  shade.push([x - 3, height]);
  return { edge, fibres, shade };
};

type Pull = {
  id: number;
  x: number;
  y: number;
  /** Pixels to a unit of the drawing, as the sheet is drawn now. */
  scale: number;
  edge: ReturnType<typeof tornEdge>;
  /** Torn all the way down, and free. */
  free: boolean;
  /** How far it was pulled when it came free, and how far it leant. */
  at: { x: number; y: number };
  lean: number;
};

/** One sheet of the pad: printed, and written on or not. The one on top
 *  is `live`, written in; under it is the next, `blank`; and while the top
 *  one is being torn off, the part of it not yet torn is its `copy`, which
 *  stays where it is, bound. */
function Sheet({
  items = [],
  check,
  rows,
  mode,
  setItem,
  setCheck,
  sheetRef,
  onPointerDown,
}: {
  items?: string[];
  check: string;
  rows: number;
  mode: "live" | "blank" | "copy";
  setItem?: (i: number, v: string) => void;
  setCheck?: (v: string) => void;
  sheetRef?: React.Ref<HTMLDivElement>;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const live = mode === "live";
  const extra = (rows - ROWS) * ROW;

  const key = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const go = (j: number, end = false) => {
      const f = fields.current[j];
      if (!f) return false;
      e.preventDefault();
      f.focus();
      const at = end ? f.value.length : Math.min(e.currentTarget.selectionStart ?? 0, f.value.length);
      f.setSelectionRange(at, at);
      return true;
    };
    if (e.key === "Enter" || e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Backspace" && !e.currentTarget.value) go(i - 1, true);
  };

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${mode === "copy" ? styles.copy : ""}`}
      style={{ "--extra": extra } as React.CSSProperties}
      onPointerDown={onPointerDown}
      aria-hidden={live ? undefined : true}
    >
      <div className={styles.shade} />
      <div className={styles.fibres} />
      <div className={styles.face} style={{ backgroundImage: `url(${paper.src})` }}>
      <img className={styles.printHead} src={printHead.src} alt="" draggable={false} />
      <svg className={styles.headings} viewBox={`${SHEET_X} ${SHEET_Y} ${SHEET_W} 162.75`} aria-hidden>
        <g className={print.className}>
          <text x="139.97" y="106.45">TABLE NO.</text>
          <text x="269.56" y="106.45">NO. PERSONS</text>
          <text x="429.96" y="106.45">CHECK NO.</text>
          <text x="614.76" y="106.45">SERVER</text>
        </g>
        <text className={`${signed.className} ${styles.server}`} transform="translate(596 140) rotate(-3.76)">
          Lauren
        </text>
      </svg>
      {live ? (
        <input
          className={`${stamped.className} ${styles.check}`}
          value={check}
          onChange={(e) => setCheck?.(e.target.value)}
          maxLength={10}
          inputMode="numeric"
          spellCheck={false}
          aria-label="Check number"
        />
      ) : (
        <span className={`${stamped.className} ${styles.check}`}>{check}</span>
      )}

      {Array.from({ length: rows + 1 }, (_, i) => (
        <img
          key={`rule-${i}`}
          className={styles.rule}
          src={RULES[i % RULES.length].src}
          alt=""
          draggable={false}
          style={{ "--y": ROWS_TOP + i * ROW - SHEET_Y } as React.CSSProperties}
        />
      ))}
      {COLS.map((c) => (
        <img
          key={c.x}
          className={styles.col}
          src={c.src.src}
          alt=""
          draggable={false}
          style={{ "--x": c.x - SHEET_X } as React.CSSProperties}
        />
      ))}
      {/* The sheet under it is blank: nothing written, nothing to write in. */}
      {mode === "blank"
        ? null
        : Array.from({ length: rows }, (_, i) =>
            live ? (
              <input
                key={`item-${i}`}
                ref={(el) => {
                  fields.current[i] = el;
                }}
                className={`${hand.className} ${styles.item}`}
                style={{ "--y": ROWS_TOP + i * ROW - SHEET_Y } as React.CSSProperties}
                value={items[i] ?? ""}
                onChange={(e) => setItem?.(i, e.target.value)}
                onKeyDown={key(i)}
                spellCheck={false}
                autoComplete="off"
                aria-label={`Order, line ${i + 1}`}
              />
            ) : (
              <input
                key={`item-${i}`}
                className={`${hand.className} ${styles.item}`}
                style={{ "--y": ROWS_TOP + i * ROW - SHEET_Y } as React.CSSProperties}
                value={items[i] ?? ""}
                readOnly
                tabIndex={-1}
              />
            ),
          )}
      <img className={styles.printFoot} src={printFoot.src} alt="" draggable={false} />
      </div>
    </div>
  );
}

/**
 * The custom order pad: a guest check, written on by hand. Each line is
 * typed into, and there is always another empty one under the last — the
 * check grows longer to fit them. Pulled away from its binding, the top
 * sheet tears off along its left edge and goes, leaving the next one, blank.
 *
 * It is kept at the right-hand edge of the window, put away but for its
 * binding; pressing the binding takes it out, and again puts it away.
 */
export default function GuestCheck({ className }: { className?: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [check, setCheck] = useState("");
  const [date, setDate] = useState("");
  /** Sheets torn off so far: the live sheet's key, so it comes back new. */
  const [torn, setTorn] = useState(0);
  const [going, setGoing] = useState(false);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const held = useRef<HTMLDivElement>(null);
  const pull = useRef<Pull | null>(null);
  const rows = rowsFor(items);

  // The date is the browser's, not the server's.
  useEffect(() => {
    const d = today();
    setDate(d);
    setCheck((c) => c || d);
  }, []);

  const setItem = useCallback((i: number, v: string) => {
    setItems((was) => {
      const next = [...was];
      while (next.length <= i) next.push("");
      next[i] = v;
      return next;
    });
  }, []);

  /** Draws the sheet as far as it has been pulled. */
  const draw = (p: Pull, dx: number, dy: number) => {
    const el = sheet.current;
    const stays = held.current;
    if (!el || !stays) return;
    const at = (x: number, y: number) => `${x * p.scale}px ${y * p.scale}px`;
    const h = el.offsetHeight / p.scale;
    // Torn from the top down, as far as it has been pulled; still bound
    // below that.
    const t = p.free ? 1 : Math.min(1, Math.hypot(dx, dy) / TEAR);
    const down = t * h;
    const torn = (line: [number, number][]) => {
      const pts = line.filter(([, y]) => y < down);
      return [...pts, [pts.length ? pts[pts.length - 1][0] : TEAR_X, down] as [number, number]];
    };
    // What has torn: across the top from the tear, down the right side to
    // where the tear has got, back across, and up the tear.
    const off = (line: [number, number][]) =>
      `polygon(100% 0, 100% ${down * p.scale}px, ${torn(line)
        .reverse()
        .map(([x, y]) => at(x, y))
        .join(", ")})`;
    const [shade, fibres, face] = el.children as unknown as HTMLElement[];
    face.style.clipPath = off(p.edge.edge);
    fibres.style.clipPath = off(p.edge.fibres);
    shade.style.clipPath = off(p.edge.shade);
    if (p.free) el.dataset.free = "";
    // What has not: the rest of it, which stays bound, as it was.
    stays.style.visibility = p.free ? "hidden" : "visible";
    stays.style.clipPath = `polygon(0 0, ${torn(p.edge.edge)
      .map(([x, y]) => at(x, y))
      .join(", ")}, 100% ${down * p.scale}px, 100% 100%, 0 100%)`;
    if (p.free) {
      // Off the pad: it goes where it is pulled, a little turned.
      const fx = dx - p.at.x;
      const fy = dy - p.at.y;
      el.style.transformOrigin = "0 100%";
      el.style.transform = `translate(${fx}px, ${fy}px) rotate(${fx * 0.01}deg) skewX(${-p.lean}deg)`;
    } else {
      // Still joined where the tear has got to: what has torn leans away
      // from there, the way it is pulled, and nothing below it moves.
      p.lean = Math.max(-5, Math.min(5, dx * 0.03)) * t;
      el.style.transformOrigin = `0 ${down * p.scale}px`;
      el.style.transform = `skewX(${-p.lean}deg)`;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!open || going || e.button !== 0 || (e.target as Element).closest("input")) return;
    const el = sheet.current;
    if (!el) return;
    const scale = el.offsetWidth / SHEET_W;
    const edge = tornEdge(el.offsetHeight / scale, 1 + Math.floor(Math.random() * 1e6));
    pull.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scale, edge, free: false, at: { x: 0, y: 0 }, lean: 0 };
    el.setPointerCapture(e.pointerId);
    el.dataset.pulled = "";
    el.style.transition = "none";
    e.preventDefault();
  };

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const p = pull.current;
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.free && Math.hypot(dx, dy) >= TEAR) {
        p.free = true;
        p.at = { x: dx, y: dy };
      }
      draw(p, dx, dy);
    };
    const up = (e: PointerEvent) => {
      const p = pull.current;
      if (!p || e.pointerId !== p.id) return;
      pull.current = null;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (p.free) {
        // Torn off: it falls away, and the next sheet is the one on top.
        setGoing(true);
        el.style.transition = "transform 0.6s cubic-bezier(0.4, 0, 0.9, 0.6), opacity 0.6s ease-in";
        const away = Math.max(1, Math.hypot(dx, dy));
        el.style.transform = `translate(${dx + (dx / away) * 500}px, ${dy + (dy / away) * 300 + 260}px) rotate(${dx > 0 ? 24 : -24}deg)`;
        el.style.opacity = "0";
        window.setTimeout(() => {
          setItems([]);
          setCheck(today());
          setTorn((n) => n + 1);
          setGoing(false);
        }, 600);
      } else {
        // Let go before it tore through: it lies back down, whole.
        el.style.transition = "transform 0.3s cubic-bezier(0.3, 1.4, 0.5, 1)";
        el.style.transform = "skewX(0deg)";
        const done = () => {
          if (pull.current) return;
          for (const c of el.children as unknown as HTMLElement[]) c.style.clipPath = "";
          el.style.transition = "";
          el.style.transform = "";
          el.style.transformOrigin = "";
          if (held.current) held.current.style.visibility = "hidden";
          delete el.dataset.pulled;
          delete el.dataset.free;
        };
        el.addEventListener("transitionend", done, { once: true });
        window.setTimeout(done, 350);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [torn]);

  return (
    <div
      className={`${styles.pad} ${className ?? ""}`}
      style={{ "--extra": (rows - ROWS) * ROW } as React.CSSProperties}
      data-open={open ? "" : undefined}
      role="group"
      aria-label="Custom order"
    >
      {/* Put away, only its binding shows at the window's edge, and none of
          it can be written in. */}
      <div className={styles.sheets} inert={!open}>
        {/* The next sheet, blank, under the one written on. */}
        <Sheet check={date} rows={rows} mode="blank" />
        <Sheet items={items} check={check} rows={rows} mode="copy" sheetRef={held} />
        <Sheet
          key={torn}
          items={items}
          check={check}
          rows={rows}
          mode="live"
          setItem={setItem}
          setCheck={setCheck}
          sheetRef={sheet}
          onPointerDown={onPointerDown}
        />
      </div>
      <div className={styles.binding} aria-hidden>
        <div className={styles.bindingTop} style={{ backgroundImage: `url(${leftTop.src})` }} />
        <div className={styles.bindingMid} style={{ backgroundImage: `url(${leftMid.src})` }} />
        <div className={styles.foot} style={{ backgroundImage: `url(${foot.src})` }} />
        <span className={`${cover.className} ${styles.cover}`}>CUSTOM ORDER</span>
      </div>
      <button
        type="button"
        className={styles.binder}
        aria-expanded={open}
        aria-label={open ? "Put the custom order pad away" : "Take out the custom order pad"}
        onClick={() => setOpen((o) => !o)}
      />
    </div>
  );
}
