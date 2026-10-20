/**
 * What a stage is for.
 *
 * A stage has a name the company chooses ("Phone chat", "Case study") and a
 * **type** the rules read. The name is for people; the type is how the product
 * knows that an interview stage can ask for scorecards, that nobody is hired by
 * dragging a card, and that a pipeline needs somewhere for a decision to land.
 *
 * No React, no state: the words and the three questions the screens ask of a
 * type, in one place so the template editor, the requisition's stage list and
 * the board cannot describe the same type three ways.
 */

export type StageType =
  | "APPLIED"
  | "SCREENING"
  | "TEST"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED";

export const STAGE_TYPES: readonly StageType[] = [
  "APPLIED",
  "SCREENING",
  "TEST",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
];

export const STAGE_TYPE_LABEL: Record<StageType, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  TEST: "Test",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

/** One plain sentence per type, shown beside the type picker. */
export const STAGE_TYPE_HELP: Record<StageType, string> = {
  APPLIED:
    "Where a new applicant lands. A pipeline has one, and it comes first.",
  SCREENING: "Reading applications and CVs, or a first call.",
  TEST: "A written test, an assessment or a take-home task.",
  INTERVIEW: "Meeting the panel. Interviews and scorecards belong here.",
  OFFER: "An offer is being prepared, approved or is out.",
  HIRED:
    "Offer accepted. Nobody is dragged here: accepting an offer puts them here.",
  REJECTED:
    "Not taken forward, or withdrew. Moving somebody here rejects them.",
};

/** A stage somebody leaves the process in, rather than passes through. */
export const isTerminalType = (type: StageType | null | undefined): boolean =>
  type === "HIRED" || type === "REJECTED";

/** Only an interview can wait for scorecards before someone leaves it. */
export const canRequireScorecards = (
  type: StageType | null | undefined,
): boolean => type === "INTERVIEW";

export const isStageType = (value: unknown): value is StageType =>
  typeof value === "string" &&
  (STAGE_TYPES as readonly string[]).includes(value);

/** A tone for a type's badge. Colour never carries it alone: the label does. */
export const STAGE_TYPE_TONE: Record<
  StageType,
  "neutral" | "info" | "accent" | "warning" | "success" | "danger"
> = {
  APPLIED: "neutral",
  SCREENING: "neutral",
  TEST: "info",
  INTERVIEW: "accent",
  OFFER: "warning",
  HIRED: "success",
  REJECTED: "danger",
};
