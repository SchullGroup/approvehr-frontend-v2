import {
  isDoneMeasure,
  type ApiGoal,
  type CreateGoalBody,
  type CreateKeyResultBody,
  type MeasureKind,
  type ReviewCycleStage,
  type UpdateGoalBody,
  type UpdateKeyResultBody,
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

/** A target the objective already has, as its inputs hold it (edit only). */
export type TargetEdit = {
  kind: MeasureKind;
  label: string;
  start: string;
  value: string;
  unit: string;
  countDown: boolean;
};

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
  /**
   * The targets an objective being changed already has, by id. Empty for a
   * new one, whose single target is the fields above.
   */
  targets: Record<string, TargetEdit>;
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
  targets: {},
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
> & {
  /** An existing target's problems, by its id (edit only). */
  targets?: Record<string, { label?: string; target?: string }>;
};

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
  if (step === "target" && Object.keys(draft.targets).length > 0) {
    const targets: NonNullable<StepProblems["targets"]> = {};
    for (const [id, edit] of Object.entries(draft.targets)) {
      const found = measureProblems({
        kind: edit.kind,
        label: edit.label,
        start: edit.start,
        target: edit.value,
        countDown: edit.countDown,
      });
      if (found.label || found.target) targets[id] = found;
    }
    if (Object.keys(targets).length > 0) found.targets = targets;
  } else if (step === "target") {
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
  Object.entries(problems).some(([key, value]) =>
    key === "targets"
      ? Object.keys(value as object).length > 0
      : value !== undefined,
  );

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
  edit,
  period,
  back,
  department,
}: {
  parent?: string;
  /** Start it for this department. */
  department?: string;
  /** The appraisal period to set objectives for. */
  period?: string;
  /** An objective to change and send again, rather than a new one. */
  edit?: string;
  back?: string;
}): string {
  const query = new URLSearchParams();
  if (edit) query.set("edit", edit);
  if (parent) query.set("parent", parent);
  if (period) query.set("period", period);
  if (back) query.set("back", back);
  if (department) query.set("department", department);
  const text = query.toString();
  return text ? `/performance/kpis/new?${text}` : "/performance/kpis/new";
}

/* ------------------------------------------------------- changing one again */

/**
 * An objective sent back to its owner, as the wizard's answers, so "Edit and
 * resend" opens on what was sent (owner request, 24 Nov 2026).
 */
export function draftFromGoal(
  goal: ApiGoal,
  employeeId: string | null,
): ObjectiveDraft {
  return {
    ...BLANK_OBJECTIVE,
    title: goal.title,
    description: goal.description ?? "",
    level:
      goal.level === "company"
        ? "company"
        : goal.level === "department"
          ? "department"
          : "person",
    departmentId: goal.departmentId ?? "",
    personId:
      goal.ownerId === null || goal.ownerId === employeeId
        ? "me"
        : goal.ownerId,
    quarter: goal.dueQuarter ?? "",
    periodId: goal.reviewCycleId ?? "",
    parentId: goal.parentId ?? "",
    targets: Object.fromEntries(
      goal.keyResults.map((measure) => [
        measure.id,
        {
          kind: isDoneMeasure(measure) ? "DONE" : "NUMBER",
          label: measure.label,
          start: measure.startValue,
          value: measure.targetValue,
          unit: measure.unit ?? "",
          countDown: measure.lowerIsBetter,
        } satisfies TargetEdit,
      ]),
    ),
  };
}

/**
 * What changed on the objective itself, as `PATCH /performance/goals/:id`
 * takes it. Only what differs, so an unchanged field is never sent; a cleared
 * description, period or parent is `null`. Whose it is is not changed here:
 * handing an objective to somebody else is a separate act.
 */
export function goalChangesOf(
  goal: ApiGoal,
  draft: ObjectiveDraft,
  { reviewCycleId, quarter }: { reviewCycleId: string; quarter: string },
): UpdateGoalBody {
  const body: UpdateGoalBody = {};
  if (draft.title.trim() !== goal.title) body.title = draft.title.trim();
  const description = draft.description.trim();
  if (description !== (goal.description ?? "")) {
    body.description = description === "" ? null : description;
  }
  if (quarter && quarter !== goal.dueQuarter) body.dueQuarter = quarter;
  if (reviewCycleId !== (goal.reviewCycleId ?? "")) {
    body.reviewCycleId = reviewCycleId === "" ? null : reviewCycleId;
  }
  if (draft.parentId !== (goal.parentId ?? "")) {
    body.parentId = draft.parentId === "" ? null : draft.parentId;
  }
  return body;
}

/** What changed on each existing target, as `PATCH /key-results/:id` takes it. */
export function targetChangesOf(
  goal: ApiGoal,
  draft: ObjectiveDraft,
): [string, UpdateKeyResultBody][] {
  const changes: [string, UpdateKeyResultBody][] = [];
  for (const measure of goal.keyResults) {
    const edit = draft.targets[measure.id];
    if (!edit) continue;
    const body: UpdateKeyResultBody = {};
    if (edit.label.trim() !== measure.label) body.label = edit.label.trim();
    if (edit.kind === "NUMBER") {
      const start = edit.start.trim() || "0";
      if (start !== measure.startValue) body.startValue = start;
      if (edit.value.trim() !== measure.targetValue) {
        body.targetValue = edit.value.trim();
      }
      const unit = edit.unit.trim();
      if (unit !== (measure.unit ?? "")) body.unit = unit === "" ? null : unit;
      if (edit.countDown !== measure.lowerIsBetter) {
        body.lowerIsBetter = edit.countDown;
      }
    }
    if (Object.keys(body).length > 0) changes.push([measure.id, body]);
  }
  return changes;
}

/* ------------------------------------------------------- who agrees it */

type Agreeing = {
  id: string;
  fullName: string;
  managerId?: string | null;
  departmentId?: string | null;
};

/**
 * Who an objective goes to, before it is sent (owner, 24 Nov 2026): the
 * person's line manager; if none, the head of their department; if none,
 * whoever holds the records permission (HR). Company and department objectives
 * go to HR. Nobody agrees their own, so a manager writing for their own report
 * is skipped to the next in line.
 *
 * It is the API's own rule (`approversOf`), written as one plain line from what
 * the screen knows; once an objective is sent, `sentLine` says who it reached.
 */
export function agreesLine({
  level,
  ownerId,
  meId,
  people,
  departments,
}: {
  level: ObjectiveLevel;
  /** The person it is for: an id, or null for "me". */
  ownerId: string | null;
  meId: string | null;
  people: readonly Agreeing[];
  departments: readonly { id: string; headId: string | null }[];
}): string {
  const hr = "Goes to HR to agree.";
  if (level !== "person") return hr;
  const owner = people.find((one) => one.id === (ownerId ?? meId));
  if (!owner) return hr;
  const named = (id: string | null | undefined) =>
    id && id !== owner.id && id !== meId
      ? (people.find((one) => one.id === id)?.fullName ?? null)
      : null;
  const manager = named(owner.managerId);
  if (manager) return `Goes to ${manager} to agree.`;
  const head = named(
    departments.find((one) => one.id === owner.departmentId)?.headId,
  );
  return head ? `Goes to ${head} to agree.` : hr;
}

/** "Sent to Ada Eze to agree." from the people the API says it reached. */
export function sentLine(
  sentTo: readonly string[] | undefined,
  people: readonly { id: string; fullName: string }[],
): string | null {
  if (!sentTo || sentTo.length === 0) return null;
  const names = sentTo.map(
    (id) => people.find((one) => one.id === id)?.fullName ?? null,
  );
  if (names.some((name) => name === null)) {
    return sentTo.length === 1
      ? "Sent to 1 person to agree."
      : `Sent to ${String(sentTo.length)} people to agree.`;
  }
  const list = names as string[];
  if (list.length <= 2) return `Sent to ${list.join(" and ")} to agree.`;
  return `Sent to ${list.slice(0, 2).join(", ")} and ${String(list.length - 2)} others to agree.`;
}
