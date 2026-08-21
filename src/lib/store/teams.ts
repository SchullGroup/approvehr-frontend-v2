"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  teamsApi,
  type ApiTeam,
  type ApiTeamDetail,
  type ApiTeamList,
} from "@/lib/api/teams";
import { useSession } from "./session";

/**
 * Teams, in both modes — and in demo mode it is read-only, on purpose.
 *
 * ## Why demo cannot edit teams, when it can edit a rota
 *
 * `lib/store/shifts.ts` argues at length that the rota *is* editable in demo
 * mode because nothing else in the frontend reads it, so a demo rota has nothing
 * to contradict. Teams are the other case, and the reason is one line of the
 * data model: **on a departmental team, adding somebody moves their
 * `departmentId`.** A department is a payroll reporting boundary — that is the
 * argument `lib/store/departments.ts` already makes for refusing every write
 * there — so a team built in browser storage would move a cost centre that the
 * demo's own payroll screens would then disagree about.
 *
 * So there are no demo teams. Not an empty editable list: an explicit, stated
 * refusal, in the same words as the department store's, because a company with
 * two teams in a demo and none of them reaching a payroll report teaches the
 * opposite of how the product works.
 *
 * The honest consequence, stated once: the teams surface can only be
 * demonstrated against a running API. The screen says so rather than showing an
 * empty card.
 *
 * ## Shape
 *
 * `lib/store/shifts.ts` is the model, and the two rules from it are obeyed here:
 * the offline value is a `useMemo` that never touches state, and the fetch runs
 * in an async IIFE inside the effect behind a `cancelled` guard. Staleness is
 * decided by comparing a key **during render** rather than clearing state in an
 * effect, which would be a synchronous setState and a cascaded render.
 */

const OFFLINE_REFUSAL =
  "Teams need the API. Putting somebody on a team also puts them in that " +
  "team's department, and a department is a payroll reporting boundary — a " +
  "team built in this browser would move a cost centre no payroll run will " +
  "ever see.";

/** Thrown by every mutation in demo mode. Never swallowed by a screen. */
function offline(): never {
  throw new ApiError(0, "offline", OFFLINE_REFUSAL);
}

const EMPTY_LIST: ApiTeamList = {
  teams: [],
  counts: { teams: 0, crossFunctional: 0, peopleOnATeam: 0 },
};

export type TeamsState = {
  teams: ApiTeam[];
  counts: ApiTeamList["counts"];
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode: every write refuses, with `refusal` as the reason. */
  editable: boolean;
  /** The sentence to render when `editable` is false. */
  refusal: string;
  reload: () => void;
};

export function useTeams(
  params: { includeArchived?: boolean; departmentId?: string } = {},
): TeamsState {
  const { isConnected } = useSession();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    list: ApiTeamList;
    error: ApiError | null;
  } | null>(null);

  const includeArchived = params.includeArchived ?? false;
  const departmentId = params.departmentId;
  const key = `${String(includeArchived)}|${departmentId ?? ""}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const list = await teamsApi.list(
          { includeArchived, ...(departmentId ? { departmentId } : {}) },
          controller.signal,
        );
        if (!cancelled) setFetched({ key, list, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            list: EMPTY_LIST,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, departmentId, key]);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  /* Never touches state. There is nothing to derive in demo mode — see the
     header — so this is the constant, and it exists as a memo rather than a
     literal so the identity is stable across renders. */
  const offlineValue = useMemo<TeamsState>(
    () => ({
      ...EMPTY_LIST,
      loading: false,
      error: null,
      editable: false,
      refusal: OFFLINE_REFUSAL,
      reload,
    }),
    [reload],
  );

  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) return offlineValue;

  return {
    teams: matched ? fetched.list.teams : [],
    counts: matched ? fetched.list.counts : EMPTY_LIST.counts,
    loading: !matched,
    error: matched ? fetched.error : null,
    editable: true,
    refusal: OFFLINE_REFUSAL,
    reload,
  };
}

export type TeamDetailState = {
  team: ApiTeamDetail | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

/**
 * One team with its members, for the drawer.
 *
 * Kept as `{ id, team }` rather than a bare team, the same way `useDepartment`
 * does it: the result carries the id it belongs to, so a slow response for a
 * team you have navigated away from cannot be shown, and there is nothing to
 * clear when `id` changes — the stale value simply stops matching.
 */
export function useTeam(id: string | null): TeamDetailState {
  const { isConnected } = useSession();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    team: ApiTeamDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = Boolean(id) && isConnected;
  const key = `${id ?? ""}|${tick}`;

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const team = await teamsApi.get(id, controller.signal);
        if (!cancelled) setFetched({ key, team, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            team: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, id, key]);

  const reload = useCallback(() => setTick((current) => current + 1), []);
  const matched = active && fetched !== null && fetched.key === key;

  return {
    team: matched ? fetched.team : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    reload,
  };
}

/**
 * Every write, each refusing in demo mode rather than pretending.
 *
 * Nothing here reloads on your behalf: the writes that matter return what they
 * *did* — `moved`, `added`, `alreadyOn` — and a hook that swallowed the response
 * to trigger a refetch would throw away the only record of a cost centre having
 * changed. The caller shows it, then reloads.
 */
export function useTeamMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) offline();
  }, [isConnected]);

  return {
    editable: isConnected,
    refusal: OFFLINE_REFUSAL,
    create: useCallback(
      async (body: Parameters<typeof teamsApi.create>[0]) => {
        guard();
        return teamsApi.create(body);
      },
      [guard],
    ),
    update: useCallback(
      async (id: string, body: Parameters<typeof teamsApi.update>[1]) => {
        guard();
        return teamsApi.update(id, body);
      },
      [guard],
    ),
    archive: useCallback(
      async (id: string) => {
        guard();
        return teamsApi.archive(id);
      },
      [guard],
    ),
    restore: useCallback(
      async (id: string) => {
        guard();
        return teamsApi.restore(id);
      },
      [guard],
    ),
    addMembers: useCallback(
      async (id: string, employeeIds: string[], roleLabel?: string) => {
        guard();
        return teamsApi.addMembers(id, employeeIds, roleLabel);
      },
      [guard],
    ),
    removeMembers: useCallback(
      async (id: string, employeeIds: string[]) => {
        guard();
        return teamsApi.removeMembers(id, employeeIds);
      },
      [guard],
    ),
  };
}
