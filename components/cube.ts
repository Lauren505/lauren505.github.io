/**
 * What the three turns of the site's cube have in common — the vertical fold
 * between home and publications (PageFold), the sideways turn to side quests
 * (PageTurn) and the turns between side quests' sections (SectionTurn) — so
 * that they read as one cube turning, whichever face is coming round.
 */

export const DEG = Math.PI / 180;

/** How long a turn takes, in milliseconds. */
export const TURN_MS = 760;

/** How far the camera sits from the page, as a multiple of the turning face's
 *  size — so the convergence looks the same whatever the window's. */
const CAMERA = 2.9;

/** The camera's distance for a face of this size, in pixels. */
export const cameraFor = (face: number) => Math.max(1200, face * CAMERA);

/** How far the face coming round tips away from the reader at the middle of
 *  the turn, in degrees. Nothing at either end, where it has a real page to
 *  match. */
export const TILT = 11;

/** Smoothstep. A cubic ease-in-out spends its first hundred milliseconds
 *  barely moving, which on a click reads as the page having ignored you; this
 *  is symmetric and just as smooth at both ends but leaves the mark far
 *  sooner. */
export const easeInOut = (t: number) => t * t * (3 - 2 * t);
