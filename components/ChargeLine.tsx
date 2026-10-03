import styles from "./PageFold.module.css";

/** The line's shape: flat at both ends, diving to a point in the middle. One
 *  `d` for all three strokes, so they lie exactly on top of each other. */
const D = "M2 4 C 70 4 110 26 120 56 C 130 26 170 4 238 4";

/**
 * The charge: a small chevron under (or over) the handle's label that fills as
 * the pull builds and is full at the moment the turn takes over. It is the
 * only thing that says how much of the gesture is left, now that the fold's
 * own rotation is the page rather than a picture of it.
 *
 * Two colours and nothing else: the line stands in the lighter orange, and the
 * darker one travels along it as the reader scrolls.
 *
 * `--pull`, 0 to 1, is read from whatever contains it — see PageFold's paint()
 * and PageLift's ease(). The fill is `stroke-dashoffset` on a path measured as
 * 1 unit long, so it is drawn from the start of the line to exactly that
 * fraction of it, whatever the line's size on screen.
 */
export default function ChargeLine({ up }: { up?: boolean }) {
  return (
    <svg
      className={up ? `${styles.line} ${styles.lineUp}` : styles.line}
      viewBox="0 0 240 60"
      aria-hidden
    >
      {/* The line, and the darker colour travelling along it. */}
      <path className={styles.track} d={D} />
      <path className={styles.charge} d={D} pathLength={1} />
    </svg>
  );
}
