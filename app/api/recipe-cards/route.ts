import { promises as fs } from "node:fs";
import path from "node:path";
import type { RecipeCard } from "@/content";

/**
 * Where the recipe editor saves to, while `next dev` is running and never
 * otherwise: it writes public/recipe-cards.json with every recipe's card as
 * it was made up in the browser. The page reads that file as it is used —
 * see content/recipeCards.ts — so writing it does not reload the page.
 */

const FILE = path.join(process.cwd(), "public", "recipe-cards.json");

const KINDS = ["onion", "kraft", "white", "photo", "gem", "drop", "stud", "flower"];

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const maybe = (v: unknown) => v === undefined || num(v);
const has = (o: unknown, keys: string[]) =>
  !!o && typeof o === "object" && keys.every((k) => num((o as Record<string, unknown>)[k]));
const box = (b: unknown) => has(b, ["x", "y", "width", "height", "rotate"]);

const item = (it: unknown) => {
  if (it === "steps") return true;
  if (!it || typeof it !== "object") return false;
  const i = it as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    /^[\w-]+$/.test(i.id) &&
    KINDS.includes(i.kind as string) &&
    (i.at === "steps" || i.at === "foot") &&
    (i.box === undefined || box(i.box)) &&
    (i.box !== undefined || i.kind === "onion") &&
    maybe(i.photo) &&
    (i.crop === undefined || has(i.crop, ["zoom", "x", "y"])) &&
    (i.mirror === undefined || typeof i.mirror === "boolean") &&
    maybe(i.seed)
  );
};

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
      Array.isArray(c.items) &&
      c.items.every(item),
  );

/** Short, the way the file is easiest read: three places at most. */
const tidy = (cards: Record<string, RecipeCard>) =>
  JSON.stringify(cards, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v), 2) + "\n";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const cards = await request.json().catch(() => null);
  if (!valid(cards)) {
    return Response.json({ error: "Those are not recipe cards." }, { status: 400 });
  }
  await fs.writeFile(FILE, tidy(cards));
  return Response.json({ saved: Object.keys(cards).length });
}
