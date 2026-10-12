/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE BAKERY TABLE — edit this file to lay the table.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every number here is in pixels on a table TABLE_WIDTH wide. The table is the
 * whole page, from its top-left corner (under the nav) down, and it is drawn
 * at exactly these sizes on a window that wide; on any other window the whole
 * layout is scaled to fit its width, so everything keeps its place relative to
 * everything else.
 *
 * Names are file names without the extension:
 *   desserts   media/bakery/desserts/     e.g. "matcha_roll"
 *   plates     media/bakery/decorations/  e.g. "plate7"
 *   cutlery    media/bakery/decorations/  e.g. "fork1", "knife2", "spoon1",
 *              and flowers, which lie about the same way, e.g. "flower3"
 *   hands      media/bakery/decorations/  e.g. "hand2"
 *
 * The page is as long as the table needs: it ends MARGIN below the lowest
 * plate, and scrolls if that is further than the window. Any dessert in the
 * folder that is not listed here is still put out, in rows below everything
 * that is (see `extra` at the bottom), so nothing uploaded goes missing.
 *
 * Angles are in degrees, clockwise. A piece of cutlery at 0 points straight up,
 * the way the drawings are drawn.
 *
 * There are two lists: `settings`, each a dessert on its plate, and `cutlery`,
 * which lies wherever it is put on the table, belonging to no plate in
 * particular — it always lies under the plates where they overlap. Flowers go
 * in `cutlery` too.
 *
 * A setting can also have a `hand`: the hand that pushes it into place as the
 * table is laid. The plate slides in from off the window, away from the hand,
 * the hand following it in, and once it is there the hand goes back the way
 * it came — so a hand is never on the finished table, only seen arriving.
 * Only the settings on the first screen of the table get theirs; further down
 * the plates slide in on their own. A hand is drawn upright, fingers up, so at
 * rotate 0 it reaches up the table, and at 90 in from the left.
 */

export const TABLE_WIDTH = 1440;

/** Space left below the lowest plate before the page ends. */
export const MARGIN = 140;

export type CutleryPlacement = {
  /** Which drawing, e.g. "fork1". */
  ware: string;
  /** Where its middle is, from the top-left of the table. */
  x: number;
  y: number;
  /** How long it is, end to end. */
  length: number;
  rotate: number;
};

export type HandPlacement = {
  /** Which drawing, e.g. "hand2". */
  ware: string;
  /** Where its middle is, from the middle of the plate, once it has pushed
   *  the plate where it goes. The plate is pushed straight away from it. */
  x: number;
  y: number;
  /** How long it is, fingertips to the end of the arm. */
  length: number;
  rotate: number;
};

export type Placement = {
  /** Which dessert, e.g. "matcha_roll". */
  dessert: string;
  /** Which plate it is on, e.g. "plate7". */
  plate: string;
  /** Where the middle of the plate is, from the top-left of the table. */
  x: number;
  y: number;
  /** How wide the plate is; its height follows from its drawing. */
  plateWidth: number;
  /** How wide the dessert is; its height follows from its picture. */
  dessertWidth: number;
  /** Where the middle of the dessert is, from the middle of the plate.
   *  Negative y sits it towards the back of the plate. */
  dessertX?: number;
  dessertY?: number;
  plateRotate?: number;
  dessertRotate?: number;
  /** What pushes it into place — see the note at the top. */
  hand?: HandPlacement;
};

export const settings: Placement[] = [
  {
    dessert: "hojicha_roll",
    plate: "plate2",
    x: 358,
    y: 271,
    plateWidth: 250,
    dessertWidth: 211,
    dessertX: 1,
    dessertY: -32,
    plateRotate: -4,
    dessertRotate: 4,
    hand: { ware: "hand1", x: -280, y: 10, length: 360, rotate: 90 },
  },
  {
    dessert: "matcha_roll",
    plate: "plate2",
    x: 758,
    y: 269,
    plateWidth: 260,
    dessertWidth: 216,
    dessertX: 1,
    dessertY: -31,
    plateRotate: -2,
    dessertRotate: -3,
    hand: { ware: "hand3", x: 0, y: -266, length: 360, rotate: 180 },
  },
  {
    dessert: "chocolate_roll",
    plate: "plate2",
    x: 1147,
    y: 275,
    plateWidth: 260,
    dessertWidth: 218,
    dessertX: -5,
    dessertY: -33,
    plateRotate: -3,
    dessertRotate: 3,
    hand: { ware: "hand4", x: 285, y: 0, length: 360, rotate: -90 },
  },
  {
    dessert: "double_fromage",
    plate: "plate12",
    x: 913,
    y: 532,
    plateWidth: 250,
    dessertWidth: 217,
    dessertX: -4,
    dessertY: -18,
    plateRotate: 200,
  },
  {
    dessert: "macaron",
    plate: "plate5",
    x: 1164,
    y: 707,
    plateWidth: 205,
    dessertWidth: 150,
    dessertY: -10,
    plateRotate: 3,
    hand: { ware: "hand5", x: 242, y: -20, length: 300, rotate: 180 },
  },
  {
    dessert: "salt_bread_roll",
    plate: "plate6",
    x: 268,
    y: 2856,
    plateWidth: 371,
    dessertWidth: 237,
    dessertX: -2,
    dessertY: -17,
    plateRotate: 4,
  },
  {
    dessert: "apple_tart",
    plate: "plate2",
    x: 308,
    y: 1530,
    plateWidth: 304,
    dessertWidth: 226,
    dessertX: 1,
    dessertY: -30,
  },
  {
    dessert: "berry_pistachio_mousse",
    plate: "plate7",
    x: 824,
    y: 850,
    plateWidth: 260,
    dessertWidth: 207,
    dessertY: -22,
  },
  {
    dessert: "berry_tart",
    plate: "plate4",
    x: 273,
    y: 958,
    plateWidth: 281,
    dessertWidth: 220,
    dessertX: -1,
    dessertY: -27,
  },
  {
    dessert: "blueberry_cake",
    plate: "plate8",
    x: 618,
    y: 1200,
    plateWidth: 400,
    dessertWidth: 346,
    dessertX: 4,
    dessertY: -29,
  },
  {
    dessert: "blueberry_cheese",
    plate: "plate5",
    x: 999,
    y: 1412,
    plateWidth: 277,
    dessertWidth: 200,
    dessertY: -22,
  },
  {
    dessert: "blueberry_crumble",
    plate: "plate6",
    x: 1188,
    y: 1076,
    plateWidth: 308,
    dessertWidth: 242,
    dessertX: -6,
    dessertY: -29,
  },
  {
    dessert: "hojicha_cake",
    plate: "plate7",
    x: 958,
    y: 2433,
    plateWidth: 411,
    dessertWidth: 366,
    dessertX: 3,
    dessertY: -26,
  },
  {
    dessert: "chai_cheesecake",
    plate: "plate9",
    x: 312,
    y: 1871,
    plateWidth: 373,
    dessertWidth: 250,
    dessertX: -7,
    dessertY: -31,
    plateRotate: 16,
  },
  {
    dessert: "chai_crunch_cheesecake",
    plate: "plate11",
    x: 1215,
    y: 2756,
    plateWidth: 260,
    dessertWidth: 200,
    dessertX: 6,
    dessertY: -21,
  },
  {
    dessert: "cheese_mousse",
    plate: "plate2",
    x: 249,
    y: 2311,
    plateWidth: 309,
    dessertWidth: 224,
    dessertX: -2,
    dessertY: -42,
  },
  {
    dessert: "chocolate_brownie_cheesecake",
    plate: "plate8",
    x: 879,
    y: 1864,
    plateWidth: 308,
    dessertWidth: 264,
    dessertX: 5,
    dessertY: -11,
  },
  {
    dessert: "chocolate_mochi_tart",
    plate: "plate7",
    x: 539,
    y: 2542,
    plateWidth: 260,
    dessertWidth: 210,
    dessertX: -2,
    dessertY: -18,
  },
  {
    dessert: "choux_puff",
    plate: "plate6",
    x: 1215,
    y: 2105,
    plateWidth: 281,
    dessertWidth: 230,
    dessertX: 2,
    dessertY: -3,
  },
  {
    dessert: "dense_chocolate_cake",
    plate: "plate3",
    x: 750,
    y: 2810,
    plateWidth: 245,
    dessertWidth: 208,
    dessertX: 3,
    dessertY: -35,
  },
  {
    dessert: "elderflower_layer_mousse",
    plate: "plate5",
    x: 627,
    y: 2162,
    plateWidth: 312,
    dessertWidth: 244,
    dessertX: -1,
    dessertY: -21,
  },
  {
    dessert: "galette_bretonne",
    plate: "plate10",
    x: 337,
    y: 3300,
    plateWidth: 433,
    dessertWidth: 365,
    dessertX: -3,
    dessertY: -8,
    plateRotate: 22,
    dessertRotate: 20,
  },
  {
    dessert: "gift_mousse",
    plate: "plate11",
    x: 666,
    y: 1618,
    plateWidth: 230,
    dessertWidth: 155,
    dessertY: -22,
  },
  {
    dessert: "kumquat_mousse",
    plate: "plate3",
    x: 1211,
    y: 1667,
    plateWidth: 228,
    dessertWidth: 204,
    dessertX: 2,
    dessertY: -17,
  },
  {
    dessert: "matcha_basque",
    plate: "plate11",
    x: 876,
    y: 3408,
    plateWidth: 260,
    dessertWidth: 204,
    dessertY: -22,
  },
  {
    dessert: "matcha_cake",
    plate: "plate11",
    x: 497,
    y: 584,
    plateWidth: 366,
    dessertWidth: 321,
    dessertX: -3,
    dessertY: -25,
    plateRotate: 204,
    hand: { ware: "hand2", x: -335, y: 131, length: 342, rotate: 90 },
  },
  {
    dessert: "peach_jasmine_tart",
    plate: "plate2",
    x: 1034,
    y: 3070,
    plateWidth: 300,
    dessertWidth: 234,
    dessertX: 4,
    dessertY: -29,
  },
  {
    dessert: "raisin_scone",
    plate: "plate7",
    x: 613,
    y: 3094,
    plateWidth: 260,
    dessertWidth: 176,
    dessertX: 5,
    dessertY: -12,
  },
  {
    dessert: "yuzu_cheese_mousse",
    plate: "plate5",
    x: 1234,
    y: 3329,
    plateWidth: 260,
    dessertWidth: 200,
    dessertX: 2,
    dessertY: -16,
  },
  {
    dessert: "opera_cake",
    plate: "plate12",
    x: 586,
    y: 3628,
    plateWidth: 291,
    dessertWidth: 259,
    dessertX: -11,
    dessertY: -12,
    plateRotate: 173,
  },
];

export const cutlery: CutleryPlacement[] = [
  { ware: "fork1", x: 605, y: 228, length: 135, rotate: 10 },
  { ware: "knife1", x: 907, y: 321, length: 122, rotate: 11 },
  { ware: "fork2", x: 224, y: 803, length: 173, rotate: 46 },
  { ware: "spoon1", x: 1234, y: 558, length: 150, rotate: -45 },
  { ware: "knife2", x: 1253, y: 515, length: 170, rotate: -43 },
  { ware: "fork3", x: 999, y: 831, length: 130, rotate: -16 },
  { ware: "knife2", x: 373, y: 1203, length: 198, rotate: 22 },
  { ware: "spoon2", x: 1012, y: 2015, length: 145, rotate: 38 },
  { ware: "fork3", x: 501, y: 1823, length: 159, rotate: -33 },
  { ware: "fork2", x: 370, y: 2177, length: 128, rotate: -431 },
  { ware: "spoon1", x: 381, y: 2594, length: 125, rotate: -20 },
  { ware: "fork3", x: 266, y: 3407, length: 173, rotate: 113 },
  { ware: "spoon2", x: 714, y: 3355, length: 145, rotate: 5 },
  { ware: "knife1", x: 904, y: 2858, length: 160, rotate: 8 },
  { ware: "fork4", x: 127, y: 1562, length: 145, rotate: 164 },
  { ware: "spoon2", x: 231, y: 356, length: 125, rotate: -44 },
  { ware: "flower3", x: 263, y: 509, length: 93, rotate: -31 },
  { ware: "flower4", x: 255, y: 543, length: 36, rotate: 27 },
  { ware: "flower3", x: 1265, y: 1531, length: 81, rotate: 43 },
  { ware: "flower1", x: 764, y: 3714, length: 87, rotate: 9 },
];

/**
 * How a dessert that is not in `settings` is put out: in rows of `perRow`, `gapY`
 * apart, starting `gapY` below the lowest listed plate, each on the next
 * plate in `plates` in turn.
 */
export const extra = {
  perRow: 3,
  gapY: 440,
  plates: ["plate2", "plate7", "plate4", "plate11", "plate5"],
  plateWidth: 260,
  dessertWidth: 200,
  dessertY: -22,
};
