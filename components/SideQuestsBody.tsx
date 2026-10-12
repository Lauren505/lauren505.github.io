"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import BakeryTable from "@/components/BakeryTable";
import GalleryPortals from "@/components/GalleryPortals";
import PortalWall from "@/components/PortalWall";
import ProjectReel from "@/components/ProjectReel";
import { freezePage, type Frozen } from "@/components/freezePage";
import SectionTurn from "@/components/SectionTurn";
import { DEFAULT_SECTION, SECTIONS, sectionOf } from "@/components/sections";
import { WALL_PAD, wall } from "@/content";
import styles from "./SideQuestsBody.module.css";

type Turn = { from: string; to: string; held: Frozen | null };

/**
 * One section's contents. `still` is the section as a picture of itself, for
 * the faces of a turn; `arriving` is that picture as the section opens — the
 * face a turn lands on, before anything on it has come in. The live section
 * brings it all in once the turn is over: the reel's title and pictures, the
 * bakery's cloth and its plates.
 */
function Section({ id, still, arriving = false }: { id: string; still: boolean; arriving?: boolean }) {
  if (id === "projects") {
    return (
      <section id="projects" className={styles.projects} aria-label="Projects">
        <ProjectReel still={still} arriving={arriving} />
      </section>
    );
  }

  if (id === "gallery") {
    return (
      <section
        id="gallery"
        className={styles.gallery}
        aria-label="Gallery"
        // The wall's shape, which is what the section's own height is capped by
        // on an upright window — see .gallery.
        style={
          {
            "--wall-aspect": wall.w / wall.h,
            "--wall-pad": WALL_PAD,
          } as React.CSSProperties
        }
      >
        {still ? <PortalWall /> : <GalleryPortals />}
      </section>
    );
  }

  if (id === "bakery") return <BakeryTable still={still} laid={!arriving} />;

  return null;
}

/**
 * The side quests page, which is a page of sections rather than a page: which
 * one is open is the hash and nothing else, the same thing the nav reads to
 * light a tab. No hash at all is Projects, and so is a hash naming no section
 * — Life lately among them, put away while content/posts.ts is still empty.
 *
 * Moving between sections turns the cube they are faces of, the way home turns
 * into publications — see SectionTurn.
 *
 * It is a component rather than markup in the route because the horizontal turn
 * has to draw this page from the other side of the route boundary: it is the
 * face coming round, wherever the turn is played from. On that face the page is
 * a picture of itself, so `still` leaves out the canvases and shows the flat
 * wall and the laid cloth alone — a second WebGL context for three quarters of
 * a second, blank for most of it, is worse than no turn at all. `arriving` is
 * the page as it opens — see Section.
 */
export default function SideQuestsBody({ still = false, arriving = false }: { still?: boolean; arriving?: boolean }) {
  // The default until the browser says otherwise, which is also what the
  // server renders: a hash never reaches it.
  const [section, setSection] = useState(DEFAULT_SECTION);
  const [turn, setTurn] = useState<Turn | null>(null);
  /** The section the page is showing or on its way to. */
  const shown = useRef(DEFAULT_SECTION);
  const mainRef = useRef<HTMLElement>(null);
  const pending = useRef(0);

  useEffect(() => {
    const read = (animate: boolean) => {
      const next = sectionOf(window.location.hash.slice(1));
      const from = shown.current;
      if (next === from) return;
      shown.current = next;
      if (animate && !still && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // The section being left is the one on screen, held as it stands —
        // see freezePage — rather than drawn again from its start. Taken on
        // the next frame, once a scene that draws every frame has drawn.
        const main = mainRef.current;
        cancelAnimationFrame(pending.current);
        pending.current = requestAnimationFrame(() => {
          const held = main ? freezePage(main) : null;
          // Every section starts at its top, so the turn does too.
          window.scrollTo({ top: 0, behavior: "instant" });
          setTurn({ from, to: next, held });
        });
        return;
      }
      cancelAnimationFrame(pending.current);
      setTurn(null);
      setSection(next);
    };
    read(false);
    const onHash = () => read(true);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      cancelAnimationFrame(pending.current);
    };
  }, [still]);

  const land = useCallback(() => {
    setSection(shown.current);
    setTurn(null);
  }, []);

  // Mid-turn the page underneath is empty: the stage covers it, and the live
  // section — a WebGL scene, for two of them — only goes up once it has
  // arrived.
  if (turn) {
    return (
      <main className={styles.body}>
        <SectionTurn
          key={`${turn.from}>${turn.to}`}
          up={SECTIONS.indexOf(turn.to) > SECTIONS.indexOf(turn.from)}
          from={
            turn.held ? (
              <Held frozen={turn.held} />
            ) : (
              <div className={styles.body}>
                <Section id={turn.from} still />
              </div>
            )
          }
          to={
            <div className={styles.body}>
              <Section id={turn.to} still arriving />
            </div>
          }
          onDone={land}
        />
      </main>
    );
  }

  return (
    <main ref={mainRef} className={styles.body}>
      <Section id={section} still={still} arriving={arriving} />
    </main>
  );
}

/** A frozen page, put up where a face of the turn wants it. It places itself:
 *  see freezePage. */
function Held({ frozen }: { frozen: Frozen }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.appendChild(frozen.node);
    frozen.hold();
    return () => frozen.node.remove();
  }, [frozen]);
  return <div ref={ref} />;
}
