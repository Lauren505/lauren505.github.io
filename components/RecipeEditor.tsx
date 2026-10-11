"use client";

import { useCallback, useEffect, useState } from "react";
import type { CardPart } from "@/components/RecipePaper";
import {
  recipeCards,
  usualPhotos,
  usualSprig,
  type Box,
  type Fastener,
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
 * On the card itself, drag anything — the name, the steps, the onion skin,
 * its clip or pin, each photo, each brown card, the flower — to move it, its
 * corner to size it and the stalk above it to turn it. Here, choose what the
 * photos are on, whether the steps have onion skin and what holds it, or
 * type the numbers. Save
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

const PAPERS: [SheetPaper, string][] = [
  ["onion", "Onion skin over them"],
  ["none", "None — only the card"],
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
  usual: usualCard,
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
  const setSteps = (patch: Partial<RecipeCard["steps"]>) => change({ ...card, steps: { ...card.steps, ...patch } });
  const k = selected && "i" in selected ? selected.i : -1;
  const photo = card.photos[k];
  const setPhoto = (patch: Partial<PhotoPlace>) =>
    change({ ...card, photos: card.photos.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const setCrop = (patch: Partial<NonNullable<PhotoPlace["crop"]>>) =>
    setPhoto({ crop: { zoom: 1, x: 50, y: 50, ...photo?.crop, ...patch } });
  const usual = usualPhotos(card.photos.length)[k];

  /** The numbers of a box: where it is, how big, how turned. */
  const boxFields = (b: Box, set: (b: Box) => void) => (
    <div className={styles.grid}>
      <Num label="Across" value={b.x} step={0.01} onChange={(x) => set({ ...b, x })} />
      <Num label="Down" value={b.y} step={0.01} onChange={(y) => set({ ...b, y })} />
      <Num label="Width" value={b.width} step={0.01} onChange={(width) => set({ ...b, width: Math.max(0.03, width) })} />
      <Num label="Height" value={b.height} step={0.01} onChange={(height) => set({ ...b, height: Math.max(0.03, height) })} />
      <Num label="Turn (°)" value={b.rotate} step={0.5} onChange={(rotate) => set({ ...b, rotate })} />
    </div>
  );

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
          On the card, drag anything to move it, its corner to size it and the stalk above it to turn it; drag the name
          up or down. ⌥ Option-drag a photo to move the picture in its frame. Sizes are fractions of the card&apos;s
          width.
        </p>

        <section>
          <h3>Name</h3>
          <div className={styles.grid}>
            <Num
              label="Space under RECIPE"
              value={card.nameDrop}
              step={0.01}
              onChange={(nameDrop) => change({ ...card, nameDrop })}
            />
          </div>
        </section>

        <section>
          <h3>Steps</h3>
          <div className={styles.grid}>
            <Num label="Across" value={card.steps.x} step={0.01} onChange={(x) => setSteps({ x })} />
            <Num label="Down" value={card.steps.y} step={0.01} onChange={(y) => setSteps({ y })} />
            <Num label="Turn (°)" value={card.steps.rotate} step={0.5} onChange={(rotate) => setSteps({ rotate })} />
            {card.steps.width !== undefined ? (
              <Num
                label="Width"
                value={card.steps.width}
                step={0.01}
                onChange={(width) => setSteps({ width: Math.max(0.2, width) })}
              />
            ) : null}
          </div>
          {card.steps.width !== undefined ? (
            <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setSteps({ width: undefined })}>
              As wide as the words
            </button>
          ) : (
            <p className={styles.sub}>As wide as the words — drag their corner to narrow them.</p>
          )}
        </section>

        <section>
          <h3>
            Onion skin <span>— over the steps</span>
          </h3>
          <Choose value={sheet.paper} of={PAPERS} onChange={(paper) => setSheet({ paper })} />
          {sheet.paper === "onion" ? (
            <>
              {sheet.box ? (
                <>
                  {boxFields(sheet.box, (box) => setSheet({ box }))}
                  <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setSheet({ box: undefined })}>
                    Just round the steps
                  </button>
                </>
              ) : (
                <p className={styles.sub}>Just round the steps — drag it to put it anywhere.</p>
              )}
              <h4 style={{ marginTop: "0.6rem" }}>Held on by</h4>
              <Choose value={sheet.fastener} of={FASTENERS} onChange={(fastener) => setSheet({ fastener })} />
              {sheet.fastener !== "none" ? (
                sheet.pin ? (
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
                )
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
                <button key={j} type="button" data-on={j === k || undefined} onClick={() => select({ part: "print", i: j })}>
                  Photo {j + 1}
                </button>
              ))}
            </div>
            {photo ? (
              <>
                <h4>The photo</h4>
                <label className={styles.row} style={{ alignItems: "center", marginBottom: "0.4rem" }}>
                  <input type="checkbox" checked={photo.white} onChange={(e) => setPhoto({ white: e.target.checked })} />
                  On torn white paper
                </label>
                {boxFields(photo.print, (print) => setPhoto({ print }))}
                {photo.white ? (
                  <div className={styles.grid} style={{ marginTop: "0.35rem" }}>
                    <Num
                      label="White margin"
                      value={photo.whiteMargin ?? 0.073}
                      step={0.005}
                      onChange={(whiteMargin) => setPhoto({ whiteMargin: Math.max(0, Math.min(0.4, whiteMargin)) })}
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
                {photo.crop ? (
                  <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setPhoto({ crop: undefined })}>
                    Show the whole picture
                  </button>
                ) : null}

                <h4 style={{ marginTop: "0.8rem" }}>Its brown card</h4>
                <label className={styles.row} style={{ alignItems: "center", marginBottom: "0.4rem" }}>
                  <input
                    type="checkbox"
                    checked={!!photo.kraft}
                    onChange={(e) => {
                      // Back where it usually is, round the photo.
                      const p = photo.print;
                      const m = 0.023;
                      setPhoto({
                        kraft: e.target.checked
                          ? { ...p, x: p.x - m, y: p.y - m, width: p.width + 2 * m, height: p.height + 2 * m }
                          : null,
                      });
                    }}
                  />
                  Brown card under it
                </label>
                {photo.kraft ? boxFields(photo.kraft, (kraft) => setPhoto({ kraft })) : null}
                {photo.kraft ? (
                  <button
                    type="button"
                    style={{ marginTop: "0.4rem" }}
                    onClick={() => {
                      const p = photo.print;
                      const m = 0.023;
                      setPhoto({ kraft: { ...p, x: p.x - m, y: p.y - m, width: p.width + 2 * m, height: p.height + 2 * m } });
                    }}
                  >
                    Line it up round the photo
                  </button>
                ) : null}
                {usual ? (
                  <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setPhoto({ ...usual })}>
                    This photo as it usually is
                  </button>
                ) : null}
              </>
            ) : (
              <p className={styles.sub}>Choose a photo, here or on the card.</p>
            )}
          </section>
        ) : null}

        {card.photos.length ? (
          <section>
            <h3 className={styles.row} style={{ justifyContent: "space-between", alignItems: "center" }}>
              Flower
              {card.sprig ? (
                <button type="button" data-on={selected?.part === "sprig" || undefined} onClick={() => select({ part: "sprig" })}>
                  Choose it
                </button>
              ) : null}
            </h3>
            <p className={styles.sub}>Choose it here to take hold of it on the card: it is mostly clear, and lies over the photos.</p>
            <label className={styles.row} style={{ alignItems: "center", marginBottom: "0.4rem" }}>
              <input
                type="checkbox"
                checked={!!card.sprig}
                onChange={(e) => change({ ...card, sprig: e.target.checked ? usualSprig(card.photos.length) : null })}
              />
              A flower laid over the photos
            </label>
            {card.sprig ? (
              <>
                {boxFields(card.sprig, (b) => change({ ...card, sprig: { ...b, height: b.width, mirror: !!card.sprig?.mirror } }))}
                <label className={styles.row} style={{ alignItems: "center", marginTop: "0.4rem" }}>
                  <input
                    type="checkbox"
                    checked={card.sprig.mirror}
                    onChange={(e) => card.sprig && change({ ...card, sprig: { ...card.sprig, mirror: e.target.checked } })}
                  />
                  The other way round
                </label>
              </>
            ) : null}
          </section>
        ) : null}

        <section>
          <button type="button" onClick={() => change(usualCard)}>
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
