/**
 * The nav and the horizontal turn both live in the layout, but the nav is
 * handed to it as children rather than rendered by it, so they talk through
 * this module rather than through context.
 *
 * It also tells the two vertical gestures to stand down: the fold at the foot
 * of the home page and the lift at the top of the publications page both
 * listen on the window, and a turn is not theirs to answer.
 */

type Turn = (href: string) => void;

let turn: Turn | null = null;
let running = false;

/** `PageTurn` registers itself while it is mounted, which is always. */
export const setTurn = (fn: Turn | null) => {
  turn = fn;
};

/** True once the turn has taken the click, so the caller knows not to let the
 *  browser follow the link as well. */
export const startTurn = (href: string) => {
  if (!turn || running) return false;
  turn(href);
  return true;
};

export const setTurning = (on: boolean) => {
  running = on;
};

export const isTurning = () => running;
