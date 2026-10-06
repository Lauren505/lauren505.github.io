/**
 * A picture of part of the live page, exactly as it stands: a copy of its DOM
 * with every canvas painted in from the one it copies, and every animation
 * held at the point the original had reached. Mounting a component again
 * would play everything from the start — the reel arriving, the plates
 * sliding in — and draw the gallery as its flat wall; this is what is on the
 * screen, stopped.
 *
 * Take it inside a requestAnimationFrame callback. A WebGL canvas only has a
 * picture to copy between being drawn and being shown, and a scene that draws
 * every frame has drawn this one by the time a callback registered since the
 * last frame runs.
 */
export type Frozen = {
  node: HTMLElement;
  /** Holds the copy's animations where the original's were. Call it once the
   *  copy is in the document: an element only has animations once it has
   *  style. */
  hold: () => void;
};

export function freezePage(root: HTMLElement): Frozen {
  const live = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const node = root.cloneNode(true) as HTMLElement;
  const copies = [node, ...node.querySelectorAll<HTMLElement>("*")];

  // Pinned where the original sits in the window, so the copy shows whatever
  // the reader had scrolled to.
  const rect = root.getBoundingClientRect();
  Object.assign(node.style, {
    position: "absolute",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    margin: "0",
  });

  live.forEach((el, i) => {
    const copy = copies[i];
    // The page is still there under its copy, and its ids belong to it.
    copy.removeAttribute("id");
    if (el instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
      copy.width = el.width;
      copy.height = el.height;
      try {
        copy.getContext("2d")?.drawImage(el, 0, 0);
      } catch {
        // An empty canvas has nothing to copy.
      }
    } else if (copy instanceof HTMLImageElement) {
      // Already loaded on the page; a lazy copy would wait to be scrolled to.
      copy.loading = "eager";
    }
  });

  // Where each CSS animation had got to, by element and name.
  const at = new Map<HTMLElement, number>(live.map((el, i) => [el, i]));
  const times = new Map<string, CSSNumberish | null>();
  const key = (i: number, pseudo: string | null, name: string) => `${i}|${pseudo ?? ""}|${name}`;
  for (const a of root.getAnimations({ subtree: true })) {
    if (!(a instanceof CSSAnimation)) continue;
    const effect = a.effect as KeyframeEffect | null;
    const i = effect?.target ? at.get(effect.target as HTMLElement) : undefined;
    if (i === undefined) continue;
    times.set(key(i, effect!.pseudoElement, a.animationName), a.currentTime);
  }

  const hold = () => {
    const index = new Map<HTMLElement, number>(copies.map((el, i) => [el, i]));
    for (const a of node.getAnimations({ subtree: true })) {
      a.pause();
      if (!(a instanceof CSSAnimation)) continue;
      const effect = a.effect as KeyframeEffect | null;
      const i = effect?.target ? index.get(effect.target as HTMLElement) : undefined;
      const t = i === undefined ? undefined : times.get(key(i, effect!.pseudoElement, a.animationName));
      // No match means the original had finished it, and nothing else is
      // still running: send it to its end.
      try {
        if (t === undefined || t === null) a.finish();
        else a.currentTime = t;
      } catch {
        // An endless one has no end to go to: it stays paused where it is.
      }
    }
  };

  return { node, hold };
}
