"use client";

import { useCallback } from "react";
import type { ApiError } from "@/lib/api/client";
import {
  workTrackersApi,
  type ApiGoalMappingRule,
  type ApiRemoteProject,
  type ApiSyncRun,
  type ApiTrackerIdentity,
  type ApiWorkEvidence,
  type ApiWorkTrackerConnectionDetail,
  type ApiWorkTrackerProvider,
  type EvidenceRange,
} from "@/lib/api/work-trackers";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * Read hooks for work-tracker integrations.
 *
 * **Connected mode only.** There is no demo copy of a Jira connection: a
 * pretend "Connected" badge is precisely the dishonest state the integrations
 * page was written to avoid, so offline every list is empty and every screen
 * says so. Writes go through `workTrackersApi` with `useAction` at the call
 * site, then the hook's `reload()`.
 */

export function useWorkTrackerProviders() {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => workTrackersApi.providers(signal),
    [],
  );
  const fetched = useFetched<ApiWorkTrackerProvider[]>(
    "work-tracker-providers",
    isConnected,
    load,
  );
  return {
    providers: fetched.data ?? [],
    loading: fetched.loading,
    error: fetched.error,
    reload: fetched.reload,
    connected: isConnected,
  };
}

/**
 * One list read, with its own state. `items` is **null** until the read has
 * answered and stays null if it failed, which is what lets a screen tell
 * "nobody here" from "this did not load" and "still asking". A bare array
 * defaulting to `[]` cannot: all three look the same.
 */
export type ListRead<T> = {
  items: T[] | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

function listOf<T>(read: {
  data: T[] | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}): ListRead<T> {
  return {
    items: read.data,
    loading: read.loading,
    error: read.error,
    reload: read.reload,
  };
}

export function useWorkTrackerConnection(id: string) {
  const { isConnected } = useSession();
  const loadDetail = useCallback(
    (signal: AbortSignal) => workTrackersApi.connection(id, signal),
    [id],
  );
  const loadIdentities = useCallback(
    (signal: AbortSignal) => workTrackersApi.identities(id, signal),
    [id],
  );
  const loadRules = useCallback(
    (signal: AbortSignal) => workTrackersApi.rules(id, signal),
    [id],
  );
  const loadRuns = useCallback(
    (signal: AbortSignal) => workTrackersApi.runs(id, signal),
    [id],
  );

  const detail = useFetched<ApiWorkTrackerConnectionDetail>(
    `wt-connection|${id}`,
    isConnected,
    loadDetail,
  );
  const identities = useFetched<ApiTrackerIdentity[]>(
    `wt-identities|${id}`,
    isConnected,
    loadIdentities,
  );
  const rules = useFetched<ApiGoalMappingRule[]>(
    `wt-rules|${id}`,
    isConnected,
    loadRules,
  );
  const runs = useFetched<ApiSyncRun[]>(`wt-runs|${id}`, isConnected, loadRuns);

  const reloadDetail = detail.reload;
  const reloadIdentities = identities.reload;
  const reloadRules = rules.reload;
  const reloadRuns = runs.reload;
  const reloadAll = useCallback(() => {
    reloadDetail();
    reloadIdentities();
    reloadRules();
    reloadRuns();
  }, [reloadDetail, reloadIdentities, reloadRules, reloadRuns]);

  return {
    connection: detail.data,
    identities: listOf(identities),
    rules: listOf(rules),
    runs: listOf(runs),
    loading: detail.loading,
    error: detail.error,
    reload: reloadAll,
    reloadIdentities,
    reloadRules,
  };
}

/**
 * Read live from the tool, whenever a panel that needs the project list is on
 * screen (Projects and Rules, on an active connection). Like every fetched
 * read it is asked again when the reader returns to the window, at most once
 * per `lib/revalidate`'s floor.
 */
export function useRemoteProjects(id: string, active: boolean) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => workTrackersApi.remoteProjects(id, signal),
    [id],
  );
  const fetched = useFetched<ApiRemoteProject[]>(
    `wt-projects|${id}`,
    isConnected && active,
    load,
  );
  return {
    projects: fetched.data ?? [],
    loading: fetched.loading,
    error: fetched.error,
    reload: fetched.reload,
  };
}

export function useWorkEvidence(
  employeeId: string | null,
  range: EvidenceRange,
) {
  const { isConnected } = useSession();
  const { cycleId, from, to } = range;
  const load = useCallback(
    (signal: AbortSignal) =>
      workTrackersApi.evidence(
        employeeId ?? "",
        {
          ...(cycleId ? { cycleId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
        signal,
      ),
    [employeeId, cycleId, from, to],
  );
  const fetched = useFetched<ApiWorkEvidence>(
    `wt-evidence|${employeeId}|${cycleId}|${from}|${to}`,
    isConnected && employeeId !== null,
    load,
  );
  return {
    evidence: fetched.data,
    loading: fetched.loading,
    error: fetched.error,
    reload: fetched.reload,
    connected: isConnected,
  };
}
