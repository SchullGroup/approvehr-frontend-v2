/**
 * The completed-work screens, worked out from the demo book.
 *
 * Demo mode has no server, so the Work record, the manager's Completed view, the
 * "Work this cycle" panel in a review and the "Completed work" list under an
 * objective are each computed here from the same finished tasks, by the rules in
 * `completions.ts`, and shaped like the API's answers. Every function is pure:
 * who is asking, who they lead and today's company zone are arguments, so a test
 * can hold each rule without a browser.
 *
 * Who may see whose work is the API's rule, mirrored: the person themselves,
 * somebody who leads them (their line manager), or somebody who can edit records.
 * A Program reader or a holder of the company-wide grant sees boards, not a
 * person's review-side record, so neither is a reason here.
 */

import type { ApiGoal, ApiWorkRecord } from "@/lib/api/performance";
import {
  BULK_LINK_LIMIT,
  byPerson,
  byProject,
  completedUnder,
  completionsBetween,
  summarise,
  type CompletedWork,
  type Completion,
  type CompletionContext,
  type TeamCompleted,
  type WorkThisCycle,
} from "./completions";
import { addDays } from "./dates";
import {
  periodAround,
  type WorkPeriod,
  type WorkPeriodKind,
} from "./work-periods";
import type { Project, ProjectData } from "./types";

export type Viewer = {
  id: string | null;
  /** Holds `EDIT_RECORDS`. */
  editRecords: boolean;
};

export type DirectoryEntry = {
  id: string;
  name: string;
  jobTitle: string;
  departmentName: string | null;
  managerId: string | null;
};

/** Whether the viewer may open this person's work record. */
export function maySeeWorkOf(
  viewer: Viewer,
  subjectId: string,
  directory: readonly DirectoryEntry[],
): boolean {
  if (viewer.editRecords) return true;
  if (!viewer.id) return false;
  if (viewer.id === subjectId) return true;
  return directory.some((p) => p.id === subjectId && p.managerId === viewer.id);
}

/** The people the viewer leads: their direct reports. */
export function ledBy(
  viewerId: string | null,
  directory: readonly DirectoryEntry[],
): DirectoryEntry[] {
  if (!viewerId) return [];
  return directory.filter((p) => p.managerId === viewerId);
}

const instant = (day: string) => `${day}T00:00:00.000Z`;

/** A finished task as a Work record row. */
function toRecordIssue(
  item: Completion,
): ApiWorkRecord["days"][number]["issues"][number] {
  return {
    id: item.id,
    key: item.key,
    title: item.title,
    projectId: item.projectId,
    projectName: item.projectName,
    type: "TASK",
    labels: [],
    doneAt: item.doneAt,
    dueDate: item.dueDate,
    onTime: item.onTime,
    grade: null,
    gradedByName: null,
    waitingForGrade: false,
    links: [],
    objective: item.objective
      ? {
          goalId: item.objective.goalId,
          title: item.objective.title,
          keyResultTitle: item.objective.keyResultTitle,
          closed: item.objective.closed,
        }
      : null,
  };
}

/** The Work record for one person over one period. */
export function demoWorkRecord(args: {
  projects: readonly ProjectData[];
  subject: DirectoryEntry;
  period: WorkPeriod;
  canOpen?: (project: Project) => boolean;
  ctx: CompletionContext;
}): ApiWorkRecord {
  const { subject, period } = args;
  const items = completionsBetween(
    args.projects,
    {
      fromDay: period.start,
      toDay: period.end,
      people: new Set([subject.id]),
      ...(args.canOpen ? { canOpen: args.canOpen } : {}),
    },
    args.ctx,
  );
  const sums = summarise(items);

  const groups = new Map<
    string,
    {
      goalId: string | null;
      title: string;
      keyResultTitle?: string;
      finished: number;
    }
  >();
  for (const item of items) {
    const o = item.objective;
    const key = o ? `${o.goalId}|${o.keyResultId ?? ""}` : "none";
    const row = groups.get(key) ?? {
      goalId: o?.goalId ?? null,
      title: o?.title ?? "Not linked to an objective",
      ...(o?.keyResultTitle ? { keyResultTitle: o.keyResultTitle } : {}),
      finished: 0,
    };
    row.finished += 1;
    groups.set(key, row);
  }
  const byObjective = [...groups.values()]
    .sort((a, b) => {
      if (a.goalId === null) return 1;
      if (b.goalId === null) return -1;
      return b.finished - a.finished || a.title.localeCompare(b.title);
    })
    .map((g) => ({ ...g, completionRate: null }));

  const days = new Map<string, Completion[]>();
  for (const item of items) {
    days.set(item.doneDay, [...(days.get(item.doneDay) ?? []), item]);
  }

  return {
    employee: {
      id: subject.id,
      name: subject.name,
      jobTitle: subject.jobTitle,
      departmentName: subject.departmentName,
    },
    period: {
      kind: period.kind,
      start: instant(period.start),
      end: instant(period.end),
      label: period.label,
    },
    summary: {
      finished: sums.finished,
      withDueDate: sums.withDueDate,
      onTime: sums.onTime,
      completionRate: null,
      graded: 0,
      linkedToObjective: sums.linked,
    },
    byObjective,
    days: [...days.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, rows]) => ({ date, issues: rows.map(toRecordIssue) })),
  };
}

/** How many tasks one person's row shows before "Show all". */
export const PERSON_ITEMS_CAP = 50;
/** How many people one page of the Completed view holds. */
export const PEOPLE_PAGE = 20;

/** The people the viewer leads, and what each finished in the period. */
export function demoTeamCompleted(args: {
  projects: readonly ProjectData[];
  viewerId: string | null;
  directory: readonly DirectoryEntry[];
  kind: WorkPeriodKind;
  day: string;
  canOpen?: (project: Project) => boolean;
  ctx: CompletionContext;
}): TeamCompleted {
  const period = periodAround(args.kind, args.day);
  const team = ledBy(args.viewerId, args.directory);
  const all = completionsBetween(
    args.projects,
    {
      fromDay: period.start,
      toDay: period.end,
      people: new Set(team.map((p) => p.id)),
      ...(args.canOpen ? { canOpen: args.canOpen } : {}),
    },
    args.ctx,
  );
  const people = team
    .map((person) => {
      const items = all.filter((i) => i.personId === person.id);
      return {
        employee: {
          id: person.id,
          name: person.name,
          jobTitle: person.jobTitle,
          departmentName: person.departmentName,
        },
        summary: summarise(items),
        items: items.slice(0, PERSON_ITEMS_CAP),
        itemsTotal: items.length,
      };
    })
    .filter((p) => p.itemsTotal > 0)
    .sort(
      (a, b) =>
        b.itemsTotal - a.itemsTotal ||
        a.employee.name.localeCompare(b.employee.name),
    );
  return {
    period: {
      kind: period.kind,
      start: instant(period.start),
      end: instant(period.end),
      label: period.label,
    },
    people,
  };
}

/** What somebody finished in a review period, for the panel inside the review. */
export function demoWorkThisCycle(args: {
  projects: readonly ProjectData[];
  subjectId: string;
  /** `YYYY-MM-DD`, inclusive. A period with no dates is the last 90 days. */
  from: string | null;
  to: string | null;
  today: string;
  canOpen?: (project: Project) => boolean;
  ctx: CompletionContext;
  cap?: number;
}): WorkThisCycle {
  const fromDay = args.from ?? addDays(args.today, -90);
  const toDay = addDays(args.to ?? args.today, 1);
  const items = completionsBetween(
    args.projects,
    {
      fromDay,
      toDay,
      people: new Set([args.subjectId]),
      ...(args.canOpen ? { canOpen: args.canOpen } : {}),
    },
    args.ctx,
  );
  const cap = args.cap ?? PERSON_ITEMS_CAP;
  return {
    summary: summarise(items),
    byProject: byProject(items),
    items: items.slice(0, cap),
    total: items.length,
    capped: items.length > cap,
  };
}

/** The completed work under one objective or KPI, grouped by person. */
export function demoCompletedWork(args: {
  projects: readonly ProjectData[];
  goal: Pick<ApiGoal, "id" | "ownerId" | "parentId" | "level">;
  goals: readonly ApiGoal[];
  /** Limit to a review period: `YYYY-MM-DD`, inclusive. Both null is any time. */
  from: string | null;
  to: string | null;
  canOpen?: (project: Project) => boolean;
  /** Only the people whose work the viewer may see. */
  mayShow: (personId: string) => boolean;
  ctx: CompletionContext;
  cap?: number;
}): CompletedWork {
  const items = completionsBetween(
    args.projects,
    {
      fromDay: args.from ?? "0000-01-01",
      toDay: args.to ? addDays(args.to, 1) : "9999-12-31",
      ...(args.canOpen ? { canOpen: args.canOpen } : {}),
    },
    args.ctx,
  ).filter((i) => args.mayShow(i.personId));
  const under = completedUnder(items, args.goal, args.goals);
  const cap = args.cap ?? BULK_LINK_LIMIT;
  const shown = under.slice(0, cap);
  return {
    groups: byPerson(shown),
    total: under.length,
    capped: under.length > cap,
  };
}
