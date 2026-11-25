/**
 * The lines every setting on Appraisal scoring shares, written once so the
 * cards say the same thing in the same words.
 *
 * The owner asked (24 Nov 2026) for these pages to be short and plain: a title,
 * the control, at most one short line under it, and anything longer behind an
 * info icon. These are the short lines.
 */

/** Somebody who may read a setting but not change it. */
export const READ_ONLY = "Only people who manage settings can change this.";

/** The same, for a card holding several settings. */
export const READ_ONLY_MANY =
  "Only people who manage settings can change these.";

/** The setting's read failed: no control is drawn rather than a guess. */
export const LOAD_FAILED =
  "This setting didn't load. Reload the page to try again.";

/** A server one deploy behind, which does not hold the setting yet. */
export const NOT_ON_SERVER = "This server doesn't offer this setting yet.";

/** No server at all (demo): the setting lives on the server. */
export const NO_SERVER = "This setting is kept on the server.";

/** While the setting is on its way. */
export const LOADING = "Loading…";

/** When a change takes effect, for settings frozen onto a period. */
export const NEXT_PERIOD = "Applies to the next period you start.";
