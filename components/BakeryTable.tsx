"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GuestCheck from "@/components/GuestCheck";
import RecipeRing from "@/components/RecipeRing";
import RecipeView from "@/components/RecipeView";
import Tablecloth from "@/components/Tablecloth";
import TableSetting, { type Edit, type Grip, type Part } from "@/components/TableSetting";
import { laidOut, layTable, placements, type Laid, type Table } from "@/components/bakeryLayout";
import { arrange, lookFor, moveTable, type Moves } from "@/components/bakerySearch";
import { TABLE_WIDTH, loadRecipeCards, lostLine, recipes } from "@/content";
import styles from "./SideQuestsBody.module.css";

/** The editor is for laying the table while the site is being worked on, and
 *  is not in the site anyone else sees: it is not even in the bundle. */
const DEV = process.env.NODE_ENV === "development";
const TableEditor = DEV ? dynamic(() => import("@/components/TableEditor"), { ssr: false }) : null;

type View = { width: number; height: number };

const view = (): View => ({
  width: document.documentElement.clientWidth,
  height: window.innerHeight,
});

/** A copy of the table, to change without touching the one it came from. */
const copy = (t: Table): Table => ({
  settings: t.settings.map((p) => ({ ...p, hand: p.hand && { ...p.hand } })),
  cutlery: t.cutlery.map((c) => ({ ...c })),
});

/** Moves, sizes or turns one thing on the table. */
const adjust = (
  t: Table,
  { i, part }: Part,
  change: { dx?: number; dy?: number; size?: number; turn?: number },
) => {
  const next = copy(t);
  const { dx = 0, dy = 0, size = 1, turn = 0 } = change;
  if (part === "cutlery" || part === "hand") {
    const c = part === "cutlery" ? next.cutlery[i] : next.settings[i]?.hand;
    if (!c) return t;
    c.x += dx;
    c.y += dy;
    c.length *= size;
    c.rotate += turn;
    return next;
  }
  const q = next.settings[i];
  if (!q) return t;
  if (part === "plate") {
    q.x += dx;
    q.y += dy;
    q.plateWidth *= size;
    q.plateRotate = (q.plateRotate ?? 0) + turn;
  } else {
    q.dessertX = (q.dessertX ?? 0) + dx;
    q.dessertY = (q.dessertY ?? 0) + dy;
    q.dessertWidth *= size;
    q.dessertRotate = (q.dessertRotate ?? 0) + turn;
  }
  return next;
};

/** Whole pixels and degrees, which is all anyone would type. */
const tidy = (t: Table): Table => {
  const r = (v: number) => Math.round(v);
  const next = copy(t);
  for (const q of next.settings) {
    q.x = r(q.x);
    q.y = r(q.y);
    q.plateWidth = r(q.plateWidth);
    q.dessertWidth = r(q.dessertWidth);
    for (const key of ["dessertX", "dessertY", "plateRotate", "dessertRotate"] as const) {
      if (q[key] !== undefined) q[key] = r(q[key]!);
    }
  }
  for (const c of [...next.cutlery, ...next.settings.flatMap((q) => (q.hand ? [q.hand] : []))]) {
    c.x = r(c.x);
    c.y = r(c.y);
    c.length = r(c.length);
    c.rotate = r(c.rotate);
  }
  return next;
};

/**
 * The bakery: the cloth, and once it is down, the desserts on it. A still
 * bakery has both already there; `laid` false is the bare table, before
 * either.
 *
 * The table is the whole page, from its very top — under the nav — to its
 * foot, and the page is as long as the table: the section is only the part of
 * that below the nav, so it hangs the table from above itself.
 *
 * Once it is laid, a dessert clicked brings its recipe, up close — see
 * RecipeView — or, if it has none, a sentence around its plate (RecipeRing).
 * One at a time: click another, or anywhere else, and it is put away first.
 *
 * In development there is also the editor — see TableEditor — which lays the
 * table from a draft instead of from content/bakeryTable.ts, and saves the
 * draft back to it.
 */
export default function BakeryTable({ still, laid: showing }: { still: boolean; laid: boolean }) {
  const [down, setDown] = useState(still);
  const onDown = useCallback(() => setDown(true), []);

  // Measured rather than rendered on the server: it is the window's size.
  const [win, setWin] = useState<View | null>(null);

  // How each recipe's card is made up, read now, so it is there by the
  // time one is opened.
  useEffect(() => {
    void loadRecipeCards();
  }, []);
  useLayoutEffect(() => {
    const read = () =>
      setWin((was) => {
        const now = view();
        return was && was.width === now.width && was.height === now.height ? was : now;
      });
    read();
    // The scrollbar the table's own length brings changes the width it has.
    const watch = new ResizeObserver(read);
    watch.observe(document.documentElement);
    window.addEventListener("resize", read);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);

  /* ------------------------------------------------------------ editing */

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Table>(placements);
  const [selected, setSelected] = useState<Part | null>(null);
  const [held, setHeld] = useState(false);
  /** Whether the hands are out on the table, to be put where they leave their
   *  plates. They are never on it otherwise — they only bring the plates in. */
  const [hands, setHands] = useState(false);
  /** The table being laid again, the way it is when the page opens, to see
   *  the hands at work: each play is a new one, from the start. */
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const play = useCallback(() => {
    window.scrollTo({ top: 0 });
    setSelected(null);
    setPlays((n) => n + 1);
    setPlaying(true);
  }, []);
  const played = useCallback(() => setPlaying(false), []);
  const undo = useRef<Table[]>([]);
  const redo = useRef<Table[]>([]);

  // Saved, or edited by hand: the file is the table again. (A new `placements`
  // is the file having changed — Next reloads the module when it does.)
  useEffect(() => {
    setDraft(placements);
    undo.current = [];
    redo.current = [];
  }, [placements]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  /** A change worth undoing: the table before it goes on the stack. */
  const commit = useCallback((next: Table, before = draftRef.current) => {
    undo.current.push(before);
    redo.current = [];
    setDraft(next);
  }, []);

  const step = useCallback((back: boolean) => {
    const from = back ? undo.current : redo.current;
    const to = back ? redo.current : undo.current;
    const was = from.pop();
    if (!was) return;
    to.push(draftRef.current);
    setDraft(was);
  }, []);

  const layout = useMemo(
    () => (editing ? layTable(draft) : laidOut),
    [editing, draft],
  );

  const scale = win ? win.width / TABLE_WIDTH : 1;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  /** Taking hold of a piece: drag, size or turn it until the pointer lets go,
   *  as one change to undo. */
  const grab = useCallback<Edit["grab"]>((part: Part, grip: Grip, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(part);
    const box = (e.currentTarget.closest("[data-editing]") ?? e.currentTarget).getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = draftRef.current;
    const reach = Math.max(8, Math.hypot(x0 - cx, y0 - cy));
    const angle = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    const a0 = angle(x0, y0);
    let moved = false;
    setHeld(true);

    const move = (ev: PointerEvent) => {
      moved = true;
      const s = scaleRef.current;
      if (grip === "move") {
        setDraft(adjust(start, part, { dx: (ev.clientX - x0) / s, dy: (ev.clientY - y0) / s }));
      } else if (grip === "size") {
        const size = Math.max(0.1, Math.hypot(ev.clientX - cx, ev.clientY - cy) / reach);
        setDraft(adjust(start, part, { size }));
      } else {
        let turn = angle(ev.clientX, ev.clientY) - a0;
        // Shift turns in fifteens, for lining things up.
        if (ev.shiftKey) turn = Math.round(turn / 15) * 15;
        setDraft(adjust(start, part, { turn }));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setHeld(false);
      if (moved) commit(tidy(draftRef.current), start);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [commit]);

  // The keyboard, while editing and not typing into the panel.
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, select, textarea");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        step(!e.shiftKey);
        return;
      }
      if (typing || !selected) return;
      const by = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-by, 0],
        ArrowRight: [by, 0],
        ArrowUp: [0, -by],
        ArrowDown: [0, by],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        commit(adjust(draftRef.current, selected, { dx, dy }));
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        commit(adjust(draftRef.current, selected, { turn: (e.key === "[" ? -1 : 1) * (e.shiftKey ? 15 : 1) }));
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.part === "cutlery") {
        e.preventDefault();
        const t = draftRef.current;
        commit({ ...t, cutlery: t.cutlery.filter((_, n) => n !== selected.i) });
        setSelected(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.part === "hand") {
        e.preventDefault();
        const t = draftRef.current;
        commit({ ...t, settings: t.settings.map((q, n) => (n === selected.i ? { ...q, hand: undefined } : q)) });
        setSelected({ part: "plate", i: selected.i });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editing, selected, commit, step]);

  const edit = useMemo<Edit | undefined>(
    () => (editing ? { selected, grab } : undefined),
    [editing, selected, grab],
  );

  /* ------------------------------------------------------------ search */

  /** How the table is rearranged for what is asked for on the order pad —
   *  see bakerySearch — or, with nothing asked for, nothing. */
  const [moves, setMoves] = useState<Moves | null>(null);
  /** How many times it has been rearranged: each time, by hand. */
  const [shuffles, setShuffles] = useState(0);
  const asked = useRef("");
  const pad = useRef<HTMLDivElement>(null);

  /** The places at the front of the table, best first: those in the window
   *  and not under the order pad, top first, then the rest, nearest the
   *  window first. */
  const front = useCallback((laid: Laid[]) => {
    const t = tableRef.current?.getBoundingClientRect();
    if (!t) return laid.map((_, i) => i);
    const s = scaleRef.current;
    const p = pad.current?.hasAttribute("data-open") ? pad.current.getBoundingClientRect() : null;
    const high = window.innerHeight;
    const at = laid.map((l, i) => {
      const x = t.left + l.plate.x * s;
      const y = t.top + l.plate.y * s;
      const r = (Math.max(l.plate.width, l.plate.height) * s) / 2;
      const seen = y - r * 0.5 >= 0 && y + r * 0.5 <= high;
      // Under the pad, if the middle of it is: it would not be seen.
      const covered = !!p && x > p.left && y > p.top - r * 0.3 && y < p.bottom + r * 0.3;
      const off = y < 0 ? -y : Math.max(0, y - high);
      // Of the places not in the window, those under the pad are as good
      // as those half the window below it.
      return { i, x, y, good: seen && !covered, off: covered ? Math.max(off, high / 2) : off };
    });
    const good = at.filter((a) => a.good).sort((a, b) => a.y - b.y || a.x - b.x);
    const rest = at.filter((a) => !a.good).sort((a, b) => a.off - b.off || a.y - b.y);
    return [...good, ...rest].map((a) => a.i);
  }, []);

  /** What is written on the order pad, as it is written: the table is
   *  rearranged as soon as it names something, and laid as it was once
   *  nothing is written. */
  const search = useCallback(
    (lines: string[]) => {
      const want = lookFor(laidOut.laid, lines);
      if (want === undefined) return;
      const key = want ? [...want].sort().join(" ") : "";
      if (key === asked.current) return;
      asked.current = key;
      setMoves(want ? arrange(laidOut.laid, want, front(laidOut.laid)) : null);
      setShuffles((n) => n + 1);
    },
    [front],
  );

  /** The table as it is now: rearranged, unless it is being edited. */
  const arranged = useMemo(
    () => (editing ? { laid: layout.laid, cutlery: layout.cutlery } : moveTable(layout.laid, layout.cutlery, moves)),
    [editing, layout, moves],
  );

  /* ----------------------------------------------------------- recipes */

  /** The dessert asked for, and the one whose recipe is out — which, while
   *  one is being put away for another, is not the same one. */
  const [want, setWant] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const pick = useCallback((i: number) => setWant((w) => (w === i ? null : i)), []);
  const close = useCallback(() => setWant(null), []);
  const gone = useCallback(() => {
    setShown(null);
  }, []);
  useEffect(() => {
    if (shown === null && want !== null) setShown(want);
  }, [want, shown]);

  // Put away by anything but the paper or another dessert, and by Escape.
  useEffect(() => {
    if (want === null) return;
    const elsewhere = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-recipe-keep]")) setWant(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setWant(null);
    document.addEventListener("pointerdown", elsewhere);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", elsewhere);
      window.removeEventListener("keydown", key);
    };
  }, [want]);

  // Put straight back — no hands — for the editor, or a play.
  useEffect(() => {
    setWant(null);
    setShown(null);
  }, [editing, plays]);

  const open = shown === null ? undefined : arranged.laid[shown];
  const recipe = open && recipes[open.id];

  /** How big a plate is among those on the table with no recipe: 0 for the
   *  smallest, 1 for the biggest — which sentence it has goes by it. */
  const sizeOf = (s: Laid) => {
    const big = (p: Laid) => Math.max(p.plate.width, p.plate.height);
    const others = layout.laid.filter((p) => !recipes[p.id]);
    if (others.length < 2) return 0.5;
    return others.filter((p) => big(p) < big(s)).length / (others.length - 1);
  };

  /** Where the open plate is in the window, now — on the table as it is
   *  laid, not as it is zoomed: measured from the section, which does not
   *  zoom, and the table's place in it, which a transform does not move. */
  const tableRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const locate = useCallback(() => {
    const t = tableRef.current;
    const box = t?.parentElement?.getBoundingClientRect();
    const p = openRef.current?.plate;
    const s = scaleRef.current;
    return t && box && p
      ? { x: box.left + t.offsetLeft + p.x * s, y: box.top + t.offsetTop + p.y * s }
      : { x: 0, y: 0 };
  }, []);

  const tableEl = useCallback(() => tableRef.current, []);

  /* -------------------------------------------------------------- size */

  const length = win ? Math.ceil(Math.max(win.height, layout.length * scale)) : 0;
  // The cloth is redrawn whole when the table's length changes, which is too
  // slow to do on every frame of a drag: it catches up when the piece is let
  // go.
  const clothLength = useRef(length);
  if (!held) clothLength.current = length;

  return (
    <section
      id="bakery"
      className={styles.bakery}
      aria-label="Bakery"
      style={win ? ({ "--table-h": `${clothLength.current}px` } as React.CSSProperties) : undefined}
    >
      {win ? (
        <div
          ref={tableRef}
          className={styles.table}
          style={{
            width: win.width,
            marginLeft: -win.width / 2,
          }}
          onPointerDown={editing ? () => setSelected(null) : undefined}
          // Ready to be looked closer at, as soon as the pointer is over a
          // dessert: a layer of its own for the zoom (see RecipeView), made
          // now, not on the click — the first time, for the length of the
          // cloth, that takes long enough to be seen.
          onPointerOver={
            editing
              ? undefined
              : (e) => {
                  const t = tableRef.current;
                  if (t && (e.target as Element).closest("button[data-recipe-keep]")) t.style.willChange = "transform";
                }
          }
        >
          {showing ? <Tablecloth still={still} length={clothLength.current} onDown={onDown} /> : null}
          {showing && down ? (
            <TableSetting
              key={plays}
              laid={arranged.laid}
              cutlery={arranged.cutlery}
              shuffled={shuffles}
              scale={scale}
              arrive={!still}
              edit={playing ? undefined : edit}
              hands={editing && hands && !playing}
              onArrived={played}
              pick={editing ? undefined : pick}
              hide={recipe ? (shown ?? undefined) : undefined}
            />
          ) : null}
          {showing && down && open && !recipe ? (
            <RecipeRing
              key={`${shown}-${open.id}`}
              setting={open}
              scale={scale}
              line={lostLine(open.id, open.bake.title, sizeOf(open))}
              leave={want !== shown}
              onGone={gone}
            />
          ) : null}
        </div>
      ) : null}

      {showing && down && open && recipe ? (
        <RecipeView
          key={`${shown}-${open.id}`}
          setting={open}
          scale={scale}
          recipe={recipe}
          locate={locate}
          leave={want !== shown}
          onClose={close}
          table={tableEl}
          onGone={gone}
        />
      ) : null}

      {/* The custom order pad, at the window's edge: what is written on it
          rearranges the table. Put away while a recipe is out, or the table
          is being laid out in the editor, and kept, with what is on it. */}
      {!still && showing ? (
        <GuestCheck ref={pad} arrived={down} away={shown !== null || editing} onSearch={search} />
      ) : null}

      {/* Not while a recipe is out: that has its own editor. */}
      {TableEditor && !still && showing && shown === null ? (
        <TableEditor
          editing={editing}
          setEditing={setEditing}
          draft={draft}
          saved={placements}
          selected={selected}
          setSelected={setSelected}
          scale={scale}
          commit={commit}
          undo={() => step(true)}
          redo={() => step(false)}
          revert={() => commit(placements)}
          hands={hands}
          setHands={setHands}
          play={play}
          playing={playing}
        />
      ) : null}
    </section>
  );
}
