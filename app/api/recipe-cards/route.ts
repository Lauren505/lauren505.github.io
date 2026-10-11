import { promises as fs } from "node:fs";
import path from "node:path";
import type { RecipeCard } from "@/content";

/**
 * Where the recipe editor saves to, while `next dev` is running and never
 * otherwise: it rewrites the `recipeCards` list in content/recipeCards.ts
 * with the cards as they were made up in the browser, and leaves the rest of
 * the file — the notes, the types, `cardFor` — as it was.
 */

const FILE = path.join(process.cwd(), "content", "recipeCards.ts");
const START = "export const recipeCards: Record<string, RecipeCard> = ";
const END = ";\n// end of recipeCards";

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const maybe = (v: unknown) => v === undefined || num(v);
const one = (v: unknown, of: readonly string[]) => typeof v === "string" && of.includes(v);
const has = (o: unknown, keys: string[]) =>
  !!o && typeof o === "object" && keys.every((k) => num((o as Record<string, unknown>)[k]));
const box = (b: unknown) => has(b, ["x", "y", "width", "height", "rotate"]);

const valid = (cards: unknown): cards is Record<string, RecipeCard> =>
  !!cards &&
  typeof cards === "object" &&
  Object.entries(cards as Record<string, RecipeCard>).every(
    ([id, c]) =>
      /^[\w-]+$/.test(id) &&
      !!c &&
      num(c.nameDrop) &&
      has(c.steps, ["x", "y", "rotate"]) &&
      maybe(c.steps.width) &&
      !!c.sheet &&
      one(c.sheet.paper, ["onion", "none"]) &&
      one(c.sheet.fastener, ["gem", "drop", "stud", "none"]) &&
      (c.sheet.box === undefined || box(c.sheet.box)) &&
      (c.sheet.pin === undefined || has(c.sheet.pin, ["x", "y", "scale", "rotate"])) &&
      Array.isArray(c.photos) &&
      c.photos.every(
        (p) =>
          !!p &&
          box(p.print) &&
          typeof p.white === "boolean" &&
          maybe(p.whiteMargin) &&
          (p.crop === undefined || has(p.crop, ["zoom", "x", "y"])) &&
          (p.kraft === null || box(p.kraft)),
      ) &&
      (c.sprig === null || (box(c.sprig) && typeof c.sprig?.mirror === "boolean")),
  );

/** Short, the way the file is easiest read: three places at most. */
const tidy = (cards: Record<string, RecipeCard>) =>
  JSON.stringify(cards, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v), 2);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const cards = await request.json().catch(() => null);
  if (!valid(cards)) {
    return Response.json({ error: "Those are not recipe cards." }, { status: 400 });
  }
  const src = await fs.readFile(FILE, "utf8");
  const from = src.indexOf(START);
  const to = from < 0 ? -1 : src.indexOf(END, from);
  if (from < 0 || to < 0) {
    return Response.json(
      { error: `Could not find "${START}" … "// end of recipeCards" in content/recipeCards.ts to replace.` },
      { status: 500 },
    );
  }
  await fs.writeFile(FILE, `${src.slice(0, from)}${START}${tidy(cards)}${src.slice(to)}`);
  return Response.json({ saved: Object.keys(cards).length });
}
