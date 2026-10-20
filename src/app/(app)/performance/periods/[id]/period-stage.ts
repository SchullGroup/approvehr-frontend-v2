import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * Which stage a period is in, which one button moves it on, and which tabs
 * the screen shows at each stage.
 *
 * Pure on purpose: the header used to be six equal pills and the question
 * "which of these is the next thing to do" was answered by nobody. Every rule
 * below is a statement about the stage, so they live apart from the screen and
 * are tested apart from it (`tests/period-screen-stage.test.ts`).
 *
 * **Nothing here decides who may do what.** The permissions are the two the
 * screen always read — `MANAGE_SETTINGS` changes a period, `EDIT_RECORDS`
 * reads the company's — and they arrive as booleans. What moved is where each
 * control sits, not whether somebody may use it.
 */

/** The five stages in the order a period walks them. */
export const STAGES: { stage: ReviewCycleStage; label: string }[] = [
  { stage: "DRAFT", label: "Not started" },
  { stage: "SELF", label: "Self-review" },
  { stage: "MANAGER", label: "Manager review" },
  { stage: "CALIBRATION", label: "Calibration" },
  { stage: "PUBLISHED", label: "Published" },
];

export function stageIndex(stage: ReviewCycleStage): number {
  return STAGES.findIndex((one) => one.stage === stage);
}

/**
 * What the next stage is called on the button, and what follows what.
 *
 * `PUBLISHED` is deliberately absent as a destination: closing the period is
 * what publishes it, the API refuses `stage: PUBLISHED` outright, and
 * "Publish the results" is that act with its own confirmation. So this only
 * ever walks SELF → MANAGER → CALIBRATION.
 */
export const STAGE_AFTER: Partial<Record<ReviewCycleStage, ReviewCycleStage>> =
  {
    SELF: "MANAGER",
    MANAGER: "CALIBRATION",
  };

export const STAGE_NEXT_LABEL: Record<string, string> = {
  MANAGER: "manager review",
  CALIBRATION: "calibration",
};

/**
 * What a stage change says it does, in the words the toast already used once
 * it had happened. The confirmation says the same sentence *before*, which is
 * when it can still change somebody's mind.
 */
export const STAGE_CONSEQUENCE: Record<string, string> = {
  MANAGER:
    "Managers write their reviews now. Self-reviews already in are kept.",
  CALIBRATION: "Marks are in. Nothing else is asked for until you publish.",
};

export type PrimaryAction =
  | { kind: "start"; label: string; disabled: boolean }
  | { kind: "advance"; label: string; to: ReviewCycleStage }
  | { kind: "publish"; label: string }
  | { kind: "report"; label: string };

/**
 * The one button the header leads with. `null` is the honest answer for a
 * reader who may not change the period: a primary action they cannot use is
 * decoration.
 *
 * - **Not started**: start it. Disabled with the reason on the button itself
 *   while it has no questions, which is what the setup card's button always did.
 * - **Self-review, manager review**: move to the next stage.
 * - **Calibration**: publish. It is the only stage left to do.
 * - **Published**: nothing changes any more, so the lead is the report.
 */
export function primaryActionFor(input: {
  stage: ReviewCycleStage;
  canManage: boolean;
  canSeeCompany: boolean;
  questionCount: number;
}): PrimaryAction | null {
  const { stage, canManage, canSeeCompany, questionCount } = input;

  if (stage === "DRAFT") {
    if (!canManage) return null;
    return questionCount === 0
      ? { kind: "start", label: "Add a question first", disabled: true }
      : { kind: "start", label: "Start the period", disabled: false };
  }

  if (stage === "PUBLISHED") {
    return canSeeCompany ? { kind: "report", label: "See the report" } : null;
  }

  if (!canManage) return null;

  if (stage === "CALIBRATION") {
    return { kind: "publish", label: "Publish the results" };
  }

  const next = STAGE_AFTER[stage];
  if (!next) return null;
  return {
    kind: "advance",
    to: next,
    label: `Move to ${STAGE_NEXT_LABEL[next]}`,
  };
}

export type MenuEntry = {
  id: "report" | "nine-box" | "sections" | "publish" | "delete";
  /** Entries in the same group sit together; groups are divided. */
  group: "view" | "setup" | "stage" | "danger";
};

/**
 * What the "More" menu holds: everything that was a pill and is not the
 * primary action.
 *
 * - **Publish** is here at SELF and MANAGER and only there. The API has always
 *   let a period be published from any running stage, so that stays reachable —
 *   but it is not the next step until calibration, and a header that offered it
 *   as loudly as "Move to manager review" is how it got pressed by accident.
 * - **Delete** is draft-only and kept in its own group at the bottom.
 * - **Report** is dropped where it is already the primary action.
 */
export function menuFor(input: {
  stage: ReviewCycleStage;
  canManage: boolean;
  canSeeCompany: boolean;
  primary: PrimaryAction | null;
}): MenuEntry[] {
  const { stage, canManage, canSeeCompany, primary } = input;
  const draft = stage === "DRAFT";
  const published = stage === "PUBLISHED";
  const running = !draft && !published;
  const entries: MenuEntry[] = [];

  if (canSeeCompany && !draft && primary?.kind !== "report") {
    entries.push({ id: "report", group: "view" });
  }
  if (canSeeCompany && !draft) {
    entries.push({ id: "nine-box", group: "view" });
  }
  if (canManage && !draft) {
    entries.push({ id: "sections", group: "setup" });
  }
  if (canManage && running && primary?.kind !== "publish") {
    entries.push({ id: "publish", group: "stage" });
  }
  if (canManage && draft) {
    entries.push({ id: "delete", group: "danger" });
  }
  return entries;
}

export type PeriodTab = "overview" | "outstanding" | "marks" | "appraisers";

export const TAB_LABEL: Record<PeriodTab, string> = {
  overview: "Overview",
  outstanding: "Outstanding",
  marks: "Marks",
  appraisers: "Appraisers",
};

/**
 * A period that has not started has no form to be late and no mark to read, so
 * two of the four tabs would be an empty table under a heading. It does have an
 * appraiser mapping — starting it fills that in, and seeing it first is the
 * reason the card says "do it now if you would rather see the mapping".
 */
export function tabsFor(stage: ReviewCycleStage): PeriodTab[] {
  return stage === "DRAFT"
    ? ["overview", "appraisers"]
    : ["overview", "outstanding", "marks", "appraisers"];
}

/** A `?tab=` that names a tab this stage does not have lands on the overview. */
export function resolveTab(
  requested: string | null,
  available: PeriodTab[],
): PeriodTab {
  return available.find((tab) => tab === requested) ?? "overview";
}

/**
 * What is true at the moment somebody is about to publish, for the
 * confirmation. Only facts the screen already holds: how many forms are
 * outstanding and how many people have no mark. A count that is not known is
 * left out, never written as 0 — "no forms outstanding" and "we have not
 * counted" are different claims and only one of them may be made.
 */
export function publishFacts(input: {
  outstanding: number | null;
  unscored: number | null;
}): string[] {
  const facts: string[] = [];
  const { outstanding, unscored } = input;
  if (outstanding !== null && outstanding > 0) {
    facts.push(
      `${outstanding} ${outstanding === 1 ? "form is" : "forms are"} still outstanding.`,
    );
  }
  if (unscored !== null && unscored > 0) {
    facts.push(
      `${unscored} ${unscored === 1 ? "person has" : "people have"} no mark and will finish with none.`,
    );
  }
  return facts;
}
