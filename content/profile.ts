import portrait from "./media/prof_pic.jpg";

export const profile = {
  firstName: "Lauren",
  lastName: "W. Wang",
  tagline: "Princeton CS PhD candidate | HCI researcher",
  email: "wlauren@princeton.edu",
  photo: portrait,
  links: {
    // NOTE: the archived _config.yml stored a display name, not a profile slug,
    // so this URL is a guess — replace with the real linkedin.com/in/<slug>.
    linkedin: "https://www.linkedin.com/in/lauren-w-wang-aa9b39217/",
    // The archive had no Google Scholar ID; paste yours in to show the icon.
    scholar: "https://scholar.google.com/citations?user=xZdPffUAAAAJ&hl=en",
    twitter: "https://twitter.com/LaurenW505",
  },
};

// One string per paragraph. [label](https://url) becomes a link — see
// components/RichText.tsx.
export const bio = [
  "Hi! I am a 3rd year Computer Science PhD student doing research with the [Princeton HCI Group](https://hci.princeton.edu/), advised by [Prof. Parastoo Abtahi](https://parastooabtahi.com/). I completed my undergrad in [Electrical Engineering](https://web.ee.ntu.edu.tw/) at the [National Taiwan University](https://www.ntu.edu.tw/).",
  "My research explores augmented reality (AR) as a bridge between people and intelligent systems, through work in human-robot interaction (HRI) and generative AI for 3D/4D scene editing. I design embodied, multimodal interfaces that help users express complex and spatial intent while providing in-situ feedback that makes AI systems more explainable and controllable. Grounded in theories of human behavior and cognition, my work seeks to translate these principles into immersive systems with real-world impact. I am grateful for the [Grace Hopper Scholarship](https://ghc.anitab.org/) and the Yu-Lin Scholarship support.",
  "In my free time, I enjoy drawing, baking, and 3D art :)",
];
