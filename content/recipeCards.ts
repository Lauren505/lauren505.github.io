/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RECIPE CARDS — how each recipe's card is made up.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where each thing lies on a recipe's card: the name, the steps, the onion
 * skin over them and what holds it on, each photo on its paper, the brown
 * card under it, and the flower. A recipe not listed here is made up the
 * usual way — see `usualCard`.
 *
 * Laid out in the browser, in development: open a recipe on the bakery
 * table and press "Edit recipe". Save writes the list below (see
 * app/api/recipe-cards), so it is easiest left to the editor.
 *
 * Where things are is in fractions of the card's width, so they keep their
 * places however wide the card is drawn. The photos, their cards and the
 * flower are placed as they are when they hang off the card's right-hand
 * side, from the top of the space under the steps; on the left, they are the
 * mirror of that. The onion skin is placed from where the steps would start.
 */

/** Something on the card: its top-left corner, its size, and how far it is
 *  turned, clockwise, in degrees. */
export type Box = { x: number; y: number; width: number; height: number; rotate: number };

/** What holds the onion skin on: a steel gem clip, a gold teardrop clip, a
 *  gold stud pin through it, or nothing. */
export type Fastener = "gem" | "drop" | "stud" | "none";

/** What the steps are over: a sheet of onion skin, or only the card. */
export type SheetPaper = "onion" | "none";

/** Where the clip or pin is on the onion skin: `x` its middle, from the
 *  skin's left edge as a fraction of the skin's width; `y` how far down from
 *  where it usually sits, as a fraction of the card's width; `scale` its
 *  size, 1 being the usual; `rotate` in degrees. */
export type PinPlace = { x: number; y: number; scale: number; rotate: number };

export type PhotoPlace = {
  /** The photo — on its square of torn white paper, if it has one. */
  print: Box;
  /** Whether it is on torn white paper, and how much of that shows round it,
   *  as a fraction of the paper's width; the usual, if left out. */
  white: boolean;
  whiteMargin?: number;
  /** What of the picture shows: how far it is enlarged (1 is just covering
   *  the frame), and which part of it is in the middle, 0–100 across and
   *  down. The whole picture, centred, if left out. */
  crop?: { zoom: number; x: number; y: number };
  /** The square of brown card under it, which lies wherever it is put; or
   *  none. */
  kraft: Box | null;
};

export type RecipeCard = {
  /** How much further down the name is than usual, under "RECIPE". */
  nameDrop: number;
  /** The steps: how far they are moved from where they fall under the
   *  ingredients, how far turned, and how wide — they wrap to it; as wide
   *  as the rest of the words, if left out. */
  steps: { x: number; y: number; rotate: number; width?: number };
  /** The onion skin over them: where it is, if it has been put anywhere —
   *  else just round the steps, as they fall — and what holds it on. */
  sheet: { paper: SheetPaper; box?: Box; fastener: Fastener; pin?: PinPlace };
  photos: PhotoPlace[];
  /** The flower laid over the photos, drawn the other way round if
   *  `mirror`; or none. */
  sprig: (Box & { mirror: boolean }) | null;
};

export const recipeCards: Record<string, RecipeCard> = {};
// end of recipeCards

/** A recipe's card as it is listed above, or else made up the usual way. */
export const cardFor = (id: string, photos: number): RecipeCard => {
  const listed = recipeCards[id];
  // One saved before cards were made up this way is made up the usual way.
  if (!listed || !listed.steps) return usualCard(id, photos);
  // A photo added to the recipe since it was laid out goes where it would
  // have.
  const more = usualPhotos(photos).slice(listed.photos.length);
  return { ...listed, photos: [...listed.photos.slice(0, photos), ...more] };
};

/** How wide a photo usually is, with its brown card, and how tall for how
 *  wide; how much of the brown card shows round it. */
const WIDE = 0.42;
const TALL = 0.8;
const KRAFT = 0.055 * WIDE;

/** A recipe's card made up the usual way, whatever is listed for it: the
 *  steps on onion skin as they fall, held by one of the fasteners — which by
 *  the recipe's name, so it is always the same one — and the photos fanned
 *  at the foot, hanging a quarter off the right-hand side, a flower laid
 *  over the first. */
export const usualCard = (id: string, photos: number): RecipeCard => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    nameDrop: 0,
    steps: { x: 0, y: 0, rotate: -1.1 },
    sheet: { paper: "onion", fastener: (["gem", "drop", "stud"] as const)[h % 3] },
    photos: usualPhotos(photos),
    sprig: photos ? usualSprig(photos) : null,
  };
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Where the `k`th of `n` photos usually lies, with its brown card. */
const fanned = (k: number, n: number): Box => ({
  x: r3(1 - WIDE * 0.76 - k * WIDE * 0.14),
  y: r3((14 + (n - 1 - k) * 16) / 600),
  width: WIDE,
  height: r3(WIDE * TALL),
  rotate: [-2.5, 3, -1.2, 2][k % 4],
});

/** The photos as they usually lie: each on torn white paper, on brown card
 *  a little bigger. */
export const usualPhotos = (n: number): PhotoPlace[] =>
  Array.from({ length: n }, (_, k) => {
    const card = fanned(k, n);
    return {
      print: {
        ...card,
        x: r3(card.x + KRAFT),
        y: r3(card.y + KRAFT),
        width: r3(card.width - 2 * KRAFT),
        height: r3(card.height - 2 * KRAFT),
      },
      white: true,
      kraft: card,
    };
  });

/** The flower as it usually lies: over the first photo's top corner. */
export const usualSprig = (n: number): Box & { mirror: boolean } => {
  const first = fanned(0, n);
  return {
    x: r3(first.x + first.width * 0.22 - first.height * 0.5),
    y: r3(first.y + first.height * 0.1),
    width: r3(first.height * 0.75),
    height: r3(first.height * 0.75),
    rotate: -38,
    mirror: false,
  };
};
