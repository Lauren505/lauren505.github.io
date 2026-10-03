import PublicationRows from "@/components/PublicationRows";
import Tags from "@/components/Tag";
import { primaryLink, publications, selectedPublications, venueLine } from "@/content";
import pageStyles from "@/app/page.module.css";
import listStyles from "@/components/PublicationList.module.css";
import styles from "./PublicationsMorph.module.css";

/**
 * The block below the fold's edge. At rest it is the Selected Publications
 * block, unchanged. As the fold turns it rearranges into the publications
 * page's layout: the heading drops the word "Selected", the card images fly to
 * the row slots, the captions fade out and the row details fade in.
 *
 * Both layouts are in the DOM the whole time — the cards in flow, the rows laid
 * out but collapsed — so the flight has real geometry to measure on both ends.
 */
export default function PublicationsMorph() {
  return (
    <div className={styles.panel}>
      <div className={styles.cardsLayer}>
        <div className={pageStyles.column}>
          {/* The first line below the fold's edge. */}
          <h2
            className={`${pageStyles.sectionTitle} ${styles.flyText}`}
            data-flip="heading"
            data-fold-seam-below
          >
            <span className={styles.word} data-fold-word>Selected </span>
            <span className={styles.wordRest}>Publications</span>
          </h2>

          <div className={pageStyles.cards}>
            {selectedPublications.map((pub, i) => (
              <article key={pub.title} className={pageStyles.card}>
                <a href={primaryLink(pub)} className={pageStyles.cardMedia} aria-label={pub.title}>
                  {pub.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={`${pageStyles.cardImage} ${styles.flyer}`}
                      data-flip={`img-${i}`}
                      src={pub.image.src}
                      width={pub.image.width}
                      height={pub.image.height}
                      alt={pub.title}
                    />
                  ) : (
                    <span className={pageStyles.cardImage} />
                  )}
                  <span className={pageStyles.cardFrame} aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                </a>

                <h3
                  className={`${pageStyles.cardTitle} ${styles.flyLate}`}
                  data-flip={`title-${i}`}
                  data-flip-mode="text"
                >
                  <a href={primaryLink(pub)}>{pub.title}</a>
                </h3>
                <p
                  className={`${pageStyles.cardVenue} ${styles.flyLate}`}
                  data-flip={`venue-${i}`}
                  data-flip-mode="text"
                >
                  {venueLine(pub)}
                </p>
                <Tags
                  links={pub.links}
                  small
                  className={`${pageStyles.cardTags} ${styles.flyLate}`}
                  flip={`tags-${i}`}
                />
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* The publications page, laid out with its own classes so the turn ends
          exactly where the real page begins. It lists everything, not just the
          selected few: the extra rows fade in as the face comes round, so the
          hand-off in either direction has nothing left to reconcile. */}
      <div className={styles.rowsLayer} aria-hidden>
        <div className={listStyles.list}>
          <h2 className={`${listStyles.heading} ${styles.slotText}`} data-flip-to="heading">
            Publications
          </h2>
          <PublicationRows
            items={publications}
            cards={selectedPublications.map((pub) => pub.title)}
          />
        </div>
      </div>
    </div>
  );
}
