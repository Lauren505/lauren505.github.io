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
  const setPin = (patch: Partial<NonNullable<RecipeCard["sheet"]["pin"]>>) =>
    sheet.pin && setSheet({ pin: { ...sheet.pin, ...patch } });
  const k = selected?.part === "photo" ? selected.i : -1;
  const photo = card.photos[k];
  const setPhoto = (patch: Partial<PhotoPlace>) =>
    change({ ...card, photos: card.photos.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const setCrop = (patch: Partial<NonNullable<PhotoPlace["crop"]>>) =>
    setPhoto({ crop: { zoom: 1, x: 50, y: 50, ...photo?.crop, ...patch } });

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
          On the card: drag a photo, the steps&apos; sheet or its clip or pin to move it, its corner to size it, and
          the stalk above it to turn it. ⌥ Option-drag a photo to move the picture in its frame. Sizes are fractions
          of the card&apos;s width.
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
              </div>
              <h4 style={{ marginTop: "0.6rem" }}>Size</h4>
              {sheet.width === undefined ? (
                <p className={styles.sub}>As wide as the words, as tall as the steps — drag its corner to size it.</p>
              ) : (
                <>
                  <div className={styles.grid}>
                    <Num
                      label="Width"
                      value={sheet.width}
                      step={0.01}
                      onChange={(width) => setSheet({ width: Math.max(0.25, width) })}
                    />
                    <Num
                      label="Least height"
                      value={sheet.height ?? 0}
                      step={0.01}
                      onChange={(height) => setSheet({ height: Math.max(0, height) })}
                    />
                  </div>
                  <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setSheet({ width: undefined, height: undefined })}>
                    Fit to the words
                  </button>
                </>
              )}
              {sheet.fastener !== "none" ? (
                <>
                  <h4 style={{ marginTop: "0.6rem" }}>The {sheet.fastener === "stud" ? "pin" : "clip"}</h4>
                  {sheet.pin ? (
                    <>
                      <div className={styles.grid}>
                        <Num label="Along (0–1)" value={sheet.pin.x} step={0.02} onChange={(x) => setPin({ x })} />
                        <Num label="Down" value={sheet.pin.y} step={0.01} onChange={(y) => setPin({ y })} />
                        <Num
                          label="Size"
                          value={sheet.pin.scale}
                          step={0.05}
                          onChange={(scale) => setPin({ scale: Math.max(0.4, Math.min(4, scale)) })}
                        />
                        <Num label="Turn (°)" value={sheet.pin.rotate} step={1} onChange={(rotate) => setPin({ rotate })} />
                      </div>
                      <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setSheet({ pin: undefined })}>
                        Back to its usual place
                      </button>
                    </>
                  ) : (
                    <p className={styles.sub}>In its usual place — drag it to move it, its corner to size it, its stalk to turn it.</p>
                  )}
                </>
              ) : null}
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
                    onChange={(width) => setPhoto({ width: Math.max(0.08, Math.min(0.95, width)) })}
                  />
                  <Num
                    label="Height"
                    value={photo.height ?? photo.width * 0.8}
                    step={0.01}
                    onChange={(height) => setPhoto({ height: Math.max(0.06, Math.min(1.2, height)) })}
                  />
                  <Num label="Turn (°)" value={photo.rotate} step={0.5} onChange={(rotate) => setPhoto({ rotate })} />
                </div>
                {photo.mount === "both" || photo.mount === "kraft" ? (
                  <div className={styles.grid} style={{ marginTop: "0.35rem" }}>
                    <Num
                      label="Brown margin"
                      value={photo.kraftMargin ?? (photo.mount === "both" ? 0.055 : 0.025)}
                      step={0.005}
                      onChange={(kraftMargin) => setPhoto({ kraftMargin: Math.max(0, Math.min(0.3, kraftMargin)) })}
                    />
                    {photo.mount === "both" ? (
                      <Num
                        label="White margin"
                        value={photo.whiteMargin ?? 0.065}
                        step={0.005}
                        onChange={(whiteMargin) => setPhoto({ whiteMargin: Math.max(0, Math.min(0.3, whiteMargin)) })}
                      />
                    ) : null}
                  </div>
                ) : photo.mount === "white" ? (
                  <div className={styles.grid} style={{ marginTop: "0.35rem" }}>
                    <Num
                      label="White margin"
                      value={photo.whiteMargin ?? 0.065}
                      step={0.005}
                      onChange={(whiteMargin) => setPhoto({ whiteMargin: Math.max(0, Math.min(0.3, whiteMargin)) })}
                    />
                  </div>
                ) : null}
                <h4 style={{ marginTop: "0.6rem" }}>Crop</h4>
                <div className={styles.grid}>
                  <Num
                    label="Zoom"
                    value={photo.crop?.zoom ?? 1}
                    step={0.05}
                    onChange={(zoom) => setCrop({ zoom: Math.max(1, Math.min(5, zoom)) })}
                  />
                  <Num label="Middle across (%)" value={photo.crop?.x ?? 50} step={1} onChange={(x) => setCrop({ x })} />
                  <Num label="Middle down (%)" value={photo.crop?.y ?? 50} step={1} onChange={(y) => setCrop({ y })} />
                </div>
                <p className={styles.sub}>
                  The frame&apos;s corner sizes it to any shape, cutting the picture to fit; ⌥ Option-drag the photo to
                  move the picture in its frame.
                </p>
                {photo.crop ? (
                  <button type="button" onClick={() => setPhoto({ crop: undefined })}>
                    Show the whole picture
                  </button>
                ) : null}
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
