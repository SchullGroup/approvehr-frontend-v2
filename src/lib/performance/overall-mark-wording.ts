/**
 * What the overall-mark switch card says, in each state it can be in.
 *
 * The switch decides what a form **offers**. A manager's form in a period that
 * weights the Manager appraisal part asks for a mark and needs one **whatever the
 * switch says**, so a card that says "forms do not ask for an overall mark" while
 * the switch is off is making two claims at once, on any server that has the part.
 * Every sentence the card writes about the switch, the header, the line under it
 * and the toast after pressing it, is here, so they cannot disagree.
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

/** The line under the card's title, from what the company has set. */
export function overallMarkHeader(
  on: boolean | null,
  part: ManagerAppraisalPart,
): string {
  if (on === true)
    return "Each form ends with a page asking for one overall mark.";
  if (on === false && part.state === "has") {
    return `Forms do not ask for an overall mark, except a manager's form in a period that weights ${part.label}. Otherwise the answers stand on their own.`;
  }
  if (on === false && part.state === "none") {
    return "Forms do not ask for an overall mark. The answers stand on their own.";
  }
  /* Not said by the server, or off with nothing known about the part: whether a
     form asks is not something this side can claim. */
  return "Whether each form ends with a page asking for one overall mark.";
}

/** The line under the switch itself. */
export function overallMarkSwitchNote(part: ManagerAppraisalPart): string {
  const base = "The person picks one of the names below after the questions.";
  if (part.state === "has") {
    return `${base} It is optional, except for managers in a period that weights ${part.label}: they have to give one.`;
  }
  if (part.state === "none") {
    return `${base} It is optional. A manager's overall mark is shown beside the score and is not counted in it.`;
  }
  return base;
}

/** The toast's title after the switch has been pressed and saved. */
export function overallMarkSavedTitle(
  next: boolean,
  part: ManagerAppraisalPart,
): string {
  if (next) return "Appraisal forms will end with an overall mark";
  if (part.state === "has") {
    return `Appraisal forms will not ask for an overall mark, except a manager's form in a period that weights ${part.label}`;
  }
  if (part.state === "none") {
    return "Appraisal forms will not ask for an overall mark";
  }
  return "Overall mark switched off";
}
