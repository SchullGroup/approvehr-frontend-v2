/**
 * What the Backlog shows, and what a move on it changes.
 *
 * Like the board, the backlog is a pure function of the project, its issues, its
 * sprints and the filter, and the UI sends what `resolveBacklogMove` returns. The
 * rules a drag follows are therefore testable without a drag, and the "Move to…"
 * menu, which has no pointer at all, goes through the very same function.
 *
 * ## Which list an issue is in
 *
 * Epics and sub-tasks are never rows: an epic is a container, and a sub-task
 * travels with its parent. Every other issue is in exactly one list:
 *
 * - a **sprint** (planned or running) it is planned into, or
 * - the **backlog**: no sprint, or a sprint that has since closed *and* the issue
 *   was not finished in it (an issue reopened out of a closed sprint is work
 *   again). Finished work in a closed sprint is history and is listed nowhere.
 *
 * A Kanban project has no sprints, so its backlog is one ordered queue, with the
 * board's own rule that finished work older than fourteen days drops off it.
 */

import { isStaleDone, openSprints } from "./board";
import { sprintScope, sumPoints } from "./progress";
import { byRank, rankForInsert } from "./rank";
import type { Issue, IssuePatch, Project, Sprint } from "./types";
import { isDone } from "./workflow";

/** The list id of the backlog. A sprint's list id is the sprint's own id. */
export const BACKLOG = "backlog";

export type SprintSection = {
  sprint: Sprint;
  /** Every issue planned into the sprint, in rank order. Not filtered. */
  all: Issue[];
  /** What the filter lets through, still in rank order. */
  shown: Issue[];
  /** Real figures for the header: they ignore the filter. */
  count: number;
  points: number;
  done: number;
};

export type BacklogSection = {
  all: Issue[];
  shown: Issue[];
  count: number;
  points: number;
};

export type BacklogLayout = {
  kind: Project["type"];
  sprints: SprintSection[];
  backlog: BacklogSection;
};

/** A row candidate: not an epic, not a sub-task. */
export function isBacklogItem(issue: Pick<Issue, "type">): boolean {
  return issue.type !== "EPIC" && issue.type !== "SUBTASK";
}

/** The list an issue is in: a sprint's id or `BACKLOG`. */
export function sectionOf(
  issue: Pick<Issue, "sprintId" | "statusId">,
  sprints: readonly Sprint[],
  statuses: Project["statuses"],
): string {
  if (!issue.sprintId) return BACKLOG;
  const sprint = sprints.find((s) => s.id === issue.sprintId);
  if (!sprint) return BACKLOG;
  if (sprint.state === "CLOSED" && !isDone(statuses, issue)) return BACKLOG;
  return sprint.id;
}

export function buildBacklog(args: {
  project: Pick<Project, "type" | "statuses">;
  issues: readonly Issue[];
  sprints: readonly Sprint[];
  today: string;
  /** The company's day an instant falls on, for the Kanban fourteen-day rule. */
  doneDayOf: (instant: string) => string | null;
  /** The filter. Defaults to everything. */
  visible?: (issue: Issue) => boolean;
}): BacklogLayout {
  const { project, issues, sprints, today, doneDayOf } = args;
  const visible = args.visible ?? (() => true);
  const top = issues.filter(isBacklogItem).sort(byRank);

  if (project.type === "KANBAN") {
    const queue = top.filter((issue) => {
      if (!isDone(project.statuses, issue)) return true;
      const day = issue.doneAt ? doneDayOf(issue.doneAt) : null;
      return !isStaleDone(issue, day, today);
    });
    return {
      kind: "KANBAN",
      sprints: [],
      backlog: backlogSection(queue, visible),
    };
  }

  const sections = openSprints([...sprints]).map((sprint) => {
    const all = top.filter((issue) => issue.sprintId === sprint.id);
    return {
      sprint,
      all,
      shown: all.filter(visible),
      count: all.length,
      points: sumPoints(all),
      done: all.filter((issue) => isDone(project.statuses, issue)).length,
    };
  });
  const loose = top.filter(
    (issue) => sectionOf(issue, sprints, project.statuses) === BACKLOG,
  );
  return {
    kind: "SCRUM",
    sprints: sections,
    backlog: backlogSection(loose, visible),
  };
}

function backlogSection(
  all: Issue[],
  visible: (issue: Issue) => boolean,
): BacklogSection {
  return {
    all,
    shown: all.filter(visible),
    count: all.length,
    points: sumPoints(all),
  };
}

/** A list's issues by id, wherever the layout holds them. */
export function listFor(layout: BacklogLayout, section: string): Issue[] {
  if (section === BACKLOG) return layout.backlog.all;
  return layout.sprints.find((s) => s.sprint.id === section)?.all ?? [];
}

/**
 * What moving `issue` into `section` changes, or null when nothing would.
 *
 * - **Sprint.** On a Scrum project the sprint becomes the section's (null for the
 *   backlog). Its sub-tasks follow on their own: the store applies the same rule
 *   the API does, so one write moves the family. Kanban has no sprints and never
 *   writes one.
 * - **Rank.** The midpoint between the neighbours at the drop position, `beforeId`
 *   being the row it landed in front of, or null for the end of the list.
 *   `siblings` is the section's *whole* list in order — filtered-out rows
 *   included — so a drop never reorders what the filter is hiding.
 * - Into an empty section there is nothing to be ranked against, and a rank of its
 *   own would be arbitrary against the other lists, so the issue keeps the one it
 *   has.
 */
export function resolveBacklogMove(args: {
  issue: Issue;
  section: string;
  siblings: readonly Issue[];
  beforeId: string | null;
  scrum: boolean;
}): IssuePatch | null {
  const { issue, section, siblings, beforeId, scrum } = args;
  const patch: IssuePatch = {};

  if (scrum) {
    const target = section === BACKLOG ? null : section;
    if (target !== issue.sprintId) patch.sprintId = target;
  }

  const rest = siblings.filter((s) => s.id !== issue.id);
  if (patch.sprintId === undefined) {
    /* Dropped where it already is: only worth a write if the order changed. */
    const index =
      beforeId === null
        ? rest.length
        : rest.findIndex((s) => s.id === beforeId);
    const current = siblings.findIndex((s) => s.id === issue.id);
    if (current !== -1 && index === current) return null;
  }
  if (rest.length > 0) patch.rank = rankForInsert(rest, beforeId, issue.id);
  return Object.keys(patch).length > 0 ? patch : null;
}

export type MoveChoice =
  { kind: "section"; section: string } | { kind: "top" } | { kind: "bottom" };

/** Encodes a choice as the value of an `<option>`. */
export function encodeChoice(choice: MoveChoice): string {
  return choice.kind === "section" ? `to:${choice.section}` : choice.kind;
}

export function decodeChoice(value: string): MoveChoice | null {
  if (value === "top" || value === "bottom") return { kind: value };
  if (value.startsWith("to:") && value.length > 3) {
    return { kind: "section", section: value.slice(3) };
  }
  return null;
}

export type MoveOption = {
  value: string;
  label: string;
  disabled: boolean;
  group: "Move to" | "Order";
};

/**
 * The entries of a row's "Move to…" menu: every list it is not already in, then
 * the two ways to reorder inside its own. Top and bottom are the non-drag path to
 * the order, which on a Kanban queue is the only thing there is to do.
 */
export function moveOptions(args: {
  issue: Issue;
  layout: BacklogLayout;
  sprints: readonly Sprint[];
  statuses: Project["statuses"];
}): MoveOption[] {
  const { issue, layout, sprints, statuses } = args;
  const here = sectionOf(issue, sprints, statuses);
  const options: MoveOption[] = [];
  if (layout.kind === "SCRUM") {
    for (const { sprint } of layout.sprints) {
      options.push({
        value: encodeChoice({ kind: "section", section: sprint.id }),
        label:
          sprint.state === "ACTIVE" ? `${sprint.name} (active)` : sprint.name,
        disabled: sprint.id === here,
        group: "Move to",
      });
    }
    options.push({
      value: encodeChoice({ kind: "section", section: BACKLOG }),
      label: "Backlog",
      disabled: here === BACKLOG,
      group: "Move to",
    });
  }
  const list = listFor(layout, here);
  const at = list.findIndex((i) => i.id === issue.id);
  options.push(
    {
      value: "top",
      label: "Top of this list",
      disabled: at <= 0,
      group: "Order",
    },
    {
      value: "bottom",
      label: "Bottom of this list",
      disabled: at === -1 || at === list.length - 1,
      group: "Order",
    },
  );
  return options;
}

/** The patch for a menu choice, or null when it would change nothing. */
export function resolveChoice(args: {
  issue: Issue;
  choice: MoveChoice;
  layout: BacklogLayout;
  sprints: readonly Sprint[];
  statuses: Project["statuses"];
}): IssuePatch | null {
  const { issue, choice, layout, sprints, statuses } = args;
  const scrum = layout.kind === "SCRUM";
  if (choice.kind === "section") {
    return resolveBacklogMove({
      issue,
      section: choice.section,
      siblings: listFor(layout, choice.section),
      beforeId: null,
      scrum,
    });
  }
  const here = sectionOf(issue, sprints, statuses);
  const list = listFor(layout, here);
  const rest = list.filter((i) => i.id !== issue.id);
  if (rest.length === 0) return null;
  return resolveBacklogMove({
    issue,
    section: here,
    siblings: list,
    beforeId: choice.kind === "top" ? rest[0]!.id : null,
    scrum,
  });
}

/* ----------------------------------------------------------------- sprints -- */

export type SprintFigures = {
  issues: number;
  points: number;
  doneIssues: number;
  donePoints: number;
  openIssues: number;
  openPoints: number;
};

/**
 * What a sprint holds, counted the way the API counts: top-level, non-epic issues
 * only, sub-tasks never. The same figures serve the start dialog (what will be
 * committed) and the complete dialog (what was done, what is left).
 */
export function sprintFigures(
  statuses: Project["statuses"],
  issues: readonly Issue[],
  sprintId: string,
): SprintFigures {
  const scope = sprintScope(issues, sprintId);
  const done = scope.filter((issue) => isDone(statuses, issue));
  const donePoints = sumPoints(done);
  const points = sumPoints(scope);
  return {
    issues: scope.length,
    points,
    doneIssues: done.length,
    donePoints,
    openIssues: scope.length - done.length,
    openPoints: points - donePoints,
  };
}

export type CompletionDestination =
  { kind: "backlog" } | { kind: "sprint"; name: string } | { kind: "new" };

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The line said after a sprint is completed, from real figures only:
 * "CHK Sprint 3 completed — 22 of 26 points done; 3 issues moved to the backlog".
 *
 * Points when the sprint was estimated, issues when it was not (a sprint of
 * unpointed work would otherwise read "0 of 0 points"). Nothing is said about
 * moving when nothing moved.
 */
export function completionLine(
  name: string,
  figures: SprintFigures,
  to: CompletionDestination,
): string {
  let line = `${name} completed`;
  if (figures.issues > 0) {
    line +=
      figures.points > 0
        ? ` — ${figures.donePoints} of ${figures.points} points done`
        : ` — ${figures.doneIssues} of ${plural(figures.issues, "issue", "issues")} done`;
  }
  if (figures.openIssues > 0) {
    const where =
      to.kind === "backlog"
        ? "the backlog"
        : to.kind === "sprint"
          ? to.name
          : "a new sprint";
    line += `; ${plural(figures.openIssues, "issue", "issues")} moved to ${where}`;
  }
  return line;
}
