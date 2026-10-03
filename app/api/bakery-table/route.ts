import { promises as fs } from "node:fs";
import path from "node:path";
import type { Table } from "@/components/bakeryLayout";
import type { CutleryPlacement, Placement } from "@/content";

/**
 * Where the table editor saves to, while `next dev` is running and never
 * otherwise: it rewrites the `settings` and `cutlery` lists in
 * content/bakeryTable.ts with what was laid in the browser, and leaves
 * everything else in the file — the notes, the types, `extra` — as it was. Next reloads the page from the file, which
 * is then the table as the editor left it.
 */

const FILE = path.join(process.cwd(), "content", "bakeryTable.ts");
const SETTINGS = "export const settings: Placement[] = [";
const CUTLERY = "export const cutlery: CutleryPlacement[] = [";
const END = "\n];\n";

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => typeof v === "string" && /^[\w-]+$/.test(v);

const valid = (t: Table | null): t is Table =>
  !!t &&
  Array.isArray(t.settings) &&
  t.settings.every(
    (p: Record<string, unknown>) =>
      p &&
      str(p.dessert) &&
      str(p.plate) &&
      ["x", "y", "plateWidth", "dessertWidth"].every((k) => num(p[k])) &&
      ["dessertX", "dessertY", "plateRotate", "dessertRotate"].every((k) => p[k] === undefined || num(p[k])),
  ) &&
  Array.isArray(t.cutlery) &&
  t.cutlery.every(
    (c: Record<string, unknown>) => c && str(c.ware) && ["x", "y", "length", "rotate"].every((k) => num(c[k])),
  );

/** Whole pixels and degrees, the way the file was written by hand. */
const n = (v: number) => String(Math.round(v * 10) / 10);

const cutlery = (c: CutleryPlacement) =>
  `{ ware: "${c.ware}", x: ${n(c.x)}, y: ${n(c.y)}, length: ${n(c.length)}, rotate: ${n(c.rotate)} }`;

const entry = (p: Placement) => {
  const lines = [
    `dessert: "${p.dessert}",`,
    `plate: "${p.plate}",`,
    `x: ${n(p.x)},`,
    `y: ${n(p.y)},`,
    `plateWidth: ${n(p.plateWidth)},`,
    `dessertWidth: ${n(p.dessertWidth)},`,
  ];
  // Left out when they are nothing, as they were in the file.
  for (const k of ["dessertX", "dessertY", "plateRotate", "dessertRotate"] as const) {
    const v = p[k];
    if (v !== undefined && Math.round(v * 10) !== 0) lines.push(`${k}: ${n(v)},`);
  }
  return ["  {", ...lines.map((l) => `    ${l}`), "  },"].join("\n");
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const table = await request.json().catch(() => null);
  if (!valid(table)) {
    return Response.json({ error: "That is not a table." }, { status: 400 });
  }

  let src = await fs.readFile(FILE, "utf8");
  const lists: [string, string][] = [
    [SETTINGS, table.settings.map(entry).join("\n")],
    [CUTLERY, table.cutlery.map((c) => `  ${cutlery(c)},`).join("\n")],
  ];
  for (const [start, body] of lists) {
    const from = src.indexOf(start);
    const to = from < 0 ? -1 : src.indexOf(END, from);
    if (from < 0 || to < 0) {
      return Response.json(
        { error: `Could not find "${start}" … "];" in content/bakeryTable.ts to replace.` },
        { status: 500 },
      );
    }
    src = `${src.slice(0, from)}${start}${body ? `\n${body}` : ""}${src.slice(to)}`;
  }
  await fs.writeFile(FILE, src);
  return Response.json({ saved: table.settings.length });
}
