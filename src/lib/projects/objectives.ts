/**
 * Linking Projects to objectives, and what the weekly-task bridge says back.
 *
 * ## What the API will accept
 *
 * The bridge files a finished issue under **the assignee's own agreed
 * objective**, resolved from the issue's `goalId` and then the project's. That
 * decides what each picker may offer, and none of it is a guess made here:
 *
 * - **An issue** can be linked only by the person it is assigned to, and only to
 *   one of their own agreed objectives. Offering anything else is offering a 422.
 * - **A project** can be linked by its lead (or HR) to any objective they can
 *   read. A company or department objective has no agreement step of its own (it
 *   belongs to nobody, so nobody agrees it), so those are offered whatever their
 *   `approval` says; each person's work then files under their own KPI beneath
 *   it. A personal objective is offered only once it is agreed.
 *
 * The API is still the authority. These functions only stop the screen offering
 * what it already knows will be refused.
 */

import type { ApiGoal } from "@/lib/api/performance";
import type { Issue, IssueType, IssueWeeklyTask } from "./types";

export type ObjectiveOption = {
  id: string;
  /** What the choice reads as in a list: the title, and whose or what level when it helps. */
  label: string;
  /** Company and department objectives are shared: the work files under a KPI beneath. */
  shared: boolean;
};

/** Only these count as a unit of somebody's work, as the API's bridge has it. */
const FILEABLE: readonly IssueType[] = ["STORY", "TASK", "BUG"];

/** Whether the bridge can ever file this issue: not an epic, not a sub-task. */
export function bridgeApplies(issue: Pick<Issue, "type">): boolean {
  return FILEABLE.includes(issue.type);
}

/** Only the person an issue is assigned to may link it to their objective. */
export function mayLinkIssueObjective(
  meId: string | null,
  issue: Pick<Issue, "type" | "assigneeId">,
): boolean {
  return meId !== null && issue.assigneeId === meId && bridgeApplies(issue);
}

/**
 * Taking a link off is wider than putting one on: the assignee, or whoever
 * manages the project. Removing a wrong link harms nobody's record.
 */
export function mayClearIssueObjective(
  meId: string | null,
  issue: Pick<Issue, "type" | "assigneeId" | "goalId">,
  canManage: boolean,
): boolean {
  if (!bridgeApplies(issue) || issue.goalId === null) return false;
  return canManage || (meId !== null && issue.assigneeId === meId);
}

const isShared = (goal: Pick<ApiGoal, "ownerId">) => goal.ownerId === null;

function levelNote(goal: ApiGoal): string {
  if (goal.level === "company") return "Company";
  if (goal.level === "department") {
    return goal.departmentName
      ? `Department · ${goal.departmentName}`
      : "Department";
  }
  return "";
}

function option(goal: ApiGoal, meId: string | null): ObjectiveOption {
  const note = isShared(goal)
    ? levelNote(goal)
    : goal.ownerId === meId
      ? ""
      : (goal.ownerName ?? "");
  return {
    id: goal.id,
    label: note ? `${goal.title} (${note})` : goal.title,
    shared: isShared(goal),
  };
}

const byLabel = (a: ObjectiveOption, b: ObjectiveOption) =>
  a.label.localeCompare(b.label);

/** An issue's choices: the assignee's own objectives that have been agreed. */
export function issueObjectiveOptions(
  goals: readonly ApiGoal[],
  employeeId: string | null,
): ObjectiveOption[] {
  if (employeeId === null) return [];
  return goals
    .filter((g) => g.ownerId === employeeId && g.approval === "AGREED")
    .map((g) => option(g, employeeId))
    .sort(byLabel);
}

/** A project's choices: agreed objectives, and the company and department ones above them. */
export function projectObjectiveOptions(
  goals: readonly ApiGoal[],
  meId: string | null,
): ObjectiveOption[] {
  return goals
    .filter((g) => isShared(g) || g.approval === "AGREED")
    .map((g) => option(g, meId))
    .sort(byLabel);
}

/**
 * The choices with the one already saved among them, so a select never shows a
 * value it has no option for. A link to something no longer on offer (an
 * objective reopened for revision, or one this person cannot list) stays
 * visible and can be cleared.
 */
export function withCurrent(
  options: readonly ObjectiveOption[],
  currentId: string | null,
  goals: readonly ApiGoal[],
  meId: string | null,
): ObjectiveOption[] {
  if (!currentId || options.some((o) => o.id === currentId)) {
    return [...options];
  }
  const known = goals.find((g) => g.id === currentId);
  return [
    ...options,
    known
      ? option(known, meId)
      : { id: currentId, label: "A linked objective", shared: false },
  ];
}

/* ------------------------------------------------------------ the status line */

const NOT_COUNTED_FALLBACK = "Not counted toward a weekly task.";

/**
 * The one line under an issue about its weekly task, or `null` for nothing.
 *
 * Only what the API said. A task that is `FILED` is said to be filed and, if it
 * is, graded, and no more: the API does not report which week it went into, and
 * an issue reopened and finished again keeps the task it already had, so "for
 * this week" would sometimes be wrong. A `NOT_COUNTED` issue shows the server's
 * own sentence as it is, whichever of the three reasons it carries. Absent or
 * unrecognised is silence, which is also all the demo ever has.
 */
export function weeklyTaskLine(weekly: IssueWeeklyTask | null): string | null {
  if (!weekly) return null;
  if (weekly.state === "FILED") {
    return weekly.graded
      ? "Filed as a weekly task, and graded"
      : "Filed as a weekly task";
  }
  return weekly.message.trim() !== "" ? weekly.message : NOT_COUNTED_FALLBACK;
}

/* ---------------------------------------------------------- the "From project" tag */

export type ProjectSource = { key: string; projectId: string | null };

/**
 * A task's `projectSource`, read defensively. The three performance reads send
 * `{ key, projectId }` or `null`; an older API sends nothing. Anything that is
 * not a non-empty key is "no tag" rather than a tag with a hole in it.
 */
export function readProjectSource(value: unknown): ProjectSource | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const key = typeof raw["key"] === "string" ? raw["key"].trim() : "";
  if (key === "") return null;
  const projectId =
    typeof raw["projectId"] === "string" && raw["projectId"] !== ""
      ? raw["projectId"]
      : null;
  return { key, projectId };
}

/**
 * Whether a source is a task on somebody's own list. Those are keyed `MY-n`, and
 * no board can take the key `MY`, so the key alone says so. They have no project
 * page to open; with the issue's id they open on `/projects/tasks/{id}`
 * (`workIssueHref`). A source tag has only the key, so it stays unlinked.
 */
export function isPersonalSource(source: ProjectSource): boolean {
  return /^MY-\d+$/i.test(source.key);
}

/**
 * Where a row about one issue goes when its id is known: a `MY-n` task to its
 * own page by id (which also sends a board task on to its board, so a wrong
 * guess still lands), anything else to its board with the issue open.
 */
export function workIssueHref(issue: {
  id: string;
  key: string;
  projectId: string;
}): string {
  return isPersonalSource({ key: issue.key, projectId: issue.projectId })
    ? `/projects/tasks/${encodeURIComponent(issue.id)}`
    : `/projects/${issue.projectId}?issue=${encodeURIComponent(issue.key)}`;
}

/** Where the tag goes: the issue in its project, as the notifications link to it. */
export function projectSourceHref(source: ProjectSource): string | null {
  if (source.projectId === null || isPersonalSource(source)) return null;
  return `/projects/${encodeURIComponent(source.projectId)}?issue=${encodeURIComponent(source.key)}`;
}
