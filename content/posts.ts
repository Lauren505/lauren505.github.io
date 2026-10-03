import type { StaticImageData } from "next/image";

export type Post = {
  title: string;
  date: string;
  /** Paragraphs; [label](https://url) becomes a link. */
  body: string[];
  image: StaticImageData | null;
  links?: { label: string; href: string }[];
};

// Nothing here yet — the Side quests page is intentionally empty. Drop images
// in content/media/posts/ and import them here when you start filling it in.
export const posts: Post[] = [];
