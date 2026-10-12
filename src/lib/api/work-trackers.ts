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
