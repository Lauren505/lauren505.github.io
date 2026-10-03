import Image from "next/image";
import { CUE, CUE_NARROW, portals as hung, wall as hungWall, WALL_PAD, type Portal, type Wall } from "@/content";
import styles from "./PortalWall.module.css";

/**
 * The wall, flat: every frame at the place the scene hangs it, drawn in HTML.
 *
 * It is not a fallback so much as the first frame of the thing. The scene fits
 * `wall` into the window and every frame sits on the z = 0 plane, so the
 * perspective camera scales them all by one number — which means this markup,
 * fitting the same rectangle into the same box, lands them in exactly the same
 * pixels. It is what the server renders, what the sideways turn carries round
 * on its far face, and what the canvas fades up over once WebGL has something
 * to show. A film is its still here, and a room is a still of it, or its wall
 * colour until it has one.
 */
export default function PortalWall({
  dim,
  portals = hung,
  wall = hungWall,
}: {
  dim?: boolean;
  /** The frames and their rectangle — the saved ones unless the editor is
   *  showing a draft. */
  portals?: Portal[];
  wall?: Wall;
}) {
  return (
    <div
      className={styles.wall}
      data-dim={dim || undefined}
      style={
        {
          "--wall-aspect": wall.w / wall.h,
          "--wall-pad": WALL_PAD,
          "--wall-w": wall.w,
          "--cue": CUE,
          "--cue-narrow": CUE_NARROW,
        } as React.CSSProperties
      }
    >
      <div className={styles.frames}>
        {portals.map((p) => (
          <figure
            key={p.id}
            className={styles.frame}
            style={{
              left: `${((p.x - p.w / 2 - wall.l) / wall.w) * 100}%`,
              top: `${((wall.t - (p.y + p.h / 2)) / wall.h) * 100}%`,
              width: `${(p.w / wall.w) * 100}%`,
              height: `${(p.h / wall.h) * 100}%`,
              background: p.bg,
            }}
          >
            {p.image ? (
              <Image
                className={styles.art}
                src={p.image}
                alt={p.title}
                sizes="(max-width: 760px) 50vw, 30vw"
                // The crop: the scene's `cover`, as CSS.
                style={
                  p.focus || p.zoom
                    ? {
                        objectPosition: `${(p.focus?.[0] ?? 0.5) * 100}% ${(p.focus?.[1] ?? 0.5) * 100}%`,
                        transform: p.zoom && p.zoom !== 1 ? `scale(${p.zoom})` : undefined,
                        transformOrigin: `${(p.focus?.[0] ?? 0.5) * 100}% ${(p.focus?.[1] ?? 0.5) * 100}%`,
                      }
                    : undefined
                }
              />
            ) : null}
          </figure>
        ))}

        {/* The rooms' captions, at the bottom left corner of each — the same
            corner the scene pins its own to, so the one is under the other. */}
        {portals
          .filter((p) => p.model)
          .map((p) => (
            <span
              key={p.id}
              className={styles.cue}
              style={{
                left: `${((p.x - p.w / 2 - wall.l) / wall.w) * 100}%`,
                top: `${((wall.t - (p.y - p.h / 2)) / wall.h) * 100}%`,
              }}
            >
              <span className={styles.label}>
                <span className={styles.fine}>double-click to step in</span>
                <span className={styles.coarse}>double-tap to enter</span>
              </span>
            </span>
          ))}
      </div>
    </div>
  );
}
