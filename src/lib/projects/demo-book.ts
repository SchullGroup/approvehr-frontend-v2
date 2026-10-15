/**
 * The demo's book of projects.
 *
 * Demo mode has no server, so the rules the API would apply are applied here, to
 * a plain object that the store keeps in localStorage. Every operation is a pure
 * function from a book to a new book, built on the same `mutations` the connected
 * store uses for its optimistic updates — one set of rules, two callers.
 *
 * Refusals are `ProjectRuleError`s carrying the API's own kind of sentence ("Move
 * them to another status first"), so the screen shows the same words in both
 * modes and a demo never teaches a rule the connected product does not have.
 */

import { issueKey, isValidKey } from "./keys";
import { removalHolders, removalRefusal } from "./members";
import {
  applyStatusInputs,
  buildIssue,
  nextIssueNumber,
  patchIssue,
  removeIssue,
  updatedProject,
  withLead,
  type FieldChange,
} from "./mutations";
import { buildSample } from "./sample";
import { completeSprint, startBlocker, startSprint } from "./sprints";
import {
  PROJECT_COLORS,
  type CompleteSprintMove,
  Issue,
  IssueActivity,
  IssueComment,
  IssuePatch,
  NewIssueInput,
  NewProjectInput,
  NewSprintInput,
  Project,
  ProjectData,
  ProjectPatch,
  Sprint,
  SprintPatch,
  StatusInput,
} from "./types";
import {
  DEFAULT_STATUS_INPUTS,
  boardTypeChangeBlocker,
  removalBlocker,
  workflowProblem,
} from "./workflow";

export class ProjectRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectRuleError";
  }
}

export type DemoBook = {
  /** The day the sample was built. A book older than a fortnight is rebuilt. */
  anchor: string;
  projects: Record<string, ProjectData>;
  comments: Record<string, IssueComment[]>;
  activity: Record<string, IssueActivity[]>;
  /** The next issue number per project, which never goes backwards after a delete. */
  counters: Record<string, number>;
};

export const EMPTY_BOOK: DemoBook = {
  anchor: "",
  projects: {},
  comments: {},
  activity: {},
  counters: {},
};

/** How old a demo book may be before it is rebuilt, in days. */
export const BOOK_MAX_AGE_DAYS = 14;

export function sampleBook(args: {
  today: string;
  now: string;
  people: readonly string[];
}): DemoBook {
  const sample = buildSample(args);
  return {
    anchor: args.today,
    projects: {
      [sample.project.id]: {
        project: sample.project,
        issues: sample.issues,
        sprints: sample.sprints,
      },
    },
    comments: sample.comments,
    activity: sample.activity,
    counters: { [sample.project.id]: sample.lastNumber },
  };
}

type Ids = () => string;

export type Ctx = { actorId: string | null; now: string; makeId: Ids };

const data = (book: DemoBook, projectId: string): ProjectData => {
  const found = book.projects[projectId];
  if (!found)
    throw new ProjectRuleError(
      "That project is not here. It may have been deleted.",
    );
  return found;
};

const withProject = (book: DemoBook, next: ProjectData): DemoBook => ({
  ...book,
  projects: { ...book.projects, [next.project.id]: next },
});

const projectIdOfIssue = (book: DemoBook, issueId: string): string | null => {
  for (const [id, d] of Object.entries(book.projects)) {
    if (d.issues.some((i) => i.id === issueId)) return id;
  }
  return null;
};

/* ---------------------------------------------------------------- projects -- */

export function createProject(
  book: DemoBook,
  input: NewProjectInput,
  ctx: Ctx & { departmentName?: string | null },
): { book: DemoBook; project: Project } {
  const key = input.key.trim().toUpperCase();
  if (!isValidKey(key)) {
    throw new ProjectRuleError(
      "Use 2 to 6 letters or digits for the key, starting with a letter.",
    );
  }
  if (Object.values(book.projects).some((d) => d.project.key === key)) {
    throw new ProjectRuleError(`Another project already uses ${key}.`);
  }
  const name = input.name.trim();
  if (!name) throw new ProjectRuleError("Give the project a name.");
  const leadId = input.leadId ?? ctx.actorId ?? "";
  const project: Project = {
    id: ctx.makeId(),
    key,
    name,
    description: input.description.trim(),
    type: input.type,
    color:
      PROJECT_COLORS[
        Object.keys(book.projects).length % PROJECT_COLORS.length
      ]!,
    departmentId: input.departmentId,
    departmentName: ctx.departmentName ?? null,
    leadId,
    leadName: null,
    goalId: null,
    memberIds: withLead(input.memberIds, leadId).filter(Boolean),
    statuses: applyStatusInputs([], DEFAULT_STATUS_INPUTS, ctx.makeId),
    createdById: leadId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    openIssueCount: 0,
    issueCount: 0,
    activeSprintId: null,
    canManage: null,
  };
  return {
    project,
    book: {
      ...withProject(book, { project, issues: [], sprints: [] }),
      counters: { ...book.counters, [project.id]: 0 },
    },
  };
}

export function updateProject(
  book: DemoBook,
  projectId: string,
  patch: ProjectPatch,
  now: string,
): DemoBook {
  const d = data(book, projectId);
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new ProjectRuleError("Give the project a name.");
  }
  if (patch.type !== undefined) {
    const blocker = boardTypeChangeBlocker(
      d.project,
      patch.type,
      d.issues,
      d.sprints,
    );
    if (blocker) throw new ProjectRuleError(blocker);
  }
  return withProject(book, {
    ...d,
    project: updatedProject(
      d.project,
      {
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      },
      now,
    ),
  });
}

export function setMembers(
  book: DemoBook,
  projectId: string,
  memberIds: readonly string[],
  now: string,
  nameOf: (employeeId: string) => string = () => "Someone",
): DemoBook {
  const d = data(book, projectId);
  const members = withLead(memberIds, d.project.leadId);
  const dropped = d.project.memberIds.filter((id) => !members.includes(id));
  const holders = removalHolders(d.project.statuses, d.issues, dropped);
  if (holders.length > 0) {
    throw new ProjectRuleError(removalRefusal(holders, nameOf));
  }
  return withProject(book, {
    ...d,
    project: { ...d.project, memberIds: members, updatedAt: now },
  });
}

export function setStatuses(
  book: DemoBook,
  projectId: string,
  drafts: readonly StatusInput[],
  ctx: Ctx,
): DemoBook {
  const d = data(book, projectId);
  const problem = workflowProblem(drafts);
  if (problem) throw new ProjectRuleError(problem);
  const keep = new Set(drafts.map((s) => s.id).filter(Boolean));
  for (const status of d.project.statuses) {
    if (keep.has(status.id)) continue;
    const blocker = removalBlocker(d.project.statuses, d.issues, status.id);
    if (blocker) throw new ProjectRuleError(blocker);
  }
  const statuses = applyStatusInputs(d.project.statuses, drafts, ctx.makeId);
  return withProject(book, {
    ...d,
    project: { ...d.project, statuses, updatedAt: ctx.now },
  });
}

export function deleteProject(book: DemoBook, projectId: string): DemoBook {
  const d = data(book, projectId);
  const projects = { ...book.projects };
  delete projects[projectId];
  const comments = { ...book.comments };
  const activity = { ...book.activity };
  for (const issue of d.issues) {
    delete comments[issue.id];
    delete activity[issue.id];
  }
  const counters = { ...book.counters };
  delete counters[projectId];
  return { ...book, projects, comments, activity, counters };
}

/* ------------------------------------------------------------------ issues -- */

export function createIssue(
  book: DemoBook,
  projectId: string,
  input: NewIssueInput,
  ctx: Ctx,
): { book: DemoBook; issue: Issue } {
  const d = data(book, projectId);
  if (!input.title.trim()) throw new ProjectRuleError("Add a summary first.");
  if (input.type === "SUBTASK") {
    const parent = d.issues.find((i) => i.id === input.parentId);
    if (!parent || parent.type === "EPIC" || parent.type === "SUBTASK") {
      throw new ProjectRuleError("A sub-task belongs to a story, task or bug.");
    }
  }
  if (input.assigneeId && !d.project.memberIds.includes(input.assigneeId)) {
    throw new ProjectRuleError(
      "Only members of the project can be assigned issues.",
    );
  }
  const number = nextIssueNumber(d.issues, book.counters[projectId] ?? 0);
  const issue = buildIssue(d, input, {
    id: ctx.makeId(),
    now: ctx.now,
    actorId: ctx.actorId,
    number,
  });
  const created: IssueActivity = {
    id: ctx.makeId(),
    issueId: issue.id,
    actorId: ctx.actorId,
    field: "created",
    from: undefined,
    to: undefined,
    at: ctx.now,
  };
  return {
    issue,
    book: {
      ...withProject(book, { ...d, issues: [...d.issues, issue] }),
      counters: { ...book.counters, [projectId]: number },
      activity: { ...book.activity, [issue.id]: [created] },
    },
  };
}

export function patchIssueInBook(
  book: DemoBook,
  issueId: string,
  patch: IssuePatch,
  ctx: Ctx,
): { book: DemoBook; issue: Issue; changes: FieldChange[] } {
  const projectId = projectIdOfIssue(book, issueId);
  if (!projectId)
    throw new ProjectRuleError(
      "That issue is not here. It may have been deleted.",
    );
  const d = data(book, projectId);
  if (patch.assigneeId && !d.project.memberIds.includes(patch.assigneeId)) {
    throw new ProjectRuleError(
      "Only members of the project can be assigned issues.",
    );
  }
  const result = patchIssue(d, issueId, patch, ctx.now);
  if (!result.issue) throw new ProjectRuleError("That issue is not here.");
  const rows: IssueActivity[] = result.changes.map((change) => ({
    id: ctx.makeId(),
    issueId,
    actorId: ctx.actorId,
    field: change.field,
    from: change.from,
    to: change.to,
    at: ctx.now,
  }));
  return {
    book: {
      ...withProject(book, result.data),
      activity: {
        ...book.activity,
        [issueId]: [...(book.activity[issueId] ?? []), ...rows],
      },
    },
    issue: result.issue,
    changes: result.changes,
  };
}

export function deleteIssueInBook(
  book: DemoBook,
  issueId: string,
  now: string,
): DemoBook {
  const projectId = projectIdOfIssue(book, issueId);
  if (!projectId) return book;
  const d = data(book, projectId);
  const removed = removeIssue(d, issueId, now);
  const comments = { ...book.comments };
  const activity = { ...book.activity };
  for (const id of removed.removedIds) {
    delete comments[id];
    delete activity[id];
  }
  return { ...withProject(book, removed.data), comments, activity };
}

/* ---------------------------------------------------------------- comments -- */

export function addCommentToBook(
  book: DemoBook,
  issueId: string,
  body: string,
  ctx: Ctx,
): { book: DemoBook; comment: IssueComment } {
  const text = body.trim();
  if (!text) throw new ProjectRuleError("Write something first.");
  if (!projectIdOfIssue(book, issueId)) {
    throw new ProjectRuleError(
      "That issue is not here. It may have been deleted.",
    );
  }
  const comment: IssueComment = {
    id: ctx.makeId(),
    issueId,
    authorId: ctx.actorId ?? "",
    body: text,
    editedAt: null,
    createdAt: ctx.now,
  };
  return {
    comment,
    book: {
      ...withCommentCount(book, issueId, 1),
      comments: {
        ...book.comments,
        [issueId]: [...(book.comments[issueId] ?? []), comment],
      },
    },
  };
}

/** Adds `by` to an issue's comment count, which the list carries so cards need no request. */
function withCommentCount(
  book: DemoBook,
  issueId: string,
  by: number,
): DemoBook {
  const projectId = projectIdOfIssue(book, issueId);
  if (!projectId) return book;
  const d = data(book, projectId);
  return withProject(book, {
    ...d,
    issues: d.issues.map((i) =>
      i.id === issueId
        ? { ...i, commentCount: Math.max(0, i.commentCount + by) }
        : i,
    ),
  });
}

export function editCommentInBook(
  book: DemoBook,
  commentId: string,
  body: string,
  ctx: Ctx,
): { book: DemoBook; comment: IssueComment } {
  const text = body.trim();
  if (!text) throw new ProjectRuleError("Write something first.");
  for (const [issueId, list] of Object.entries(book.comments)) {
    const found = list.find((c) => c.id === commentId);
    if (!found) continue;
    if (found.authorId !== (ctx.actorId ?? "")) {
      throw new ProjectRuleError(
        "Only the person who wrote a comment can edit it.",
      );
    }
    const comment = { ...found, body: text, editedAt: ctx.now };
    return {
      comment,
      book: {
        ...book,
        comments: {
          ...book.comments,
          [issueId]: list.map((c) => (c.id === commentId ? comment : c)),
        },
      },
    };
  }
  throw new ProjectRuleError("That comment is not here.");
}

export function removeCommentFromBook(
  book: DemoBook,
  commentId: string,
): DemoBook {
  let next: DemoBook = book;
  const comments: Record<string, IssueComment[]> = {};
  for (const [issueId, list] of Object.entries(book.comments)) {
    const kept = list.filter((c) => c.id !== commentId);
    if (kept.length !== list.length) next = withCommentCount(next, issueId, -1);
    comments[issueId] = kept;
  }
  return { ...next, comments };
}

/* ----------------------------------------------------------------- sprints -- */

export function createSprintInBook(
  book: DemoBook,
  projectId: string,
  input: NewSprintInput,
  ctx: Ctx,
): { book: DemoBook; sprint: Sprint } {
  const d = data(book, projectId);
  if (d.project.type === "KANBAN") {
    throw new ProjectRuleError("Kanban projects do not use sprints.");
  }
  const sprint: Sprint = {
    id: ctx.makeId(),
    projectId,
    name:
      input.name.trim() || `${d.project.key} Sprint ${d.sprints.length + 1}`,
    goal: input.goal ?? "",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    state: "PLANNED",
    committedPoints: null,
    completedPoints: null,
    closedAt: null,
    createdAt: ctx.now,
  };
  return {
    sprint,
    book: withProject(book, { ...d, sprints: [...d.sprints, sprint] }),
  };
}

const projectIdOfSprint = (book: DemoBook, sprintId: string): string => {
  for (const [id, d] of Object.entries(book.projects)) {
    if (d.sprints.some((s) => s.id === sprintId)) return id;
  }
  throw new ProjectRuleError("That sprint is not here.");
};

export function updateSprintInBook(
  book: DemoBook,
  sprintId: string,
  patch: SprintPatch,
): DemoBook {
  const d = data(book, projectIdOfSprint(book, sprintId));
  return withProject(book, {
    ...d,
    sprints: d.sprints.map((s) => (s.id === sprintId ? { ...s, ...patch } : s)),
  });
}

export function deleteSprintInBook(
  book: DemoBook,
  sprintId: string,
  now: string,
): DemoBook {
  const d = data(book, projectIdOfSprint(book, sprintId));
  const sprint = d.sprints.find((s) => s.id === sprintId)!;
  if (sprint.state !== "PLANNED") {
    throw new ProjectRuleError("Only a planned sprint can be deleted.");
  }
  return withProject(book, {
    ...d,
    sprints: d.sprints.filter((s) => s.id !== sprintId),
    issues: d.issues.map((i) =>
      i.sprintId === sprintId ? { ...i, sprintId: null, updatedAt: now } : i,
    ),
  });
}

export function startSprintInBook(
  book: DemoBook,
  sprintId: string,
  edits: SprintPatch,
): DemoBook {
  const d = data(book, projectIdOfSprint(book, sprintId));
  const sprint = d.sprints.find((s) => s.id === sprintId)!;
  const blocker = startBlocker(sprint, d.sprints, d.issues);
  if (blocker) throw new ProjectRuleError(blocker);
  const clean = {
    ...(edits.name !== undefined ? { name: edits.name } : {}),
    ...(edits.goal !== undefined ? { goal: edits.goal } : {}),
    ...(edits.startDate ? { startDate: edits.startDate } : {}),
    ...(edits.endDate ? { endDate: edits.endDate } : {}),
  };
  return withProject(book, startSprint(d, sprintId, clean));
}

export function completeSprintInBook(
  book: DemoBook,
  sprintId: string,
  move: CompleteSprintMove,
  nextDraft: NewSprintInput,
  ctx: Ctx,
): DemoBook {
  const d = data(book, projectIdOfSprint(book, sprintId));
  const sprint = d.sprints.find((s) => s.id === sprintId)!;
  if (sprint.state !== "ACTIVE") {
    throw new ProjectRuleError("Only the active sprint can be completed.");
  }
  const created: Sprint | null =
    move === "new"
      ? {
          id: ctx.makeId(),
          projectId: d.project.id,
          name: nextDraft.name,
          goal: nextDraft.goal ?? "",
          startDate: nextDraft.startDate ?? null,
          endDate: nextDraft.endDate ?? null,
          state: "PLANNED",
          committedPoints: null,
          completedPoints: null,
          closedAt: null,
          createdAt: ctx.now,
        }
      : null;
  return withProject(
    book,
    completeSprint(d, sprintId, move, ctx.now, created).data,
  );
}

/** `KEY-12` for the next issue of a project in a book, for previews. */
export function nextKeyIn(book: DemoBook, projectId: string): string {
  const d = data(book, projectId);
  return issueKey(
    d.project.key,
    nextIssueNumber(d.issues, book.counters[projectId] ?? 0),
  );
}

/**
 * Whether the persisted book is too old to keep. The sample is written relative
 * to the day it was built, so after a couple of weeks its active sprint would
 * read as long over; a fresh book is better than a stale one.
 */
export function bookIsStale(book: DemoBook, today: string): boolean {
  if (!book.anchor) return true;
  const age = Math.round(
    (Date.parse(today) - Date.parse(book.anchor)) / 86_400_000,
  );
  return Number.isNaN(age) || age > BOOK_MAX_AGE_DAYS || age < 0;
}
