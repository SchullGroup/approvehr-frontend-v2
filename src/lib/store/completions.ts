"use client";

import { useCallback, useMemo } from "react";
import { ApiError } from "@/lib/api/client";
import {
  projectsApi,
  type TeamFilter,
  type TeamPerson,
} from "@/lib/api/projects";
import {
  performanceApi,
  type ApiGoal,
  type ApiWorkRecord,
  type ApiWorkRecordPeriod,
} from "@/lib/api/performance";
import { completionsApi, type TeamRow } from "@/lib/api/completions";
import {
  demoCompletedWork,
  demoTeamCompleted,
  demoTeamOpen,
  demoWorkRecord,
  demoWorkThisCycle,
  maySeeWorkOf,
  type DirectoryEntry,
} from "@/lib/projects/completions-demo";
import type {
  CompletedWork,
  CompletionContext,
  TeamCompleted,
  TeamCompletedPerson,
  WorkThisCycle,
} from "@/lib/projects/completions";
import {
  BULK_LINK_LIMIT,
  runBulkLink,
  type BulkItem,
  type BulkLinkResult,
  type BulkTarget,
} from "@/lib/projects/bulk-link";
import { patchIssueInBook } from "@/lib/projects/demo-book";
import { periodAround } from "@/lib/projects/work-periods";
import type { ProjectData } from "@/lib/projects/types";
import { useCan } from "@/lib/permissions";
import { useEmployeeStore } from "@/lib/store/employees";
import { demoCyclePeriod, useDemoObjectives } from "@/lib/store/performance";
import { demoRun, useDemoBook } from "@/lib/store/projects";
import { usePagedList } from "@/lib/store/paged-list";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { todayIn } from "@/lib/time";
import { useFetched } from "@/lib/use-fetched";

/**
 * The completed-work reads, in both modes.
 *
 * Connected, each asks the API and says what it said. In the demo there is no
 * server, so each works the same answer out of the demo book (`completions-demo`)
 * for the same person, by the same rules, and so a role preview (Employee,
 * manager, HR, Owner) changes what these return exactly as it would connected.
 *
 * Nothing here reads a score or moves a figure. These are lists of finished
 * tasks and counts of them.
 */

export type Read<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

const noReload = () => undefined;

/**
 * One request for one question, however many times it is asked at once.
 *
 * React's development StrictMode runs an effect, undoes it and runs it again, so
 * a read started in an effect is asked twice for one screen. The first ask is
 * aborted by the undo, which is right for what it was doing and wrong for the
 * request itself, so the request is shared: the second ask finds the first still
 * in flight and waits for it. Each reader still gives up when its own signal
 * aborts, and the request is never cancelled out from under the other one.
 */
const inflight = new Map<string, Promise<unknown>>();

function shared<T>(
  key: string,
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  let held = inflight.get(key) as Promise<T> | undefined;
  if (!held) {
    held = run().finally(() => inflight.delete(key));
    inflight.set(key, held);
  }
  const answer = held;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    answer.then(resolve, reject);
  });
}

/** Everything the demo's answers are worked out from, none of it fetched. */
function useDemoWorld() {
  const { isConnected, isLoading, actingId } = useSession();
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const book = useDemoBook(!isConnected && !isLoading, today);
  const goals = useDemoObjectives();
  const editRecords = useCan("EDIT_RECORDS");
  const { directory: people } = useEmployeeStore();

  const directory = useMemo<DirectoryEntry[]>(
    () =>
      people.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        jobTitle: p.jobTitle,
        departmentName: p.department || null,
        managerId: p.managerId,
      })),
    [people],
  );
  const ctx = useMemo<CompletionContext>(() => {
    const names = new Map(directory.map((p) => [p.id, p.name]));
    return {
      timeZone,
      goals,
      nameOf: (id) => names.get(id) ?? "Someone",
    };
  }, [directory, goals, timeZone]);
  const projects = useMemo<ProjectData[]>(
    () => Object.values(book.projects),
    [book.projects],
  );

  return {
    demo: !isConnected,
    ready: !isConnected && !isLoading,
    viewer: { id: actingId || null, editRecords },
    today,
    directory,
    ctx,
    projects,
    goals,
  };
}

const notFound = () =>
  new ApiError(404, "not_found", "That person could not be found.");

const demoRead = <T>(
  data: T | null,
  error: ApiError | null = null,
): Read<T> => ({
  data,
  loading: false,
  error,
  reload: noReload,
});

/* ------------------------------------------------------------- work record */

/**
 * One person's work record over one period. `employeeId` undefined is the
 * signed-in person's own.
 */
export function useWorkRecord(
  employeeId: string | undefined,
  period: ApiWorkRecordPeriod,
  date: string | undefined,
): Read<ApiWorkRecord> {
  const { isConnected } = useSession();
  const world = useDemoWorld();

  const load = useCallback(
    (signal: AbortSignal) =>
      shared(
        `work-record|${employeeId ?? "mine"}|${period}|${date ?? "today"}`,
        signal,
        () =>
          employeeId
            ? performanceApi.workRecord(employeeId, { period, date })
            : performanceApi.myWorkRecord({ period, date }),
      ),
    [employeeId, period, date],
  );
  const fetched = useFetched<ApiWorkRecord>(
    `work-record|${employeeId ?? "mine"}|${period}|${date ?? "today"}`,
    isConnected,
    load,
  );

  const demo = useMemo(() => {
    if (!world.ready) return null;
    const subjectId = employeeId ?? world.viewer.id;
    const subject = world.directory.find((p) => p.id === subjectId);
    if (!subject || !maySeeWorkOf(world.viewer, subject.id, world.directory)) {
      return { error: notFound() };
    }
    return {
      record: demoWorkRecord({
        projects: world.projects,
        subject,
        period: periodAround(period, date ?? world.today),
        ctx: world.ctx,
      }),
    };
  }, [world, employeeId, period, date]);

  if (isConnected) return fetched;
  if (!demo)
    return { data: null, loading: true, error: null, reload: noReload };
  return "error" in demo
    ? demoRead<ApiWorkRecord>(null, demo.error)
    : demoRead(demo.record);
}

/* --------------------------------------------------- the manager's completed */

/** Whether the viewer leads anybody: the only people the Completed view is for. */
export function useLeadsAnyone(): boolean {
  const world = useDemoWorld();
  return useMemo(
    () => world.directory.some((p) => p.managerId === world.viewer.id),
    [world.directory, world.viewer.id],
  );
}

/**
 * What the people you lead have on, worked out for the demo, which has no server
 * to ask. `null` when connected: the page asks the API itself.
 */
export function useDemoTeamOpen(filter: TeamFilter): TeamPerson[] | null {
  const world = useDemoWorld();
  return useMemo(
    () =>
      world.ready
        ? demoTeamOpen({
            projects: world.projects,
            viewerId: world.viewer.id,
            directory: world.directory,
            filter,
            today: world.today,
            timeZone: world.ctx.timeZone,
          })
        : null,
    [world, filter],
  );
}

/** How many finished tasks one page of the Completed view asks for. */
export const TEAM_PAGE = 50;

export type TeamCompletedList = {
  people: TeamCompletedPerson[];
  /** Every finished task the period matches, when known. */
  total: number | null;
  /** How many of them are on screen now. */
  shown: number;
  loading: boolean;
  error: ApiError | null;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: ApiError | null;
  loadMore: () => void;
  reload: () => void;
};

/**
 * The rows the API gave, grouped by the person they are credited to. The API
 * sorts by person, so a person's tasks are together, and one cut across two pages
 * simply continues in the next: the same person at the end of one page and the
 * start of the next is one group.
 */
export function groupTeamRows(rows: readonly TeamRow[]): TeamCompletedPerson[] {
  const groups: TeamCompletedPerson[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.employee.id === row.personId) {
      last.items.push(row);
      continue;
    }
    groups.push({
      employee: {
        id: row.personId,
        name: row.personName,
        jobTitle: row.jobTitle,
        departmentName: row.departmentName,
      },
      summary: row.totals,
      items: [row],
      itemsTotal: row.totals.finished,
    });
  }
  return groups;
}

/**
 * What the people you lead finished in a period (a week, a month or a quarter).
 *
 * `anchor` is any day inside the period, or undefined for today. Connected, the
 * API pages by task and this keeps what it has been given, so no screen ever asks
 * for everything at once; the demo answers in one piece.
 */
export function useTeamCompleted(
  kind: "week" | "month" | "quarter",
  anchor: string | undefined,
  /** One person, or `null` for everybody the reader may see. */
  employeeId: string | null = null,
): TeamCompletedList {
  const { isConnected } = useSession();
  const world = useDemoWorld();

  const paged = usePagedList<TeamRow>({
    key: `team-completed|${kind}|${anchor ?? "today"}|${employeeId ?? "all"}`,
    enabled: isConnected,
    idOf: (row) => row.id,
    fetchPage: async (cursor, signal) => {
      const page = await shared(
        `team|${kind}|${anchor ?? ""}|${employeeId ?? ""}|${cursor ?? ""}`,
        signal,
        () =>
          completionsApi.teamCompleted({
            period: kind,
            date: anchor,
            employeeId: employeeId ?? undefined,
            cursor,
            limit: TEAM_PAGE,
          }),
      );
      return { rows: page.rows, total: page.total, next: page.next };
    },
  });

  const demo = useMemo<TeamCompleted | null>(
    () =>
      world.ready
        ? demoTeamCompleted({
            projects: world.projects,
            viewerId: world.viewer.id,
            directory: world.directory,
            kind,
            day: anchor ?? world.today,
            everyone: world.viewer.editRecords,
            employeeId,
            ctx: world.ctx,
          })
        : null,
    [world, kind, anchor, employeeId],
  );

  const connectedPeople = useMemo(
    () => groupTeamRows(paged.settling ? [] : paged.rows),
    [paged.rows, paged.settling],
  );

  if (isConnected) {
    /* A new period is a new list: while it is settling, the rows still on hand
       belong to the last period, and showing them under this one's heading
       would be a claim about the wrong weeks. */
    return {
      people: connectedPeople,
      total: paged.settling ? null : paged.total,
      shown: paged.settling ? 0 : paged.rows.length,
      loading: paged.loading || paged.settling,
      error: paged.error,
      hasMore: paged.hasMore,
      loadingMore: paged.loadingMore,
      moreError: paged.moreError,
      loadMore: paged.loadMore,
      reload: paged.reload,
    };
  }
  const tasks = demo?.people.reduce((n, p) => n + p.items.length, 0) ?? 0;
  return {
    people: demo?.people ?? [],
    total: demo ? tasks : null,
    shown: tasks,
    loading: demo === null,
    error: null,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: noReload,
    reload: noReload,
  };
}

/* ------------------------------------------------------------ bulk linking */

/** A task to change, with who it is assigned to (the demo checks who may link it). */
export type BulkLinkItem = BulkItem & { personId: string | null };

/**
 * Link or clear many tasks at once. One change per task, a few at a time, and
 * the answer says how many changed and, for each that did not, why.
 *
 * Connected, it is one `POST /issues/objective-links` and each task answers for
 * itself, so the API decides every one. In the demo each is applied to the demo
 * book, and the same people may link: the assignee, the project's lead, the
 * assignee's manager and HR.
 */
export function useBulkLink(): (
  items: readonly BulkLinkItem[],
  target: BulkTarget,
) => Promise<BulkLinkResult> {
  const { isConnected } = useSession();
  const world = useDemoWorld();
  const { viewer, directory, projects, today } = world;

  return useCallback(
    async (items, target) => {
      const goalId = target?.goalId ?? null;
      const keyResultId = target?.keyResultId ?? null;
      if (isConnected) {
        const queue = items.slice(0, BULK_LINK_LIMIT);
        try {
          const answer = await projectsApi.bulkObjective({
            issueIds: queue.map((item) => item.id),
            goalId,
            keyResultId,
          });
          const keyOf = new Map(queue.map((item) => [item.id, item.key]));
          const failed = answer.items
            .filter(
              (row) => row.result === "refused" || row.result === "not_found",
            )
            .map((row) => ({
              id: row.issueId,
              key: row.key ?? keyOf.get(row.issueId) ?? "",
              reason:
                row.message ??
                "It could not be found, or it is not yours to link.",
            }));
          return { changed: answer.items.length - failed.length, failed };
        } catch (error) {
          /* The objective itself was refused, so nothing was attempted: every
             task says the same plain thing. */
          const reason =
            error instanceof ApiError
              ? error.message
              : "It could not be changed.";
          return {
            changed: 0,
            failed: queue.map((item) => ({
              id: item.id,
              key: item.key,
              reason,
            })),
          };
        }
      }
      return runBulkLink(items, async (item) => {
        const patch = { goalId, keyResultId };
        const owner = projects.find((p) =>
          p.issues.some((i) => i.id === item.id),
        );
        const mayLink =
          viewer.editRecords ||
          (viewer.id !== null &&
            (item.personId === viewer.id ||
              owner?.project.leadId === viewer.id ||
              directory.some(
                (p) => p.id === item.personId && p.managerId === viewer.id,
              )));
        if (!mayLink) {
          return { ok: false, message: "You can't link this task." };
        }
        const result = demoRun(viewer.id, today, (book, ctx) => {
          const out = patchIssueInBook(book, item.id, patch, ctx);
          return { book: out.book, value: out.issue };
        });
        return result.ok
          ? { ok: true }
          : { ok: false, message: result.message };
      });
    },
    [isConnected, viewer, directory, projects, today],
  );
}

/* ------------------------------------------------------ work in a review */

/** The cap on the list inside a review: the panel is a summary, not the record. */
export const REVIEW_LIST_CAP = 50;

/**
 * "Work this cycle": what the person the review is about finished in its period.
 *
 * `enabled` holds the request until the review has loaded and is one the panel
 * is for. A period with no dates has no stretch to read, so there is nothing to
 * show and `data` is `null`, which hides the panel.
 */
export function useWorkThisCycle(args: {
  subjectId: string | null;
  cycleId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  enabled: boolean;
}): Read<WorkThisCycle> {
  const { subjectId, cycleId, periodStart, periodEnd, enabled } = args;
  const { isConnected } = useSession();
  const world = useDemoWorld();

  const load = useCallback(
    (signal: AbortSignal) =>
      shared(`cycle|${cycleId ?? ""}|${subjectId ?? ""}`, signal, () =>
        completionsApi.workForCycle(cycleId ?? "", subjectId ?? "", {
          limit: REVIEW_LIST_CAP,
        }),
      ),
    [cycleId, subjectId],
  );
  const fetched = useFetched<WorkThisCycle | null>(
    `work-cycle|${subjectId ?? ""}|${cycleId ?? ""}`,
    isConnected && enabled && subjectId !== null && cycleId !== null,
    load,
  );

  const demo = useMemo(() => {
    if (!world.ready || !enabled || !subjectId) return null;
    if (!periodStart || !periodEnd) return { work: null };
    if (!maySeeWorkOf(world.viewer, subjectId, world.directory)) {
      return { error: notFound() };
    }
    return {
      work: demoWorkThisCycle({
        projects: world.projects,
        subjectId,
        from: periodStart,
        to: periodEnd,
        today: world.today,
        ctx: world.ctx,
        cap: REVIEW_LIST_CAP,
      }),
    };
  }, [world, enabled, subjectId, periodStart, periodEnd]);

  if (!enabled) {
    return { data: null, loading: false, error: null, reload: noReload };
  }
  if (isConnected) return fetched;
  if (!demo) {
    return { data: null, loading: true, error: null, reload: noReload };
  }
  return "error" in demo
    ? demoRead<WorkThisCycle>(null, demo.error)
    : demoRead(demo.work);
}

/* ------------------------------------------------ under an objective or KPI */

/**
 * "Completed work" under one objective or KPI, grouped by person.
 *
 * Held until `enabled`, so a list of objectives asks for nothing until somebody
 * opens one.
 */
export function useCompletedWork(args: {
  goal: Pick<
    ApiGoal,
    "id" | "ownerId" | "parentId" | "level" | "reviewCycleId"
  > | null;
  enabled: boolean;
}): Read<CompletedWork> {
  const { goal, enabled } = args;
  const { isConnected } = useSession();
  const world = useDemoWorld();
  const goalId = goal?.id ?? null;

  const load = useCallback(
    (signal: AbortSignal) =>
      shared(`goal|${goalId ?? ""}`, signal, () =>
        completionsApi.completedWork(goalId ?? "", { limit: 100 }),
      ),
    [goalId],
  );
  const fetched = useFetched<CompletedWork>(
    `completed-work|${goalId ?? ""}`,
    isConnected && enabled && goalId !== null,
    load,
  );

  const demo = useMemo(() => {
    if (!world.ready || !enabled || !goal) return null;
    const period = demoCyclePeriod(goal.reviewCycleId);
    return demoCompletedWork({
      projects: world.projects,
      goal,
      goals: world.goals,
      from: period?.start ?? null,
      to: period?.end ?? null,
      mayShow: (personId) =>
        maySeeWorkOf(world.viewer, personId, world.directory),
      ctx: world.ctx,
    });
  }, [world, enabled, goal]);

  if (!enabled || !goal) {
    return { data: null, loading: false, error: null, reload: noReload };
  }
  if (isConnected) return fetched;
  return demo
    ? demoRead(demo)
    : { data: null, loading: true, error: null, reload: noReload };
}
