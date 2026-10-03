/**
 * The nav and the fold live on opposite sides of the route boundary, so they
 * talk through this module. It is plain module state, which survives a
 * client-side navigation because the JS context does.
 *
 * Down (home -> publications) happens in place: the fold is already mounted,
 * so the nav just asks it to run.
 *
 * Up (publications -> home) cannot, because the fold's geometry only exists
 * where the home page is laid out. So the nav navigates first and leaves a
 * note; the fold reads it on mount, jumps to the bottom of the page and plays
 * the turn backwards from there.
 */

type Trigger = () => void;

let rollDown: Trigger | null = null;

/** The fold registers itself while it is mounted. */
export const setRollDown = (fn: Trigger | null) => {
  rollDown = fn;
};

export const canRollDown = () => rollDown !== null;

export const startRollDown = () => {
  if (!rollDown) return false;
  rollDown();
  return true;
};

let rollUpPending = false;

export const requestRollUp = () => {
  rollUpPending = true;
};

export const pendingRollUp = () => rollUpPending;

/** Torn up once the turn is actually under way, never merely on being read —
 *  a mount that gets thrown away again must still find the note. */
export const clearRollUp = () => {
  rollUpPending = false;
};
