/**
 * What people finished on the project boards, as facts.
 *
 * ## Evidence only
 *
 * A completion is a finished top-level task: who finished it, when, whether that
 * was by its due date, and the objective it is linked to if anybody linked one.
 * Nothing here is a score and no number it produces moves anything. It counts
 * finished tasks only; Effort is never read. A task with no link is just as much
 * a completion as one with a link, and is never described as missing anything.
 *
 * ## One definition, used twice
 *
 * The connected screens read these figures from the API. The demo has no server,
 * so these functions work the same figures out from the demo book, by the same
 * rules: top-level Tasks and Problems only (no initiatives, no subtasks), credited
 * to the person it was assigned to, by the company's calendar day. Co-assignee
 * credit is a later phase and is not here.
 */

import type { ApiGoal } from "@/lib/api/performance";
import { addDays } from "./dates";
import { countsAsWork, describeLink, type ObjectiveLevel } from "./objectives";
import { dayIn } from "@/lib/time";
import { categoryOf } from "./workflow";
import {
  isLinked,
  type Issue,
  type IssueObjective,
  type Project,
  type ProjectData,
} from "./types";

export type Completion = {
  id: string;
  key: string;
  title: string;
  projectId: string;
  projectName: string;
  /** A task on somebody's own list (`MY-n`): no project page to open. */
  personal: boolean;
  personId: string;
  personName: string;
  /** The instant it was finished. */
  doneAt: string;
  /** The company's calendar day it was finished on. */
  doneDay: string;
  dueDate: string | null;
  /** `null` when it had no due date: neither on time nor late. */
  onTime: boolean | null;
  /**
   * Where it is under an objective, as the API says it. `UNLINKED` is the
   * ordinary state of most tasks and is never a gap.
   */
  objective: IssueObjective;
  /**
   * Whether this reader may open the task: a board they are on, or a person they
   * lead. Absent is yes (the demo shows no task its reader cannot open).
   */
  canOpen?: boolean;
  /**
   * For a person's KPI: which level a task was linked at when it is linked to
   * an objective above the KPI rather than to the KPI itself.
   */
  linkedAt?: ObjectiveLevel;
  /**
   * Who put the task on this person's plate, when that is somebody else: its
   * creator, not a record of every hand-over after it. Absent when the person made
   * it themselves (most of what anybody finishes) and when the server does not
   * say, which are not told apart and are never worth a line.
   */
  setBy?: { id: string; name: string };
};

export type CompletionSummary = {
  finished: number;
  withDueDate: number;
  onTime: number;
  late: number;
  /** Linked to an objective or KPI. Optional, so a low share is not a fault. */
  linked: number;
};

export type ProjectCount = {
  projectId: string;
  projectName: string;
  finished: number;
};

/**
 * Finished tasks per objective (and measure). `unlinked` is the ones with no
 * link; `visible` false is work under an objective this reader may not open,
 * whose title is withheld. Neither is a fault.
 */
export type ObjectiveCount = {
  goalId: string | null;
  title: string | null;
  keyResultTitle: string | null;
  unlinked: boolean;
  visible: boolean;
  finished: number;
};

/** The objective's own name for a row, or the plain fact when there is none to give. */
export function objectiveCountTitle(
  row: Pick<ObjectiveCount, "unlinked" | "visible" | "title">,
): string {
  if (row.unlinked) return "Not linked to an objective";
  if (!row.visible || !row.title) return "An objective you can't open";
  return row.title;
}

/** What a row of "By objective" reads as: the name and the measure, or the plain fact. */
export function objectiveCountLabel(row: ObjectiveCount): string {
  const title = objectiveCountTitle(row);
  return !row.unlinked && row.visible && row.keyResultTitle
    ? `${title} (${row.keyResultTitle})`
    : title;
}

/* ------------------------------------------------------------------ the sums */

export function summarise(items: readonly Completion[]): CompletionSummary {
  let withDueDate = 0;
  let onTime = 0;
  let linked = 0;
  for (const item of items) {
    if (item.onTime !== null) {
      withDueDate += 1;
      if (item.onTime) onTime += 1;
    }
    if (isLinked(item.objective)) linked += 1;
  }
  return {
    finished: items.length,
    withDueDate,
    onTime,
    late: withDueDate - onTime,
    linked,
  };
}

/** Finished tasks per project, the busiest first, then by name. */
export function byProject(items: readonly Completion[]): ProjectCount[] {
  const counts = new Map<string, ProjectCount>();
  for (const item of items) {
    const row = counts.get(item.projectId) ?? {
      projectId: item.projectId,
      projectName: item.projectName,
      finished: 0,
    };
    row.finished += 1;
    counts.set(item.projectId, row);
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.finished - a.finished || a.projectName.localeCompare(b.projectName),
  );
}

/**
 * Finished tasks per objective, the busiest first, and the ones with no link
 * last. A count of tasks and nothing more: a task with no link is not a gap.
 */
export function byObjective(items: readonly Completion[]): ObjectiveCount[] {
  const counts = new Map<string, ObjectiveCount>();
  for (const item of items) {
    const o = item.objective;
    const unlinked = !isLinked(o);
    const key = unlinked
      ? "none"
      : `${o.goalId ?? "hidden"}|${o.keyResultId ?? ""}`;
    const row = counts.get(key) ?? {
      goalId: unlinked ? null : o.goalId,
      title: unlinked ? null : o.title,
      keyResultTitle: unlinked ? null : o.keyResultTitle,
      unlinked,
      visible: o.visible,
      finished: 0,
    };
    row.finished += 1;
    counts.set(key, row);
  }
  return [...counts.values()].sort(
    (a, b) =>
      Number(a.unlinked) - Number(b.unlinked) ||
      b.finished - a.finished ||
      objectiveCountLabel(a).localeCompare(objectiveCountLabel(b)),
  );
}

export type PersonCompletions = {
  personId: string;
  personName: string;
  items: Completion[];
};

/** Grouped by the person who finished them, people in name order, newest first within. */
export function byPerson(items: readonly Completion[]): PersonCompletions[] {
  const groups = new Map<string, PersonCompletions>();
  for (const item of items) {
    const group = groups.get(item.personId) ?? {
      personId: item.personId,
      personName: item.personName,
      items: [],
    };
    group.items.push(item);
    groups.set(item.personId, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort(newestFirst) }))
    .sort((a, b) => a.personName.localeCompare(b.personName));
}

export const newestFirst = (a: Completion, b: Completion): number =>
  b.doneAt.localeCompare(a.doneAt) || a.key.localeCompare(b.key);

/* ------------------------------------------------------- reading the book */

export type CompletionContext = {
  timeZone: string;
  /** What the person asking may see by name, for the label on a completion. */
  nameOf: (employeeId: string) => string;
  /** The objectives the labels come from. */
  goals: readonly ApiGoal[];
};

function objectiveOf(
  issue: Pick<Issue, "goalId" | "keyResultId">,
  project: Pick<Project, "goalId">,
  goals: readonly ApiGoal[],
): IssueObjective {
  return issue.goalId
    ? describeLink(
        {
          goalId: issue.goalId,
          keyResultId: issue.keyResultId ?? null,
          source: "TASK",
        },
        goals,
      )
    : describeLink(
        { goalId: project.goalId, keyResultId: null, source: "PROJECT" },
        goals,
      );
}

/** One finished task as a completion, or null when it is not one. */
export function completionOf(
  issue: Issue,
  data: Pick<ProjectData, "project">,
  ctx: CompletionContext,
): Completion | null {
  if (!countsAsWork(issue) || !issue.doneAt || !issue.assigneeId) return null;
  if (categoryOf(data.project.statuses, issue.statusId) !== "DONE") return null;
  const doneDay = dayIn(issue.doneAt, ctx.timeZone);
  if (!doneDay) return null;
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    projectId: data.project.id,
    projectName: data.project.name,
    personal: false,
    personId: issue.assigneeId,
    personName: ctx.nameOf(issue.assigneeId),
    doneAt: issue.doneAt,
    doneDay,
    dueDate: issue.dueDate,
    onTime: issue.dueDate ? doneDay <= issue.dueDate : null,
    objective: objectiveOf(issue, data.project, ctx.goals),
    /* As the API says it: who made the task, only when that is somebody else. */
    ...(issue.reporterId && issue.reporterId !== issue.assigneeId
      ? { setBy: { id: issue.reporterId, name: ctx.nameOf(issue.reporterId) } }
      : {}),
  };
}

/**
 * Every completion in the book finished on a day in `[fromDay, toDay)`,
 * newest first. `people` narrows to those people (`null` for anybody).
 * `canOpen` limits it to projects the viewer may read, so a completion never
 * names a project they could not open.
 */
export function completionsBetween(
  projects: readonly ProjectData[],
  args: {
    fromDay: string;
    toDay: string;
    people?: ReadonlySet<string> | null;
    canOpen?: (project: Project) => boolean;
  },
  ctx: CompletionContext,
): Completion[] {
  const out: Completion[] = [];
  for (const data of projects) {
    if (args.canOpen && !args.canOpen(data.project)) continue;
    for (const issue of data.issues) {
      const row = completionOf(issue, data, ctx);
      if (!row) continue;
      if (row.doneDay < args.fromDay || row.doneDay >= args.toDay) continue;
      if (args.people && !args.people.has(row.personId)) continue;
      out.push(row);
    }
  }
  return out.sort(newestFirst);
}

/** The last day a period of `n` days back from `today` reaches, for "recent" windows. */
export const daysAgo = (today: string, n: number): string => addDays(today, -n);

/* ------------------------------------------- completed work under an objective */

/**
 * The goals above this one, nearest first (its parent, then that one's parent).
 * Stops at a loop, which the API does not allow but a hand-made book might.
 */
export function ancestorsOf(
  goal: Pick<ApiGoal, "parentId">,
  goals: readonly ApiGoal[],
): ApiGoal[] {
  const out: ApiGoal[] = [];
  const seen = new Set<string>();
  let parentId = goal.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = goals.find((g) => g.id === parentId);
    if (!parent) break;
    out.push(parent);
    parentId = parent.parentId;
  }
  return out;
}

/**
 * The completed work that belongs under one objective or KPI.
 *
 * - **Any objective:** the finished tasks linked to it.
 * - **A person's KPI:** also the owner's own finished tasks that are linked to
 *   an objective above it, each marked with the level it was linked at, so a
 *   link made at the department or company level lands where the person's
 *   manager is looking.
 *
 * Grouped by person by the caller. Never graded and never scored.
 */
export function completedUnder(
  items: readonly Completion[],
  goal: Pick<ApiGoal, "id" | "ownerId" | "parentId" | "level">,
  goals: readonly ApiGoal[],
): Completion[] {
  const above = new Map(
    goal.level === "personal" && goal.ownerId
      ? ancestorsOf(goal, goals).map((g) => [g.id, g.level] as const)
      : [],
  );
  const out: Completion[] = [];
  for (const item of items) {
    const linked = item.objective.goalId;
    if (!linked) continue;
    if (linked === goal.id) {
      out.push(item);
    } else if (
      goal.ownerId &&
      item.personId === goal.ownerId &&
      above.has(linked)
    ) {
      out.push({ ...item, linkedAt: above.get(linked)! });
    }
  }
  return out.sort(newestFirst);
}

/* ------------------------------------------------------- what the screens read */

/**
 * The manager's Completed view: the people they lead, and what each finished in
 * one period. Facts only. There is no grade on any row.
 */
export type TeamCompletedPerson = {
  employee: {
    id: string;
    name: string;
    jobTitle: string;
    departmentName: string | null;
  };
  summary: CompletionSummary;
  /** Newest first, capped. `itemsTotal` says how many there were. */
  items: Completion[];
  itemsTotal: number;
};

export type TeamCompleted = {
  period: { kind: string; start: string; end: string; label: string };
  people: TeamCompletedPerson[];
};

/** "Work this cycle", inside a review: figures, by project, and the list. */
export type WorkThisCycle = {
  summary: CompletionSummary;
  byProject: ProjectCount[];
  byObjective: ObjectiveCount[];
  items: Completion[];
  /** Every finished task in the period; `items` may be fewer when capped. */
  total: number;
  capped: boolean;
};

/** "Completed work" under an objective or KPI, grouped by person. */
export type CompletedWork = {
  groups: PersonCompletions[];
  total: number;
  capped: boolean;
};

/** One line of a bulk link that did not take. Plain, never alarming. */
export type BulkLinkFailure = { id: string; key: string; reason: string };

export type BulkLinkResult = {
  /** How many were changed. */
  changed: number;
  failed: BulkLinkFailure[];
};

/** The most a bulk link will take at once. */
export const BULK_LINK_LIMIT = 100;
