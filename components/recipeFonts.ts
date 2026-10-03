import { Caveat, EB_Garamond, Pinyon_Script } from "next/font/google";

/** The bakery's written things. The recipe cards are printed in a menu's
 *  faces — a Garamond, and a script for the flourish over a name — and the
 *  words around a plate with no recipe are written by hand. */
export const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], display: "swap" });
export const script = Pinyon_Script({ subsets: ["latin"], weight: "400", display: "swap" });
export const hand = Caveat({ subsets: ["latin"], display: "swap" });
