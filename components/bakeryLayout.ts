import type { StaticImageData } from "next/image";
import {
  MARGIN,
  TABLE_WIDTH,
  bakes,
  cutlery,
  decorations,
  extra,
  settings,
  type Bake,
  type CutleryPlacement,
  type Placement,
} from "@/content";

/**
 * content/bakeryTable.ts, worked out: every name looked up, every position made
 * absolute, and every dessert that is not listed there put out below the ones
 * that are. Nothing in here is for editing — the table is laid there.
 *
 * Everything is still in the table's own pixels (TABLE_WIDTH wide); the page
 * scales it to the window.
 */

/** One drawing or picture on the table, by its middle. */
export type Piece = {
  image: StaticImageData;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  /** For cutlery: which entry in the `cutlery` list this is, which the editor
   *  needs even if an entry before it named no drawing. */
  source?: number;
};

export type Laid = {
  id: string;
  bake: Bake;
  plate: Piece;
  dessert: Piece;
};

/** Both lists in content/bakeryTable.ts: what the editor works on and saves. */
export type Table = { settings: Placement[]; cutlery: CutleryPlacement[] };

const shape = (image: StaticImageData) => image.height / image.width;

const drawing = (id: string, what: string) => {
  const found = decorations.find((d) => d.id === id);
  if (!found && process.env.NODE_ENV !== "production") {
    console.warn(`bakeryTable: there is no ${what} called "${id}" in media/bakery/decorations/.`);
  }
  return found;
};

const lay = (p: Placement, bake: Bake): Laid | null => {
  const plate = drawing(p.plate, "plate");
  if (!plate) return null;
  const pw = p.plateWidth;
  return {
    id: bake.id,
    bake,
    plate: {
      image: plate.image,
      x: p.x,
      y: p.y,
      width: pw,
      height: pw * shape(plate.image),
      rotate: p.plateRotate ?? 0,
    },
    dessert: {
      image: bake.image,
      x: p.x + (p.dessertX ?? 0),
      y: p.y + (p.dessertY ?? 0),
      width: p.dessertWidth,
      height: p.dessertWidth * shape(bake.image),
      rotate: p.dessertRotate ?? 0,
    },
  };
};

/** A piece of cutlery on the table. The drawings stand upright, so their
 *  length is their height. */
const layWare = (c: CutleryPlacement, source: number): Piece[] => {
  const ware = drawing(c.ware, "piece of cutlery");
  if (!ware) return [];
  return [
    {
      image: ware.image,
      x: c.x,
      y: c.y,
      width: c.length / shape(ware.image),
      height: c.length,
      rotate: c.rotate,
      source,
    },
  ];
};

const bottom = (p: Piece) => p.y + p.height / 2;

/**
 * The table as it will be laid: every entry in `settings` that names a dessert
 * and a plate that exist, and after them one for every dessert that is not
 * listed, put out in rows below — see `extra` — and all the cutlery. This is
 * also where the editor starts from, so saving from it lists every dessert by
 * name.
 */
export const complete = (table: Table): Table => ({
  settings: completeSettings(table.settings),
  cutlery: table.cutlery,
});

const completeSettings = (placements: Placement[]): Placement[] => {
  const listed = placements.filter((p) => {
    const ok = bakes.some((b) => b.id === p.dessert);
    if (!ok && process.env.NODE_ENV !== "production") {
      console.warn(`bakeryTable: there is no dessert called "${p.dessert}" in media/bakery/desserts/.`);
    }
    return ok && drawing(p.plate, "plate");
  });

  // Everything uploaded goes on the table, listed or not.
  const rest = bakes.filter((b) => !listed.some((p) => p.dessert === b.id));
  const start = listed.length ? Math.max(...listed.map((p) => p.y)) : 0;
  const plates = extra.plates.filter((id) => decorations.some((d) => d.id === id));
  const fallback = plates.length ? plates : decorations.filter((d) => d.kind === "plate").map((d) => d.id);
  if (!fallback.length) return listed;

  return [
    ...listed,
    ...rest.map((bake, i) => ({
      dessert: bake.id,
      plate: fallback[i % fallback.length],
      x: Math.round((TABLE_WIDTH * ((i % extra.perRow) + 0.5)) / extra.perRow),
      y: start + extra.gapY * (Math.floor(i / extra.perRow) + 1),
      plateWidth: extra.plateWidth,
      dessertWidth: extra.dessertWidth,
      dessertY: extra.dessertY,
    })),
  ];
};

/** Lays out a table from complete(): one Laid for each setting and one Piece
 *  for each piece of cutlery, in the same order, and how long the table has to
 *  be for all of it, in its own pixels. */
export const layTable = (table: Table) => {
  const laid = table.settings.flatMap((p) => {
    const bake = bakes.find((b) => b.id === p.dessert);
    const done = bake ? lay(p, bake) : null;
    return done ? [done] : [];
  });
  const wares = table.cutlery.flatMap(layWare);
  const all = [...laid.flatMap((s) => [s.plate, s.dessert]), ...wares];
  return { laid, cutlery: wares, length: all.length ? Math.max(...all.map(bottom)) + MARGIN : 0 };
};

/** The table as content/bakeryTable.ts lays it. */
export const placements = complete({ settings, cutlery });
export const laidOut = layTable(placements);
