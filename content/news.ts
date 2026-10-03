export type NewsItem = {
  date: string;
  text: string;
};

// Newest first.
export const news: NewsItem[] = [
  {
    date: "Mar 12, 2026",
    text: "Visiting Edinburgh next week! I will present X-OOHRI at HRI.",
  },
  {
    date: "Sep 27, 2025",
    text: "Flying to Busan! I will present GhostObjects at UIST.",
  },
  {
    date: "Oct 30, 2023",
    text: "Presented AirCharge at UIST. Talk available now!",
  },
];
