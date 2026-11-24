import type {
  CreateGoalBody,
  CreateKeyResultBody,
  ReviewCycleStage,
} from "@/lib/api/performance";
import { measureProblems } from "./measure-problems";

/**
 * The new-objective wizard, as decisions about data (owner request, 24 Nov
 * 2026: "New objective should open a full-page wizard, not a dialog").
 *
 * Four questions, one to a screen: what the aim is and whose it is, what the
 * target is, which period it counts in and what it supports, then a review
 * that sends it to be agreed or keeps it as a draft. Nothing is written until
 * the last screen.
 *
 * Everything here is pure, so the rules the dialog had (a title of three
 * characters, a personal objective filed in a period when one is open, the
 * target's direction) are read by the wizard and by its tests from one place.
 */

export type ObjectiveLevel = "company" | "department" | "person";

/** What kind of target, or none yet. */
export type TargetChoice = "NUMBER" | "DONE" | "LATER";

/** Everything the wizard collects, as the strings its inputs hold. */
export type ObjectiveDraft = {
  title: string;
  description: string;
  /** `null` until chosen, so the starting answer follows what this person may set. */
  level: ObjectiveLevel | null;
  /** When `level` is a department. */
  departmentId: string;
  /** When `level` is a person: `"me"`, or somebody this person leads. */
  personId: string;
  target: TargetChoice | null;
  /** What is counted, or what done means. */
  label: string;
  start: string;
  value: string;
  unit: string;
  countDown: boolean;
  /** `""` until chosen: the second quarter on the list. */
  quarter: string;
  /** `null` until chosen, so it follows the open periods. `""` is "none". */
  periodId: string | null;
  /** `""` when it supports nothing above it. */
  parentId: string;
};

export const BLANK_OBJECTIVE: ObjectiveDraft = {
  title: "",
  description: "",
  level: null,
  departmentId: "",
  personId: "me",
  target: null,
  label: "",
  start: "0",
  value: "",
  unit: "",
  countDown: false,
  quarter: "",
  periodId: null,
  parentId: "",
};

export const OBJECTIVE_STEPS = ["aim", "target", "period", "review"] as const;
export type ObjectiveStep = (typeof OBJECTIVE_STEPS)[number];

export const STEP_TITLES: Record<ObjectiveStep, string> = {
  aim: "What is the aim?",
  target: "What is the target?",
  period: "Which period does it count in?",
  review: "Check it, then send it to be agreed",
};

/**
 * The periods an objective can be filed in: the ones still taking objectives.
 *
 * The API refuses a published period, and one past self-review ("takes no new
 * objectives and no new agreements"), so offering either is offering a button
 * whose one outcome is a refusal.
 */
export function periodsTakingObjectives<
  T extends { stage: ReviewCycleStage | string },
>(periods: readonly T[]): T[] {
  return periods.filter(
    (period) => period.stage === "DRAFT" || period.stage === "SELF",
  );
}

/** Which rungs this person may set, from what the API accepts. */
export function levelsOffered({
  canSetCompanyWide,
  departments,
  hasStaffRecord,
  leadsAnybody,
}: {
  canSetCompanyWide: boolean;
  /** The departments they may file a shared objective under. */
  departments: readonly unknown[];
  hasStaffRecord: boolean;
  leadsAnybody: boolean;
}): ObjectiveLevel[] {
  const levels: ObjectiveLevel[] = [];
  if (canSetCompanyWide) levels.push("company");
  if (departments.length > 0) levels.push("department");
  if (hasStaffRecord || leadsAnybody) levels.push("person");
  return levels;
}

/**
 * The rung the wizard starts on, from `objectiveWhoseChoices`' fallback:
 * somebody's own first for anybody with a staff record (U93).
 */
export function levelFromWhose(fallback: string): {
  level: ObjectiveLevel;
  departmentId: string;
} {
  if (fallback === "company") return { level: "company", departmentId: "" };
  if (fallback.startsWith("dept:")) {
    return { level: "department", departmentId: fallback.slice(5) };
  }
  return { level: "person", departmentId: "" };
}

/** Whether a personal objective has to be filed in a period. */
export function needsPeriod(
  draft: Pick<ObjectiveDraft, "level">,
  openPeriods: number,
): boolean {
  return draft.level === "person" && openPeriods > 0;
}

/**
 * The sentence for a personal objective left out of a period, read by the
 * wizard and by Edit objective.
 *
 * A personal objective filed in no period counts towards nobody's score, even
 * once it is agreed, with nothing on the screen to say so. So when there is a
 * period to choose, choosing one is not optional. A shared objective (the
 * company's, a department's) may belong to no period, and a company with no
 * open period is told in words rather than stopped. The API still accepts an
 * objective with no period: this is the form's rule, not the server's.
 */
export const NEEDS_PERIOD =
  "Choose the appraisal period this is scored in. An objective with none counts towards nobody's score, even once it is agreed.";

export type StepProblems = Partial<
  Record<
    "title" | "department" | "person" | "target" | "label" | "value" | "period",
    string
  >
>;

/** What stops this step from moving on. Empty when nothing does. */
export function stepProblems(
  step: ObjectiveStep,
  draft: ObjectiveDraft,
  context: { reviewCycleId: string; openPeriods: number },
): StepProblems {
  const found: StepProblems = {};
  if (step === "aim") {
    if (draft.title.trim().length < 3) {
      found.title = "Give it a title of at least three characters.";
    }
    if (draft.level === "department" && draft.departmentId === "") {
      found.department = "Choose the department it belongs to.";
    }
    if (draft.level === "person" && draft.personId === "") {
      found.person = "Choose whose objective it is.";
    }
  }
  if (step === "target") {
    if (draft.target === null) {
      found.target = "Choose a kind of target, or add one later.";
    } else if (draft.target !== "LATER") {
      const measure = measureProblems({
        kind: draft.target,
        label: draft.label,
        start: draft.start,
        target: draft.value,
        countDown: draft.countDown,
      });
      if (measure.label) found.label = measure.label;
      if (measure.target) found.value = measure.target;
    }
  }
  if (step === "period") {
    if (
      needsPeriod(draft, context.openPeriods) &&
      context.reviewCycleId === ""
    ) {
      found.period = NEEDS_PERIOD;
    }
  }
  return found;
}

export const hasProblems = (problems: StepProblems) =>
  Object.values(problems).some((value) => value !== undefined);

/**
 * The objective itself, as `POST /performance/goals` takes it.
 *
 * The same body the dialog built: a company objective is nobody's, a
 * department's is nobody's and names the department, somebody else's names
 * them, and one's own sends no owner at all.
 */
export function goalBodyOf(
  draft: ObjectiveDraft,
  { reviewCycleId, quarter }: { reviewCycleId: string; quarter: string },
): CreateGoalBody {
  const body: CreateGoalBody = { title: draft.title.trim() };
  if (draft.description.trim()) body.description = draft.description.trim();
  if (draft.parentId) body.parentId = draft.parentId;
  if (quarter) body.dueQuarter = quarter;
  if (reviewCycleId) body.reviewCycleId = reviewCycleId;
  if (draft.level === "company") body.ownerId = null;
  else if (draft.level === "department") {
    body.ownerId = null;
    body.departmentId = draft.departmentId;
  } else if (draft.personId !== "me" && draft.personId !== "") {
    body.ownerId = draft.personId;
  }
  return body;
}

/** The target, as `POST /performance/goals/:id/key-results` takes it, or none. */
export function keyResultBodyOf(
  draft: ObjectiveDraft,
): CreateKeyResultBody | null {
  if (draft.target === null || draft.target === "LATER") return null;
  if (draft.target === "DONE") {
    return { kind: "DONE", label: draft.label.trim() };
  }
  const body: CreateKeyResultBody = {
    label: draft.label.trim(),
    targetValue: draft.value.trim(),
    startValue: draft.start.trim() || "0",
  };
  if (draft.unit.trim()) body.unit = draft.unit.trim();
  if (draft.countDown) body.lowerIsBetter = true;
  return body;
}

/** Whether anything has been typed or chosen that leaving would lose. */
export function draftIsBlank(draft: ObjectiveDraft): boolean {
  return (
    draft.title.trim() === "" &&
    draft.description.trim() === "" &&
    draft.target === null &&
    draft.label.trim() === "" &&
    draft.value.trim() === ""
  );
}

/**
 * Where Cancel goes back to: the Objectives address it was opened from, and
 * never anywhere else (a `back` parameter is somebody's typing, so anything
 * that is not this screen's own path is ignored).
 */
export function safeBack(back: string | null | undefined): string {
  if (
    back &&
    back.startsWith("/performance/kpis") &&
    !back.startsWith("/performance/kpis/new") &&
    !back.includes("//")
  ) {
    return back;
  }
  return "/performance/kpis";
}

/**
 * The address of the wizard, started under an objective or not, and knowing
 * the Objectives address to come back to.
 */
export function newObjectiveHref({
  parent,
  back,
}: {
  parent?: string;
  back?: string;
}): string {
  const query = new URLSearchParams();
  if (parent) query.set("parent", parent);
  if (back) query.set("back", back);
  const text = query.toString();
  return text ? `/performance/kpis/new?${text}` : "/performance/kpis/new";
}
