import { request } from "./client";

/**
 * Work-tracker integrations — `approvehr-backend` `src/modules/work-trackers`.
 *
 * Jira, Asana, ClickUp, Monday.com and Trello. Each is `configured: false`
 * until the server has that tool's credentials. Every setup call needs
 * `MANAGE_SETTINGS`. The evidence calls need nothing on the route: the API
 * answers for yourself, the people who report to you, or anyone with
 * `EDIT_RECORDS`, and refuses the rest.
 *
 * Connecting is a browser round trip, not a fetch: `connect()` returns the
 * tool's consent URL, the page sends the browser there, and the tool sends it
 * back through the API to `/settings/integrations?workTracker=connected`.
 * Trello is the exception: it returns a token in the URL fragment to
 * `/settings/integrations/connect-return`, which posts it with
 * `completeToken`.
 */

export type WorkTrackerProvider =
  "JIRA" | "ASANA" | "CLICKUP" | "MONDAY" | "TRELLO";

export type WorkTrackerStatus = "ACTIVE" | "NEEDS_REAUTH" | "DISCONNECTED";

export type ApiWorkTrackerConnection = {
  id: string;
  provider: WorkTrackerProvider;
  status: WorkTrackerStatus;
  site: { id: string; name: string | null; url: string | null };
  /** Project keys. Empty means nothing is read yet. */
  selectedProjects: string[];
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  connectedById: string;
  createdAt: string;
};

export type ApiSyncRun = {
  id: string;
  trigger: "SCHEDULED" | "MANUAL";
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  stored: number;
  linked: number;
  skippedUnmatched: number;
  error: string | null;
};

export type ApiWorkTrackerConnectionDetail = ApiWorkTrackerConnection & {
  unmatchedPeople: number;
  lastRun: ApiSyncRun | null;
};

export type ApiWorkTrackerProvider = {
  slug: string;
  provider: WorkTrackerProvider;
  name: string;
  /** False = no adapter yet ("coming soon"). */
  available: boolean;
  /** False = this server has no credentials for the tool. */
  configured: boolean;
  connections: ApiWorkTrackerConnection[];
};

export type ApiRemoteProject = { key: string; name: string };

export type ApiTrackerIdentity = {
  id: string;
  externalUserId: string;
  externalEmail: string | null;
  displayName: string;
  employeeId: string | null;
  matchedBy: "EMAIL" | "MANUAL" | null;
  ignored: boolean;
  employee: { id: string; firstName: string; lastName: string } | null;
};

export type GoalRuleMatch = "PROJECT" | "EPIC" | "LABEL";

export type ApiGoalMappingRule = {
  id: string;
  matchType: GoalRuleMatch;
  matchValue: string;
  goalId: string;
  goal: { id: string; title: string };
  createdAt: string;
};

export type ApiSyncSummary = {
  runId: string;
  fetched: number;
  stored: number;
  linked: number;
  skippedUnmatched: number;
  error: string | null;
};

export type ExternalTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type ApiEvidenceTask = {
  id: string;
  provider: WorkTrackerProvider;
  key: string;
  title: string;
  url: string;
  projectKey: string;
  status: ExternalTaskStatus;
  statusName: string;
  dueAt: string | null;
  completedAt: string | null;
  /** The weekly task it became, if it became one. */
  objectiveTask: {
    id: string;
    goalId: string;
    grade: "COMPLETED" | "PARTIALLY_COMPLETED" | "NOT_COMPLETED" | null;
  } | null;
};

export type ApiWorkEvidence = {
  employeeId: string;
  from: string;
  to: string;
  summary: {
    completed: number;
    completedWithDueDate: number;
    completedOnTime: number;
    /** Percent, or null when nothing finished had a due date. */
    onTimeRate: number | null;
    openOverdue: number;
    medianDaysToClose: number | null;
  };
  tasks: ApiEvidenceTask[];
};

export type EvidenceRange = { cycleId?: string; from?: string; to?: string };

export type ApiConfirmResult = {
  graded: string[];
  skipped: { id: string; reason: string }[];
};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const workTrackersApi = {
  providers: (signal?: AbortSignal) =>
    request<ApiWorkTrackerProvider[]>(
      "/work-trackers/providers",
      signalOf(signal),
    ),

  /** The tool's consent URL. Send the browser there. */
  connect: (slug: string) =>
    request<{ url: string }>(`/work-trackers/providers/${slug}/connect`, {
      method: "POST",
    }),

  /**
   * Trello's return page: hand over the token Trello put in the URL
   * fragment, with the signed state from the query string. Anonymous on
   * purpose — the state is the proof, as on the OAuth callback. Answers
   * where to send the browser next.
   */
  completeToken: (body: { state: string; token?: string; error?: string }) =>
    request<{ redirect: string }>("/work-trackers/oauth/token", {
      method: "POST",
      body,
      anonymous: true,
    }),

  connection: (id: string, signal?: AbortSignal) =>
    request<ApiWorkTrackerConnectionDetail>(
      `/work-trackers/connections/${id}`,
      signalOf(signal),
    ),

  setProjects: (id: string, selectedProjects: string[]) =>
    request<ApiWorkTrackerConnection>(`/work-trackers/connections/${id}`, {
      method: "PATCH",
      body: { selectedProjects },
    }),

  /** Read live from the tool. */
  remoteProjects: (id: string, signal?: AbortSignal) =>
    request<ApiRemoteProject[]>(
      `/work-trackers/connections/${id}/projects`,
      signalOf(signal),
    ),

  disconnect: (id: string, purge: boolean) =>
    request<{ id: string; purged: boolean }>(
      `/work-trackers/connections/${id}`,
      {
        method: "DELETE",
        query: { purge: purge ? "true" : "false" },
      },
    ),

  syncNow: (id: string) =>
    request<ApiSyncSummary>(`/work-trackers/connections/${id}/sync`, {
      method: "POST",
    }),

  runs: (id: string, signal?: AbortSignal) =>
    request<ApiSyncRun[]>(
      `/work-trackers/connections/${id}/runs`,
      signalOf(signal),
    ),

  identities: (id: string, signal?: AbortSignal) =>
    request<ApiTrackerIdentity[]>(
      `/work-trackers/connections/${id}/identities`,
      signalOf(signal),
    ),

  updateIdentity: (
    id: string,
    identityId: string,
    body: { employeeId?: string | null; ignored?: boolean },
  ) =>
    request<ApiTrackerIdentity>(
      `/work-trackers/connections/${id}/identities/${identityId}`,
      { method: "PATCH", body },
    ),

  rules: (id: string, signal?: AbortSignal) =>
    request<ApiGoalMappingRule[]>(
      `/work-trackers/connections/${id}/rules`,
      signalOf(signal),
    ),

  createRule: (
    id: string,
    body: { matchType: GoalRuleMatch; matchValue: string; goalId: string },
  ) =>
    request<{ rule: ApiGoalMappingRule; linked: number }>(
      `/work-trackers/connections/${id}/rules`,
      { method: "POST", body },
    ),

  deleteRule: (id: string, ruleId: string) =>
    request<{ id: string }>(
      `/work-trackers/connections/${id}/rules/${ruleId}`,
      {
        method: "DELETE",
      },
    ),

  evidence: (employeeId: string, range: EvidenceRange, signal?: AbortSignal) =>
    request<ApiWorkEvidence>(`/work-trackers/evidence/${employeeId}`, {
      query: { cycleId: range.cycleId, from: range.from, to: range.to },
      ...signalOf(signal),
    }),

  /** Grade imported weekly tasks Completed. Refusals come back in `skipped`. */
  confirm: (objectiveTaskIds: string[]) =>
    request<ApiConfirmResult>("/work-trackers/evidence/confirm", {
      method: "POST",
      body: { objectiveTaskIds },
    }),

  linkTask: (externalTaskId: string, goalId: string) =>
    request<unknown>(`/work-trackers/tasks/${externalTaskId}/link`, {
      method: "POST",
      body: { goalId },
    }),
};

/** Display names for the five tools. */
export const PROVIDER_NAME: Record<WorkTrackerProvider, string> = {
  JIRA: "Jira",
  ASANA: "Asana",
  CLICKUP: "ClickUp",
  MONDAY: "Monday.com",
  TRELLO: "Trello",
};

/**
 * Why the browser came back from a tool without a connection, in words. The
 * API sends a short code in `?reason=`; anything else gets the generic line.
 *
 * **Own keys only.** The code comes from the address bar, so anybody can put
 * anything there, and a plain `REASONS[code]` also finds what every object
 * inherits: `__proto__` returns an object, which the toast then tries to
 * render and React throws on, and `constructor` returns a function. A link
 * that crashes the page is a small thing; it is also a one-word fix.
 */
const CONNECT_FAILURES: Record<string, string> = {
  expired:
    "The sign-in took longer than ten minutes, or did not start here. Start again.",
  denied: "Access was not granted in the tool. Nothing was connected.",
  no_site: "That account cannot see any site in the tool.",
  unavailable: "That tool cannot be connected yet.",
  failed: "The tool did not answer as expected. Try again in a minute.",
};

export function connectFailureText(reason: string | null): string {
  const known =
    reason !== null && Object.hasOwn(CONNECT_FAILURES, reason)
      ? CONNECT_FAILURES[reason]
      : undefined;
  return known ?? CONNECT_FAILURES["failed"]!;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A connection id taken from the address bar, or null if it is not one. */
export function connectionIdOf(raw: string | null): string | null {
  return raw !== null && UUID.test(raw) ? raw : null;
}

/**
 * The most tasks the API grades in one request (`confirmSchema` allows 1 to
 * 200). A manager with more waiting than that would otherwise have the whole
 * request refused, so the button sends them in batches of this size.
 */
export const CONFIRM_BATCH_LIMIT = 200;

/**
 * Grade imported tasks Completed, in as many requests as it takes.
 *
 * The answers are merged, so the caller sees one `graded` and one `skipped`.
 * If a later batch fails after an earlier one landed, the tasks in the batches
 * that never ran come back in `skipped` with the failure as the reason rather
 * than the whole call throwing: the first batch is already graded, and an
 * error that hid that would leave the screen showing work as undone that is
 * done. A failure on the very first batch is thrown, as nothing has changed.
 */
export async function confirmInBatches(
  confirm: (ids: string[]) => Promise<ApiConfirmResult>,
  ids: string[],
): Promise<ApiConfirmResult> {
  const merged: ApiConfirmResult = { graded: [], skipped: [] };
  for (let at = 0; at < ids.length; at += CONFIRM_BATCH_LIMIT) {
    try {
      const part = await confirm(ids.slice(at, at + CONFIRM_BATCH_LIMIT));
      merged.graded.push(...part.graded);
      merged.skipped.push(...part.skipped);
    } catch (cause) {
      if (at === 0) throw cause;
      const reason =
        cause instanceof Error ? cause.message : "The request failed.";
      for (const id of ids.slice(at)) merged.skipped.push({ id, reason });
      break;
    }
  }
  return merged;
}
