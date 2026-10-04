import { Caveat, EB_Garamond } from "next/font/google";

/** The bakery's written things. The recipe cards are printed in a menu's
 *  face, a Garamond, and the words around a plate with no recipe are written
 *  by hand. */
export const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], display: "swap" });
export const hand = Caveat({ subsets: ["latin"], display: "swap" });
