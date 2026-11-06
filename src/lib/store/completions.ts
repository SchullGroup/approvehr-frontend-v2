"use client";

import { useCallback, useMemo } from "react";
import { ApiError } from "@/lib/api/client";
import {
  performanceApi,
  type ApiGoal,
  type ApiWorkRecord,
  type ApiWorkRecordPeriod,
} from "@/lib/api/performance";
import { completionsApi, workRecordToThisCycle } from "@/lib/api/completions";
import {
  demoCompletedWork,
  demoTeamCompleted,
  demoWorkRecord,
  demoWorkThisCycle,
  maySeeWorkOf,
  type DirectoryEntry,
} from "@/lib/projects/completions-demo";
import type {
  CompletedWork,
  CompletionContext,
  TeamCompleted,
  WorkThisCycle,
} from "@/lib/projects/completions";
import { periodAround } from "@/lib/projects/work-periods";
import type { ProjectData } from "@/lib/projects/types";
import { useCan } from "@/lib/permissions";
import { useEmployeeStore } from "@/lib/store/employees";
import { demoCyclePeriod, useDemoObjectives } from "@/lib/store/performance";
import { useDemoBook } from "@/lib/store/projects";
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
      employeeId
        ? performanceApi.workRecord(employeeId, { period, date }, signal)
        : performanceApi.myWorkRecord({ period, date }, signal),
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
 * What the people you lead finished in a period (a week, a month or a quarter).
 *
 * The demo answers in one piece. Connected, the API pages by person and this
 * walks one page at a time (`usePagedTeam` in the screen) so no screen asks for
 * everybody at once.
 */
export function useDemoTeamCompleted(
  kind: "week" | "month" | "quarter",
  date: string | undefined,
): { enabled: boolean; data: TeamCompleted | null } {
  const world = useDemoWorld();
  return useMemo(() => {
    if (!world.ready) return { enabled: false, data: null };
    return {
      enabled: true,
      data: demoTeamCompleted({
        projects: world.projects,
        viewerId: world.viewer.id,
        directory: world.directory,
        kind,
        day: date ?? world.today,
        ctx: world.ctx,
      }),
    };
  }, [world, kind, date]);
}

/* ------------------------------------------------------ work in a review */

/** The cap on the list inside a review: the panel is a summary, not the record. */
export const REVIEW_LIST_CAP = 50;

/**
 * "Work this cycle": what the person the review is about finished in its period.
 *
 * `employeeId` null is the signed-in person's own. `enabled` holds the request
 * until the review has loaded and the reader is somebody the API will answer.
 */
export function useWorkThisCycle(args: {
  employeeId: string | null;
  cycleId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  enabled: boolean;
}): Read<WorkThisCycle> {
  const { employeeId, cycleId, periodStart, periodEnd, enabled } = args;
  const { isConnected } = useSession();
  const world = useDemoWorld();

  const load = useCallback(
    async (signal: AbortSignal) =>
      workRecordToThisCycle(
        await completionsApi.workForCycle(
          employeeId,
          { cycleId, from: periodStart, to: periodEnd },
          signal,
        ),
        REVIEW_LIST_CAP,
      ),
    [employeeId, cycleId, periodStart, periodEnd],
  );
  const fetched = useFetched<WorkThisCycle>(
    `work-cycle|${employeeId ?? "mine"}|${cycleId ?? ""}|${periodStart ?? ""}|${periodEnd ?? ""}`,
    isConnected && enabled,
    load,
  );

  const demo = useMemo(() => {
    if (!world.ready || !enabled) return null;
    const subjectId = employeeId ?? world.viewer.id;
    if (!subjectId) return { error: notFound() };
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
  }, [world, enabled, employeeId, periodStart, periodEnd]);

  if (!enabled)
    return { data: null, loading: false, error: null, reload: noReload };
  if (isConnected) return fetched;
  if (!demo)
    return { data: null, loading: true, error: null, reload: noReload };
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
    (signal: AbortSignal) => completionsApi.completedWork(goalId ?? "", signal),
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
