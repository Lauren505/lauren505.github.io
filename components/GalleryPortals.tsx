"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalWall from "@/components/PortalWall";
import type { Preview } from "@/components/GalleryEditor";
import { entries, portals, resolve, wallOf, type Entry } from "@/content";
import styles from "./GalleryPortals.module.css";

type Rect = { x: number; y: number; w: number; h: number };

// three and drei are about half a megabyte between them and nothing else on the
// site wants them, so they are fetched when this section is, and never on the
// server: there is no WebGL there to render into.
const PortalScene = dynamic(() => import("@/components/PortalScene"), { ssr: false });

// The editor, in development and nowhere else — see GalleryEditor.
const DEV = process.env.NODE_ENV === "development";
const GalleryEditor = DEV ? dynamic(() => import("@/components/GalleryEditor"), { ssr: false }) : null;

/**
 * The gallery: the flat wall, and the scene that takes it over.
 *
 * The wall is drawn in HTML first and the canvas is faded up on top of it once
 * the pictures are in — they land on the same pixels (see PortalWall), so what
 * the reader sees is a wall that starts turning rather than a wall that
 * arrives. Which portal is open lives here rather than in the scene, so the
 * way back out of one can be an ordinary button and an ordinary key.
 */
export default function GalleryPortals() {
  const [open, setOpen] = useState<string | null>(null);

  /* ----------------------------------------------- editing, in dev only */

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Entry[]>(entries);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const addPreview = useCallback(
    (name: string, p: Preview) => setPreviews((was) => ({ ...was, [name]: p })),
    [],
  );
  // Done keeps the draft, so nothing unsaved is lost by it: the page goes back
  // to the saved wall, and coming back to the editor picks the draft up again.
  // A draft with nothing unsaved in it is the file as it was, so it is brought
  // up to the file as it is — in case that was edited by hand meanwhile.
  const base = useRef(entries);
  useEffect(() => {
    if (!editing) return;
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(base.current) ? entries : d));
    base.current = entries;
  }, [editing]);
  useEffect(() => {
    if (editing) setOpen(null);
  }, [editing]);

  /** What hangs: the draft while it is being edited, the file otherwise. */
  const shown = useMemo(
    () =>
      editing
        ? draft.map((e) =>
            resolve(e, (name) => (previews[name] as unknown as ReturnType<typeof resolve>["image"]) ?? undefined),
          )
        : portals,
    [editing, draft, previews],
  );
  /** The rectangle it is fitted by — held where it was while a frame is being
   *  dragged, or the whole wall would rescale under the pointer every time
   *  the frame being dragged went past its edge. */
  const live = useMemo(() => wallOf(shown), [shown]);
  const [held, setHeld] = useState(live);
  useEffect(() => {
    if (!dragging) setHeld(live);
  }, [dragging, live]);
  const fit = dragging ? held : live;
  const [ready, setReady] = useState(false);
  const [lit, setLit] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  /** The rectangle the wall is hung on, in the window's own pixels. The canvas
   *  is the whole window, so the scene has to be told which part of it the wall
   *  belongs in — otherwise the wall would grow to fill the margins rather than
   *  the margins being room to zoom into, and it would be centred on the window
   *  rather than on the page's column, which are not the same point on an
   *  upright window. */
  const [frame, setFrame] = useState<Rect | null>(null);
  useEffect(() => {
    // The flat wall's own box, which reaches past the stage into the margins
    // — see .wall — and is what the scene has to fit the wall to as well.
    const el = stage.current?.querySelector<HTMLElement>("[data-wall]") ?? stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setFrame((was) =>
        was && was.x === r.x && was.y === r.y && was.w === r.width && was.h === r.height
          ? was
          : { x: r.x, y: r.y, w: r.width, h: r.height },
      );
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Mounted from an effect: the canvas is client-only, and this keeps what the
  // server renders and what the first client render renders the same thing.
  useEffect(() => setLit(true), []);

  useEffect(() => {
    if (!open) return;
    const out = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", out);
    return () => window.removeEventListener("keydown", out);
  }, [open]);

  // The way out is the way in: another double-click. It is listened for on the
  // element rather than in the scene, because by then the wall has been made
  // untouchable — see `frozen` — and there is nothing in the scene left to
  // press. The blind moment at the start is the double-click that opened it,
  // which is still on its way up the document when this goes on: React has
  // already run this effect by the time the event reaches the element it is
  // listening on.
  useEffect(() => {
    const el = stage.current;
    if (!open || !el) return;
    const opened = performance.now();
    const out = () => {
      if (performance.now() - opened > 400) setOpen(null);
    };
    el.addEventListener("dblclick", out);
    return () => el.removeEventListener("dblclick", out);
  }, [open]);

  const onReady = useCallback(() => setReady(true), []);
  // In a room, or zoomed in on a picture or a film: either way, the way back.
  const inside = shown.some((p) => p.id === open);

  return (
    <>
      {/* The wall's own rectangle, which is what the scene fits it to — so the
          line underneath is outside it rather than over it. */}
      <div ref={stage} className={styles.stage}>
        <PortalWall dim={ready} portals={shown} wall={fit} />

        {lit && frame ? (
          <div className={styles.canvas} data-ready={ready || undefined}>
            <PortalScene
              frame={frame}
              open={open}
              onOpen={setOpen}
              onReady={onReady}
              portals={shown}
              wall={fit}
              editing={editing}
            />
          </div>
        ) : null}

        {GalleryEditor && lit ? (
          <GalleryEditor
            editing={editing}
            setEditing={setEditing}
            draft={draft}
            setDraft={setDraft}
            shown={shown}
            fit={fit}
            setDragging={setDragging}
            previews={previews}
            addPreview={addPreview}
          />
        ) : null}
      </div>

      {/* Out here each room says for itself that it is one — see Cue in the
          scene — so the only line left to print is the way back. */}
      {inside ? (
        <p className={styles.hint} data-ready={ready || undefined}>
          <button type="button" className={styles.back} onClick={() => setOpen(null)}>
            ← back
          </button>
        </p>
      ) : null}
    </>
  );
}
