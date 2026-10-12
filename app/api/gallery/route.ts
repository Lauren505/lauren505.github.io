import { promises as fs } from "node:fs";
import path from "node:path";
import type { Entry } from "@/content/gallery";
import { FRAME_SPECS } from "@/content/frames";

const LABEL_SIDES = ["right", "right-top", "left", "left-top", "below", "below-right", "above", "above-right", "none"];

/**
 * Where the gallery editor reads its choices from and saves to, while
 * `next dev` is running and never otherwise — see components/GalleryEditor.
 *
 * GET lists what can be hung: every picture under content/media/gallery/, and
 * every model and film under public/models/gallery/ (a film's original is left
 * out when there is a `-web` copy of it, which is the one to hang). With
 * `?file=`, it sends one of those pictures, so that a picture not yet imported
 * can be shown before it is saved.
 *
 * POST rewrites two parts of content/gallery.ts with what was arranged in the
 * browser — the picture imports, and the `entries` list — and leaves the rest
 * of the file as it was. The comments that sit above a field in an entry are
 * kept, by the frame's id and the field's name, so a note on why a model is
 * turned the way it is outlives the model being turned.
 */

const ROOT = process.cwd();
const FILE = path.join(ROOT, "content", "gallery.ts");
const PICTURES = path.join(ROOT, "content", "media", "gallery");
const PUBLIC = path.join(ROOT, "public", "models", "gallery");

const LIST = "export const entries: Entry[] = [";
const END = "\n];\n";
const PICS_START = "// @gallery-pictures-start";
const PICS_END = "// @gallery-pictures-end";

const IMAGE = /\.(jpe?g|png|webp|avif)$/i;
const MODEL = /\.glb$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;
/** Over GitHub's file limit, so never in the repository to be hung. */
const TOO_BIG = 100 * 1024 * 1024;

const dev = () => process.env.NODE_ENV === "development";
const notFound = () => new Response("Not found", { status: 404 });

async function walk(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (d.name.startsWith(".")) continue;
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...(await walk(path.join(dir, d.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

export async function GET(request: Request) {
  if (!dev()) return notFound();
  const file = new URL(request.url).searchParams.get("file");

  if (file) {
    const full = path.resolve(PICTURES, file);
    if (!full.startsWith(PICTURES + path.sep) || !IMAGE.test(full)) return notFound();
    const body = await fs.readFile(full).catch(() => null);
    if (!body) return notFound();
    const ext = path.extname(full).slice(1).toLowerCase();
    const type = ext === "jpg" ? "jpeg" : ext;
    return new Response(new Uint8Array(body), { headers: { "content-type": `image/${type}` } });
  }

  const pictures = (await walk(PICTURES)).filter((f) => IMAGE.test(f));
  const shared = await walk(PUBLIC);
  const sizes = new Map(
    await Promise.all(
      shared.map(async (f) => [f, (await fs.stat(path.join(PUBLIC, f))).size] as const),
    ),
  );
  // Frames are hung round artworks, not as them — see the editor's frame list.
  const models = shared.filter((f) => MODEL.test(f) && !f.startsWith("frames/"));
  const videos = shared.filter(
    (f) =>
      VIDEO.test(f) &&
      (sizes.get(f) ?? 0) < TOO_BIG &&
      // The original, when there is a copy made for the web.
      !shared.includes(f.replace(/(\.\w+)$/, "-web$1")),
  );
  const url = (f: string) => `/models/gallery/${f}`;
  return Response.json({ pictures, models: models.map(url), videos: videos.map(url) });
}

/* ----------------------------------------------------------------- saving */

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length < 400;
const tuple = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(num);

const valid = (list: unknown): list is Entry[] =>
  Array.isArray(list) &&
  list.length < 200 &&
  list.every((e: Record<string, unknown>) => {
    if (!e || !text(e.id) || !/^[\w-]+$/.test(e.id) || !text(e.title) || !text(e.bg)) return false;
    if (!["x", "y", "w", "h"].every((k) => num(e[k]))) return false;
    if (e.image !== undefined && !(text(e.image) && IMAGE.test(e.image) && !e.image.includes(".."))) return false;
    for (const k of ["model", "video"]) {
      const v = e[k];
      if (v !== undefined && v !== null && !(text(v) && v.startsWith("/models/gallery/") && !v.includes("..")))
        return false;
    }
    for (const k of ["modelSpan", "modelScale", "zoom"]) if (e[k] !== undefined && !num(e[k])) return false;
    if (e.modelFocus !== undefined && !tuple(e.modelFocus, 3)) return false;
    if (e.modelOffset !== undefined && !tuple(e.modelOffset, 3)) return false;
    if (e.modelView !== undefined && !tuple(e.modelView, 2)) return false;
    if (e.focus !== undefined && !tuple(e.focus, 2)) return false;
    if (e.sound !== undefined && typeof e.sound !== "boolean") return false;
    if (e.flush !== undefined && typeof e.flush !== "boolean") return false;
    if (e.frame !== undefined && e.frame !== null && !(text(e.frame) && e.frame in FRAME_SPECS)) return false;
    if (e.label !== undefined && !(text(e.label) && LABEL_SIDES.includes(e.label))) return false;
    for (const k of ["medium", "about"]) if (e[k] !== undefined && !(typeof e[k] === "string" && e[k].length < 4000)) return false;
    return true;
  });

/** Three places, which is a thousandth of a wall unit — finer than a pixel. */
const n = (v: number) => String(Math.round(v * 1000) / 1000);
const value = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map((x) => n(x as number)).join(", ")}]` : typeof v === "number" ? n(v) : JSON.stringify(v);

/** The order a frame's fields are written in, which is the order they were
 *  written in by hand: what it is, how it is staged, then where it hangs. */
const ORDER = [
  "id",
  "title",
  "image",
  "model",
  "modelSpan",
  "modelFocus",
  "modelView",
  "modelScale",
  "modelOffset",
  "video",
  "sound",
  "focus",
  "zoom",
  "frame",
  "flush",
  "bg",
  "label",
  "medium",
  "about",
  "x",
  "y",
  "w",
  "h",
] as const;

/** Left out when they are what leaving them out means. */
const idle = (k: string, v: unknown) =>
  v === undefined ||
  v === null ||
  (k === "focus" && Array.isArray(v) && v[0] === 0.5 && v[1] === 0.5) ||
  (k === "zoom" && v === 1) ||
  (k === "modelScale" && v === 1) ||
  (k === "sound" && v === false) ||
  (k === "flush" && v === false) ||
  (k === "label" && v === "right") ||
  ((k === "medium" || k === "about") && v === "");

/** The comments above each field of each entry, by id and field. */
function notes(body: string) {
  const out = new Map<string, Map<string, string[]>>();
  let id: string | null = null;
  let pending: string[] = [];
  let mine = new Map<string, string[]>();
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t === "{") {
      id = null;
      pending = [];
      mine = new Map();
    } else if (t.startsWith("//") && line.startsWith("    ")) {
      pending.push(t);
    } else {
      const key = /^(\w+):/.exec(t)?.[1];
      if (key) {
        if (key === "id") id = /"([^"]+)"/.exec(t)?.[1] ?? null;
        if (pending.length) mine.set(key, pending);
        pending = [];
      }
      if (t === "}," && id) out.set(id, mine);
    }
  }
  return out;
}

const entry = (e: Entry, kept: Map<string, string[]> | undefined) => {
  const lines: string[] = [];
  for (const k of ORDER) {
    const v = (e as Record<string, unknown>)[k];
    if (idle(k, v)) continue;
    for (const c of kept?.get(k) ?? []) lines.push(c);
    lines.push(`${k}: ${value(v)},`);
  }
  return ["  {", ...lines.map((l) => `    ${l}`), "  },"].join("\n");
};

const DIVIDERS = {
  rooms: "  // ---------------------------------------------------------------- rooms",
  films: "  // ---------------------------------------------------------------- films",
  pictures: "  // ------------------------------------------------------------- pictures",
};

/** A name to import a picture by: its file name, camel-cased, and made unique. */
const nameFor = (file: string, taken: Set<string>) => {
  const base = path
    .basename(file, path.extname(file))
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^[^a-zA-Z_]+/, "");
  let name = base || "picture";
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return name;
};

const picturesBlock = (files: string[]) => {
  const taken = new Set<string>();
  const named = files.map((f) => [f, nameFor(f, taken)] as const);
  return [
    `${PICS_START} — written by the gallery editor from the \`image\``,
    "// names below; add an import by hand and it will be kept as long as a frame",
    "// uses it.",
    ...named.map(([f, v]) => `import ${v} from "./media/gallery/${f}";`),
    "",
    "/** Every picture a frame can name, by its path under content/media/gallery/. */",
    "export const pictures: Record<string, StaticImageData> = {",
    ...named.map(([f, v]) => `  ${JSON.stringify(f)}: ${v},`),
    "};",
    PICS_END,
  ].join("\n");
};

export async function POST(request: Request) {
  if (!dev()) return notFound();
  const list = await request.json().catch(() => null);
  if (!valid(list)) return Response.json({ error: "That is not a wall." }, { status: 400 });
  if (new Set(list.map((e) => e.id)).size !== list.length)
    return Response.json({ error: "Two frames have the same id." }, { status: 400 });

  for (const e of list) {
    if (e.image && !(await fs.stat(path.join(PICTURES, e.image)).catch(() => null)))
      return Response.json({ error: `No picture at content/media/gallery/${e.image}.` }, { status: 400 });
  }

  let src = await fs.readFile(FILE, "utf8");

  const from = src.indexOf(LIST);
  const to = from < 0 ? -1 : src.indexOf(END, from);
  const a = src.indexOf(PICS_START);
  const b = a < 0 ? -1 : src.indexOf(PICS_END, a);
  if (from < 0 || to < 0 || a < 0 || b < 0)
    return Response.json(
      { error: "Could not find the entries list or the picture imports in content/gallery.ts." },
      { status: 500 },
    );

  const kept = notes(src.slice(from + LIST.length, to));
  const kind = (e: Entry) => (e.model ? "rooms" : e.video ? "films" : "pictures");
  const groups = (["rooms", "films", "pictures"] as const)
    .map((k) => [k, list.filter((e) => kind(e) === k)] as const)
    .filter(([, es]) => es.length);
  const body = groups
    .map(([k, es]) => [DIVIDERS[k], ...es.map((e) => entry(e, kept.get(e.id)))].join("\n"))
    .join("\n\n");

  const used = [...new Set(list.map((e) => e.image).filter((f): f is string => !!f))].sort();
  src = `${src.slice(0, from)}${LIST}\n${body}${src.slice(to)}`;
  src = `${src.slice(0, a)}${picturesBlock(used)}${src.slice(b + PICS_END.length)}`;

  await fs.writeFile(FILE, src);
  return Response.json({ saved: list.length });
}
