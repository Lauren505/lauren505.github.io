/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LOST RECIPES — what is written around a plate that has no recipe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Click a dessert on the bakery table and, if media/bakery/recipes/ has a
 * file named for it (see _template.md there), its recipe is brought to it on a
 * sheet of paper. Every other dessert has a sentence written around its plate
 * instead: its own, from `lost` below, if it has one, or else one of
 * `anyLost` — one that goes a good part of the way round its plate, so the
 * longer sentences go round the bigger plates and the short ones the small,
 * and the same one for the same dessert every time.
 *
 * "{name}" in a sentence is the dessert's name, in lower case: "the {name}"
 * reads "the matcha roll". Keep them to a sentence or two — they have to fit
 * around the plate, and are written smaller the longer they are.
 */

/** For any dessert without a sentence of its own. */
export const anyLost: string[] = [
  "Unfortunately, this recipe has been lost to time...",
  "The recipe was lost in the journey to Mordor, but the dessert survived.",
  "Alas, the recipe lives only in the baker's head.",
  "Sorry, a cat ate the recipe."
];

/** A sentence for one dessert, by the name of its picture. */
export const lost: Record<string, string> = {
  // matcha_basque: "This one was improvised at midnight, and never quite the same twice.",
};
