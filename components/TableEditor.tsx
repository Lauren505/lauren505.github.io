"use client";

import { useCallback, useEffect, useState } from "react";
import type { Table } from "@/components/bakeryLayout";
import type { Part } from "@/components/TableSetting";
import { TABLE_WIDTH, bakes, decorations, type CutleryPlacement, type Placement, type Ware } from "@/content";
import styles from "./TableEditor.module.css";

/**
 * Laying the bakery's table in the browser, in development only: BakeryTable
 * leaves it out of every other build.
 *
 * On the table itself, drag anything to move it, its corner to size it and
 * the stalk above it to turn it. Here, choose what is on each plate and which
 * plate it is, put cutlery down anywhere, or type the numbers. Save
 * writes it all to content/bakeryTable.ts — see app/api/bakery-table — which
 * is where the table is laid from.
 */

type Props = {
  editing: boolean;
  setEditing: (on: boolean) => void;
  draft: Table;
  /** The table as the file has it, to tell whether there is anything to save. */
  saved: Table;
  selected: Part | null;
  setSelected: (part: Part | null) => void;
  /** Window pixels to the table's. */
  scale: number;
  commit: (next: Table) => void;
  undo: () => void;
  redo: () => void;
  revert: () => void;
};

const plates = decorations.filter((d) => d.kind === "plate");
const wares = decorations.filter((d) => d.kind !== "plate");

/** A number field that only commits when it holds a number. */
function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 10) / 10)), [value]);
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

/** A row of drawings to choose one from. */
function Pick({
  items,
  chosen,
  onPick,
}: {
  items: { id: string; image: { src: string } }[];
  chosen?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className={styles.pick}>
      {items.map((d) => (
        <button
          key={d.id}
          type="button"
          title={d.id}
          className={styles.swatch}
          data-chosen={d.id === chosen || undefined}
          onClick={() => onPick(d.id)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail
              of a drawing, in a panel only development ever sees. */}
          <img src={d.image.src} alt="" />
        </button>
      ))}
    </div>
  );
}

export default function TableEditor({
  editing,
  setEditing,
  draft,
  saved,
  selected,
  setSelected,
  scale,
  commit,
  undo,
  redo,
  revert,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  /** Which side of the window the panel stands at: whichever is not in the
   *  way of what is being moved. */
  const [side, setSide] = useState<"left" | "right">("right");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useCallback(async () => {
    setStatus("Saving…");
    try {
      const res = await fetch("/api/bakery-table", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const out = await res.json().catch(() => ({}));
      setStatus(res.ok ? "Saved to content/bakeryTable.ts" : `Not saved: ${out.error ?? res.status}`);
    } catch (err) {
      setStatus(`Not saved: ${String(err)}`);
    }
  }, [draft]);

  // ⌘S / Ctrl+S saves, and the tab asks before it closes on unsaved work.
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leave);
    };
  }, [editing, save, dirty]);

  if (!editing) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setEditing(true)}>
        Edit table
      </button>
    );
  }

  const i = selected?.i ?? -1;
  const p = selected && selected.part !== "cutlery" ? draft.settings[i] : undefined;
  const c = selected?.part === "cutlery" ? draft.cutlery[i] : undefined;

  /** Changes the selected setting. */
  const change = (patch: Partial<Placement>) => {
    if (!p) return;
    commit({ ...draft, settings: draft.settings.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  };

  /** Changes the selected piece of cutlery. */
  const changeWare = (patch: Partial<CutleryPlacement>) => {
    if (!c) return;
    commit({ ...draft, cutlery: draft.cutlery.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  };

  /** Puts a dessert on the selected plate. Every dessert is on the table
   *  exactly once, so the one it replaces goes where this one was. */
  const serve = (dessert: string) => {
    if (!p) return;
    commit({
      ...draft,
      settings: draft.settings.map((q, j) =>
        j === i ? { ...q, dessert } : q.dessert === dessert ? { ...q, dessert: p.dessert } : q,
      ),
    });
  };

  /** A new piece of cutlery: beside the plate that is selected, next to the
   *  piece that is, or else in the middle of the window. */
  const add = (ware: string) => {
    const kind = wares.find((d) => d.id === ware)?.kind as Ware;
    const at = p
      ? { x: p.x + p.plateWidth * 0.62, y: p.y }
      : c
        ? { x: c.x + 40, y: c.y }
        : { x: TABLE_WIDTH / 2, y: (window.scrollY + window.innerHeight / 2) / scale };
    const piece = {
      ware,
      x: Math.round(at.x),
      y: Math.round(at.y),
      length: kind === "knife" ? 160 : 145,
      rotate: 0,
    };
    commit({ ...draft, cutlery: [...draft.cutlery, piece] });
    setSelected({ part: "cutlery", i: draft.cutlery.length });
  };

  const remove = () => {
    commit({ ...draft, cutlery: draft.cutlery.filter((_, j) => j !== i) });
    setSelected(null);
  };

  return (
    <aside className={styles.panel} data-side={side} onPointerDown={(e) => e.stopPropagation()}>
      <header className={styles.head}>
        <strong>Bakery table</strong>
        <span className={styles.row}>
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

      <div className={styles.body}>
        {p ? (
          <>
            <h3>
              Setting {i + 1} <span>· {selected?.part}</span>
            </h3>

            <section>
              <h4>Dessert</h4>
              <select value={p.dessert} onChange={(e) => serve(e.target.value)}>
                {bakes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
              <div className={styles.grid}>
                <Num label="width" value={p.dessertWidth} onChange={(v) => change({ dessertWidth: v })} />
                <Num label="rotate" value={p.dessertRotate ?? 0} onChange={(v) => change({ dessertRotate: v })} />
                <Num label="x on plate" value={p.dessertX ?? 0} onChange={(v) => change({ dessertX: v })} />
                <Num label="y on plate" value={p.dessertY ?? 0} onChange={(v) => change({ dessertY: v })} />
              </div>
            </section>

            <section>
              <h4>Plate</h4>
              <Pick items={plates} chosen={p.plate} onPick={(plate) => change({ plate })} />
              <div className={styles.grid}>
                <Num label="x" value={p.x} onChange={(v) => change({ x: v })} />
                <Num label="y" value={p.y} onChange={(v) => change({ y: v })} />
                <Num label="width" value={p.plateWidth} onChange={(v) => change({ plateWidth: v })} />
                <Num label="rotate" value={p.plateRotate ?? 0} onChange={(v) => change({ plateRotate: v })} />
              </div>
            </section>
          </>
        ) : c ? (
          <>
            <h3>
              Cutlery {i + 1} <span>· {c.ware}</span>
            </h3>
            <section>
              <Pick items={wares} chosen={c.ware} onPick={(ware) => changeWare({ ware })} />
              <div className={styles.grid}>
                {(["x", "y", "length", "rotate"] as const).map((f) => (
                  <Num key={f} label={f} value={c[f]} onChange={(v) => changeWare({ [f]: v })} />
                ))}
              </div>
              <p className={styles.sub}>
                <button type="button" onClick={remove}>
                  Remove
                </button>
              </p>
            </section>
          </>
        ) : (
          <p className={styles.hint}>
            Click a plate, dessert or piece of cutlery to choose it. Drag to move, drag the corner to
            size, drag the stalk to turn (hold shift for 15°).
            <br />
            <br />
            Arrows nudge (shift: 10), [ and ] turn, Delete removes cutlery, ⌘Z undoes, ⌘S saves.
          </p>
        )}

        <section>
          <h4>Add cutlery</h4>
          <Pick items={wares} onPick={add} />
        </section>
      </div>

      <footer className={styles.foot}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} disabled={!dirty} onClick={save}>
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
        <p className={styles.status}>{dirty ? "Unsaved changes" : (status ?? "Matches content/bakeryTable.ts")}</p>
      </footer>
    </aside>
  );
}
