import { getImageProps } from "next/image";
import RichText from "@/components/RichText";
import { LinkedIn, Mail, Scholar, Twitter } from "@/components/Icons";
import { bio, news, profile } from "@/content";
import styles from "@/app/page.module.css";

// How many of content/news.ts (newest first) the home page shows.
const NEWS_SHOWN = 2;

// The portrait, resized for the width it is seen at: the frame is --side-w
// wide and the photo is zoomed 1.7 times inside it (see .photoFrame), so it
// shows about 34rem of picture. It is the first thing the page draws, so it
// asks to be fetched first.
const portrait = profile.photo
  ? getImageProps({
      src: profile.photo,
      alt: `${profile.firstName} ${profile.lastName}`,
      sizes: "34rem",
      quality: 85,
      loading: "eager",
      fetchPriority: "high",
    }).props
  : null;

// Everything on the home page above the cube. Nothing here moves during the
// turn, so it is plain presentational markup.
export default function HomeBody() {
  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        {/* Photo, links and news share one column, so they share one width. */}
        <div className={styles.side}>
          {/* The frame does the cropping; see --photo-zoom in page.module.css. */}
          <div className={styles.photoFrame}>
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt is in portrait
              <img {...portrait} className={styles.photo} />
            ) : null}
          </div>

          <div className={styles.socials}>
            {profile.links.linkedin ? (
              <a href={profile.links.linkedin} aria-label="LinkedIn">
                <LinkedIn />
              </a>
            ) : null}
            {profile.links.scholar ? (
              <a href={profile.links.scholar} aria-label="Google Scholar">
                <Scholar />
              </a>
            ) : null}
            {profile.links.twitter ? (
              <a href={profile.links.twitter} aria-label="Twitter">
                <Twitter />
              </a>
            ) : null}
            {/* One link around both the icon and the address: hovering either
                highlights the pair. */}
            <a className={styles.email} href={`mailto:${profile.email}`}>
              <Mail />
              <span>{profile.email}</span>
            </a>
          </div>

          <h2 className={styles.sectionTitle}>News</h2>
          {/* The last line above the fold's edge. */}
          <div className={styles.news} data-fold-seam-above>
            {news.slice(0, NEWS_SHOWN).map((item, i) => (
              <div key={i} style={{ display: "contents" }}>
                <span className={styles.newsDate}>{item.date}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.lead}>
          <h1 className={styles.name}>
            <strong>{profile.firstName}</strong> {profile.lastName}
          </h1>
          <p className={styles.tagline}>{profile.tagline}</p>

          <div className={styles.bio}>
            {bio.map((paragraph, i) => (
              <p key={i}>
                <RichText text={paragraph} />
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
