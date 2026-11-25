/**
 * What the overall-mark switch card says, in each state it can be in.
 *
 * The switch decides what a form **offers**. A manager's form in a period that
 * weights the Manager appraisal part asks for a mark and needs one **whatever the
 * switch says**, so a card that says "forms do not ask for an overall mark" while
 * the switch is off is making two claims at once, on any server that has the part.
 * Every sentence the card writes about the switch, the line under it and the
 * toast after pressing it, is here, so they cannot disagree. (The card had a
 * line under its title too; the owner asked on 24 Nov 2026 for these pages to
 * say less, and the switch already shows whether it is on.)
 *
 * ## Three states, because "no row" is two different facts
 *
 * What this side knows about the part comes from the weights read, and that read
 * has three outcomes:
 *
 * - **`has`**: the server sent a row for it, under the company's own name. The
 *   exception is real, and every sentence names it.
 * - **`none`**: the weights are in and carry no such row, which is a server that
 *   predates the part. It has no exception, and the sentences are the ones that
 *   were true of every server before it.
 * - **`unknown`**: the weights are not in yet, or could not be read. Nothing is
 *   known, so nothing is said about whether a form asks for a mark or whether the
 *   mark counts. Treating this as `none` printed "is not counted in it" on a
 *   server that has the part, for as long as the read was in flight, and for good
 *   if it failed.
 */

export type ManagerAppraisalPart =
  { state: "has"; label: string } | { state: "none" } | { state: "unknown" };

/**
 * The one line under the switch. It names the exception where the server has
 * the part, and says nothing about it otherwise.
 */
export function overallMarkSwitchNote(part: ManagerAppraisalPart): string {
  const base = "People pick one of the rating names below.";
  if (part.state === "has") {
    return `${base} Managers must give one in a period that weights ${part.label}.`;
  }
  return base;
}

/** The toast after the switch moves. */
export function overallMarkSavedTitle(
  next: boolean,
  part: ManagerAppraisalPart,
): string {
  if (next) return "Overall rating switched on";
  if (part.state === "has") {
    return `Overall rating switched off, except for managers in periods that weight ${part.label}`;
  }
  return "Overall rating switched off";
}
