import type { StaticImageData } from "next/image";
import { anyLost, lost } from "./lostRecipes";

/**
 * The bakery's recipes, read straight off media/bakery/recipes/: one markdown
 * file per dessert, named for it — matcha_roll.md for matcha_roll.png. See
 * _template.md there for what goes in one; anything starting with an
 * underscore is left out. Photos for a recipe go in the same folder, or one
 * of its own, and the recipe names them: ![The roll, sliced](matcha_roll.jpg).
 */

export type Recipe = {
  id: string;
  name: string;
  /** What it makes, as written: "one 25 cm roll, about 8 slices". */
  portion?: string;
  /** In groups, each under its sub-heading if it has one. */
  ingredients: { heading?: string; items: string[] }[];
  steps: string[];
  /** Any other section, as paragraphs, each under its heading if it opens
   *  one. */
  notes: { heading?: string; text: string }[];
  /** Photos, tied to the recipe card, in the order the file names them. */
  photos: { image: StaticImageData; alt: string }[];
};

/** A recipe as its file has it: the photos only named, not yet looked up. */
type Parsed = Omit<Recipe, "photos"> & { named: { src: string; alt: string }[] };

/** Each file's text: next.config.mjs has markdown read as a string (see
 *  markdown-loader.cjs). */
const files = import.meta.glob("./media/bakery/recipes/*.md", {
  eager: true,
  import: "default",
  caseSensitive: false,
}) as Record<string, string>;

const pictures = import.meta.glob(
  [
    "./media/bakery/recipes/**/*.jpg",
    "./media/bakery/recipes/**/*.jpeg",
    "./media/bakery/recipes/**/*.png",
    "./media/bakery/recipes/**/*.webp",
    "./media/bakery/recipes/**/*.avif",
  ],
  { eager: true, import: "default", caseSensitive: false },
) as Record<string, StaticImageData>;

type Section = "intro" | "portion" | "ingredients" | "steps" | "notes";

const sectionOf = (heading: string): Section =>
  /ingredient/i.test(heading)
    ? "ingredients"
    : /step|method|instruction|direction/i.test(heading)
      ? "steps"
      : /portion|serv|yield|makes/i.test(heading)
        ? "portion"
        : "notes";

const IMAGE = /^!\[([^\]]*)\]\(\s*<?([^)>]+?)>?(?:\s+"[^"]*")?\s*\)$/;
const ITEM = /^(?:[-*+]|\d+[.)])\s+(.*)$/;
const PORTION = /^(?:portions?|serves|servings|makes|yield)\s*:\s*(.+)$/i;

/** One recipe file, read leniently: whatever it has of a name, a portion,
 *  ingredients and steps. */
const parseRecipe = (id: string, text: string): Parsed => {
  const recipe: Parsed = { id, name: "", ingredients: [], steps: [], notes: [], named: [] };
  let section: Section = "intro";
  let heading: string | undefined;
  /** Where a line goes that carries on the one before it — an item or a
   *  paragraph runs over lines until a blank one. */
  let carry: ((more: string) => void) | null = null;

  const add = (list: string[], words: string) => {
    const at = list.push(words) - 1;
    carry = (more) => (list[at] += ` ${more}`);
  };
  const group = () => {
    let g = recipe.ingredients[recipe.ingredients.length - 1];
    if (!g) recipe.ingredients.push((g = { items: [] }));
    return g;
  };

  const lines = text.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if (!line) {
      carry = null;
      continue;
    }
    if ((m = /^#\s+(.*)$/.exec(line))) {
      if (!recipe.name) recipe.name = m[1];
      carry = null;
      continue;
    }
    if ((m = /^##\s+(.*)$/.exec(line))) {
      section = sectionOf(m[1]);
      heading = section === "notes" ? m[1] : undefined;
      carry = null;
      continue;
    }
    if ((m = /^###+\s+(.*)$/.exec(line))) {
      if (section === "ingredients") recipe.ingredients.push({ heading: m[1], items: [] });
      else heading = m[1];
      carry = null;
      continue;
    }
    if ((m = IMAGE.exec(line))) {
      recipe.named.push({ alt: m[1], src: m[2].trim() });
      carry = null;
      continue;
    }
    const portion = section !== "ingredients" && section !== "steps" && PORTION.exec(line.replace(/[*_]/g, ""));
    if (portion) {
      recipe.portion = portion[1].trim();
      carry = null;
      continue;
    }
    const item = ITEM.exec(line);
    const words = item ? item[1] : line;
    if (carry && !item) {
      carry(words);
      continue;
    }
    if (section === "ingredients") add(group().items, words);
    else if (section === "steps") add(recipe.steps, words);
    else if (section === "portion") {
      recipe.portion = recipe.portion ? `${recipe.portion} ${words}` : words;
      carry = (more) => (recipe.portion += ` ${more}`);
    } else {
      const note = { heading, text: words };
      recipe.notes.push(note);
      heading = undefined;
      carry = (more) => (note.text += ` ${more}`);
    }
  }
  return recipe;
};

const stem = (path: string) => path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

/** A photo a recipe names, looked up in the recipes folder. */
const photo = ({ src, alt }: Parsed["named"][number], id: string) => {
  const want = `./media/bakery/recipes/${src.replace(/^\.?\//, "")}`.toLowerCase();
  const path = Object.keys(pictures).find((p) => p.toLowerCase() === want);
  if (!path && process.env.NODE_ENV !== "production") {
    console.warn(`recipes: ${id}.md names a photo, "${src}", that is not in media/bakery/recipes/.`);
  }
  return path ? [{ image: pictures[path], alt }] : [];
};

/** Every recipe there is, by the dessert it is for. */
export const recipes: Record<string, Recipe> = Object.fromEntries(
  Object.keys(files)
    .filter((path) => !stem(path).startsWith("_"))
    .map((path) => {
      const id = stem(path);
      const { named, ...recipe } = parseRecipe(id, files[path]);
      return [id, { ...recipe, photos: named.flatMap((n) => photo(n, id)) }];
    }),
);

/** What is written around the plate of a dessert with no recipe: its own
 *  sentence, or one of the rest, picked by its name so it is always the same
 *  one. */
export const lostLine = (id: string, title: string) => {
  const own = lost[id];
  if (own) return own.replaceAll("{name}", title.toLowerCase());
  if (!anyLost.length) return "";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return anyLost[h % anyLost.length].replaceAll("{name}", title.toLowerCase());
};
