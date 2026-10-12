/**
 * The side quests page's sections, by the names their hashes use, in the order
 * the nav lists them — which is also what decides whether a turn between two
 * rolls up or down. Kept apart from the page itself so the nav can read them
 * without bringing the page along: the nav is on every page of the site.
 */
export const SECTIONS = ["projects", "gallery", "bakery"];

/** The section with no hash at all — arriving from the nav tab, home or
 *  publications — so the page always opens on something. */
export const DEFAULT_SECTION = "projects";

/** The section a hash names — or, for no hash or one naming nothing here
 *  (Life lately, put away until there is something in it), the default. */
export const sectionOf = (hash: string) => (SECTIONS.includes(hash) ? hash : DEFAULT_SECTION);
