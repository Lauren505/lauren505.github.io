"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { LABEL_H, LABEL_W, labelOf, type Portal } from "@/content";

/**
 * A wall label: a slip of card beside the frame, the way a museum hangs one,
 * with the title, a line for what it is made with, and a paragraph about it.
 *
 * Set in the page's own face, at a size that reads once you have walked up to
 * it — the label is about fifty pixels wide with the whole wall in view, and
 * is meant to be read zoomed in, which is what double-clicking the artwork
 * does. The type is drawn onto a canvas large enough to stay sharp there.
 *
 * It is mounted on a thin board, so it stands a little off the wall and the
 * light from above draws a hairline of shadow under it. The card itself is not
 * lit, like the artworks, so it is the colour of paper whatever the light.
 */

/** Pixels the card is drawn across. */
const PX = 1200;
const BOARD = 0.012;

/** Words broken into lines that fit `width` in the canvas's current font. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.push("");
  }
  lines.pop();
  return lines;
}

/** The card, drawn: margins of a museum label, the title in the heavier
 *  weight, and the rest smaller under a short rule. The paragraph is set
 *  smaller still until it fits. */
function drawCard(p: Pick<Portal, "title" | "medium" | "about">, family: string) {
  const W = PX;
  const H = Math.round((PX * LABEL_H) / LABEL_W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#f7f4ee";
  g.fillRect(0, 0, W, H);

  const m = W * 0.075;
  const inner = W - 2 * m;
  let y = m;
  g.textBaseline = "top";
  g.fillStyle = "#1b1814";

  g.font = `600 ${W * 0.074}px ${family}`;
  for (const line of wrap(g, p.title, inner)) {
    g.fillText(line, m, y);
    y += W * 0.088;
  }

  if (p.medium) {
    g.fillStyle = "#4a443c";
    g.font = `400 ${W * 0.05}px ${family}`;
    y += W * 0.008;
    for (const line of wrap(g, p.medium, inner)) {
      g.fillText(line, m, y);
      y += W * 0.064;
    }
  }

  y += W * 0.03;
  g.fillStyle = "#1b1814";
  g.fillRect(m, y, W * 0.08, Math.max(2, W * 0.003));
  y += W * 0.035;

  if (p.about) {
    g.fillStyle = "#2a2621";
    for (let size = 0.04; size > 0.018; size -= 0.002) {
      g.font = `400 ${W * size}px ${family}`;
      const lines = wrap(g, p.about, inner);
      const lead = W * size * 1.32;
      if (y + lines.length * lead <= H - m * 0.8 || size <= 0.02) {
        let ly = y;
        for (const line of lines) {
          if (ly + lead > H - m * 0.4) break;
          g.fillText(line, m, ly);
          ly += lead;
        }
        break;
      }
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The page's own type, once it has loaded: the canvas is drawn with whatever
 *  is there when it is drawn, which before then is a fallback. */
function useFamily() {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => {
      if (live) setFamily(getComputedStyle(document.body).fontFamily || "sans-serif");
    });
    return () => {
      live = false;
    };
  }, []);
  return family;
}

/** The card is drawn as it is, like the artworks — unlit, so it reads as the
 *  paper it is in any light — with its edges a shade darker than its face. */
const edge = new THREE.MeshBasicMaterial({ color: "#dcd5c9", toneMapped: false });

export function WallLabel({ p }: { p: Portal }) {
  const box = labelOf(p);
  const family = useFamily();
  const [face, setFace] = useState<THREE.MeshBasicMaterial | null>(null);

  useEffect(() => {
    if (!family) return;
    const map = drawCard(p, family);
    const m = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    setFace(m);
    return () => {
      map.dispose();
      m.dispose();
    };
  }, [family, p.title, p.medium, p.about]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!box || !face) return null;
  return (
    <mesh
      position={[box.x, box.y, BOARD / 2]}
      // Casts its hairline of shadow down the wall.
      castShadow
      raycast={() => null}
      // A box's faces are right, left, top, bottom, front, back.
      material={[edge, edge, edge, edge, face, edge]}
    >
      <boxGeometry args={[LABEL_W, LABEL_H, BOARD]} />
    </mesh>
  );
}
