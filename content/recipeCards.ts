/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RECIPE CARDS — how each recipe's card is made up.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where each photo lies at the foot of the card and what it is mounted on,
 * where the sheet the steps are on lies, what paper it is and what holds it
 * on. A recipe not listed here is made up the usual way — see `cardFor`.
 *
 * Laid out in the browser, in development: open a recipe on the bakery
 * table and press "Edit recipe". Save writes the list below (see
 * app/api/recipe-cards), so it is easiest left to the editor.
 *
 * Where things are is in fractions of the card's width, so they keep their
 * places however wide the card is drawn. The photos are placed as they are
 * when they hang off the card's right-hand side; on the left, they are the
 * mirror of that.
 */

/** What a photo is mounted on: a square of brown card with a torn white one
 *  on it, either alone, or nothing. */
export type PhotoMount = "both" | "kraft" | "white" | "none";

/** What holds the steps' sheet on: a steel gem clip, a gold teardrop clip, a
 *  gold stud pin through it, or nothing. */
export type Fastener = "gem" | "drop" | "stud" | "none";

/** What the steps are on: a sheet of onion skin over the card, or the card
 *  itself. */
export type SheetPaper = "onion" | "none";

export type PhotoPlace = {
  /** Its left edge, from the card's left edge. */
  x: number;
  /** Its top, from the top of the photos, under the steps. */
  y: number;
  width: number;
  /** Degrees, clockwise. */
  rotate: number;
  mount: PhotoMount;
};

export type RecipeCard = {
  sheet: {
    paper: SheetPaper;
    /** How far it is moved from where it lies under the ingredients. */
    x: number;
    y: number;
    rotate: number;
    fastener: Fastener;
    /** Where along its top edge the fastener is, from 0 at its left to 1 at
     *  its right; the usual place if left out. */
    fastenerAt?: number;
  };
  photos: PhotoPlace[];
};

export const recipeCards: Record<string, RecipeCard> = {};
// end of recipeCards

/** A recipe's card as it is listed above, or else made up the usual way:
 *  the sheet as it falls, held by one of the fasteners — which one by the
 *  recipe's name, so it is always the same — and the photos fanned at the
 *  foot, hanging a quarter off the right-hand side. */
export const cardFor = (id: string, photos: number): RecipeCard => {
  const listed = recipeCards[id];
  if (!listed) return usualCard(id, photos);
  // A photo added to the recipe since it was laid out goes where it would
  // have.
  const more = defaultPhotos(photos).slice(listed.photos.length);
  return { ...listed, photos: [...listed.photos.slice(0, photos), ...more] };
};

/** A recipe's card made up the usual way, whatever is listed for it. */
export const usualCard = (id: string, photos: number): RecipeCard => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    sheet: { paper: "onion", x: 0, y: 0, rotate: -1.1, fastener: (["gem", "drop", "stud"] as const)[h % 3] },
    photos: defaultPhotos(photos),
  };
};

const defaultPhotos = (n: number): PhotoPlace[] =>
  Array.from({ length: n }, (_, k) => {
    const width = 0.42;
    return {
      x: Math.round((1 - width * 0.76 - k * width * 0.14) * 1000) / 1000,
      y: Math.round(((14 + (n - 1 - k) * 16) / 600) * 1000) / 1000,
      width,
      rotate: [-2.5, 3, -1.2, 2][k % 4],
      mount: "both",
    };
  });
