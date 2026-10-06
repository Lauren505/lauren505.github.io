"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BakeryTable from "@/components/BakeryTable";
import GalleryPortals from "@/components/GalleryPortals";
import PortalWall from "@/components/PortalWall";
import ProjectReel from "@/components/ProjectReel";
import SectionTurn from "@/components/SectionTurn";
import { WALL_PAD, wall } from "@/content";
import styles from "./SideQuestsBody.module.css";

/** The sections in the order the nav lists them, which is what decides whether
 *  a turn between two rolls up or down. */
const ORDER = ["projects", "gallery", "bakery", "life-lately"];

/** The section with no hash at all — arriving from the nav tab, home or
 *  publications — so the page always opens on something. */
export const DEFAULT_SECTION = "projects";

type Turn = { from: string; to: string; lift: number };

/**
 * One section's contents. `still` is the section as a picture of itself, for
 * the faces of a turn; `laid` is false for a bakery the cloth has not been
 * thrown onto yet — the face a turn arrives on, before the live one throws it.
 */
function Section({ id, still, laid = true }: { id: string; still: boolean; laid?: boolean }) {
  if (id === "projects") {
    return (
      <section id="projects" className={styles.projects} aria-label="Projects">
        <ProjectReel still={still} />
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

  if (id === "bakery") return <BakeryTable still={still} laid={laid} />;

  return null;
}

/**
 * The side quests page, which is a page of sections rather than a page: which
 * one is open is the hash and nothing else, the same thing the nav reads to
 * light a tab. No hash at all is Projects. Projects, Gallery and Bakery have
 * something in them so far — content/posts.ts is still empty — so Life lately
 * is a blank page.
 *
 * Moving between sections turns the cube they are faces of, the way home turns
 * into publications — see SectionTurn.
 *
 * It is a component rather than markup in the route because the horizontal turn
 * has to draw this page from the other side of the route boundary: it is the
 * face coming round, wherever the turn is played from. On that face the page is
 * a picture of itself, so `still` leaves out the canvases and shows the flat
 * wall and the laid cloth alone — a second WebGL context for three quarters of
 * a second, blank for most of it, is worse than no turn at all.
 */
export default function SideQuestsBody({ still = false }: { still?: boolean }) {
  // The default until the browser says otherwise, which is also what the
  // server renders: a hash never reaches it.
  const [section, setSection] = useState(DEFAULT_SECTION);
  const [turn, setTurn] = useState<Turn | null>(null);
  /** The section the page is showing or on its way to. */
  const shown = useRef(DEFAULT_SECTION);

  useEffect(() => {
    const read = (animate: boolean) => {
      const next = window.location.hash.slice(1) || DEFAULT_SECTION;
      const from = shown.current;
      if (next === from) return;
      shown.current = next;
      if (animate && !still && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // Every section starts at its top, so the turn does too: the one being
        // left is drawn from wherever it had been scrolled to — see `lift`.
        const lift = window.scrollY;
        window.scrollTo({ top: 0, behavior: "instant" });
        setTurn({ from, to: next, lift });
        return;
      }
      setTurn(null);
      setSection(next);
    };
    read(false);
    const onHash = () => read(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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
          up={ORDER.indexOf(turn.to) > ORDER.indexOf(turn.from)}
          lift={turn.lift}
          from={
            <div className={styles.body}>
              <Section id={turn.from} still />
            </div>
          }
          to={
            <div className={styles.body}>
              <Section id={turn.to} still laid={false} />
            </div>
          }
          onDone={land}
        />
      </main>
    );
  }

  return (
    <main className={styles.body}>
      <Section id={section} still={still} />
    </main>
  );
}
