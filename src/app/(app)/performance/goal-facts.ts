import type { ApiGoal } from "@/lib/api/performance";

/**
 * What is true of one objective, for the person looking at it.
 *
 * These lived inside `GoalCard`, which is the only place an objective's detail
 * used to open from. "New objective" opens the same detail from the screen
 * itself, straight after the objective is made, so the answers moved here:
 * two call sites asking the same questions would drift, and the detail modal's
 * buttons depend on every one of them.
 */

/**
 * Which rung of the ladder this is, in words.
 *
 * From the API's own `level` rather than guessed. It used to read
 * `childCount > 0 ? "Team KPI"`, which labelled a **personal** KPI that
 * happened to have children as the team's — a guess that was wrong exactly
 * where the cascade matters. A department objective names its department,
 * because "Department objective" without saying which one is half a fact.
 */
export function rungLabel(goal: ApiGoal): string {
  if (goal.level === "company") return "Company KPI";
  if (goal.level === "department") {
    return goal.departmentName
      ? `${goal.departmentName} objective`
      : "Department objective";
  }
  return "Personal KPI";
}

export type GoalFacts = {
  rung: string;
  progress: number;
  done: boolean;
  canShare: boolean;
  canLogTasks: boolean;
  noPeriod: boolean;
};

/**
 * `actingId` is the signed-in person's own employee id.
 */
export function goalFacts(goal: ApiGoal, actingId: string | null): GoalFacts {
  const done = goal.status === "DONE";
  return {
    rung: rungLabel(goal),
    progress: goal.measuredProgress ?? goal.progress,
    done,
    canShare: goal.dueQuarter !== null && goal.keyResults.length > 0,
    /* Only the goal's own owner may log a task against it — the API's own
       rule (`submitTask` throws for anybody else) — and only once it is
       agreed, matching the objective/delivery scoring it feeds. */
    canLogTasks:
      !done && goal.approval === "AGREED" && actingId === goal.ownerId,
    /* Nothing to agree against: the API refuses to send an objective that
       belongs to no period, because one agreed for no period cannot be agreed
       before it. */
    noPeriod: goal.reviewCycleId === null && goal.dueQuarter === null,
  };
}

/* -------------------------------------------------------------------------- */

export type WhoseChoice = { value: string; label: string };

/**
 * The answers to "whose objective is this", for the **New objective** form.
 *
 * An objective is a thing the company, a department or one person is held to,
 * so this offers exactly those three kinds and nothing narrower. Listing the
 * people somebody leads is the "New KPI" form's job — handing one person a KPI
 * is what the detail screen's "Give a KPI to people" is for, and that is where
 * this form now sends you.
 *
 * Only what the API will accept (`createGoal`): the whole company needs
 * `EDIT_RECORDS`; a department needs heading it, or `EDIT_RECORDS`; anybody
 * may make a personal one. A choice the save would refuse is not offered.
 *
 * `fallback` is where the select starts. A department you head wins — that is
 * who this button is mostly pressed by — then the company for somebody who may
 * set one (the empty cascade's own advice is "start with one company KPI"),
 * then yourself.
 */
export function objectiveWhoseChoices(input: {
  departments: readonly { id: string; name: string; headId: string | null }[];
  employeeId: string | null;
  canSetCompanyWide: boolean;
}): { choices: WhoseChoice[]; fallback: string } {
  const { departments, employeeId, canSetCompanyWide } = input;
  const heads = (department: { headId: string | null }) =>
    employeeId !== null && department.headId === employeeId;

  const choices: WhoseChoice[] = [];
  if (canSetCompanyWide) {
    choices.push({
      value: "company",
      label: "The whole company (everyone sees it)",
    });
  }
  for (const department of departments) {
    if (canSetCompanyWide || heads(department)) {
      choices.push({
        value: `dept:${department.id}`,
        label: `${department.name} — the whole department`,
      });
    }
  }
  choices.push({ value: "me", label: "Mine" });

  const headed = departments.find(heads);
  return {
    choices,
    fallback: headed
      ? `dept:${headed.id}`
      : canSetCompanyWide
        ? "company"
        : "me",
  };
}
