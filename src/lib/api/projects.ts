"use client";

import { ApiError, request, requestPaged } from "@/lib/api/client";
import { STATUS_CATEGORIES } from "@/lib/projects/types";
import type {
  AttachmentRef,
  StatusCategory,
  CompleteSprintMove,
  IssueAttachment,
  Issue,
  IssueActivity,
  IssueComment,
  IssuePatch,
  IssueThread,
  IssueWeeklyTask,
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
  WatchState,
} from "@/lib/projects/types";

/**
 * Projects — `/api/v1/projects`, `/sprints`, `/issues`, `/comments`.
 *
 * A Jira-style tracker: projects with a workflow, members, sprints, issues with
 * sub-tasks and epics, comments and a history. The contract is "Contract as built"
 * in `docs/specs/projects-module.md`.
 *
 * ## One adapter, so the wire can move without the screens knowing
 *
 * Every response is read through a `to…` function below. They tolerate a field
 * that is absent (a list in place of `undefined`, `null` in place of nothing), so
 * a small difference between this client and the API's own shape is a change in
 * one place. The domain types in `lib/projects/types.ts` are what the rest of the
 * app sees.
 *
 * ## What the client does not decide
 *
 * Who may see or change what, the doneAt rule, sub-task inheritance, the
 * one-active-sprint rule: the API is the authority on all of them. The browser
 * predicts the answer (`lib/projects/mutations.ts`) to move a card under the
 * pointer, and replaces the prediction with what comes back.
 *
 * ## Errors worth knowing
 *
 * - **404 is also "you are not on it".** A project somebody is not a member of
 *   answers exactly as one that does not exist.
 * - **422 with `details.reason === "module_off"`** means the company has not
 *   switched Projects on; `isModuleOff` reads it.
 * - Messages are written to be shown to a person as they are.
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

/** Whether this is the API refusing because the company has Projects switched off. */
export function isModuleOff(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  const details = error.details;
  return (
    !!details &&
    !Array.isArray(details) &&
    (details as Record<string, unknown>)["reason"] === "module_off"
  );
}

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
  if (Array.isArray(direct)) {
    return direct.filter((x): x is string => typeof x === "string");
  }
  return list(raw["members"])
    .map((m) => str(m["employeeId"] ?? m["id"]))
    .filter(Boolean);
}

export function toProject(raw: Raw): Project {
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    name: str(raw["name"]),
    description: str(raw["description"]),
    type: str(raw["type"], "SCRUM") as Project["type"],
    color: str(raw["color"], "#2B3990"),
    departmentId: strOrNull(raw["departmentId"]),
    departmentName: strOrNull(raw["departmentName"]),
    leadId: str(raw["leadId"]),
    leadName: strOrNull(raw["leadName"]),
    goalId: strOrNull(raw["goalId"]),
    memberIds: memberIdsOf(raw),
    statuses: list(raw["statuses"]).map(toStatus),
    createdById: str(raw["createdById"]),
    createdAt: str(raw["createdAt"]),
    updatedAt: str(raw["updatedAt"]),
    openIssueCount: numOrNull(raw["openIssueCount"]),
    issueCount: numOrNull(raw["issueCount"]),
    activeSprintId: strOrNull(raw["activeSprintId"]),
    canManage:
      typeof raw["canManage"] === "boolean"
        ? (raw["canManage"] as boolean)
        : null,
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

/**
 * The bridge's note on an issue. Absent or unrecognised is "nothing to say",
 * never "filed": a screen must not claim an outcome the API did not report.
 */
export function toWeeklyTask(raw: unknown): IssueWeeklyTask | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (r["state"] === "FILED") {
    return {
      state: "FILED",
      taskId: str(r["taskId"]),
      graded: r["graded"] === true,
    };
  }
  if (r["state"] === "NOT_COUNTED") {
    return {
      state: "NOT_COUNTED",
      reason: str(r["reason"], "NO_OBJECTIVE") as Extract<
        IssueWeeklyTask,
        { state: "NOT_COUNTED" }
      >["reason"],
      message: str(r["message"]),
    };
  }
  return null;
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
    /* An API from before several people could share a task sends the lead alone. */
    assigneeIds: Array.isArray(raw["assigneeIds"])
      ? (raw["assigneeIds"] as unknown[]).filter(
          (a): a is string => typeof a === "string",
        )
      : typeof raw["assigneeId"] === "string"
        ? [raw["assigneeId"]]
        : [],
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
    weeklyTask: toWeeklyTask(raw["weeklyTask"]),
    commentCount: num(raw["commentCount"]),
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
    editedAt: strOrNull(raw["editedAt"]),
    createdAt: str(raw["createdAt"]),
    attachments: list(raw["attachments"]).map(toAttachment),
  };
}

export function toAttachment(raw: Raw): IssueAttachment {
  return {
    id: str(raw["id"]),
    filename: str(raw["filename"]),
    contentType: str(raw["contentType"]),
    sizeBytes: num(raw["sizeBytes"]),
    uploadedBy: str(raw["uploadedBy"]),
    createdAt: str(raw["createdAt"]),
  };
}

/** `{ watchers, watching }`, from an issue's read or any watcher route. */
export function toWatchState(raw: Raw): WatchState {
  return {
    watchers: list(raw["watchers"])
      .map((w) => ({
        id: str(w["id"]),
        name: str(w["name"]),
        addedById: strOrNull(w["addedById"]),
      }))
      .filter((w) => w.id !== ""),
    watching: raw["watching"] === true,
  };
}

/** Where to PUT one file for an issue: the key to record, and the signed URL. */
export type IssueUploadUrl = {
  storageKey: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

/**
 * What opening a task by id finds (`/projects/tasks/:id`): somebody's personal
 * task, a board task (opened on its board), or a board task the reader only
 * leads somebody on (the reduced read).
 */
export type TaskTarget =
  | { kind: "personal"; issue: Issue }
  | { kind: "board"; projectId: string; key: string }
  | ({ kind: "reduced" } & ReducedIssueDetail);

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

/** How a link reads from one side; the API stores one row per pair. */
export type LinkType = "RELATES" | "BLOCKS" | "IMPLEMENTS" | "DUPLICATES";

/** What you choose when adding one: the stored type, or its reverse. */
export type LinkChoice =
  LinkType | "BLOCKED_BY" | "IMPLEMENTED_BY" | "DUPLICATED_BY";

export type LinkedIssue =
  | {
      hidden?: false;
      id: string;
      key: string;
      title: string;
      projectId: string;
      projectName: string;
      statusName: string;
      statusCategory: StatusCategory;
      assigneeName: string | null;
    }
  | { hidden: true };

export type IssueLink = {
  id: string;
  type: LinkType;
  direction: "outgoing" | "incoming";
  /** Worded for this side, e.g. "blocked by". Shown as given. */
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  other: LinkedIssue;
};

export type IssueSearchHit = {
  id: string;
  key: string;
  title: string;
  projectName: string;
};

export function toIssueLink(raw: Raw): IssueLink {
  const other = (raw["other"] ?? {}) as Raw;
  const by = raw["createdBy"] as Raw | null | undefined;
  return {
    id: str(raw["id"]),
    type: str(raw["type"]) as LinkType,
    direction: raw["direction"] === "incoming" ? "incoming" : "outgoing",
    label: str(raw["label"]),
    note: strOrNull(raw["note"]),
    createdAt: str(raw["createdAt"]),
    createdBy: by ? { id: str(by["id"]), name: str(by["name"]) } : null,
    other:
      other["hidden"] === true
        ? { hidden: true }
        : {
            id: str(other["id"]),
            key: str(other["key"]),
            title: str(other["title"]),
            projectId: str(other["projectId"]),
            projectName: str(other["projectName"]),
            statusName: str(other["statusName"]),
            statusCategory: (STATUS_CATEGORIES as readonly string[]).includes(
              str(other["statusCategory"]),
            )
              ? (other["statusCategory"] as StatusCategory)
              : "TODO",
            assigneeName: strOrNull(other["assigneeName"]),
          },
  };
}

/* ------------------------------------------------------------- personal tasks */

export type PersonalState = "open" | "done" | "overdue";

/** A task on somebody's own list: an issue, the column it is in, and who set it. */
export type PersonalTask = Issue & {
  statusName: string;
  statusCategory: StatusCategory;
  /** Present only when somebody other than its owner put it on the list. */
  setBy: { id: string; name: string } | null;
  /** Whose list it is on, when a colleague put the reader on one of theirs. */
  sharedBy: { id: string; name: string } | null;
};

/** One personal task as the drawer needs it: the issue and its list's columns. */
export type PersonalTaskDetail = {
  issue: Issue;
  statusName: string;
  statusCategory: StatusCategory;
  statuses: ProjectStatus[];
  /** The reader may change title, description and due date: its owner, or the leader who set it. */
  canEditDetails: boolean;
};

export type NewPersonalTaskInput = {
  title: string;
  description?: string;
  dueDate?: string | null;
  labels?: string[];
  goalId?: string | null;
};

const categoryOf = (v: unknown): StatusCategory =>
  (STATUS_CATEGORIES as readonly string[]).includes(str(v))
    ? (v as StatusCategory)
    : "TODO";

export function toPersonalTask(raw: Raw): PersonalTask {
  const person = (value: unknown) => {
    const row = value as Raw | null | undefined;
    return row && str(row["id"])
      ? { id: str(row["id"]), name: str(row["name"]) }
      : null;
  };
  return {
    ...toIssue(raw),
    statusName: str(raw["statusName"]),
    statusCategory: categoryOf(raw["statusCategory"]),
    setBy: person(raw["setBy"]),
    sharedBy: person(raw["sharedBy"]),
  };
}

export function toPersonalTaskDetail(raw: Raw): PersonalTaskDetail {
  return {
    issue: toIssue(raw),
    statusName: str(raw["statusName"]),
    statusCategory: categoryOf(raw["statusCategory"]),
    statuses: list(raw["statuses"]).map(toStatus),
    canEditDetails: raw["canEditDetails"] === true,
  };
}

/* ----------------------------------------------------------------- team tasks */

export type TeamFilter = "open" | "overdue" | "due-week";

export type TeamCounts = {
  open: number;
  overdue: number;
  dueThisWeek: number;
  laterOrNoDate: number;
  doneThisWeek: number;
};

export type TeamTask = {
  id: string;
  key: string;
  title: string;
  /** Null for a personal task: its list is not a project anybody opens. */
  projectId: string | null;
  projectName: string;
  personal: boolean;
  statusName: string;
  statusCategory: StatusCategory;
  dueDate: string | null;
  overdue: boolean;
  labels: string[];
};

export type TeamPerson = {
  employee: { id: string; name: string; jobTitle: string | null };
  counts: TeamCounts;
  tasks: TeamTask[];
};

export type GiveTaskInput = {
  employeeId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  labels?: string[];
};

export function toTeamTask(raw: Raw): TeamTask {
  return {
    id: str(raw["id"]),
    key: str(raw["key"]),
    title: str(raw["title"]),
    projectId: strOrNull(raw["projectId"]),
    projectName: str(raw["projectName"]),
    personal: raw["personal"] === true,
    statusName: str(raw["statusName"]),
    statusCategory: categoryOf(raw["statusCategory"]),
    dueDate: day(raw["dueDate"]),
    overdue: raw["overdue"] === true,
    labels: Array.isArray(raw["labels"])
      ? (raw["labels"] as unknown[]).filter(
          (l): l is string => typeof l === "string",
        )
      : [],
  };
}

export function toTeamPerson(raw: Raw): TeamPerson {
  const who = (raw["employee"] ?? {}) as Raw;
  const c = (raw["counts"] ?? {}) as Raw;
  return {
    employee: {
      id: str(who["id"]),
      name: str(who["name"]),
      jobTitle: strOrNull(who["jobTitle"]),
    },
    counts: {
      open: num(c["open"]),
      overdue: num(c["overdue"]),
      dueThisWeek: num(c["dueThisWeek"]),
      laterOrNoDate: num(c["laterOrNoDate"]),
      doneThisWeek: num(c["doneThisWeek"]),
    },
    tasks: list(raw["tasks"]).map(toTeamTask),
  };
}

/**
 * A board task read by somebody who leads its assignee but is not on its project
 * (`GET /issues/:id` answers `reduced: true`): what it is and where it stands,
 * never what is said about it. No description, comments or files.
 */
export type ReducedIssueDetail = {
  issue: Issue;
  projectName: string;
  statusName: string;
  statusCategory: StatusCategory;
  subtasks: {
    id: string;
    key: string;
    title: string;
    statusCategory: StatusCategory;
  }[];
};

/** What `GET /issues/:id` gave a leader: the full read, or the reduced one. */
export type LeaderRead =
  { reduced: false } | ({ reduced: true } & ReducedIssueDetail);

export function toLeaderRead(raw: Raw): LeaderRead {
  if (raw["reduced"] !== true) return { reduced: false };
  return {
    reduced: true,
    /* Rebuilt from the fields a reduced read carries: if the API ever sent a
       description or a comment count here, it would still not reach the screen. */
    issue: toIssue({
      ...raw,
      description: "",
      commentCount: 0,
    }),
    projectName: str(raw["projectName"]),
    statusName: str(raw["statusName"]),
    statusCategory: categoryOf(raw["statusCategory"]),
    subtasks: list(raw["subtasks"]).map((s) => ({
      id: str(s["id"]),
      key: str(s["key"]),
      title: str(s["title"]),
      statusCategory: categoryOf(s["statusCategory"]),
    })),
  };
}

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export type LoadedProject = ProjectData & {
  /** The API holds more issues than it sent (it stops at 5,000). */
  issuesCapped: boolean;
};

/** What `POST /sprints/:id/complete` answers. */
export type CompletedSprint = {
  sprint: Sprint;
  movedIssueIds: string[];
  createdSprint: Sprint | null;
};

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
    toProject(
      await request<Raw>("/projects", {
        method: "POST",
        body: {
          key: input.key,
          name: input.name,
          type: input.type,
          description: input.description,
          ...(input.departmentId
            ? {
                departmentId: input.departmentId,
                seedMembersFromDepartment: input.seedMembersFromDepartment,
              }
            : {}),
          ...(input.leadId ? { leadId: input.leadId } : {}),
        },
      }),
    ),

  /** One project, with every issue and sprint, in three requests. */
  load: async (id: string, signal?: AbortSignal): Promise<LoadedProject> => {
    const [project, issues, sprints] = await Promise.all([
      request<Raw>(`/projects/${id}`, signalOf(signal)),
      requestPaged<Raw, { capped?: boolean }>(`/projects/${id}/issues`, {
        ...signalOf(signal),
      }),
      request<Raw[]>(`/projects/${id}/sprints`, signalOf(signal)),
    ]);
    return {
      project: toProject(project),
      issues: list(issues.data).map(toIssue),
      sprints: list(sprints).map(toSprint),
      issuesCapped: issues.meta.capped === true,
    };
  },

  get: async (id: string, signal?: AbortSignal) =>
    toProject(await request<Raw>(`/projects/${id}`, signalOf(signal))),

  update: async (id: string, patch: ProjectPatch) =>
    toProject(
      await request<Raw>(`/projects/${id}`, { method: "PATCH", body: patch }),
    ),

  remove: (id: string) =>
    request<unknown>(`/projects/${id}`, { method: "DELETE" }),

  /**
   * Replaces the member set. The lead stays whether or not it is listed. Answers
   * the set as saved. Removing somebody who still has open issues is refused
   * (422, `reason: "has_open_issues"`).
   */
  setMembers: async (id: string, employeeIds: string[]): Promise<string[]> => {
    const saved = await request<Raw>(`/projects/${id}/members`, {
      method: "PUT",
      body: { employeeIds },
    });
    return memberIdsOf(saved);
  },

  /** Replaces the workflow: the full ordered list, new entries without an id. */
  setStatuses: async (id: string, statuses: StatusInput[]) => {
    const saved = await request<Raw[] | { statuses: Raw[] }>(
      `/projects/${id}/statuses`,
      { method: "PUT", body: { statuses } },
    );
    const rows = Array.isArray(saved) ? saved : list(saved.statuses);
    return rows.map(toStatus);
  },

  /* ------------------------------------------------------------ task links */

  links: async (issueId: string, signal?: AbortSignal) =>
    list(
      await request<Raw[]>(`/issues/${issueId}/links`, signalOf(signal)),
    ).map(toIssueLink),

  addLink: async (
    issueId: string,
    body: { toIssueKey: string; type: LinkChoice; note?: string },
  ) =>
    toIssueLink(
      await request<Raw>(`/issues/${issueId}/links`, { method: "POST", body }),
    ),

  /** Answers nothing useful: the stored side may differ, so refetch the list. */
  updateLink: (id: string, note: string | null) =>
    request<unknown>(`/links/${id}`, { method: "PATCH", body: { note } }),

  removeLink: (id: string) =>
    request<unknown>(`/links/${id}`, { method: "DELETE" }),

  /** Tasks the caller can open, up to ten. */
  searchIssues: async (
    q: string,
    signal?: AbortSignal,
  ): Promise<IssueSearchHit[]> =>
    list(
      await request<Raw[]>("/issues/search", {
        query: { q },
        ...signalOf(signal),
      }),
    ).map((r) => ({
      id: str(r["id"]),
      key: str(r["key"]),
      title: str(r["title"]),
      projectName: str(r["projectName"]),
    })),

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
    request<unknown>(`/sprints/${id}`, { method: "DELETE" }),

  /** Starts a sprint, optionally editing its name, goal and dates in the same call. */
  startSprint: async (id: string, edits: SprintPatch = {}) =>
    toSprint(
      await request<Raw>(`/sprints/${id}/start`, {
        method: "POST",
        body: edits,
      }),
    ),

  completeSprint: async (
    id: string,
    moveTo: CompleteSprintMove,
  ): Promise<CompletedSprint> => {
    const done = await request<Raw>(`/sprints/${id}/complete`, {
      method: "POST",
      body: { moveTo },
    });
    return {
      sprint: toSprint((done["sprint"] as Raw) ?? {}),
      movedIssueIds: Array.isArray(done["movedIssueIds"])
        ? (done["movedIssueIds"] as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      createdSprint: done["createdSprint"]
        ? toSprint(done["createdSprint"] as Raw)
        : null,
    };
  },

  /* ---------------------------------------------------------- personal tasks */

  /** The caller's own tasks. `overdue` is open and due before today. */
  mineTasks: async (state: PersonalState, signal?: AbortSignal) =>
    list(
      await request<Raw[]>("/projects/mine/tasks", {
        query: { state },
        ...signalOf(signal),
      }),
    ).map(toPersonalTask),

  createMineTask: async (input: NewPersonalTaskInput) =>
    toPersonalTask(
      await request<Raw>("/projects/mine/tasks", {
        method: "POST",
        body: input,
      }),
    ),

  /** A personal task with the columns of the list it is on. */
  personalTask: async (id: string, signal?: AbortSignal) =>
    toPersonalTaskDetail(await request<Raw>(`/issues/${id}`, signalOf(signal))),

  /* -------------------------------------------------------------- team tasks */

  /** Your people's open work, most overdue first. `{ people: [] }` for a non-leader. */
  teamTasks: async (
    filter: TeamFilter,
    signal?: AbortSignal,
  ): Promise<TeamPerson[]> => {
    const raw = await request<Raw>("/projects/team-tasks", {
      query: { filter },
      ...signalOf(signal),
    });
    return list(raw["people"]).map(toTeamPerson);
  },

  /** Whether the caller leads anybody: one cheap existence check for the nav. */
  teamLeads: async (signal?: AbortSignal): Promise<boolean> => {
    const raw = await request<Raw>(
      "/projects/team-tasks/leads",
      signalOf(signal),
    );
    return raw["leads"] === true;
  },

  /** Puts a task on one of your people's own lists, set by you. */
  giveTask: (input: GiveTaskInput) =>
    request<Raw>("/projects/team-tasks", { method: "POST", body: input }),

  /** Moves a personal task to somebody in your team. */
  moveTask: (id: string, employeeId: string) =>
    request<Raw>(`/issues/${id}/move`, {
      method: "POST",
      body: { employeeId },
    }),

  /**
   * A task by id, wherever it lives. The read says whether it is personal; the
   * key cannot, since a board may be keyed `MY` too.
   */
  openTask: async (id: string, signal?: AbortSignal): Promise<TaskTarget> => {
    const raw = await request<Raw>(`/issues/${id}`, signalOf(signal));
    const read = toLeaderRead(raw);
    if (read.reduced) return { ...read, kind: "reduced" };
    const issue = toIssue(raw);
    if (raw["personal"] === true) {
      return { kind: "personal", issue };
    }
    return { kind: "board", projectId: issue.projectId, key: issue.key };
  },

  /** An issue as a leader reads it: in full, or reduced when not on its project. */
  leaderRead: async (id: string, signal?: AbortSignal) =>
    toLeaderRead(await request<Raw>(`/issues/${id}`, signalOf(signal))),

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

  /** One issue as the server has it now, weekly-task line included. */
  getIssue: async (id: string, signal?: AbortSignal) =>
    toIssue(await request<Raw>(`/issues/${id}`, signalOf(signal))),

  removeIssue: (id: string) =>
    request<unknown>(`/issues/${id}`, { method: "DELETE" }),

  /** An issue's comments and its history. */
  thread: async (id: string, signal?: AbortSignal): Promise<IssueThread> => {
    const [issue, comments] = await Promise.all([
      request<Raw>(`/issues/${id}`, signalOf(signal)),
      request<Raw[]>(`/issues/${id}/comments`, signalOf(signal)),
    ]);
    return {
      comments: list(comments).map(toComment),
      activity: list(issue["activity"]).map(toActivity),
      ...toWatchState(issue),
      attachments: list(issue["attachments"]).map(toAttachment),
      canManageWatchers: issue["canManageWatchers"] === true,
      canAttachToTask: issue["canAttachToTask"] === true,
    };
  },

  /** Files go up first (`attachmentUploadUrl`, then the PUT); this records them. */
  addComment: async (
    issueId: string,
    body: string,
    attachments: AttachmentRef[] = [],
  ) =>
    toComment(
      await request<Raw>(`/issues/${issueId}/comments`, {
        method: "POST",
        body: attachments.length > 0 ? { body, attachments } : { body },
      }),
    ),

  /* --------------------------------------------------------------- watchers */

  watch: async (issueId: string) =>
    toWatchState(
      await request<Raw>(`/issues/${issueId}/watch`, { method: "POST" }),
    ),

  unwatch: async (issueId: string) =>
    toWatchState(
      await request<Raw>(`/issues/${issueId}/watch`, { method: "DELETE" }),
    ),

  /** 422 when, on a board, they cannot see the task; 403 on a personal task
      for anybody but its owner and their leaders. */
  addWatcher: async (issueId: string, employeeId: string) =>
    toWatchState(
      await request<Raw>(`/issues/${issueId}/watchers`, {
        method: "POST",
        body: { employeeId },
      }),
    ),

  removeWatcher: async (issueId: string, employeeId: string) =>
    toWatchState(
      await request<Raw>(`/issues/${issueId}/watchers/${employeeId}`, {
        method: "DELETE",
      }),
    ),

  /* ------------------------------------------------------------------ files */

  /** Somewhere to PUT one file, for the task or for a comment about to be posted. */
  attachmentUploadUrl: async (
    issueId: string,
    input: { filename: string; contentType: string; sizeBytes: number },
  ): Promise<IssueUploadUrl> => {
    const raw = await request<Raw>(
      `/issues/${issueId}/attachments/upload-url`,
      { method: "POST", body: input },
    );
    const headers = (raw["headers"] ?? {}) as Record<string, unknown>;
    return {
      storageKey: str(raw["storageKey"]),
      url: str(raw["url"]),
      headers: Object.fromEntries(
        Object.entries(headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      expiresAt: str(raw["expiresAt"]),
    };
  },

  /** Records a file, already uploaded, on the task itself. */
  recordAttachment: async (issueId: string, ref: AttachmentRef) =>
    toAttachment(
      await request<Raw>(`/issues/${issueId}/attachments`, {
        method: "POST",
        body: ref,
      }),
    ),

  /** A short-lived link to open one file. */
  attachmentUrl: async (id: string, signal?: AbortSignal) => {
    const raw = await request<Raw>(`/attachments/${id}/url`, signalOf(signal));
    return { url: str(raw["url"]), expiresAt: str(raw["expiresAt"]) };
  },

  removeAttachment: (id: string) =>
    request<unknown>(`/attachments/${id}`, { method: "DELETE" }),

  /** Author only. */
  editComment: async (id: string, body: string) =>
    toComment(
      await request<Raw>(`/comments/${id}`, {
        method: "PATCH",
        body: { body },
      }),
    ),

  removeComment: (id: string) =>
    request<unknown>(`/comments/${id}`, { method: "DELETE" }),
};
