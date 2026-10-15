/**
 * What a change does to a project's data.
 *
 * These are the design's rules as pure functions over `ProjectData`: a status
 * move into a DONE category sets `doneAt` and leaving it clears it; a sub-task
 * takes its parent's sprint and epic and keeps them in step; an epic has no
 * sprint, epic or points; deleting an issue takes its sub-tasks with it and
 * releases an epic's children.
 *
 * Two callers use them, which is the point of writing them once:
 *
 * - **Demo mode** applies the result as the truth and records the activity.
 * - **Connected mode** applies the result *optimistically*, so a drag lands under
 *   the pointer, then replaces it with what the API answered or rolls it back. The
 *   API runs the same rules; this is a prediction of it, never a second authority.
 */

import { daysBetween } from "./dates";
import { issueKey } from "./keys";
import { rankAtEnd } from "./rank";
import type {
  Issue,
  IssuePatch,
  NewIssueInput,
  Project,
  ProjectData,
  ProjectStatus,
  StatusInput,
} from "./types";
import {
  categoryOf,
  effectiveStatus,
  sortStatuses,
  statusOf,
} from "./workflow";

export type FieldChange = { field: string; from: unknown; to: unknown };

export const MAX_TITLE = 240;
export const MAX_LABELS = 12;

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Comma-separated labels as the API stores them: trimmed, unique, at most twelve. */
export function parseLabels(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const label = raw.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length === MAX_LABELS) break;
  }
  return out;
}

/** Whole non-negative points, or null. Anything else is not a number of points. */
export function parsePoints(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function childrenOf(
  issues: readonly Issue[],
  parentId: string,
): Issue[] {
  return issues.filter((issue) => issue.parentId === parentId);
}

export function storiesOf(issues: readonly Issue[], epicId: string): Issue[] {
  return issues.filter(
    (issue) => issue.epicId === epicId && issue.type !== "SUBTASK",
  );
}

/**
 * The patch with everything the rules would refuse taken out, so a caller can
 * send "whatever the form held" and the optimistic result matches the server's.
 */
export function sanitisePatch(
  data: ProjectData,
  issue: Issue,
  patch: IssuePatch,
): IssuePatch {
  const out: IssuePatch = { ...patch };
  const { project, issues } = data;

  if (issue.type === "SUBTASK") {
    delete out.type;
    delete out.epicId;
    delete out.sprintId;
  }
  if (issue.type === "EPIC") {
    delete out.sprintId;
    delete out.epicId;
    delete out.points;
    delete out.type;
  } else if (out.type === "EPIC" || out.type === "SUBTASK") {
    delete out.type;
  }
  if (project.type === "KANBAN") delete out.sprintId;

  if (out.statusId !== undefined && !statusOf(project.statuses, out.statusId)) {
    delete out.statusId;
  }
  if (out.epicId) {
    const target = issues.find((i) => i.id === out.epicId);
    if (!target || target.type !== "EPIC") delete out.epicId;
  }
  if (out.title !== undefined) {
    const title = out.title.trim().slice(0, MAX_TITLE);
    if (!title) delete out.title;
    else out.title = title;
  }
  if (out.points !== undefined && out.points !== null) {
    const points = parsePoints(out.points);
    if (points === null) delete out.points;
    else out.points = points;
  }
  if (out.labels) out.labels = parseLabels(out.labels.join(","));
  return out;
}

export type PatchResult = {
  data: ProjectData;
  /** The updated issue, or null when it does not exist. */
  issue: Issue | null;
  /** One entry per changed field, never rank. For the history list. */
  changes: FieldChange[];
  /** Ids whose rows differ from before, sub-tasks that followed included. */
  touched: string[];
  /**
   * The fields that actually changed, rank included — what to send the API.
   * Sending only these keeps a no-op out of the history and a stale field out of
   * a save.
   */
  applied: IssuePatch;
};

export function patchIssue(
  data: ProjectData,
  issueId: string,
  rawPatch: IssuePatch,
  now: string,
): PatchResult {
  const current = data.issues.find((i) => i.id === issueId);
  if (!current)
    return { data, issue: null, changes: [], touched: [], applied: {} };

  const patch = sanitisePatch(data, current, rawPatch);
  const changes: FieldChange[] = [];
  const applied: Record<string, unknown> = {};
  const next: Issue = { ...current };

  for (const field of Object.keys(patch) as (keyof IssuePatch)[]) {
    const to = patch[field] ?? null;
    const from = current[field as keyof Issue] ?? null;
    if (same(from, to)) continue;
    (next as Record<string, unknown>)[field] = to;
    applied[field] = to;
    if (field === "rank") continue;
    if (field === "description") {
      changes.push({ field, from: undefined, to: undefined });
    } else {
      changes.push({ field, from, to });
    }
  }
  if (next.rank === current.rank && changes.length === 0) {
    return { data, issue: current, changes: [], touched: [], applied: {} };
  }

  if (next.statusId !== current.statusId) {
    const was = categoryOf(data.project.statuses, current.statusId) === "DONE";
    const is = categoryOf(data.project.statuses, next.statusId) === "DONE";
    if (is && !was) next.doneAt = now;
    if (!is && was) next.doneAt = null;
  }
  next.updatedAt = now;

  const touched = [issueId];
  const issues = data.issues.map((issue) => {
    if (issue.id === issueId) return next;
    if (issue.parentId !== issueId) return issue;
    /* A sub-task follows its parent's sprint and epic. */
    const followsSprint = next.sprintId !== current.sprintId;
    const followsEpic = next.epicId !== current.epicId;
    if (!followsSprint && !followsEpic) return issue;
    touched.push(issue.id);
    return {
      ...issue,
      sprintId: followsSprint ? next.sprintId : issue.sprintId,
      epicId: followsEpic ? next.epicId : issue.epicId,
      updatedAt: now,
    };
  });

  return {
    data: { ...data, issues },
    issue: next,
    changes,
    touched,
    applied: applied as IssuePatch,
  };
}

/** The next issue number for a project: one more than any it has had on screen. */
export function nextIssueNumber(issues: readonly Issue[], floor = 0): number {
  return Math.max(floor, ...issues.map((i) => i.number), 0) + 1;
}

export type CreateContext = {
  id: string;
  now: string;
  actorId: string | null;
  number: number;
};

/** A new issue as the rules would build it. Does not insert it. */
export function buildIssue(
  data: ProjectData,
  input: NewIssueInput,
  ctx: CreateContext,
): Issue {
  const { project, issues } = data;
  const parent =
    input.type === "SUBTASK" && input.parentId
      ? (issues.find((i) => i.id === input.parentId) ?? null)
      : null;

  const isEpic = input.type === "EPIC";
  const status =
    (input.statusId ? statusOf(project.statuses, input.statusId) : null) ??
    sortStatuses(project.statuses)[0]!;

  const epic =
    !isEpic && input.epicId
      ? issues.find((i) => i.id === input.epicId && i.type === "EPIC")
      : undefined;
  const sprintId =
    isEpic || project.type === "KANBAN"
      ? null
      : parent
        ? parent.sprintId
        : (input.sprintId ?? null);

  const done = status.category === "DONE";
  return {
    id: ctx.id,
    projectId: project.id,
    number: ctx.number,
    key: issueKey(project.key, ctx.number),
    type: input.type,
    title: (input.title.trim() || "Untitled").slice(0, MAX_TITLE),
    description: input.description ?? "",
    statusId: status.id,
    priority: input.priority ?? "MEDIUM",
    assigneeId: input.assigneeId ?? null,
    reporterId: ctx.actorId,
    epicId: parent ? parent.epicId : (epic?.id ?? null),
    parentId: parent ? parent.id : null,
    sprintId,
    points: isEpic ? null : parsePoints(input.points ?? null),
    labels: parseLabels((input.labels ?? []).join(",")),
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    rank: rankAtEnd(issues.map((i) => i.rank)),
    doneAt: done ? ctx.now : null,
    goalId: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

export type DeleteResult = {
  data: ProjectData;
  /** The issue and its sub-tasks. */
  removedIds: string[];
  /** Stories that lost their epic. */
  releasedIds: string[];
};

export function removeIssue(
  data: ProjectData,
  issueId: string,
  now: string,
): DeleteResult {
  const target = data.issues.find((i) => i.id === issueId);
  if (!target) return { data, removedIds: [], releasedIds: [] };
  const removed = new Set<string>([
    issueId,
    ...data.issues.filter((i) => i.parentId === issueId).map((i) => i.id),
  ]);
  const releasedIds: string[] = [];
  const issues = data.issues
    .filter((i) => !removed.has(i.id))
    .map((i) => {
      if (target.type === "EPIC" && i.epicId === issueId) {
        releasedIds.push(i.id);
        return { ...i, epicId: null, updatedAt: now };
      }
      return i;
    });
  return {
    data: { ...data, issues },
    removedIds: [...removed],
    releasedIds,
  };
}

/* ------------------------------------------------------------ the project -- */

/** The lead is always a member, and nobody is listed twice. */
export function withLead(
  memberIds: readonly string[],
  leadId: string,
): string[] {
  return [...new Set([leadId, ...memberIds])];
}

/**
 * Turns a draft workflow into saved statuses, keeping the ids of the ones that
 * existed. New entries get an id from `makeId`.
 */
export function applyStatusInputs(
  existing: readonly ProjectStatus[],
  drafts: readonly StatusInput[],
  makeId: () => string,
): ProjectStatus[] {
  const known = new Set(existing.map((s) => s.id));
  return drafts.map((draft, index) => ({
    id: draft.id && known.has(draft.id) ? draft.id : makeId(),
    name: draft.name.trim(),
    category: draft.category,
    wipLimit: draft.wipLimit,
    position: index,
  }));
}

/** Everything the `project` row carries that a settings edit can touch. */
export function updatedProject(
  project: Project,
  patch: Partial<Project>,
  now: string,
): Project {
  const next = { ...patch };
  const merged = { ...project, ...next, updatedAt: now };
  if (patch.leadId !== undefined) {
    merged.memberIds = withLead(merged.memberIds, merged.leadId);
  }
  return merged;
}

/** Issues that are not finished, by the project's own categories. */
export function openIssues(
  statuses: readonly ProjectStatus[],
  issues: readonly Issue[],
): Issue[] {
  return issues.filter(
    (issue) =>
      issue.type !== "EPIC" &&
      effectiveStatus(statuses, issue.statusId).category !== "DONE",
  );
}

/** Days between the day an issue finished and `today`, or null when it is not done. */
export function daysSinceDone(
  issue: Pick<Issue, "doneAt">,
  doneDay: string | null,
  today: string,
): number | null {
  if (!issue.doneAt || !doneDay) return null;
  return daysBetween(doneDay, today);
}
