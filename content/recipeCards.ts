/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RECIPE CARDS — how each recipe's card is made up.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Over the printed words of a recipe's card lie things put there: onion skin,
 * squares of brown card, torn white paper, the recipe's photos, clips and
 * pins, a flower — each where it is put, in front of or behind the others,
 * the steps among them. A recipe not made up otherwise is made up the usual
 * way — see `usualCard`.
 *
 * How each card is made up is kept in public/recipe-cards.json, which the
 * page reads as it is used rather than builds in: so that the editor (in
 * development: open a recipe on the bakery table and press "Edit recipe")
 * can write it — see app/api/recipe-cards — without the page reloading.
 *
 * Where things are is in fractions of the card's width, so they keep their
 * places however wide the card is drawn: across from the card's left edge,
 * and down from where the steps start (`at: "steps"`) or from under them
 * (`at: "foot"`). Things under the steps hang off the card on the side away
 * from the dessert, so they are placed as they are on the right and are the
 * mirror of that on the left.
 */

/** Its top-left corner, its size, and how far it is turned, clockwise, in
 *  degrees. */
export type Box = { x: number; y: number; width: number; height: number; rotate: number };

/** What can be put on a card. */
export type ItemKind = "onion" | "kraft" | "white" | "photo" | "gem" | "drop" | "stud" | "flower";

export type Item = {
  /** Its own name, to tell it from the others. */
  id: string;
  kind: ItemKind;
  /** Where it is measured from: where the steps start, or under them. */
  at: "steps" | "foot";
  /** Where it is — or, for onion skin, nothing: just round the steps. */
  box?: Box;
  /** A photo: which of the recipe's, and what of it shows — how far it is
   *  enlarged (1 just covering its box) and what is in the middle, 0–100
   *  across and down. */
  photo?: number;
  crop?: { zoom: number; x: number; y: number };
  /** A flower: drawn the other way round. */
  mirror?: boolean;
  /** Torn white paper: which way it tore. */
  seed?: number;
};

export type RecipeCard = {
  /** How much further down the name is than usual, under "RECIPE". */
  nameDrop: number;
  /** The steps: how far they are moved from where they fall under the
   *  ingredients, how far turned, and how wide — they wrap to it; as wide
   *  as the rest of the words, if left out. */
  steps: Words;
  /** The notes, after the steps — any other section of the recipe — the
   *  same way. */
  notes: Words;
  /** What lies on the card, the furthest back first; "steps" and "notes"
   *  are where those are among them. */
  items: Layer[];
};

/** Words on the card that can be moved: how far from where they fall, how
 *  far turned, and how wide — they wrap to it; as wide as the rest of the
 *  words, if left out. */
type Words = { x: number; y: number; rotate: number; width?: number };

/** One of the things on a card, or the words among them. */
export type Layer = Item | "steps" | "notes";

/** How each kind is drawn: what it is called, whether it keeps its shape as
 *  it is sized, where it is measured from, and where a new one goes. */
export const KINDS: Record<ItemKind, { name: string; keepShape: boolean; at: Item["at"]; box: Box }> = {
  onion: { name: "Onion skin", keepShape: false, at: "steps", box: { x: 0.06, y: 0, width: 0.6, height: 0.3, rotate: -1.1 } },
  kraft: { name: "Brown card", keepShape: false, at: "foot", box: { x: 0.5, y: 0.02, width: 0.42, height: 0.336, rotate: -2 } },
  white: {
    name: "Torn white paper",
    keepShape: false,
    at: "foot",
    box: { x: 0.52, y: 0.04, width: 0.374, height: 0.29, rotate: -2 },
  },
  photo: { name: "Photo", keepShape: false, at: "foot", box: { x: 0.55, y: 0.07, width: 0.32, height: 0.235, rotate: -2 } },
  gem: { name: "Steel paper clip", keepShape: true, at: "steps", box: { x: 0.85, y: -0.047, width: 0.041, height: 0.153, rotate: 4 } },
  drop: {
    name: "Gold teardrop clip",
    keepShape: true,
    at: "steps",
    box: { x: 0.85, y: -0.025, width: 0.065, height: 0.096, rotate: -8 },
  },
  stud: { name: "Gold stud pin", keepShape: true, at: "steps", box: { x: 0.9, y: 0.025, width: 0.018, height: 0.018, rotate: 0 } },
  flower: { name: "Flower", keepShape: true, at: "foot", box: { x: 0.5, y: 0, width: 0.25, height: 0.25, rotate: -38 } },
};

/* ------------------------------------------------------------- the store */

let kept: Record<string, RecipeCard> | null = null;
let coming: Promise<Record<string, RecipeCard>> | null = null;

/** Every recipe's card as public/recipe-cards.json has it — read once, and
 *  kept. */
export const loadRecipeCards = () => {
  // Never from the cache while the editor can be writing it; on the site it is
  // a file like any other, and the browser can keep it between visits.
  coming ??= fetch("/recipe-cards.json", process.env.NODE_ENV === "development" ? { cache: "no-store" } : undefined)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((cards: Record<string, RecipeCard>) => (kept = cards));
  return coming;
};

/** The cards as they have been read, if they have. */
export const recipeCardsNow = () => kept ?? {};

/** The cards as the editor has just saved them. */
export const keepRecipeCards = (cards: Record<string, RecipeCard>) => {
  kept = cards;
  coming = Promise.resolve(cards);
};

/** A recipe's card as it is kept, or else made up the usual way. */
export const cardFor = (id: string, photos: number): RecipeCard => {
  const listed = kept?.[id];
  // One kept before cards were made up this way is made up the usual way.
  if (!listed || !Array.isArray(listed.items)) return usualCard(id, photos);
  // A photo no longer in the recipe is left out; the notes, kept before
  // they were apart from the steps, go just in front of them.
  let items = listed.items.filter((it) => typeof it === "string" || it.kind !== "photo" || (it.photo ?? 0) < photos);
  if (!items.includes("notes")) {
    const at = items.indexOf("steps");
    items = at < 0 ? [...items, "notes"] : [...items.slice(0, at + 1), "notes", ...items.slice(at + 1)];
  }
  return { ...listed, notes: listed.notes ?? { x: 0, y: 0, rotate: -1.1 }, items };
};

/* ------------------------------------------------------- the usual card */

const WIDE = 0.42;
const TALL = 0.8;
const KRAFT = 0.055 * WIDE;
/** How much of the white paper shows round a photo, as a fraction of the
 *  paper's width. */
const WHITE = 0.073;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Where the `k`th of `n` photos usually lies, with its brown card. */
const fanned = (k: number, n: number): Box => ({
  x: r3(1 - WIDE * 0.76 - k * WIDE * 0.14),
  y: r3((14 + (n - 1 - k) * 16) / 600),
  width: WIDE,
  height: r3(WIDE * TALL),
  rotate: [-2.5, 3, -1.2, 2][k % 4],
});

const inset = (b: Box, by: number): Box => ({
  ...b,
  x: r3(b.x + by),
  y: r3(b.y + by),
  width: r3(b.width - 2 * by),
  height: r3(b.height - 2 * by),
});

/** The `k`th photo of `n` as it usually lies: on torn white paper, on brown
 *  card a little bigger. */
const usualPhoto = (k: number, n: number): Item[] => {
  const card = fanned(k, n);
  const paper = inset(card, KRAFT);
  return [
    { id: `kraft-${k}`, kind: "kraft", at: "foot", box: card },
    { id: `white-${k}`, kind: "white", at: "foot", box: paper, seed: 7 + k * 13 },
    { id: `photo-${k}`, kind: "photo", at: "foot", box: inset(paper, WHITE * paper.width), photo: k },
  ];
};

/** A recipe's card made up the usual way: the steps on onion skin as they
 *  fall, held by one of the fasteners — which by the recipe's name, so it is
 *  always the same one — and the photos fanned under them, hanging a quarter
 *  off the side, a flower laid over the first. */
export const usualCard = (id: string, photos: number): RecipeCard => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const fastener = (["gem", "drop", "stud"] as const)[h % 3];
  const first = fanned(0, Math.max(1, photos));
  return {
    nameDrop: 0,
    steps: { x: 0, y: 0, rotate: -1.1 },
    notes: { x: 0, y: 0, rotate: -1.1 },
    items: [
      { id: "onion", kind: "onion", at: "steps" },
      "steps",
      "notes",
      { id: fastener, kind: fastener, at: "steps", box: KINDS[fastener].box },
      ...Array.from({ length: photos }, (_, k) => usualPhoto(photos - 1 - k, photos)).flat(),
      ...(photos
        ? [
            {
              id: "flower",
              kind: "flower" as const,
              at: "foot" as const,
              box: {
                x: r3(first.x + first.width * 0.22 - first.height * 0.5),
                y: r3(first.y + first.height * 0.1),
                width: r3(first.height * 0.75),
                height: r3(first.height * 0.75),
                rotate: -38,
              },
            },
          ]
        : []),
    ],
  };
};
