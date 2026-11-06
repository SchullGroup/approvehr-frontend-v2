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
import type { TeamFilter, TeamPerson, TeamTask } from "@/lib/api/projects";
import { dayIn } from "@/lib/time";
import { countsAsWork } from "./objectives";
import { categoryOf } from "./workflow";
import {
  BULK_LINK_LIMIT,
  byObjective,
  objectiveCountLabel,
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
    objective: item.objective,
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

  const byObjectiveRows = byObjective(items).map((row) => ({
    goalId: row.goalId,
    title: objectiveCountLabel(row),
    ...(row.keyResultTitle ? { keyResultTitle: row.keyResultTitle } : {}),
    finished: row.finished,
    completionRate: null,
    ...(!row.unlinked && !row.visible ? { hidden: true } : {}),
  }));

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
    byObjective: byObjectiveRows,
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
    byObjective: byObjective(items),
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

/* ------------------------------------------------- the open view of the same page */

/**
 * What the people you lead have on, for the demo's Team tasks page: their open
 * top-level tasks, counted the way the API counts them (overdue, due this week,
 * later or no date) and finished this week.
 */
export function demoTeamOpen(args: {
  projects: readonly ProjectData[];
  viewerId: string | null;
  directory: readonly DirectoryEntry[];
  filter: TeamFilter;
  today: string;
  timeZone: string;
}): TeamPerson[] {
  const week = periodAround("week", args.today);
  const team = ledBy(args.viewerId, args.directory);
  return team
    .map((person) => {
      const open: TeamTask[] = [];
      let doneThisWeek = 0;
      for (const data of args.projects) {
        for (const issue of data.issues) {
          if (!countsAsWork(issue) || !issue.assigneeIds.includes(person.id)) {
            continue;
          }
          const category = categoryOf(data.project.statuses, issue.statusId);
          if (category === "DONE") {
            const day = issue.doneAt
              ? dayIn(issue.doneAt, args.timeZone)
              : null;
            if (day && day >= week.start && day < week.end) doneThisWeek += 1;
            continue;
          }
          const overdue = issue.dueDate !== null && issue.dueDate < args.today;
          open.push({
            id: issue.id,
            key: issue.key,
            title: issue.title,
            projectId: data.project.id,
            projectName: data.project.name,
            personal: false,
            statusName:
              data.project.statuses.find((s) => s.id === issue.statusId)
                ?.name ?? "",
            statusCategory: category,
            dueDate: issue.dueDate,
            dueTime: issue.dueTime ?? null,
            overdue,
            labels: issue.labels,
          });
        }
      }
      const dueThisWeek = open.filter(
        (t) =>
          !t.overdue &&
          t.dueDate !== null &&
          t.dueDate >= args.today &&
          t.dueDate < week.end,
      ).length;
      const overdue = open.filter((t) => t.overdue).length;
      const shown = open
        .filter((t) =>
          args.filter === "overdue"
            ? t.overdue
            : args.filter === "due-week"
              ? !t.overdue &&
                t.dueDate !== null &&
                t.dueDate >= args.today &&
                t.dueDate < week.end
              : true,
        )
        .sort(
          (a, b) =>
            (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
            a.key.localeCompare(b.key),
        );
      return {
        employee: {
          id: person.id,
          name: person.name,
          jobTitle: person.jobTitle,
          departmentId: person.departmentName
            ? `dept-${person.departmentName}`
            : null,
          departmentName: person.departmentName,
        },
        counts: {
          open: open.length,
          overdue,
          dueThisWeek,
          laterOrNoDate: open.length - overdue - dueThisWeek,
          doneThisWeek,
        },
        tasks: shown,
      };
    })
    .sort(
      (a, b) =>
        b.counts.overdue - a.counts.overdue ||
        a.employee.name.localeCompare(b.employee.name),
    );
}
