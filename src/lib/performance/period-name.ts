/**
 * What an appraisal period may be called, and what renaming one means.
 *
 * ## One copy of the rule
 *
 * The API trims the name and refuses one under 3 or over 80 characters
 * (`cycleName` in `modules/performance/schemas.ts`). Both the start-a-period
 * dialog and the rename dialog check it before sending, so the answer arrives
 * while the dialog is open. Two hand-written checks would drift until one
 * accepted a name the other refused.
 *
 * `String.length` counts UTF-16 units, which is how the server counts too.
 *
 * ## What is not checked here
 *
 * Whether the name is already taken. The API says so (`"X" already exists.`)
 * and that sentence is shown as it comes: nothing on this side can see every
 * period, and a pre-check against the list would be wrong the moment somebody
 * else renamed one.
 */

export const PERIOD_NAME_MIN = 3;
export const PERIOD_NAME_MAX = 80;

/** The sentence the start dialog has always used for a name that is too short. */
export const PERIOD_NAME_TOO_SHORT =
  "Name it: people will see this in their inbox.";

/** The server's own sentence for one that is too long. */
export const PERIOD_NAME_TOO_LONG = "That name is too long for a heading.";

/** Why this name cannot be sent, or `null` when it can. */
export function periodNameProblem(name: string): string | null {
  const length = name.trim().length;
  if (length < PERIOD_NAME_MIN) return PERIOD_NAME_TOO_SHORT;
  if (length > PERIOD_NAME_MAX) return PERIOD_NAME_TOO_LONG;
  return null;
}

/**
 * What renaming does, in the words shown under the field.
 *
 * Nothing about the period changes except what it is called, everywhere it is
 * shown. Once it has started, messages already sent carry the name they were
 * sent with: a notification's title is written when it is sent, so renaming
 * cannot reach back into somebody's inbox. Said only then, because a draft has
 * sent nobody anything.
 */
export function renameNote(started: boolean): string {
  const base =
    "People see this name on their form, in their inbox and in reports. Nothing else about the period changes.";
  return started ? `${base} Messages already sent keep the old name.` : base;
}

/** The toast after a rename. The new name is in the detail, where it fits. */
export function renamedToast(name: string): { title: string; detail: string } {
  return { title: "Renamed", detail: `This period is now called ${name}.` };
}
