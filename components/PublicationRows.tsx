"use client";

import { useMemo, useState } from "react";
import Tags from "@/components/Tag";
import { isSelf, venueLine, type Publication } from "@/content";
import styles from "./PublicationRows.module.css";

type Props = {
  items: Publication[];
  /** Inside the home page's fold: the titles of the cards that fly into these
      rows, in card order. A row named here becomes a landing slot — measured,
      hidden, and covered by the flying card. A row not named has no card on
      the home page, so it fades in with the turn instead. */
  cards?: string[];
};

/** Which run of same-year entries each row belongs to. The list is in year
 *  order, so a run is simply a stretch of neighbours. */
function runsOf(items: Publication[]) {
  let run = -1;
  return items.map((pub, i) => {
    if (i === 0 || items[i - 1].year !== pub.year) run += 1;
    return run;
  });
}

export default function PublicationRows({ items, cards }: Props) {
  const [active, setActive] = useState(0);
  const folding = cards !== undefined;
  const run = useMemo(() => runsOf(items), [items]);

  return (
    <div className={[styles.rows, folding ? styles.slots : ""].filter(Boolean).join(" ")}>
      {items.map((pub, i) => {
        const slot = cards ? cards.indexOf(pub.title) : -1;
        const cls = (base: string, marked: string) =>
          [base, slot >= 0 ? marked : ""].filter(Boolean).join(" ");
        // Where this row sits in its run of same-year entries, which is what
        // the year column draws: a line strung through the run, ending at the
        // rows on either end of it.
        const first = i === 0 || run[i - 1] !== run[i];
        const last = i === items.length - 1 || run[i + 1] !== run[i];
        const place = first && last ? "solo" : first ? "start" : last ? "end" : "mid";
        // One year to a run, on the row being read — or on the first of the
        // run, when the row being read is somewhere else. The rest are circles.
        const says = run[i] === run[active] ? i === active : first;
        return (
        <div
          key={pub.title}
          className={styles.row}
          data-active={active === i}
          data-extra={folding && slot < 0 ? true : undefined}
          onMouseEnter={() => setActive(i)}
          onFocus={() => setActive(i)}
        >
          {/* Still spoken on every row: it is only the ink that is shared. */}
          <span className={styles.year} data-run={place} data-says={says}>
            <span className={styles.yearText}>{pub.year}</span>
            <span className={styles.railUp} aria-hidden />
            <span className={styles.railDown} aria-hidden />
            <span className={styles.dot} aria-hidden />
          </span>

          <button
            type="button"
            className={styles.figure}
            aria-label={`Highlight ${pub.title}`}
            onClick={() => setActive(i)}
          >
            {pub.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={cls(styles.image, styles.slot)}
                data-flip-to={slot >= 0 ? `img-${slot}` : undefined}
                /* Inside the fold these rows are off-screen until the turn
                   runs, so they queue behind what the page is showing now. */
                fetchPriority={folding && slot < 0 ? "low" : undefined}
                src={pub.image.src}
                width={pub.image.width}
                height={pub.image.height}
                alt={pub.title}
              />
            ) : (
              <span className={styles.image} />
            )}
            <span className={styles.brackets} aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>

          <div className={styles.details}>
            <h2
              className={cls(styles.title, styles.lateSlot)}
              data-flip-to={slot >= 0 ? `title-${slot}` : undefined}
            >
              {pub.title}
            </h2>
            <p className={styles.authors}>
              {pub.authors.map((author, j) => (
                <span key={j} className={isSelf(author) ? styles.self : undefined}>
                  {author}
                  {j < pub.authors.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
            <p
              className={cls(styles.venue, styles.lateSlot)}
              data-flip-to={slot >= 0 ? `venue-${slot}` : undefined}
            >
              {venueLine(pub)}
            </p>
            <Tags
              links={pub.links}
              className={cls(styles.tags, styles.lateSlot)}
              flipTo={slot >= 0 ? `tags-${slot}` : undefined}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}
