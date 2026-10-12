import { Bodoni_Moda, Cedarville_Cursive, Corinthia, EB_Garamond, Reenie_Beanie, Roboto_Mono, Source_Serif_4 } from "next/font/google";

/** The bakery's written things. The recipe cards are printed in a menu's
 *  face, a Garamond, and the words around a plate with no recipe are written
 *  by hand.
 *
 *  Not preloaded: this module is reached from the layout, through the turn's
 *  copy of side quests, so a preload would put both faces on every page of
 *  the site. The bakery asks for them as it opens instead — see warmFonts.
 *  The same goes for the guest check's faces below. */
export const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", preload: false });
export const hand = Cedarville_Cursive({ weight: "400", subsets: ["latin"], display: "swap", preload: false });

/** The guest check's faces: the item written in by hand, the printed headings,
 *  the waiter's name, the check's number, and the cover. */
export const padHand = Reenie_Beanie({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
export const padPrint = Source_Serif_4({ subsets: ["latin"], display: "swap", preload: false });
export const padSigned = Corinthia({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
export const padStamped = Roboto_Mono({ subsets: ["latin"], display: "swap", preload: false });
export const padCover = Bodoni_Moda({ subsets: ["latin"], display: "swap", preload: false });

/** Starts every face loading as the table is put up — on the face of the turn
 *  that brings it, as often as not — so the pad is written in its own hand
 *  from the first frame it is seen, and a recipe's card is ready before it is
 *  opened. */
export const warmFonts = () => {
  const fonts = document.fonts;
  if (!fonts) return;
  const load = (font: string) => fonts.load(font).catch(() => {});
  for (const face of [garamond, hand, padHand, padPrint, padSigned, padStamped, padCover]) {
    load(`1em ${face.style.fontFamily}`);
  }
  load(`italic 1em ${garamond.style.fontFamily}`);
};
