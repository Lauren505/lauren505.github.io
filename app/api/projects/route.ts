import { promises as fs } from "node:fs";
import path from "node:path";
import type { LayoutItem } from "@/content";

/**
 * Where the project editor saves to, while `next dev` is running and never
 * otherwise: it sets one project's spread in content/projectLayouts.ts — or,
 * sent `null`, takes it out, so the project goes back to being laid out
 * automatically — and writes the file again. Next reloads the page from it.
 */

const FILE = path.join(process.cwd(), "content", "projectLayouts.ts");
const START = "export const projectLayouts: Record<string, LayoutItem[]> = ";

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

const validItem = (it: Record<string, unknown>) =>
  !!it &&
  typeof it.key === "string" &&
  /^(title|dek|cover|[pm]\d+)$/.test(it.key) &&
  ["x", "y", "w", "h"].every((k) => num(it[k])) &&
  (it.size === undefined || num(it.size)) &&
  (it.crop === undefined ||
    (typeof it.crop === "object" &&
      it.crop !== null &&
      ["x", "y", "zoom"].every((k) => num((it.crop as Record<string, unknown>)[k]))));

/** A tenth of a unit is finer than anyone can place by hand. */
const r = (v: number) => Math.round(v * 1000) / 1000;
const clean = (it: LayoutItem): LayoutItem => ({
  key: it.key,
  x: r(it.x),
  y: r(it.y),
  w: r(it.w),
  h: r(it.h),
  ...(it.crop && (it.crop.zoom !== 1 || it.crop.x !== 0.5 || it.crop.y !== 0.5)
    ? { crop: { x: r(it.crop.x), y: r(it.crop.y), zoom: r(it.crop.zoom) } }
    : {}),
  ...(it.size && it.size !== 1 ? { size: r(it.size) } : {}),
});

/** One piece to a line, so a change to the file reads as the pieces moved. */
const write = (all: Record<string, LayoutItem[]>) => {
  const slugs = Object.keys(all).sort();
  if (!slugs.length) return "{}";
  const body = slugs
    .map((s) => `  ${JSON.stringify(s)}: [\n${all[s].map((it) => `    ${JSON.stringify(it)},`).join("\n")}\n  ],`)
    .join("\n");
  return `{\n${body}\n}`;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const slug = body?.slug;
  const layout = body?.layout;
  if (typeof slug !== "string" || !/^[\w-]+$/.test(slug)) {
    return Response.json({ error: "No project named." }, { status: 400 });
  }
  if (layout !== null && !(Array.isArray(layout) && layout.every(validItem))) {
    return Response.json({ error: "That is not a layout." }, { status: 400 });
  }

  const src = await fs.readFile(FILE, "utf8");
  const from = src.indexOf(START);
  const end = src.lastIndexOf(";");
  if (from < 0 || end < from) {
    return Response.json({ error: `Could not find "${START}…;" in content/projectLayouts.ts.` }, { status: 500 });
  }
  let all: Record<string, LayoutItem[]>;
  try {
    // Trailing commas are how the file is written; JSON has none.
    all = JSON.parse(src.slice(from + START.length, end).replace(/,(\s*[\]}])/g, "$1"));
  } catch {
    return Response.json({ error: "content/projectLayouts.ts is not as the editor wrote it." }, { status: 500 });
  }
  if (layout === null) delete all[slug];
  else all[slug] = (layout as LayoutItem[]).map(clean);

  await fs.writeFile(FILE, `${src.slice(0, from)}${START}${write(all)}${src.slice(end)}`);
  return Response.json({ saved: slug, pieces: layout?.length ?? 0 });
}
