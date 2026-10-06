"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { canRollDown, requestRollUp, startRollDown } from "@/components/foldSignal";
import { DEFAULT_SECTION } from "@/components/SideQuestsBody";
import { startTurn } from "@/components/turnSignal";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/publications", label: "Publications" },
  { href: "/side-quests", label: "Side quests" },
];

/** The side quests page's own sections. They stand beside its tab, and only
 *  while that tab is the page: everywhere else there is nothing to the right of
 *  it but window, and nothing they would mean. */
const SUBS = ["Projects", "Gallery", "Bakery", "Life lately"];
const slug = (label: string) => label.toLowerCase().replace(/\s+/g, "-");

const HOME = "/";
const PUBS = "/publications";
const SIDE = "/side-quests";

/** How long to let a scroll-to-top settle before turning, when the browser
 *  can't tell us. */
const SCROLL_CAP = 520;

// `current` lets the fold render the nav in its destination state while the
// home route is still mounted.
export default function Nav({ current }: { current?: string }) {
  const live = usePathname();
  const router = useRouter();
  const pathname = current ?? live;
  // A copy inside the fold's stage is a picture of the nav, not the nav.
  const frozen = current !== undefined;

  useEffect(() => {
    if (frozen) return;
    if (live === PUBS) router.prefetch(HOME);
  }, [frozen, live, router]);

  /**
   * The three pages are faces of the same cube, so moving between them turns
   * rather than navigates: home and publications fold along the line between
   * News and Selected Publications, and side quests hangs off the vertical
   * line between the two tabs below, so it turns sideways instead.
   *
   * Home -> publications runs in place. The other three have to change route
   * in the middle of the turn, each through its own channel — see foldSignal
   * and turnSignal.
   */
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (frozen) {
        e.preventDefault();
        return;
      }
      // Let the browser have modified clicks: they open tabs, not turns.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // Exactly one end is side quests: that is the sideways turn, whichever
      // way round it is. Both ends of it are ordinary pages otherwise.
      if ((href === SIDE) !== (live === SIDE)) {
        if (startTurn(href)) e.preventDefault();
        return;
      }

      if (live === HOME && href === PUBS && canRollDown()) {
        e.preventDefault();
        startRollDown();
        return;
      }

      if (live === PUBS && href === HOME) {
        e.preventDefault();
        requestRollUp();
        // The cube's other face is the top of the list, so start there.
        if (window.scrollY <= 0) {
          router.push(HOME);
          return;
        }
        let gone = false;
        const go = () => {
          if (gone) return;
          gone = true;
          window.removeEventListener("scrollend", go);
          router.push(HOME);
        };
        window.addEventListener("scrollend", go);
        setTimeout(go, SCROLL_CAP);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [frozen, live, router],
  );

  // On side quests the whole row of tabs stands in the left margin instead —
  // see .atSide. The turn slides it there, and this is where it lands.
  const atSide = pathname === SIDE;

  // Which section of side quests is open, which is the hash and nothing else:
  // they are places on one page, so there is no route to read it from. No hash
  // is the default section, which is also what the server renders.
  const [section, setSection] = useState(DEFAULT_SECTION);
  // Before paint, so the turn's copy is never drawn lighting the wrong one.
  useLayoutEffect(() => {
    if (!atSide) return;
    const read = () => setSection(window.location.hash.slice(1) || DEFAULT_SECTION);
    read();
    // A picture of the nav — the turn's copy — lights the section the page is
    // on as it is taken, and keeps it.
    if (frozen) return;
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [frozen, atSide]);

  const tab = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        // The pseudo-element copy of the label reserves the width of the
        // widest (active) state so neighbours don't shift on hover.
        data-label={label}
        // The sideways turn creases between these two tabs.
        data-turn-seam-left={href === PUBS ? "" : undefined}
        data-turn-seam-right={href === SIDE ? "" : undefined}
        className={styles.link}
        data-active={active}
        aria-current={active ? "page" : undefined}
        onClick={(e) => onClick(e, href)}
      >
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <header className={atSide ? `${styles.header} ${styles.atSide}` : styles.header}>
      <div className={styles.rail}>
        <nav className={styles.nav}>
          {LINKS.slice(0, -1).map(tab)}

          {/* Everything past the column's right edge: the side quests tab, and
              — once side quests is the page — its own sections after it. */}
          <div className={styles.hang}>
            {tab(LINKS[LINKS.length - 1])}

            {atSide ? (
              <div className={styles.subs}>
                {SUBS.map((label) => (
                  <a
                    key={label}
                    href={`#${slug(label)}`}
                    data-label={label}
                    className={styles.link}
                    data-active={section === slug(label)}
                  >
                    <span>{label}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
