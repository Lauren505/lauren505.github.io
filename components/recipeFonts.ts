import { EB_Garamond, Pinyon_Script } from "next/font/google";

/** The bakery's printed things — the recipe cards, and the words written
 *  around a plate — in a menu's faces: a Garamond, and a script for the
 *  flourish over a name. */
export const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], display: "swap" });
export const script = Pinyon_Script({ subsets: ["latin"], weight: "400", display: "swap" });
