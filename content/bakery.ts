import type { StaticImageData } from "next/image";

/**
 * The bakery's table, read straight off media/bakery/: nothing here to list
 * by hand. Drop a picture in desserts/ and it is on the table, on a plate of
 * its own; drop a drawing in decorations/ and it is one more plate, piece of
 * cutlery, flower or hand for the table to be laid with.
 *
 * Desserts are pictures with the background taken out, so they can sit on the
 * plate rather than being cropped to it. Decorations are line drawings named
 * for what they are — plate…, fork…, knife…, spoon…, flower…, hand… — which
 * is how the table knows which is which. Flowers lie about the table like the
 * cutlery; hands are drawn upright, fingers up, and only ever pass over it —
 * they push the first plates into place and are gone (see `hand` in
 * content/bakeryTable.ts).
 */

export type Bake = {
  id: string;
  /** Read off the file's name: "matcha_roll.png" is "Matcha roll". */
  title: string;
  image: StaticImageData;
};

export type Ware = "plate" | "fork" | "knife" | "spoon" | "flower" | "hand";

const WARES: readonly Ware[] = ["plate", "fork", "knife", "spoon", "flower", "hand"];

type Decoration = {
  id: string;
  kind: Ware;
  image: StaticImageData;
};

const desserts = import.meta.glob(
  [
    "./media/bakery/desserts/*.png",
    "./media/bakery/desserts/*.webp",
    "./media/bakery/desserts/*.avif",
  ],
  { eager: true, import: "default", caseSensitive: false },
) as Record<string, StaticImageData>;

const drawings = import.meta.glob("./media/bakery/decorations/*.svg", {
  eager: true,
  import: "default",
  caseSensitive: false,
}) as Record<string, StaticImageData>;

const stem = (path: string) => path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

/** In order of name, with the numbers in them read as numbers: plate2 comes
 *  before plate10. */
const byName = (a: string, b: string) =>
  stem(a).localeCompare(stem(b), undefined, { numeric: true });

export const bakes: Bake[] = Object.keys(desserts)
  .sort(byName)
  .map((path) => {
    const id = stem(path);
    const words = id.replace(/[-_]+/g, " ").trim();
    return { id, title: words.charAt(0).toUpperCase() + words.slice(1), image: desserts[path] };
  });

export const decorations: Decoration[] = Object.keys(drawings)
  .sort(byName)
  .flatMap((path) => {
    const id = stem(path);
    const kind = WARES.find((k) =>
      id.toLowerCase().startsWith(k),
    );
    return kind ? [{ id, kind, image: drawings[path] }] : [];
  });
