"use client";

import { request } from "@/lib/api/client";
import type {
  CompleteSprintMove,
  Issue,
  IssueActivity,
  IssueBridge,
  IssueComment,
  IssuePatch,
  IssueThread,
  NewIssueInput,
  NewProjectInput,
  NewSprintInput,
  Priority,
  Project,
  ProjectData,
  ProjectPatch,
  ProjectStatus,
  Sprint,
  SprintPatch,
  StatusInput,
} from "@/lib/projects/types";

/**
 * Projects — `/api/v1/projects`, `/sprints`, `/issues`, `/comments`.
 *
 * A Jira-style tracker: projects with a workflow, members, sprints, issues with
 * sub-tasks and epics, comments and a history. See `docs/specs/projects-module.md`.
 *
 * ## One adapter, so the wire can move without the screens knowing
 *
 * Every response is read through a `to…` function below. They tolerate a field
 * that is absent (a list in place of `undefined`, `null` in place of nothing) and
 * a couple of equivalent spellings, so a small difference between this client and
 * the API's own shape is a change in one place. The domain types in
 * `lib/projects/types.ts` are what the rest of the app sees.
 *
 * ## What the client does not decide
 *
 * Who may see or change what, the doneAt rule, sub-task inheritance, the
 * one-active-sprint rule: the API is the authority on all of them. The browser
 * predicts the answer (`lib/projects/mutations.ts`) to move a card under the
 * pointer, and replaces the prediction with what comes back.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

/** A date-only value as `YYYY-MM-DD`, even if the API sends a full instant. */
const day = (v: unknown): string | null => {
  const s = strOrNull(v);
  return s ? s.slice(0, 10) : null;
};

export function toStatus(raw: Raw, index: number): ProjectStatus {
  return {
    id: str(raw["id"]),
    name: str(raw["name"]),
    category: str(raw["category"], "TODO") as ProjectStatus["category"],
    wipLimit: numOrNull(raw["wipLimit"]),
    position: num(raw["position"], index),
  };
}

function memberIdsOf(raw: Raw): string[] {
  const direct = raw["memberIds"];
  if (Array.isArray(direct))
    return direct.filter((x): x is string => typeof x === "string");
  return list(raw["members"])
    .map((m) => str(m["employeeId"] ?? m["id"]))
    .filter(Boolean);
}

export function toProject(raw: Raw): Project {
  const department = raw["department"] as Raw | null | undefined;
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    name: str(raw["name"]),
    description: str(raw["description"]),
    type: str(raw["type"], "SCRUM") as Project["type"],
    color: str(raw["color"], "#2B3990"),
    departmentId: strOrNull(raw["departmentId"]),
    departmentName:
      strOrNull(raw["departmentName"]) ??
      (department && typeof department === "object"
        ? strOrNull(department["name"])
        : null),
    leadId: str(raw["leadId"]),
    goalId: strOrNull(raw["goalId"]),
    memberIds: memberIdsOf(raw),
    statuses: list(raw["statuses"]).map(toStatus),
    createdById: str(raw["createdById"]),
    createdAt: str(raw["createdAt"]),
    updatedAt: str(raw["updatedAt"]),
    openIssueCount: numOrNull(raw["openIssueCount"] ?? raw["openCount"]),
  };
}

export function toSprint(raw: Raw): Sprint {
  return {
    id: str(raw["id"]),
    projectId: str(raw["projectId"]),
    name: str(raw["name"]),
    goal: str(raw["goal"]),
    startDate: day(raw["startDate"]),
    endDate: day(raw["endDate"]),
    state: str(raw["state"], "PLANNED") as Sprint["state"],
    committedPoints: numOrNull(raw["committedPoints"]),
    completedPoints: numOrNull(raw["completedPoints"]),
    closedAt: strOrNull(raw["closedAt"]),
    createdAt: str(raw["createdAt"]),
  };
}

export function toIssue(raw: Raw): Issue {
  return {
    id: str(raw["id"]),
    projectId: str(raw["projectId"]),
    number: num(raw["number"]),
    key: str(raw["key"]),
    type: str(raw["type"], "TASK") as Issue["type"],
    title: str(raw["title"]),
    description: str(raw["description"]),
    statusId: str(raw["statusId"]),
    priority: str(raw["priority"], "MEDIUM") as Priority,
    assigneeId: strOrNull(raw["assigneeId"]),
    reporterId: strOrNull(raw["reporterId"]),
    epicId: strOrNull(raw["epicId"]),
    parentId: strOrNull(raw["parentId"]),
    sprintId: strOrNull(raw["sprintId"]),
    points: numOrNull(raw["points"]),
    labels: Array.isArray(raw["labels"])
      ? (raw["labels"] as unknown[]).filter(
          (l): l is string => typeof l === "string",
        )
      : [],
    startDate: day(raw["startDate"]),
    dueDate: day(raw["dueDate"]),
    rank: num(raw["rank"]),
    doneAt: strOrNull(raw["doneAt"]),
    goalId: strOrNull(raw["goalId"]),
    createdAt: str(raw["createdAt"]),
    updatedAt: str(raw["updatedAt"]),
  };
}

export function toComment(raw: Raw): IssueComment {
  return {
    id: str(raw["id"]),
    issueId: str(raw["issueId"]),
    authorId: str(raw["authorId"]),
    body: str(raw["body"]),
    createdAt: str(raw["createdAt"]),
  };
}

export function toActivity(raw: Raw): IssueActivity {
  return {
    id: str(raw["id"]),
    issueId: str(raw["issueId"]),
    actorId: strOrNull(raw["actorId"]),
    field: str(raw["field"]),
    from: raw["from"] ?? undefined,
    to: raw["to"] ?? undefined,
    at: str(raw["at"] ?? raw["createdAt"]),
  };
}

/**
 * The bridge's answer for one issue, only when the API gives one.
 * Absent means "nothing to say", never "filed".
 */
export function toBridge(raw: unknown): IssueBridge | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const status = str(r["status"]);
  if (status !== "FILED" && status !== "NOT_COUNTED") return null;
  return { status, message: strOrNull(r["message"] ?? r["reason"]) };
}

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const projectsApi = {
  /** The projects the caller is on. `all` is for people who hold `EDIT_RECORDS`. */
  list: async (scope: "mine" | "all" = "mine", signal?: AbortSignal) =>
    list(
      await request<Raw[]>("/projects", {
        query: { scope: scope === "all" ? "all" : undefined },
        ...signalOf(signal),
      }),
    ).map(toProject),

  create: async (input: NewProjectInput) =>
    toProject(await request<Raw>("/projects", { method: "POST", body: input })),

  /** One project, with every issue and sprint, in three requests. */
  load: async (id: string, signal?: AbortSignal): Promise<ProjectData> => {
    const [project, issues, sprints] = await Promise.all([
      request<Raw>(`/projects/${id}`, signalOf(signal)),
      request<Raw[]>(`/projects/${id}/issues`, signalOf(signal)),
      request<Raw[]>(`/projects/${id}/sprints`, signalOf(signal)),
    ]);
    return {
      project: toProject(project),
      issues: list(issues).map(toIssue),
      sprints: list(sprints).map(toSprint),
    };
  },

  /** The project row alone, and the sprints, for a refresh after a settings change. */
  get: async (id: string, signal?: AbortSignal) =>
    toProject(await request<Raw>(`/projects/${id}`, signalOf(signal))),

  update: async (id: string, patch: ProjectPatch) =>
    toProject(
      await request<Raw>(`/projects/${id}`, { method: "PATCH", body: patch }),
    ),

  remove: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),

  /** Replaces the member set. The lead stays whether or not it is listed. */
  setMembers: async (id: string, memberIds: string[]) =>
    toProject(
      await request<Raw>(`/projects/${id}/members`, {
        method: "PUT",
        body: { memberIds },
      }),
    ),

  /** Replaces the workflow: the full ordered list, new entries without an id. */
  setStatuses: async (id: string, statuses: StatusInput[]) => {
    const saved = await request<Raw[] | { statuses: Raw[] }>(
      `/projects/${id}/statuses`,
      { method: "PUT", body: { statuses } },
    );
    const rows = Array.isArray(saved) ? saved : list(saved.statuses);
    return rows.map(toStatus);
  },

  /* ---------------------------------------------------------------- sprints */

  createSprint: async (projectId: string, input: NewSprintInput) =>
    toSprint(
      await request<Raw>(`/projects/${projectId}/sprints`, {
        method: "POST",
        body: input,
      }),
    ),

  updateSprint: async (id: string, patch: SprintPatch) =>
    toSprint(
      await request<Raw>(`/sprints/${id}`, { method: "PATCH", body: patch }),
    ),

  deleteSprint: (id: string) =>
    request<void>(`/sprints/${id}`, { method: "DELETE" }),

  startSprint: async (id: string) =>
    toSprint(await request<Raw>(`/sprints/${id}/start`, { method: "POST" })),

  completeSprint: async (id: string, moveTo: CompleteSprintMove) =>
    request<Raw>(`/sprints/${id}/complete`, {
      method: "POST",
      body: { moveTo },
    }),

  /* ----------------------------------------------------------------- issues */

  createIssue: async (projectId: string, input: NewIssueInput) =>
    toIssue(
      await request<Raw>(`/projects/${projectId}/issues`, {
        method: "POST",
        body: input,
      }),
    ),

  updateIssue: async (id: string, patch: IssuePatch) =>
    toIssue(
      await request<Raw>(`/issues/${id}`, { method: "PATCH", body: patch }),
    ),

  removeIssue: (id: string) =>
    request<void>(`/issues/${id}`, { method: "DELETE" }),

  /** An issue's comments and history, and the bridge's note when it has one. */
  thread: async (id: string, signal?: AbortSignal): Promise<IssueThread> => {
    const [issue, comments] = await Promise.all([
      request<Raw>(`/issues/${id}`, signalOf(signal)),
      request<Raw[]>(`/issues/${id}/comments`, signalOf(signal)),
    ]);
    return {
      comments: list(comments).map(toComment),
      activity: list(issue["activity"]).map(toActivity),
      bridge: toBridge(issue["bridge"] ?? issue["weeklyTask"]),
    };
  },

  addComment: async (issueId: string, body: string) =>
    toComment(
      await request<Raw>(`/issues/${issueId}/comments`, {
        method: "POST",
        body: { body },
      }),
    ),

  removeComment: (id: string) =>
    request<void>(`/comments/${id}`, { method: "DELETE" }),
};
