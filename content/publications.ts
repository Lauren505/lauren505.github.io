import type { StaticImageData } from "next/image";
import aircharge from "./media/papers/aircharge.jpg";
import ecskin from "./media/papers/ecskin.jpg";
import ghostobjects from "./media/papers/ghostobjects.jpg";
import ultrabat from "./media/papers/ultrabat.jpg";
import xoohri from "./media/papers/xoohri.webp";
import sorryimissedthis from "./media/papers/sorryimissedthis.png";
import lowfrictionreview from "./media/papers/lowfrictionreview.png";

export type Publication = {
  year: string;
  title: string;
  authors: string[];
  /** Conference or journal, without the year — "HRI", "UIST Adjunct", … */
  venue: string;
  image: StaticImageData | null;
  /** First link is used as the card's primary link on the home page. */
  links: { label: string; href: string }[];
  /** Shown under "Selected Publications" on the home page. */
  selected?: boolean;
};

// Newest first — both pages render them in this order.
export const publications: Publication[] = [
  {
    year: "2026",
    title:
      "Explainable OOHRI: Communicating Robot Capabilities and Limitations as Augmented Reality Affordances",
    authors: ["Lauren W. Wang", "Mohamed Kari", "Parastoo Abtahi"],
    venue: "HRI",
    image: xoohri,
    links: [
      { label: "Project page", href: "https://xoohri.github.io/" },
      { label: "Paper", href: "https://doi.org/10.1145/3757279.3785569" },
      { label: "Video", href: "https://youtu.be/eFOGPiuS-9Q" },
    ],
    selected: true,
  },
  {
    year: "2026",
    title:
      "SorryIMissedThis: Leveraging Conversation History to Support Sustained Remote Communication",
    authors: ["Jules Oreste Mpano", "Mayan Wasu", "Eshaan Govil", "Ishaan Javali", "Ching-Yi Tsai", "Lauren W. Wang", "Parastoo Abtahi"],
    venue: "CHI EA",
    image: sorryimissedthis,
    links: [
      { label: "Paper", href: "https://doi.org/10.1145/3772363.3799073" },
    ],
    selected: false,
  },
  {
    year: "2026",
    title:
      "Reducing Entry-Point Friction in Review Interface Design: Combating Extreme Review Polarization",
    authors: ["Austin Li", "Shannon Yeow", "Stephanie Oh", "Ishaan Bhagat", "Lauren W. Wang", "Ching-Yi Tsai", "Parastoo Abtahi"],
    venue: "CHI EA",
    image: lowfrictionreview,
    links: [
      { label: "Paper", href: "https://doi.org/10.1145/3772363.3798972" },
    ],
    selected: false,
  },
  {
    year: "2025",
    title:
      "GhostObjects: Instructing Robots by Manipulating Spatially Aligned Virtual Twins in Augmented Reality",
    authors: ["Lauren W. Wang", "Parastoo Abtahi"],
    venue: "UIST Adjunct",
    image: ghostobjects,
    links: [
      { label: "Paper", href: "https://doi.org/10.1145/3746058.3758451" },
      {
        label: "Video",
        href: "https://hci.princeton.edu/wp-content/uploads/sites/459/2025/08/ghost_objects_Poster_demo_lowbitrate.mp4",
      },
    ],
    selected: true,
  },
  {
    year: "2024",
    title: "ECSkin: Tessellating Electrochromic Films for Reconfigurable On-skin Displays",
    authors: ["Pin-Sung Ku", "Shuwen Jiang*", "Wei-Hsin Wang*", "Hsin-Liu Cindy Kao"],
    venue: "IMWUT",
    image: ecskin,
    links: [{ label: "Paper", href: "https://doi.org/10.1145/3659613" }],
  },
  {
    year: "2023",
    title: "AirCharge: Amplifying Ungrounded Impact Force by Accumulating Air Propulsion Momentum",
    authors: [
      "Po-Yu Chen*",
      "Ching-Yi Tsai*",
      "Wei-Hsin Wang*",
      "Chao-Jung Lai",
      "Chia-An Fan",
      "Shih Chin Lin",
      "Chia-Chen Chi",
      "Mike Y. Chen",
    ],
    venue: "UIST",
    image: aircharge,
    links: [
      { label: "Paper", href: "https://doi.org/10.1145/3586183.3606768" },
      {
        label: "Talk",
        href: "https://www.youtube.com/live/8Pzk_2D0Bxo?si=irWOdS9PJtI1c7-e&t=615",
      },
    ],
    selected: true,
  },
  {
    year: "2022",
    title: "UltraBat: An Interactive 3D Side-Scrolling Game Using Ultrasound Levitation",
    authors: ["Wei-Hsin Wang", "Hong-En Chen", "Mike Y. Chen"],
    venue: "UIST Adjunct",
    image: ultrabat,
    links: [
      { label: "Paper", href: "https://doi.org/10.1145/3526114.3561344" },
      { label: "Video", href: "https://www.youtube.com/watch?v=TdXyQqirVXk" },
    ],
  },
];

export const selectedPublications = publications.filter((pub) => pub.selected);

// "HRI 2026", "UIST Adjunct 2025", …
export const venueLine = (pub: Publication) => `${pub.venue} ${pub.year}`;

// Project page if there is one, otherwise the paper.
export const primaryLink = (pub: Publication) => pub.links[0]?.href ?? "/publications";

// Authors matching any of these are bolded (an asterisk marks co-first authorship).
export const SELF_NAMES = ["Lauren W. Wang", "Wei-Hsin Wang"];

export const isSelf = (author: string) => SELF_NAMES.some((name) => author.startsWith(name));
