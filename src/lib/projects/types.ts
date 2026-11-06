/**
 * The Projects module's shapes, in one place.
 *
 * ## What lives where
 *
 * `lib/projects/*` is pure: no React, no fetch, no clock. Everything that decides
 * something about an issue, a sprint or a board — keys, rank, doneAt, sub-task
 * inheritance, filters, WIP counts, lanes, progress — is a function here that takes
 * its inputs, including "today" and "now", as arguments. That is what lets the
 * demo book and the connected store's optimistic updates apply the **same** rule,
 * and lets the Backlog, Roadmap and Reports views import the arithmetic instead of
 * writing a second copy of it.
 *
 * The wire format is camelCase with the spec's enum names (`SCRUM`, `IN_PROGRESS`,
 * `HIGHEST`), so these types are also what the API client hands back. If the API's
 * "Contract as built" differs, the adapter in `lib/api/projects.ts` is the only
 * place that changes.
 *
 * Dates: `startDate` / `dueDate` / sprint dates are **date-only** (`YYYY-MM-DD`)
 * and are compared as strings or as UTC calendar days — never through the
 * browser's zone. `createdAt`, `updatedAt`, `doneAt`, `closedAt` and comment times
 * are full ISO instants.
 */

import {
  CATEGORY_LABEL as TERMS_CATEGORY_LABEL,
  PICKABLE_TYPES,
  PROJECT_TYPE_LABEL as TERMS_PROJECT_TYPE_LABEL,
  TYPE_LABEL,
} from "./terms";

export const PROJECT_TYPES = ["SCRUM", "KANBAN"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const STATUS_CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/**
 * What a person can pick when creating or retyping a task: Task, Problem,
 * Initiative, in that order. A subtask is made from a parent, and a STORY is
 * shown and picked as a Task (see `terms.ts`).
 */
export const PICKABLE_ISSUE_TYPES: readonly IssueType[] = PICKABLE_TYPES;

export const PRIORITIES = [
  "HIGHEST",
  "HIGH",
  "MEDIUM",
  "LOW",
  "LOWEST",
] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SPRINT_STATES = ["PLANNED", "ACTIVE", "CLOSED"] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

/**
 * The colours a project can take, each with a name for people who cannot see it.
 * Every one carries white text at 4.5:1 or better.
 */
export const PROJECT_COLORS = [
  "#2B3990",
  "#0F766E",
  "#B4421F",
  "#6D3FC0",
  "#8F5F08",
  "#1F5F8A",
  "#A3336B",
  "#3F6212",
] as const;

export const PROJECT_COLOR_NAMES: Record<string, string> = {
  "#2B3990": "Indigo",
  "#0F766E": "Teal",
  "#B4421F": "Rust",
  "#6D3FC0": "Violet",
  "#8F5F08": "Bronze",
  "#1F5F8A": "Blue",
  "#A3336B": "Plum",
  "#3F6212": "Olive",
};

/* The words for these live in `terms.ts`, which is the one place they are written. */
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> =
  TERMS_PROJECT_TYPE_LABEL;

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = TYPE_LABEL;

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGHEST: "Highest",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  LOWEST: "Lowest",
};

/** Higher is more urgent. For sorting. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  HIGHEST: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  LOWEST: 1,
};

export const CATEGORY_LABEL: Record<StatusCategory, string> =
  TERMS_CATEGORY_LABEL;

export type ProjectStatus = {
  id: string;
  name: string;
  category: StatusCategory;
  /** Advisory only. Nothing blocks; the board colours the count. */
  wipLimit: number | null;
  position: number;
};

export type Project = {
  id: string;
  /** 2 to 6 characters, unique per company, never changes. */
  key: string;
  name: string;
  description: string;
  type: ProjectType;
  /** `#RRGGBB`. */
  color: string;
  departmentId: string | null;
  /** Resolved name, when the API sends one beside the id. */
  departmentName: string | null;
  leadId: string;
  /** The objective issues are filed under when finished, when the API has one set. */
  goalId: string | null;
  /** The lead is always among them. */
  memberIds: string[];
  /**
   * Each member's department id (null for none), for the board's "Assignee's
   * department" filter. Sent with one project, not with the list; absent in the
   * demo, where the filter is not offered.
   */
  memberDepartments?: Record<string, string | null>;
  /** Names of the departments in `memberDepartments`, by id. */
  departmentNames?: Record<string, string>;
  statuses: ProjectStatus[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** The lead's name, so a card can say it before the directory has loaded. */
  leadName: string | null;
  /**
   * Issues not yet in a DONE status, when the list endpoint says so.
   * `null` means "not told", which a card must not render as zero.
   */
  openIssueCount: number | null;
  /** Every issue, epics and sub-tasks included. `null` when not told. */
  issueCount: number | null;
  /** The running sprint, if there is one. */
  activeSprintId: string | null;
  /**
   * Whether the signed-in person may change settings, as the API says it. `null`
   * where the API did not say (the demo), and the screen falls back to the same
   * rule worked out from the project: the lead, or somebody who manages records.
   */
  canManage: boolean | null;
  /**
   * The program this project belongs to, or null (or absent) for none. Moving a
   * project changes only this: members, tasks and keys stay as they are.
   */
  programId?: string | null;
  programName?: string | null;
  programColor?: string | null;
  /**
   * What the signed-in person may do here, as the API says it: READ, WRITE or
   * MANAGE. Absent where the API did not say (the demo works it out with
   * `accessFor`, the same rule).
   */
  access?: "READ" | "WRITE" | "MANAGE" | null;
  canWrite?: boolean | null;
};

export type Sprint = {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string | null;
  endDate: string | null;
  state: SprintState;
  committedPoints: number | null;
  completedPoints: number | null;
  closedAt: string | null;
  createdAt: string;
};

export type Issue = {
  id: string;
  projectId: string;
  number: number;
  /** `KEY-12`. */
  key: string;
  type: IssueType;
  title: string;
  description: string;
  statusId: string;
  priority: Priority;
  /** The lead: `assigneeIds[0]`. Credit for finished work follows them. */
  assigneeId: string | null;
  /** Everybody on it, the lead first. Empty when nobody is. */
  assigneeIds: string[];
  reporterId: string | null;
  epicId: string | null;
  parentId: string | null;
  sprintId: string | null;
  points: number | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  /**
   * `HH:MM`, 24-hour, on `dueDate` in the company's time zone; null (or absent)
   * for "by the end of the day". Never set without a `dueDate`.
   */
  dueTime?: string | null;
  /** The deadline instant the API worked out from the two (ISO); read-only. */
  dueAt?: string | null;
  /** Position within a column or section. Insert between neighbours is the midpoint. */
  rank: number;
  doneAt: string | null;
  /**
   * The objective or personal KPI this task is linked to, or null. Optional and
   * never a fault: a task with no link is simply on the person's work record.
   */
  goalId: string | null;
  /**
   * The one measure of that objective the link is narrowed to, or null/absent
   * for the objective as a whole. Never set without a `goalId`.
   */
  keyResultId?: string | null;
  /**
   * What the API says about the link, in neutral terms (`null` or absent when
   * the task is not linked). The demo derives the same from its own objectives.
   */
  objective?: IssueObjective | null;
  /**
   * Whether the signed-in person may link or unlink this task, as the API says
   * it. Absent where it did not say, and the screen works the same rule out
   * from what it knows (the assignee, the lead, the assignee's manager, HR).
   */
  canLinkObjective?: boolean | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type IssueComment = {
  id: string;
  issueId: string;
  authorId: string;
  /** Mentions are stored as `<@employeeId>`. */
  body: string;
  /** Set once the author has changed it after posting. */
  editedAt: string | null;
  createdAt: string;
  /** Files posted with it. Absent in the demo, which keeps none. */
  attachments?: IssueAttachment[];
};

/**
 * A file on a task, or on one of its comments. Never its storage key: the only
 * way to open one is `GET /attachments/:id/url`, which asks who is reading.
 */
export type IssueAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** The employee who attached it. */
  uploadedBy: string;
  createdAt: string;
};

/** A file already PUT to a key the API minted, ready to be recorded. */
export type AttachmentRef = {
  storageKey: string;
  filename: string;
  contentType: string;
};

/** Somebody watching an issue. `addedById` is a *user* id: who added them. */
export type Watcher = { id: string; name: string; addedById?: string | null };

/** Who is watching an issue, and whether the reader is. */
export type WatchState = { watchers: Watcher[]; watching: boolean };

export type IssueActivity = {
  id: string;
  issueId: string;
  actorId: string | null;
  /** `created`, `description`, or an issue field name. Never `rank`. */
  field: string;
  from: unknown;
  to: unknown;
  at: string;
};

/**
 * What a task's link to an objective reads as, in plain terms.
 *
 * Only ever a statement of fact: "Linked to X", or "Linked objective is closed".
 * Never a warning. A task that is not linked has no `IssueObjective` at all.
 */
export type IssueObjective = {
  goalId: string;
  /** The objective's title, when the reader may see it. */
  title: string | null;
  keyResultId: string | null;
  keyResultTitle: string | null;
  /** The objective has closed (done, or gone since the link was made). */
  closed: boolean;
};

export type IssueThread = {
  comments: IssueComment[];
  activity: IssueActivity[];
  /** From the issue's own read; absent in the demo, which keeps none. */
  watchers?: Watcher[];
  watching?: boolean;
  /** The task's own files, not its comments'. */
  attachments?: IssueAttachment[];
  /** What the API says the reader may do; absent in the demo. */
  canManageWatchers?: boolean;
  canAttachToTask?: boolean;
};

/** Everything the project screen needs about one project. */
export type ProjectData = {
  project: Project;
  issues: Issue[];
  sprints: Sprint[];
};

/* ----------------------------------------------------------------- inputs -- */

export type NewProjectInput = {
  name: string;
  key: string;
  type: ProjectType;
  departmentId: string | null;
  description: string;
  /**
   * Add everyone active in the department as members, once, when the project is
   * made. Connected, the API does it (it can see everybody); the demo uses
   * `memberIds`.
   */
  seedMembersFromDepartment: boolean;
  /** Employees to start with besides the creator. What the demo seeds from. */
  memberIds: string[];
  /**
   * The lead, when it is not the person creating the project. Required for a
   * sign-in with no staff record behind it, which cannot lead anything itself.
   */
  leadId?: string;
  /** The program it starts in. Null or absent: Unassigned. */
  programId?: string | null;
};

export type ProjectPatch = Partial<{
  name: string;
  description: string;
  type: ProjectType;
  color: string;
  departmentId: string | null;
  leadId: string;
  goalId: string | null;
  /** Moves the project into a program, or out of one (null). Nothing else about it changes. */
  programId: string | null;
}>;

export type StatusInput = {
  /** Absent for a status that does not exist yet. */
  id?: string;
  name: string;
  category: StatusCategory;
  wipLimit: number | null;
};

export type NewIssueInput = {
  type: IssueType;
  title: string;
  description?: string;
  statusId?: string;
  priority?: Priority;
  assigneeId?: string | null;
  /** Everybody on it, the lead first. Wins over `assigneeId`. */
  assigneeIds?: string[];
  epicId?: string | null;
  parentId?: string | null;
  sprintId?: string | null;
  points?: number | null;
  labels?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
};

export type IssuePatch = Partial<{
  title: string;
  description: string;
  type: IssueType;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  assigneeIds: string[];
  epicId: string | null;
  sprintId: string | null;
  points: number | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  rank: number;
  goalId: string | null;
  keyResultId: string | null;
}>;

export type NewSprintInput = {
  name: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type SprintPatch = Partial<{
  name: string;
  goal: string;
  startDate: string | null;
  endDate: string | null;
}>;

/** Where unfinished issues go when a sprint closes. */
export type CompleteSprintMove = null | string | "new";
