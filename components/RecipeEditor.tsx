"use client";

import { useCallback, useEffect, useState } from "react";
import type { CardPart } from "@/components/RecipePaper";
import {
  recipeCards,
  type Fastener,
  type PhotoMount,
  type PhotoPlace,
  type Recipe,
  type RecipeCard,
  type SheetPaper,
} from "@/content";
import styles from "./TableEditor.module.css";

/**
 * Making up a recipe's card in the browser, in development only: RecipeView
 * leaves it out of every other build.
 *
 * On the card itself, drag a photo or the steps' sheet to move it, a photo's
 * corner to size it and the stalk above either to turn it, and the clip or
 * pin along the sheet's edge. Here, choose what each photo is mounted on,
 * what paper the steps are on and what holds it, or type the numbers. Save
 * writes it to content/recipeCards.ts — see app/api/recipe-cards — which is
 * where the card is made up from.
 */

type Props = {
  recipe: Recipe;
  editing: boolean;
  setEditing: (on: boolean) => void;
  card: RecipeCard;
  /** The card as the file has it, to tell whether there is anything to save. */
  saved: RecipeCard;
  change: (card: RecipeCard) => void;
  /** Back to the card as it was made up before the editor had it. */
  usual: RecipeCard;
  selected: CardPart | null;
  select: (part: CardPart | null) => void;
  /** Which side of the window the panel stands at: away from the card. */
  side: "left" | "right";
};

const MOUNTS: [PhotoMount, string][] = [
  ["both", "Brown card, torn white card on it"],
  ["kraft", "Brown card"],
  ["white", "Torn white card"],
  ["none", "Nothing"],
];

const PAPERS: [SheetPaper, string][] = [
  ["onion", "Onion skin, over the card"],
  ["none", "None — on the card itself"],
];

const FASTENERS: [Fastener, string][] = [
  ["gem", "Steel paper clip"],
  ["drop", "Gold teardrop clip"],
  ["stud", "Gold stud pin"],
  ["none", "Nothing"],
];

const tidy = (card: RecipeCard): RecipeCard =>
  JSON.parse(JSON.stringify(card, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));

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
  const shown = (v: number) => String(Math.round(v * 1000) / 1000);
  const [text, setText] = useState(shown(value));
  useEffect(() => setText(shown(value)), [value]);
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

function Choose<T extends string>({
  value,
  of,
  onChange,
}: {
  value: T;
  of: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {of.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

export default function RecipeEditor({
  recipe,
  editing,
  setEditing,
  card,
  saved,
  change,
  usual,
  selected,
  select,
  side,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  // What was last saved from here — the file, before the page has it back.
  const [kept, setKept] = useState<RecipeCard | null>(null);
  const filed = kept ?? saved;
  const dirty = JSON.stringify(tidy(card)) !== JSON.stringify(tidy(filed));

  const save = useCallback(async () => {
    setStatus("Saving…");
    // To three places, as the file has them, so that once saved the card
    // matches it.
    const neat = tidy(card);
    try {
      const res = await fetch("/api/recipe-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...recipeCards, [recipe.id]: neat }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        change(neat);
        setKept(neat);
      }
      setStatus(res.ok ? "Saved to content/recipeCards.ts" : `Not saved: ${out.error ?? res.status}`);
    } catch (err) {
      setStatus(`Not saved: ${String(err)}`);
    }
  }, [card, recipe.id, change]);

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
      <button
        type="button"
        className={styles.toggle}
        // Beside "Edit table", which has the bottom-right corner — the
        // bottom-left one is Next's.
        style={{ right: 120 }}
        onClick={() => setEditing(true)}
      >
        Edit recipe
      </button>
    );
  }

  const sheet = card.sheet;
  const setSheet = (patch: Partial<RecipeCard["sheet"]>) => change({ ...card, sheet: { ...sheet, ...patch } });
  const k = selected?.part === "photo" ? selected.i : -1;
  const photo = card.photos[k];
  const setPhoto = (patch: Partial<PhotoPlace>) =>
    change({ ...card, photos: card.photos.map((p, j) => (j === k ? { ...p, ...patch } : p)) });

  return (
    <aside
      className={styles.panel}
      data-side={side}
      // On the left, clear of Next's badge in the bottom-left corner.
      style={side === "left" ? { bottom: 64 } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header className={styles.head}>
        <strong>{recipe.name || recipe.id}</strong>
        <button type="button" onClick={() => setEditing(false)}>
          Done
        </button>
      </header>

      <div className={styles.body}>
        <p className={styles.hint}>
          On the card: drag a photo or the steps&apos; sheet to move it, a photo&apos;s corner to size it, the stalk
          above either to turn it, and the clip or pin along the sheet&apos;s top edge. Sizes are fractions of the
          card&apos;s width.
        </p>

        <section>
          <h3>
            Steps <span>— the sheet they are on</span>
          </h3>
          <h4>Paper</h4>
          <Choose value={sheet.paper} of={PAPERS} onChange={(paper) => setSheet({ paper })} />
          {sheet.paper === "onion" ? (
            <>
              <h4>Held on by</h4>
              <Choose value={sheet.fastener} of={FASTENERS} onChange={(fastener) => setSheet({ fastener })} />
              <div className={styles.grid}>
                <Num label="Across" value={sheet.x} step={0.01} onChange={(x) => setSheet({ x })} />
                <Num label="Down" value={sheet.y} step={0.01} onChange={(y) => setSheet({ y })} />
                <Num label="Turn (°)" value={sheet.rotate} step={0.5} onChange={(rotate) => setSheet({ rotate })} />
                {sheet.fastener !== "none" ? (
                  <Num
                    label="Fastener along (0–1)"
                    value={sheet.fastenerAt ?? 0.88}
                    step={0.02}
                    onChange={(fastenerAt) => setSheet({ fastenerAt: Math.max(0, Math.min(1, fastenerAt)) })}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        {card.photos.length ? (
          <section>
            <h3>
              Photos <span>— {card.photos.length}</span>
            </h3>
            <div className={styles.row} style={{ flexWrap: "wrap", marginBottom: "0.5rem" }}>
              {card.photos.map((_, j) => (
                <button
                  key={j}
                  type="button"
                  data-on={j === k || undefined}
                  onClick={() => select({ part: "photo", i: j })}
                >
                  Photo {j + 1}
                </button>
              ))}
            </div>
            {photo ? (
              <>
                <h4>Mounted on</h4>
                <Choose value={photo.mount} of={MOUNTS} onChange={(mount) => setPhoto({ mount })} />
                <div className={styles.grid}>
                  <Num label="Across" value={photo.x} step={0.01} onChange={(x) => setPhoto({ x })} />
                  <Num label="Down" value={photo.y} step={0.01} onChange={(y) => setPhoto({ y })} />
                  <Num
                    label="Width"
                    value={photo.width}
                    step={0.01}
                    onChange={(width) => setPhoto({ width: Math.max(0.12, Math.min(0.9, width)) })}
                  />
                  <Num label="Turn (°)" value={photo.rotate} step={0.5} onChange={(rotate) => setPhoto({ rotate })} />
                </div>
              </>
            ) : (
              <p className={styles.sub}>Choose a photo, here or on the card.</p>
            )}
          </section>
        ) : null}

        <section>
          <button type="button" onClick={() => change(usual)}>
            Start again from the usual card
          </button>
        </section>
      </div>

      <footer className={styles.foot}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} disabled={!dirty} onClick={save}>
            Save
          </button>
          <button type="button" disabled={!dirty} onClick={() => change(filed)}>
            Revert
          </button>
        </div>
        <p className={styles.status}>{dirty ? "Unsaved changes" : (status ?? "Matches content/recipeCards.ts")}</p>
      </footer>
    </aside>
  );
}
