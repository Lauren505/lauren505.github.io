import { getImageProps, type StaticImageData } from "next/image";

/**
 * A paper's picture, as the home page's cards and the publications rows both
 * draw it: resized for the width it is shown at rather than sent whole.
 *
 * One set of props for both, so a card and the row it flies into on the fold
 * ask for the same file, and the row has it already when the card lands. Eager,
 * because the rows inside the fold are off-screen until the turn runs, and a
 * lazy picture would only start loading as it came round.
 */
const SIZES = "(max-width: 640px) 100vw, 26rem";

export const thumbProps = (image: StaticImageData, alt: string) =>
  getImageProps({ src: image, alt, sizes: SIZES, loading: "eager" }).props;
