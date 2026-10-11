"use client";

import { useCallback, useEffect, useState } from "react";
import { samePart, type CardPart } from "@/components/RecipePaper";
import {
  KINDS,
  keepRecipeCards,
  recipeCardsNow,
  type Box,
  type Item,
  type ItemKind,
  type Layer,
  type Recipe,
  type RecipeCard,
} from "@/content";
import styles from "./TableEditor.module.css";

/**
 * Making up a recipe's card in the browser, in development only: RecipeView
 * leaves it out of every other build.
 *
 * Everything laid on the card — onion skin, brown card, torn white paper,
 * the photos, clips and pins, the flower — is a thing of its own: add one
 * from the list, take one away, put it in front of or behind the others.
 * On the card, drag anything to move it, its corner to size it and the
 * stalk above it to turn it; drag the name up or down. Save writes
 * public/recipe-cards.json — see app/api/recipe-cards — which the card is
 * made up from, and which the page reads without reloading.
 */

type Props = {
  recipe: Recipe;
  editing: boolean;
  setEditing: (on: boolean) => void;
  card: RecipeCard;
  /** The card as it was last saved, to tell whether there is anything to
   *  save. */
  saved: RecipeCard;
  change: (card: RecipeCard) => void;
  /** The card made up the usual way. */
  usual: RecipeCard;
  selected: CardPart | null;
  select: (part: CardPart | null) => void;
  /** Which side of the window the panel stands at: away from the card. */
  side: "left" | "right";
};

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

/** What a thing is called in the list. */
const nameOf = (it: Layer) =>
  it === "steps"
    ? "Steps"
    : it === "notes"
      ? "Notes"
      : it.kind === "photo"
        ? `Photo ${(it.photo ?? 0) + 1}`
        : KINDS[it.kind].name;

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
  const dirty = JSON.stringify(tidy(card)) !== JSON.stringify(tidy(saved));

  const save = useCallback(async () => {
    setStatus("Saving…");
    const neat = tidy(card);
    const cards = { ...recipeCardsNow(), [recipe.id]: neat };
    try {
      const res = await fetch("/api/recipe-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cards),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        keepRecipeCards(cards);
        change(neat);
      }
      setStatus(res.ok ? "Saved to public/recipe-cards.json" : `Not saved: ${out.error ?? res.status}`);
    } catch (err) {
      setStatus(`Not saved: ${String(err)}`);
    }
  }, [card, recipe.id, change]);

  const chosenItem =
    selected?.part === "item" ? card.items.find((x): x is Item => typeof x !== "string" && x.id === selected.id) : undefined;
  const wordsPart = selected?.part === "steps" || selected?.part === "notes" ? selected.part : null;
  const at = chosenItem ? card.items.indexOf(chosenItem) : wordsPart ? card.items.indexOf(wordsPart) : -1;

  const remove = useCallback(() => {
    if (!chosenItem) return;
    change({ ...card, items: card.items.filter((x) => x !== chosenItem) });
    select(null);
  }, [card, change, chosenItem, select]);

  // ⌘S / Ctrl+S saves, Delete takes away what is chosen, and the tab asks
  // before it closes on unsaved work.
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !(e.target as Element).closest("input, select, textarea")
      ) {
        e.preventDefault();
        remove();
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
  }, [editing, save, dirty, remove]);

  if (!editing) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setEditing(true)}>
        Edit recipe
      </button>
    );
  }

  /** A new thing, in front of everything, where that kind usually goes. */
  const add = (what: string) => {
    const [kind, n] = what.split(":") as [ItemKind, string | undefined];
    const k = KINDS[kind];
    const item: Item = {
      id: `${kind}-${Date.now().toString(36)}`,
      kind,
      at: k.at,
      box: { ...k.box },
      ...(kind === "photo" ? { photo: Number(n ?? 0) } : {}),
      ...(kind === "white" ? { seed: Math.floor(Math.random() * 1000) } : {}),
    };
    change({ ...card, items: [...card.items, item] });
    select({ part: "item", id: item.id });
  };

  /** The chosen thing moved `to` places forward (or back), or to the very
   *  front or back. */
  const shift = (to: number | "front" | "back") => {
    if (at < 0) return;
    const items = [...card.items];
    const [it] = items.splice(at, 1);
    const where = to === "front" ? items.length : to === "back" ? 0 : Math.max(0, Math.min(items.length, at + to));
    items.splice(where, 0, it);
    change({ ...card, items });
  };

  const setItem = (patch: Partial<Item>) => {
    if (chosenItem) change({ ...card, items: card.items.map((x) => (x === chosenItem ? { ...chosenItem, ...patch } : x)) });
  };
  const setCrop = (patch: Partial<NonNullable<Item["crop"]>>) =>
    setItem({ crop: { zoom: 1, x: 50, y: 50, ...chosenItem?.crop, ...patch } });
  const setWords = (patch: Partial<RecipeCard["steps"]>) =>
    wordsPart && change({ ...card, [wordsPart]: { ...card[wordsPart], ...patch } });

  /** The numbers of a box: where it is, how big, how turned. */
  const boxFields = (b: Box, set: (b: Box) => void, keepShape = false) => (
    <div className={styles.grid}>
      <Num label="Across" value={b.x} step={0.01} onChange={(x) => set({ ...b, x })} />
      <Num label="Down" value={b.y} step={0.01} onChange={(y) => set({ ...b, y })} />
      <Num
        label="Width"
        value={b.width}
        step={0.005}
        onChange={(v) => {
          const width = Math.max(0.01, v);
          set({ ...b, width, height: keepShape ? (width * b.height) / b.width : b.height });
        }}
      />
      {keepShape ? null : (
        <Num label="Height" value={b.height} step={0.005} onChange={(height) => set({ ...b, height: Math.max(0.01, height) })} />
      )}
      <Num label="Turn (°)" value={b.rotate} step={0.5} onChange={(rotate) => set({ ...b, rotate })} />
    </div>
  );

  const photoOptions = recipe.photos.map((p, n) => (
    <option key={n} value={n}>
      Photo {n + 1}
      {p.alt ? ` — ${p.alt}` : ""}
    </option>
  ));

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
          up or down; ⌥ Option-drag a photo to move the picture in its box. Delete takes away what is chosen.
        </p>

        <section>
          <h3>Add</h3>
          <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
            <option value="">Add to the card…</option>
            {(Object.keys(KINDS) as ItemKind[])
              .filter((kind) => kind !== "photo")
              .map((kind) => (
                <option key={kind} value={kind}>
                  {KINDS[kind].name}
                </option>
              ))}
            {recipe.photos.map((p, n) => (
              <option key={`photo:${n}`} value={`photo:${n}`}>
                Photo {n + 1}
                {p.alt ? ` — ${p.alt}` : ""}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h3>
            On the card <span>— the front first</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: "0.5rem" }}>
            {[...card.items].reverse().map((it) => {
              const part: CardPart = typeof it === "string" ? { part: it } : { part: "item", id: it.id };
              return (
                <button
                  key={typeof it === "string" ? it : it.id}
                  type="button"
                  data-on={samePart(selected, part) || undefined}
                  style={{ textAlign: "left" }}
                  onClick={() => select(part)}
                >
                  {nameOf(it)}
                </button>
              );
            })}
          </div>
          {at >= 0 ? (
            <div className={styles.row} style={{ flexWrap: "wrap" }}>
              <button type="button" disabled={at === card.items.length - 1} onClick={() => shift("front")}>
                To front
              </button>
              <button type="button" disabled={at === card.items.length - 1} onClick={() => shift(1)}>
                Forward
              </button>
              <button type="button" disabled={at === 0} onClick={() => shift(-1)}>
                Backward
              </button>
              <button type="button" disabled={at === 0} onClick={() => shift("back")}>
                To back
              </button>
              {chosenItem ? (
                <button type="button" onClick={remove}>
                  Remove
                </button>
              ) : null}
            </div>
          ) : (
            <p className={styles.sub}>Choose something, here or on the card.</p>
          )}
        </section>

        {chosenItem ? (
          <section>
            <h3>{nameOf(chosenItem)}</h3>
            {chosenItem.box ? (
              <>
                {boxFields(chosenItem.box, (box) => setItem({ box }), KINDS[chosenItem.kind].keepShape)}
                {chosenItem.kind === "onion" ? (
                  <button
                    type="button"
                    style={{ marginTop: "0.4rem" }}
                    onClick={() => setItem({ box: undefined, at: "steps" })}
                  >
                    Just round the steps
                  </button>
                ) : null}
              </>
            ) : (
              <p className={styles.sub}>Just round the steps — drag it to put it anywhere.</p>
            )}
            {chosenItem.kind === "photo" ? (
              <>
                <h4 style={{ marginTop: "0.6rem" }}>Which photo</h4>
                <select value={chosenItem.photo ?? 0} onChange={(e) => setItem({ photo: Number(e.target.value) })}>
                  {photoOptions}
                </select>
                <h4>Crop</h4>
                <div className={styles.grid}>
                  <Num
                    label="Zoom"
                    value={chosenItem.crop?.zoom ?? 1}
                    step={0.05}
                    onChange={(zoom) => setCrop({ zoom: Math.max(1, Math.min(5, zoom)) })}
                  />
                  <Num label="Middle across (%)" value={chosenItem.crop?.x ?? 50} step={1} onChange={(x) => setCrop({ x })} />
                  <Num label="Middle down (%)" value={chosenItem.crop?.y ?? 50} step={1} onChange={(y) => setCrop({ y })} />
                </div>
                {chosenItem.crop ? (
                  <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setItem({ crop: undefined })}>
                    Show the whole picture
                  </button>
                ) : null}
              </>
            ) : null}
            {chosenItem.kind === "white" ? (
              <button
                type="button"
                style={{ marginTop: "0.4rem" }}
                onClick={() => setItem({ seed: Math.floor(Math.random() * 1000) })}
              >
                Tear it differently
              </button>
            ) : null}
            {chosenItem.kind === "flower" ? (
              <label className={styles.row} style={{ alignItems: "center", marginTop: "0.4rem" }}>
                <input type="checkbox" checked={!!chosenItem.mirror} onChange={(e) => setItem({ mirror: e.target.checked })} />
                The other way round
              </label>
            ) : null}
          </section>
        ) : null}

        {wordsPart ? (
          <section>
            <h3>{wordsPart === "steps" ? "Steps" : "Notes"}</h3>
            <div className={styles.grid}>
              <Num label="Across" value={card[wordsPart].x} step={0.01} onChange={(x) => setWords({ x })} />
              <Num label="Down" value={card[wordsPart].y} step={0.01} onChange={(y) => setWords({ y })} />
              <Num label="Turn (°)" value={card[wordsPart].rotate} step={0.5} onChange={(rotate) => setWords({ rotate })} />
              {card[wordsPart].width !== undefined ? (
                <Num
                  label="Width"
                  value={card[wordsPart].width}
                  step={0.01}
                  onChange={(width) => setWords({ width: Math.max(0.2, width) })}
                />
              ) : null}
            </div>
            {card[wordsPart].width !== undefined ? (
              <button type="button" style={{ marginTop: "0.4rem" }} onClick={() => setWords({ width: undefined })}>
                As wide as the words
              </button>
            ) : (
              <p className={styles.sub}>As wide as the words — drag their corner to narrow them.</p>
            )}
          </section>
        ) : null}

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
          <button
            type="button"
            onClick={() => {
              change(usual);
              select(null);
            }}
          >
            Start again from the usual card
          </button>
        </section>
      </div>

      <footer className={styles.foot}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} disabled={!dirty} onClick={save}>
            Save
          </button>
          <button type="button" disabled={!dirty} onClick={() => change(saved)}>
            Revert
          </button>
        </div>
        <p className={styles.status}>{dirty ? "Unsaved changes" : (status ?? "Matches public/recipe-cards.json")}</p>
      </footer>
    </aside>
  );
}
