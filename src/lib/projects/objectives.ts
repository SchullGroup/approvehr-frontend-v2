/**
 * Linking Projects to objectives, which is optional.
 *
 * ## What linking is, and is not
 *
 * A task is not hard-tied to an objective. Every finished task counts on the
 * person's work record and in their review whether or not it is linked. A link
 * only decides *where else* the task is shown: under that objective or KPI, so
 * whoever reads that objective sees the finished work that went into it.
 *
 * So nothing here is ever a fault. There is no "not counted" line, no refusal
 * for an objective of the wrong kind, no week that closes. A person may link a
 * task to any objective or personal KPI they can see (company, department,
 * personal; a draft too), optionally narrowed to one measure, whenever they
 * like, including after it is finished. The API is still the authority on who
 * may and on ids from outside the company; these functions only decide what the
 * screen offers and how the link reads.
 */

import type { ApiGoal, ApiKeyResult } from "@/lib/api/performance";
import type { Issue, IssueObjective, IssueType } from "./types";

export type ObjectiveLevel = "company" | "department" | "personal";

export type ObjectiveMeasure = { id: string; label: string };

export type ObjectiveOption = {
  id: string;
  /** What the choice reads as in a list: the title, and whose or what level when it helps. */
  label: string;
  /** The bare title, for a sentence about the link. */
  title: string;
  level: ObjectiveLevel;
  /** Company and department objectives are shared: nobody owns them. */
  shared: boolean;
  /** Done, so no more work is expected under it. Still a valid link. */
  closed: boolean;
  /** Its measures, for narrowing a link to one of them. */
  measures: ObjectiveMeasure[];
};

/** A heading in the picker and the options under it. */
export type ObjectiveGroup = {
  level: ObjectiveLevel;
  label: string;
  options: ObjectiveOption[];
};

/** Only these count as a unit of somebody's work. A subtask or an initiative does not. */
const COUNTS: readonly IssueType[] = ["STORY", "TASK", "BUG"];

/** Whether the task is a top-level unit of work: not an initiative, not a subtask. */
export function countsAsWork(issue: Pick<Issue, "type">): boolean {
  return COUNTS.includes(issue.type);
}

const LEVEL_HEADING: Record<ObjectiveLevel, string> = {
  company: "Company",
  department: "Department",
  personal: "Personal",
};

const isShared = (goal: Pick<ApiGoal, "ownerId">) => goal.ownerId === null;

function levelNote(goal: ApiGoal, meId: string | null): string {
  if (goal.level === "company") return "Company";
  if (goal.level === "department") {
    return goal.departmentName
      ? `Department · ${goal.departmentName}`
      : "Department";
  }
  return goal.ownerId === meId ? "" : (goal.ownerName ?? "");
}

const isClosed = (goal: Pick<ApiGoal, "status">) => goal.status === "DONE";

const measureOf = (
  kr: Pick<ApiKeyResult, "id" | "label">,
): ObjectiveMeasure => ({
  id: kr.id,
  label: kr.label,
});

function option(goal: ApiGoal, meId: string | null): ObjectiveOption {
  const note = levelNote(goal, meId);
  return {
    id: goal.id,
    label: note ? `${goal.title} (${note})` : goal.title,
    title: goal.title,
    level: goal.level,
    shared: isShared(goal),
    closed: isClosed(goal),
    measures: (goal.keyResults ?? []).map(measureOf),
  };
}

const byLabel = (a: ObjectiveOption, b: ObjectiveOption) =>
  a.label.localeCompare(b.label);

/**
 * Everything a person may link to, grouped Company, Department, Personal.
 *
 * `goals` is what the person can see, so this never filters by owner or by
 * approval: a draft is allowed, and so is somebody else's personal KPI the
 * reader is permitted to read. The assignee's own KPIs come first among the
 * personal ones, because that is where most links go.
 */
export function objectiveGroups(
  goals: readonly ApiGoal[],
  args: { meId: string | null; assigneeId?: string | null },
): ObjectiveGroup[] {
  const mine = (goal: ApiGoal) =>
    goal.ownerId !== null &&
    (goal.ownerId === args.assigneeId || goal.ownerId === args.meId);
  const out: ObjectiveGroup[] = [];
  for (const level of ["company", "department", "personal"] as const) {
    const rows = goals.filter((g) => g.level === level);
    if (rows.length === 0) continue;
    const ordered =
      level === "personal"
        ? [
            ...rows
              .filter(mine)
              .map((g) => option(g, args.meId))
              .sort(byLabel),
            ...rows
              .filter((g) => !mine(g))
              .map((g) => option(g, args.meId))
              .sort(byLabel),
          ]
        : rows.map((g) => option(g, args.meId)).sort(byLabel);
    out.push({ level, label: LEVEL_HEADING[level], options: ordered });
  }
  return out;
}

/** Every option of every group, in the order a person meets them. */
export const flattenGroups = (groups: readonly ObjectiveGroup[]) =>
  groups.flatMap((g) => g.options);

/**
 * The groups with the one already saved among them, so a select never shows a
 * value it has no option for. A link to something this person cannot list (or an
 * objective since removed) stays visible and can be cleared.
 */
export function withCurrentGroup(
  groups: readonly ObjectiveGroup[],
  link: { goalId: string | null; objective?: IssueObjective | null },
  goals: readonly ApiGoal[],
  meId: string | null,
): ObjectiveGroup[] {
  const currentId = link.goalId;
  if (!currentId) return [...groups];
  if (flattenGroups(groups).some((o) => o.id === currentId)) return [...groups];
  const known = goals.find((g) => g.id === currentId);
  const title = known?.title ?? link.objective?.title ?? null;
  const kept: ObjectiveOption = known
    ? option(known, meId)
    : {
        id: currentId,
        label: title ?? "A linked objective",
        title: title ?? "an objective",
        level: "personal",
        shared: false,
        closed: link.objective?.closed ?? false,
        measures: [],
      };
  return [
    ...groups,
    { level: kept.level, label: "Linked now", options: [kept] },
  ];
}

/* ------------------------------------------------------------ who may link */

/**
 * Whether the signed-in person is offered the picker.
 *
 * The API says first (`canLinkObjective` on the task). Where it does not (the
 * demo, or an older server) the rule is the contract's: the assignee, whoever
 * manages the project (its lead, or HR), the assignee's manager or department
 * head, and HR. Anybody else is offered nothing at all, not a switched-off
 * control: the API would refuse them.
 */
export function mayLinkIssue(args: {
  issue: Pick<Issue, "type" | "assigneeIds" | "canLinkObjective">;
  meId: string | null;
  canManageProject: boolean;
  editRecords: boolean;
  leadsAssignee: boolean;
}): boolean {
  const { issue, meId } = args;
  if (!countsAsWork(issue)) return false;
  if (typeof issue.canLinkObjective === "boolean") {
    return issue.canLinkObjective;
  }
  if (args.canManageProject || args.editRecords || args.leadsAssignee) {
    return true;
  }
  return meId !== null && issue.assigneeIds.includes(meId);
}

/* --------------------------------------------------------- the state line */

/**
 * The one neutral line about a task's link, or `null` for nothing.
 *
 * - not linked: nothing at all, which is the ordinary case and not a gap
 * - linked: "Linked to <objective>", with the measure when it is narrowed
 * - linked and the objective has closed: "Linked objective is closed"
 *
 * Plain text, never a warning: a closed objective is a fact about the past.
 */
export function objectiveLine(
  issue: Pick<Issue, "goalId" | "keyResultId" | "objective">,
  known?: readonly ApiGoal[],
): string | null {
  if (!issue.goalId) return null;
  const goal = known?.find((g) => g.id === issue.goalId);
  const closed =
    issue.objective?.closed === true || (goal ? isClosed(goal) : false);
  if (closed) return "Linked objective is closed";
  const title = issue.objective?.title ?? goal?.title ?? null;
  if (!title) return "Linked to an objective";
  const measureId = issue.keyResultId ?? issue.objective?.keyResultId ?? null;
  const measure =
    issue.objective?.keyResultTitle ??
    (measureId
      ? (goal?.keyResults?.find((kr) => kr.id === measureId)?.label ?? null)
      : null);
  return measure ? `Linked to ${title}, ${measure}` : `Linked to ${title}`;
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
