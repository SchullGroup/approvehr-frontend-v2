"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { projectsApi } from "@/lib/api/projects";
import { employeeById } from "@/lib/mock/people";
import { nowIso } from "@/lib/projects/clock";
import {
  EMPTY_BOOK,
  ProjectRuleError,
  addCommentToBook,
  bookIsStale,
  completeSprintInBook,
  createIssue as bookCreateIssue,
  createProject as bookCreateProject,
  createSprintInBook,
  deleteIssueInBook,
  deleteProject as bookDeleteProject,
  deleteSprintInBook,
  editCommentInBook,
  patchIssueInBook,
  removeCommentFromBook,
  sampleBook,
  setMembers as bookSetMembers,
  setStatuses as bookSetStatuses,
  startSprintInBook,
  updateProject as bookUpdateProject,
  updateSprintInBook,
  type Ctx,
  type DemoBook,
} from "@/lib/projects/demo-book";
import {
  patchIssue,
  removeIssue,
  updatedProject,
  withLead,
} from "@/lib/projects/mutations";
import type {
  CompleteSprintMove,
  Issue,
  IssueComment,
  IssuePatch,
  IssueThread,
  NewIssueInput,
  NewProjectInput,
  NewSprintInput,
  Project,
  ProjectData,
  ProjectPatch,
  ProjectStatus,
  Sprint,
  SprintPatch,
  StatusInput,
} from "@/lib/projects/types";
import {
  removalBlocker,
  sortStatuses,
  workflowProblem,
} from "@/lib/projects/workflow";
import { useRevalidation } from "@/lib/revalidate";
import { todayIn } from "@/lib/time";
import { createPersistedState } from "./persisted";
import { useOrgTimezone, useSession } from "./session";

/**
 * Projects, from whichever source is available.
 *
 * Connected, the API; with no API (a development or demonstration build), a book
 * kept in this browser and seeded with the "Checkout Revamp" sample. Every screen
 * calls the same hooks and does not care which it got.
 *
 * ## Connected: a cache that is a prediction, not a copy
 *
 * - **All of a project's issues arrive in one list** (the API caps it at 5,000),
 *   so the board, the backlog, the roadmap and the reports are all views of one
 *   array. Nothing pages.
 * - **Freshness without sockets.** The cache is re-fetched when the window comes
 *   back into focus (`useRevalidation`) and after every mutation settles. A
 *   refetch never shows a skeleton over data already on screen.
 * - **Optimistic, with a way back.** A move or an edit is applied to the cache
 *   first, using the same rules the API applies (`lib/projects/mutations.ts`), so
 *   a card lands under the pointer. The API's answer then replaces the
 *   prediction; a refusal puts back the rows it touched and raises an error toast
 *   that names the issue.
 * - **One at a time per issue.** Two edits to one card are sent in order, so the
 *   second cannot overtake the first and leave the server with the older value.
 * - **A refetch never overwrites newer work.** Each project counts its in-flight
 *   mutations and a "version" that moves when one settles. A response that began
 *   before the version moved, or that lands while something is still in flight,
 *   is dropped and asked for again once things are quiet.
 *
 * Creating a project or an issue is *not* optimistic: the key (`PAY-12`) comes
 * from the server, and a card that has no key cannot be opened or linked.
 *
 * ## Demo: the same rules, applied for real
 *
 * `lib/projects/demo-book.ts` applies the API's rules to a plain object that this
 * file keeps in localStorage. A book more than a fortnight old is rebuilt, because
 * the sample is written relative to the day it was made.
 *
 * ## Errors
 *
 * Every action returns a `Result` and **never throws**. By default a failure also
 * raises a toast — the rollback has already happened by then — so a call made and
 * forgotten (a drag) is still honest. A form that wants to show the reason beside
 * its field passes `{ quiet: true }` and reads `result.message`.
 */

export type Result<T> =
  { ok: true; value: T } | { ok: false; message: string; error: unknown };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** The same outcome, with nothing to hand back. */
const voided = <T>(result: Result<T>): Result<void> =>
  result.ok ? ok(undefined) : result;

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof ProjectRuleError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

const fail = (error: unknown): Result<never> => ({
  ok: false,
  message: messageOf(error),
  error,
});

const isNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;

const makeId = (): string => crypto.randomUUID();

/* ======================================================================== */
/*  The connected cache                                                     */
/* ======================================================================== */

type LoadStatus = "idle" | "loading" | "ready" | "error";

type Entry = {
  data: ProjectData | null;
  status: LoadStatus;
  error: unknown;
  notFound: boolean;
  /** The API holds more issues than it sent (it stops at 5,000). */
  capped: boolean;
};

type ThreadEntry = {
  thread: IssueThread | null;
  status: LoadStatus;
  error: unknown;
};

type Scope = "mine" | "all";

type Cache = {
  /** Whose cache this is. Another person or company starts from nothing. */
  owner: string | null;
  lists: Partial<
    Record<Scope, { projects: Project[]; status: LoadStatus; error: unknown }>
  >;
  entries: Record<string, Entry>;
  threads: Record<string, ThreadEntry>;
};

const EMPTY_CACHE: Cache = {
  owner: null,
  lists: {},
  entries: {},
  threads: {},
};

let cache: Cache = EMPTY_CACHE;
const listeners = new Set<() => void>();

function setCache(next: Cache) {
  cache = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function claim(owner: string) {
  if (cache.owner !== owner) setCache({ ...EMPTY_CACHE, owner });
}

function setEntry(projectId: string, entry: Entry) {
  setCache({ ...cache, entries: { ...cache.entries, [projectId]: entry } });
}

function setData(projectId: string, data: ProjectData) {
  setEntry(projectId, {
    data,
    status: "ready",
    error: null,
    notFound: false,
    capped: cache.entries[projectId]?.capped ?? false,
  });
}

function dataOf(projectId: string): ProjectData | null {
  return cache.entries[projectId]?.data ?? null;
}

function upsertIssues(projectId: string, rows: readonly Issue[]) {
  const data = dataOf(projectId);
  if (!data) return;
  const incoming = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const issues = data.issues.map((issue) => {
    const row = incoming.get(issue.id);
    if (row) seen.add(issue.id);
    return row ?? issue;
  });
  for (const row of rows) if (!seen.has(row.id)) issues.push(row);
  setData(projectId, { ...data, issues });
}

function replaceProject(projectId: string, project: Project) {
  const data = dataOf(projectId);
  if (!data) return;
  setData(projectId, { ...data, project });
  const lists = { ...cache.lists };
  for (const scope of ["mine", "all"] as const) {
    const list = lists[scope];
    if (list) {
      lists[scope] = {
        ...list,
        projects: list.projects.map((p) =>
          p.id === projectId ? { ...p, ...project } : p,
        ),
      };
    }
  }
  setCache({ ...cache, lists });
}

/** A server project row may leave out what it did not change; keep what we hold. */
function mergeProject(prev: Project, server: Project): Project {
  return {
    ...server,
    statuses: server.statuses.length > 0 ? server.statuses : prev.statuses,
    memberIds: server.memberIds.length > 0 ? server.memberIds : prev.memberIds,
    departmentName: server.departmentName ?? prev.departmentName,
    openIssueCount: server.openIssueCount ?? prev.openIssueCount,
  };
}

/* ---- in-flight bookkeeping ---------------------------------------------- */

const pending = new Map<string, number>();
const versions = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();
const chains = new Map<string, Promise<unknown>>();

const pendingOf = (projectId: string) => pending.get(projectId) ?? 0;
const versionOf = (projectId: string) => versions.get(projectId) ?? 0;

/** Runs `work` after anything earlier under the same key has finished. */
function inOrder<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = chains.get(key) ?? Promise.resolve();
  const next = before.catch(() => undefined).then(work);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Counts a mutation as in flight, and when the last one settles asks for the
 * project again so the screen ends on the server's answer.
 */
async function tracked<T>(
  projectId: string,
  work: () => Promise<T>,
): Promise<T> {
  pending.set(projectId, pendingOf(projectId) + 1);
  try {
    return await work();
  } finally {
    pending.set(projectId, Math.max(0, pendingOf(projectId) - 1));
    versions.set(projectId, versionOf(projectId) + 1);
    if (pendingOf(projectId) === 0 && cache.owner) {
      void loadProject(cache.owner, projectId);
    }
  }
}

/* ---- loads -------------------------------------------------------------- */

async function loadList(owner: string, scope: Scope): Promise<void> {
  claim(owner);
  const key = `list:${scope}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    const prev = cache.lists[scope];
    if (!prev || prev.status !== "ready") {
      setCache({
        ...cache,
        lists: {
          ...cache.lists,
          [scope]: {
            projects: prev?.projects ?? [],
            status: "loading",
            error: null,
          },
        },
      });
    }
    try {
      const projects = await projectsApi.list(scope);
      setCache({
        ...cache,
        lists: {
          ...cache.lists,
          [scope]: { projects, status: "ready", error: null },
        },
      });
    } catch (error) {
      if (prev?.status === "ready") return;
      setCache({
        ...cache,
        lists: {
          ...cache.lists,
          [scope]: { projects: prev?.projects ?? [], status: "error", error },
        },
      });
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

async function loadProject(owner: string, id: string): Promise<void> {
  claim(owner);
  const key = `project:${id}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    const prev = cache.entries[id];
    const startedAt = versionOf(id);
    if (!prev?.data) {
      setEntry(id, {
        data: null,
        status: "loading",
        error: null,
        notFound: false,
        capped: false,
      });
    }
    try {
      const data = await projectsApi.load(id);
      /* Something changed under this answer: it is older than the cache. Ask
         again once the mutations in flight have landed, and keep what is shown. */
      if (versionOf(id) !== startedAt || pendingOf(id) > 0) {
        if (pendingOf(id) === 0) {
          inflight.delete(key);
          void loadProject(owner, id);
        }
        return;
      }
      setEntry(id, {
        data: {
          project: data.project,
          issues: data.issues,
          sprints: data.sprints,
        },
        status: "ready",
        error: null,
        notFound: false,
        capped: data.issuesCapped,
      });
    } catch (error) {
      if (isNotFound(error)) {
        setEntry(id, {
          data: null,
          status: "error",
          error,
          notFound: true,
          capped: false,
        });
      } else if (!prev?.data) {
        setEntry(id, {
          data: null,
          status: "error",
          error,
          notFound: false,
          capped: false,
        });
      }
      /* With data already on screen a failed refresh stays quiet: stale beats gone. */
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

async function loadThread(owner: string, issueId: string): Promise<void> {
  claim(owner);
  const key = `thread:${issueId}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    const prev = cache.threads[issueId];
    if (!prev?.thread) {
      setCache({
        ...cache,
        threads: {
          ...cache.threads,
          [issueId]: { thread: null, status: "loading", error: null },
        },
      });
    }
    try {
      const thread = await projectsApi.thread(issueId);
      setCache({
        ...cache,
        threads: {
          ...cache.threads,
          [issueId]: { thread, status: "ready", error: null },
        },
      });
    } catch (error) {
      if (!prev?.thread) {
        setCache({
          ...cache,
          threads: {
            ...cache.threads,
            [issueId]: { thread: null, status: "error", error },
          },
        });
      }
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

/* ---- connected mutations ------------------------------------------------ */

async function apiCreateProject(
  owner: string,
  input: NewProjectInput,
): Promise<Result<Project>> {
  claim(owner);
  try {
    const project = await projectsApi.create(input);
    setEntry(project.id, {
      data: { project, issues: [], sprints: [] },
      status: "ready",
      error: null,
      notFound: false,
      capped: false,
    });
    const lists = { ...cache.lists };
    for (const scope of ["mine", "all"] as const) {
      const list = lists[scope];
      if (list)
        lists[scope] = { ...list, projects: [...list.projects, project] };
    }
    setCache({ ...cache, lists });
    return ok(project);
  } catch (error) {
    return fail(error);
  }
}

async function apiPatchIssue(
  owner: string,
  projectId: string,
  issueId: string,
  patch: IssuePatch,
): Promise<Result<Issue>> {
  claim(owner);
  const data = dataOf(projectId);
  if (!data) return fail(new Error("Open the project first."));
  const predicted = patchIssue(data, issueId, patch, nowIso());
  if (!predicted.issue) {
    return fail(
      new ApiError(
        404,
        "not_found",
        "That issue is not here. It may have been deleted.",
      ),
    );
  }
  if (Object.keys(predicted.applied).length === 0) return ok(predicted.issue);

  const before = data.issues.filter((i) => predicted.touched.includes(i.id));
  setData(projectId, predicted.data);
  try {
    const saved = await tracked(projectId, () =>
      inOrder(issueId, () =>
        projectsApi.updateIssue(issueId, predicted.applied),
      ),
    );
    /* Only when nothing else is in flight: otherwise a later edit's prediction
       would be rolled back by this older answer until its own lands. */
    if (pendingOf(projectId) === 0) upsertIssues(projectId, [saved]);
    if (cache.threads[issueId]) void loadThread(owner, issueId);
    return ok(saved);
  } catch (error) {
    upsertIssues(projectId, before);
    return fail(error);
  }
}

async function apiCreateIssue(
  owner: string,
  projectId: string,
  input: NewIssueInput,
): Promise<Result<Issue>> {
  claim(owner);
  try {
    const issue = await tracked(projectId, () =>
      projectsApi.createIssue(projectId, input),
    );
    upsertIssues(projectId, [issue]);
    return ok(issue);
  } catch (error) {
    return fail(error);
  }
}

async function apiDeleteIssue(
  owner: string,
  projectId: string,
  issueId: string,
): Promise<Result<void>> {
  claim(owner);
  const data = dataOf(projectId);
  if (!data) return fail(new Error("Open the project first."));
  const predicted = removeIssue(data, issueId, nowIso());
  const restore = data.issues.filter(
    (i) =>
      predicted.removedIds.includes(i.id) ||
      predicted.releasedIds.includes(i.id),
  );
  setData(projectId, predicted.data);
  try {
    await tracked(projectId, () =>
      inOrder(issueId, () => projectsApi.removeIssue(issueId)),
    );
    return ok(undefined);
  } catch (error) {
    upsertIssues(projectId, restore);
    return fail(error);
  }
}

async function apiUpdateProject(
  owner: string,
  projectId: string,
  patch: ProjectPatch,
): Promise<Result<Project>> {
  claim(owner);
  const data = dataOf(projectId);
  if (!data) return fail(new Error("Open the project first."));
  const before = data.project;
  replaceProject(
    projectId,
    updatedProject(before, patch as Partial<Project>, nowIso()),
  );
  try {
    const saved = await tracked(projectId, () =>
      projectsApi.update(projectId, patch),
    );
    const merged = mergeProject(dataOf(projectId)?.project ?? before, saved);
    replaceProject(projectId, merged);
    return ok(merged);
  } catch (error) {
    replaceProject(projectId, before);
    return fail(error);
  }
}

async function apiSetMembers(
  owner: string,
  projectId: string,
  memberIds: string[],
): Promise<Result<Project>> {
  claim(owner);
  const data = dataOf(projectId);
  if (!data) return fail(new Error("Open the project first."));
  const before = data.project;
  replaceProject(projectId, {
    ...before,
    memberIds: withLead(memberIds, before.leadId),
  });
  try {
    const saved = await tracked(projectId, () =>
      projectsApi.setMembers(projectId, memberIds),
    );
    const current = dataOf(projectId)?.project ?? before;
    const merged = {
      ...current,
      memberIds: saved.length > 0 ? saved : current.memberIds,
    };
    replaceProject(projectId, merged);
    return ok(merged);
  } catch (error) {
    replaceProject(projectId, before);
    return fail(error);
  }
}

async function apiSaveWorkflow(
  owner: string,
  projectId: string,
  drafts: StatusInput[],
): Promise<Result<ProjectStatus[]>> {
  claim(owner);
  const data = dataOf(projectId);
  if (!data) return fail(new Error("Open the project first."));
  try {
    const saved = await tracked(projectId, () =>
      projectsApi.setStatuses(projectId, drafts),
    );
    const statuses = sortStatuses(saved);
    replaceProject(projectId, {
      ...(dataOf(projectId)?.project ?? data.project),
      statuses,
    });
    return ok(statuses);
  } catch (error) {
    return fail(error);
  }
}

async function apiDeleteProject(
  owner: string,
  projectId: string,
): Promise<Result<void>> {
  claim(owner);
  try {
    await projectsApi.remove(projectId);
    const entries = { ...cache.entries };
    delete entries[projectId];
    const lists = { ...cache.lists };
    for (const scope of ["mine", "all"] as const) {
      const list = lists[scope];
      if (list) {
        lists[scope] = {
          ...list,
          projects: list.projects.filter((p) => p.id !== projectId),
        };
      }
    }
    setCache({ ...cache, entries, lists });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

async function apiAddComment(
  owner: string,
  projectId: string,
  issueId: string,
  body: string,
): Promise<Result<IssueComment>> {
  claim(owner);
  try {
    const comment = await tracked(projectId, () =>
      projectsApi.addComment(issueId, body),
    );
    const entry = cache.threads[issueId];
    if (entry?.thread) {
      setCache({
        ...cache,
        threads: {
          ...cache.threads,
          [issueId]: {
            ...entry,
            thread: {
              ...entry.thread,
              comments: [...entry.thread.comments, comment],
            },
          },
        },
      });
    }
    return ok(comment);
  } catch (error) {
    return fail(error);
  }
}

async function apiRemoveComment(
  owner: string,
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<Result<void>> {
  claim(owner);
  const entry = cache.threads[issueId];
  const before = entry?.thread ?? null;
  if (entry && before) {
    setCache({
      ...cache,
      threads: {
        ...cache.threads,
        [issueId]: {
          ...entry,
          thread: {
            ...before,
            comments: before.comments.filter((c) => c.id !== commentId),
          },
        },
      },
    });
  }
  try {
    await tracked(projectId, () => projectsApi.removeComment(commentId));
    return ok(undefined);
  } catch (error) {
    const current = cache.threads[issueId];
    if (current && before) {
      setCache({
        ...cache,
        threads: {
          ...cache.threads,
          [issueId]: { ...current, thread: before },
        },
      });
    }
    return fail(error);
  }
}

async function apiEditComment(
  owner: string,
  projectId: string,
  issueId: string,
  commentId: string,
  body: string,
): Promise<Result<IssueComment>> {
  claim(owner);
  try {
    const comment = await tracked(projectId, () =>
      projectsApi.editComment(commentId, body),
    );
    const entry = cache.threads[issueId];
    if (entry?.thread) {
      setCache({
        ...cache,
        threads: {
          ...cache.threads,
          [issueId]: {
            ...entry,
            thread: {
              ...entry.thread,
              comments: entry.thread.comments.map((c) =>
                c.id === commentId ? comment : c,
              ),
            },
          },
        },
      });
    }
    return ok(comment);
  } catch (error) {
    return fail(error);
  }
}

async function apiSprint<T>(
  owner: string,
  projectId: string,
  work: () => Promise<T>,
  apply?: (value: T, data: ProjectData) => ProjectData,
): Promise<Result<T>> {
  claim(owner);
  try {
    const value = await tracked(projectId, work);
    const data = dataOf(projectId);
    if (data && apply) setData(projectId, apply(value, data));
    return ok(value);
  } catch (error) {
    return fail(error);
  }
}

/* ======================================================================== */
/*  The demo book                                                           */
/* ======================================================================== */

const demoStore = createPersistedState<DemoBook>({
  key: "approvehr.projects.book",
  empty: EMPTY_BOOK,
  version: 1,
});

/** The employees the sample is written for, kept to ones the directory has. */
function demoPeople(): string[] {
  const wanted = ["p-01", "p-03", "p-09", "p-04"];
  const known = DEMO_ENABLED ? wanted.filter((id) => employeeById(id)) : [];
  return known.length > 0 ? known : wanted;
}

/**
 * Builds the sample when there is no book or it is too old.
 *
 * Reads storage first (`current()` hydrates it) and only writes if what it finds
 * is stale. The hook below cannot do that check itself, because until the store
 * has subscribed it holds the empty book, and an empty book looks stale.
 */
function seedDemoIfStale(today: string) {
  if (!DEMO_ENABLED) return;
  const held = demoStore.current();
  if (!bookIsStale(held, today)) return;
  demoStore.commit(sampleBook({ today, now: nowIso(), people: demoPeople() }));
}

function demoRun<T>(
  actorId: string | null,
  today: string,
  fn: (book: DemoBook, ctx: Ctx) => { book: DemoBook; value: T },
): Result<T> {
  try {
    seedDemoIfStale(today);
    const book = demoStore.current();
    const out = fn(book, { actorId, now: nowIso(), makeId });
    demoStore.commit(out.book);
    return ok(out.value);
  } catch (error) {
    return fail(error);
  }
}

/* ======================================================================== */
/*  Hooks                                                                   */
/* ======================================================================== */

function useMode() {
  const { isConnected, isLoading, user, actingId } = useSession();
  const timeZone = useOrgTimezone();
  const owner = isConnected
    ? `api:${user?.organizationId ?? "self"}:${actingId}`
    : null;
  return {
    connected: isConnected,
    sessionLoading: isLoading,
    owner,
    actingId,
    timeZone,
  };
}

function useCache(): Cache {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY_CACHE,
  );
}

function useDemoBook(enabled: boolean, today: string): DemoBook {
  const book = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
  const stale = enabled && bookIsStale(book, today);
  useEffect(() => {
    if (stale) seedDemoIfStale(today);
  }, [stale, today]);
  return stale ? EMPTY_BOOK : book;
}

export type ViewStatus = "loading" | "ready" | "error" | "notFound";

/**
 * The projects the signed-in person can see.
 *
 * `scope: "all"` is for people who hold `EDIT_RECORDS` and asked to see the
 * company's; the API refuses it for anybody else.
 */
export function useProjectList(
  scope: Scope = "mine",
  canSee: (project: Project) => boolean = () => true,
): {
  status: ViewStatus;
  error: unknown;
  projects: Project[];
  reload: () => void;
} {
  const mode = useMode();
  const state = useCache();
  const today = todayIn(mode.timeZone);
  const book = useDemoBook(!mode.connected && !mode.sessionLoading, today);
  const revalidation = useRevalidation();
  const owner = mode.owner;

  useEffect(() => {
    if (owner) void loadList(owner, scope);
  }, [owner, scope, revalidation]);

  const reload = useCallback(() => {
    if (owner) void loadList(owner, scope);
  }, [owner, scope]);

  return useMemo(() => {
    if (!mode.connected) {
      const ready = book.anchor !== "";
      const projects = Object.values(book.projects).map((d) => ({
        ...d.project,
        openIssueCount: d.issues.filter(
          (i) =>
            i.type !== "EPIC" &&
            d.project.statuses.find((s) => s.id === i.statusId)?.category !==
              "DONE",
        ).length,
      }));
      return {
        status: ready ? ("ready" as const) : ("loading" as const),
        error: null,
        projects: projects.filter(canSee),
        reload,
      };
    }
    const list = state.owner === owner ? state.lists[scope] : undefined;
    return {
      status:
        !list || list.status === "idle" || list.status === "loading"
          ? ("loading" as const)
          : list.status === "error"
            ? ("error" as const)
            : ("ready" as const),
      error: list?.error ?? null,
      projects: list?.projects ?? [],
      reload,
    };
  }, [mode.connected, book, state, owner, scope, canSee, reload]);
}

/**
 * One project with all of its issues and sprints.
 *
 * `status` is `notFound` for a project the person cannot see, as well as for one
 * that is gone: the API answers both the same way on purpose, and so does this.
 */
export function useProjectData(id: string): {
  status: ViewStatus;
  error: unknown;
  data: ProjectData | null;
  /** The API holds more issues than it sent, which stop at 5,000. */
  capped: boolean;
  reload: () => void;
} {
  const mode = useMode();
  const state = useCache();
  const today = todayIn(mode.timeZone);
  const book = useDemoBook(!mode.connected && !mode.sessionLoading, today);
  const revalidation = useRevalidation();
  const owner = mode.owner;

  useEffect(() => {
    if (owner) void loadProject(owner, id);
  }, [owner, id, revalidation]);

  const reload = useCallback(() => {
    if (owner) void loadProject(owner, id);
  }, [owner, id]);

  return useMemo(() => {
    if (mode.sessionLoading) {
      return {
        status: "loading" as const,
        error: null,
        data: null,
        capped: false,
        reload,
      };
    }
    if (!mode.connected) {
      const data = book.projects[id] ?? null;
      if (book.anchor === "") {
        return {
          status: "loading" as const,
          error: null,
          data: null,
          capped: false,
          reload,
        };
      }
      return data
        ? { status: "ready" as const, error: null, data, capped: false, reload }
        : {
            status: "notFound" as const,
            error: null,
            data: null,
            capped: false,
            reload,
          };
    }
    const entry = state.owner === owner ? state.entries[id] : undefined;
    if (
      !entry ||
      entry.status === "idle" ||
      (entry.status === "loading" && !entry.data)
    ) {
      return {
        status: "loading" as const,
        error: null,
        data: null,
        capped: false,
        reload,
      };
    }
    if (entry.notFound) {
      return {
        status: "notFound" as const,
        error: entry.error,
        data: null,
        capped: false,
        reload,
      };
    }
    if (!entry.data) {
      return {
        status: "error" as const,
        error: entry.error,
        data: null,
        capped: false,
        reload,
      };
    }
    return {
      status: "ready" as const,
      error: null,
      data: entry.data,
      capped: entry.capped,
      reload,
    };
  }, [mode.sessionLoading, mode.connected, book, state, owner, id, reload]);
}

const NO_THREAD: IssueThread = { comments: [], activity: [] };

/**
 * An issue's comments and history, oldest first.
 *
 * The weekly-task bridge's note is not here: it rides on the issue itself
 * (`issue.weeklyTask`), so it is as fresh as the issue and needs no request.
 */
export function useIssueThread(issueId: string | null): {
  thread: IssueThread;
  status: ViewStatus;
  reload: () => void;
} {
  const mode = useMode();
  const state = useCache();
  const today = todayIn(mode.timeZone);
  const book = useDemoBook(!mode.connected && !mode.sessionLoading, today);
  const revalidation = useRevalidation();
  const owner = mode.owner;

  useEffect(() => {
    if (owner && issueId) void loadThread(owner, issueId);
  }, [owner, issueId, revalidation]);

  const reload = useCallback(() => {
    if (owner && issueId) void loadThread(owner, issueId);
  }, [owner, issueId]);

  return useMemo(() => {
    if (!issueId)
      return { thread: NO_THREAD, status: "ready" as const, reload };
    if (!mode.connected) {
      return {
        thread: {
          comments: book.comments[issueId] ?? [],
          activity: book.activity[issueId] ?? [],
        },
        status: "ready" as const,
        reload,
      };
    }
    const entry = state.owner === owner ? state.threads[issueId] : undefined;
    if (!entry || entry.status === "loading" || entry.status === "idle") {
      return {
        thread: entry?.thread ?? NO_THREAD,
        status: entry?.thread ? ("ready" as const) : ("loading" as const),
        reload,
      };
    }
    return {
      thread: entry.thread ?? NO_THREAD,
      status:
        entry.status === "error" && !entry.thread
          ? ("error" as const)
          : ("ready" as const),
      reload,
    };
  }, [issueId, mode.connected, book, state, owner, reload]);
}

type Quiet = { quiet?: boolean };

export type ProjectActions = {
  /** Connected, this waits for the API: the key comes from the server. */
  createIssue: (
    input: NewIssueInput,
    options?: Quiet,
  ) => Promise<Result<Issue>>;
  /** Applied at once, rolled back with a toast if refused. */
  patchIssue: (
    issue: Pick<Issue, "id" | "key">,
    patch: IssuePatch,
    options?: Quiet,
  ) => Promise<Result<Issue>>;
  deleteIssue: (
    issue: Pick<Issue, "id" | "key">,
    options?: Quiet,
  ) => Promise<Result<void>>;
  addComment: (
    issueId: string,
    body: string,
    options?: Quiet,
  ) => Promise<Result<IssueComment>>;
  /** Author only. The API refuses anybody else. */
  editComment: (
    issueId: string,
    commentId: string,
    body: string,
    options?: Quiet,
  ) => Promise<Result<IssueComment>>;
  deleteComment: (
    issueId: string,
    commentId: string,
    options?: Quiet,
  ) => Promise<Result<void>>;
  updateProject: (
    patch: ProjectPatch,
    options?: Quiet,
  ) => Promise<Result<Project>>;
  /**
   * Replaces the member set. Taking off somebody who still has open issues is
   * refused with a sentence naming them; `nameOf` lets the demo write the same.
   */
  setMembers: (
    memberIds: string[],
    options?: Quiet & { nameOf?: (employeeId: string) => string },
  ) => Promise<Result<Project>>;
  saveWorkflow: (
    drafts: StatusInput[],
    options?: Quiet,
  ) => Promise<Result<ProjectStatus[]>>;
  deleteProject: (options?: Quiet) => Promise<Result<void>>;
  createSprint: (
    input: NewSprintInput,
    options?: Quiet,
  ) => Promise<Result<Sprint>>;
  updateSprint: (
    id: string,
    patch: SprintPatch,
    options?: Quiet,
  ) => Promise<Result<void>>;
  deleteSprint: (id: string, options?: Quiet) => Promise<Result<void>>;
  startSprint: (
    id: string,
    edits?: SprintPatch,
    options?: Quiet,
  ) => Promise<Result<void>>;
  completeSprint: (
    id: string,
    move: CompleteSprintMove,
    next?: NewSprintInput,
    options?: Quiet,
  ) => Promise<Result<void>>;
};

/**
 * Everything a Projects screen can do to one project, in both modes.
 *
 * Failures toast by default; see the header. Successes do not: the caller knows
 * whether "PAY-12 created" or nothing at all is the right thing to say, and a
 * drag should not announce itself.
 */
export function useProjectActions(projectId: string): ProjectActions {
  const mode = useMode();
  const toast = useToast();
  const { connected, owner, actingId, timeZone } = mode;
  const today = todayIn(timeZone);

  return useMemo(() => {
    const actor = actingId || null;

    const settle = <T>(
      result: Result<T>,
      title: string,
      options?: Quiet,
    ): Result<T> => {
      if (!result.ok && !options?.quiet) {
        toast.push({ tone: "danger", title, detail: result.message });
      }
      return result;
    };

    const demo = <T>(
      fn: (book: DemoBook, ctx: Ctx) => { book: DemoBook; value: T },
    ) => demoRun(actor, today, fn);

    const api = connected && owner !== null ? owner : null;

    return {
      createIssue: async (input, options) =>
        settle(
          api
            ? await apiCreateIssue(api, projectId, input)
            : demo((book, ctx) => {
                const out = bookCreateIssue(book, projectId, input, ctx);
                return { book: out.book, value: out.issue };
              }),
          "Could not create the issue",
          options,
        ),

      patchIssue: async (issue, patch, options) =>
        settle(
          api
            ? await apiPatchIssue(api, projectId, issue.id, patch)
            : demo((book, ctx) => {
                const out = patchIssueInBook(book, issue.id, patch, ctx);
                return { book: out.book, value: out.issue };
              }),
          `Could not update ${issue.key}`,
          options,
        ),

      deleteIssue: async (issue, options) =>
        settle(
          api
            ? await apiDeleteIssue(api, projectId, issue.id)
            : demo((book, ctx) => ({
                book: deleteIssueInBook(book, issue.id, ctx.now),
                value: undefined,
              })),
          `Could not delete ${issue.key}`,
          options,
        ),

      addComment: async (issueId, body, options) =>
        settle(
          api
            ? await apiAddComment(api, projectId, issueId, body)
            : demo((book, ctx) => {
                const out = addCommentToBook(book, issueId, body, ctx);
                return { book: out.book, value: out.comment };
              }),
          "Could not post the comment",
          options,
        ),

      editComment: async (issueId, commentId, body, options) =>
        settle(
          api
            ? await apiEditComment(api, projectId, issueId, commentId, body)
            : demo((book, ctx) => {
                const out = editCommentInBook(book, commentId, body, ctx);
                return { book: out.book, value: out.comment };
              }),
          "Could not save the comment",
          options,
        ),

      deleteComment: async (issueId, commentId, options) =>
        settle(
          api
            ? await apiRemoveComment(api, projectId, issueId, commentId)
            : demo((book) => ({
                book: removeCommentFromBook(book, commentId),
                value: undefined,
              })),
          "Could not delete the comment",
          options,
        ),

      updateProject: async (patch, options) =>
        settle(
          api
            ? await apiUpdateProject(api, projectId, patch)
            : demo((book, ctx) => {
                const next = bookUpdateProject(book, projectId, patch, ctx.now);
                return { book: next, value: next.projects[projectId]!.project };
              }),
          "Could not save the project",
          options,
        ),

      setMembers: async (memberIds, options) =>
        settle(
          api
            ? await apiSetMembers(api, projectId, memberIds)
            : demo((book, ctx) => {
                const next = bookSetMembers(
                  book,
                  projectId,
                  memberIds,
                  ctx.now,
                  options?.nameOf,
                );
                return { book: next, value: next.projects[projectId]!.project };
              }),
          "Could not save the members",
          options,
        ),

      saveWorkflow: async (drafts, options) => {
        /* Said before it is sent: the same two rules the API applies, so the
           reason arrives without a round trip. */
        const data = api ? dataOf(projectId) : null;
        const problem =
          workflowProblem(drafts) ??
          (data
            ? (data.project.statuses
                .filter((s) => !drafts.some((d) => d.id === s.id))
                .map((s) =>
                  removalBlocker(data.project.statuses, data.issues, s.id),
                )
                .find(Boolean) ?? null)
            : null);
        if (problem) {
          return settle(
            fail(new Error(problem)),
            "Could not save the workflow",
            options,
          );
        }
        return settle(
          api
            ? await apiSaveWorkflow(api, projectId, drafts)
            : demo((book, ctx) => {
                const next = bookSetStatuses(book, projectId, drafts, ctx);
                return {
                  book: next,
                  value: next.projects[projectId]!.project.statuses,
                };
              }),
          "Could not save the workflow",
          options,
        );
      },

      deleteProject: async (options) =>
        settle(
          api
            ? await apiDeleteProject(api, projectId)
            : demo((book) => ({
                book: bookDeleteProject(book, projectId),
                value: undefined,
              })),
          "Could not delete the project",
          options,
        ),

      createSprint: async (input, options) =>
        settle(
          api
            ? await apiSprint(
                api,
                projectId,
                () => projectsApi.createSprint(projectId, input),
                (sprint, data) => ({
                  ...data,
                  sprints: [...data.sprints, sprint],
                }),
              )
            : demo((book, ctx) => {
                const out = createSprintInBook(book, projectId, input, ctx);
                return { book: out.book, value: out.sprint };
              }),
          "Could not create the sprint",
          options,
        ),

      updateSprint: async (id, patch, options) =>
        settle(
          api
            ? voided(
                await apiSprint(
                  api,
                  projectId,
                  () => projectsApi.updateSprint(id, patch),
                  (saved, data) => ({
                    ...data,
                    sprints: data.sprints.map((s) => (s.id === id ? saved : s)),
                  }),
                ),
              )
            : demo((book) => ({
                book: updateSprintInBook(book, id, patch),
                value: undefined,
              })),
          "Could not save the sprint",
          options,
        ),

      deleteSprint: async (id, options) =>
        settle(
          api
            ? voided(
                await apiSprint(
                  api,
                  projectId,
                  () => projectsApi.deleteSprint(id),
                  (_, data) => ({
                    ...data,
                    sprints: data.sprints.filter((s) => s.id !== id),
                    issues: data.issues.map((i) =>
                      i.sprintId === id ? { ...i, sprintId: null } : i,
                    ),
                  }),
                ),
              )
            : demo((book, ctx) => ({
                book: deleteSprintInBook(book, id, ctx.now),
                value: undefined,
              })),
          "Could not delete the sprint",
          options,
        ),

      startSprint: async (id, edits, options) =>
        settle(
          api
            ? voided(
                await apiSprint(
                  api,
                  projectId,
                  () => projectsApi.startSprint(id, edits ?? {}),
                  (started, data) => ({
                    ...data,
                    sprints: data.sprints.map((s) =>
                      s.id === id ? started : s,
                    ),
                  }),
                ),
              )
            : demo((book) => ({
                book: startSprintInBook(book, id, edits ?? {}),
                value: undefined,
              })),
          "Could not start the sprint",
          options,
        ),

      completeSprint: async (id, move, next, options) =>
        settle(
          api
            ? voided(
                await apiSprint(
                  api,
                  projectId,
                  () => projectsApi.completeSprint(id, move),
                  (done, data) => {
                    const moved = new Set(done.movedIssueIds);
                    const to =
                      move === "new" ? (done.createdSprint?.id ?? null) : move;
                    return {
                      ...data,
                      sprints: [
                        ...data.sprints.map((s) =>
                          s.id === id ? done.sprint : s,
                        ),
                        ...(done.createdSprint ? [done.createdSprint] : []),
                      ],
                      issues: data.issues.map((i) =>
                        moved.has(i.id) ? { ...i, sprintId: to } : i,
                      ),
                    };
                  },
                ),
              )
            : demo((book, ctx) => ({
                book: completeSprintInBook(
                  book,
                  id,
                  move,
                  next ?? { name: "" },
                  ctx,
                ),
                value: undefined,
              })),
          "Could not complete the sprint",
          options,
        ),
    } satisfies ProjectActions;
  }, [connected, owner, actingId, today, projectId, toast]);
}

/** Creating a project, which belongs to no project yet. */
export function useCreateProject(): (
  input: NewProjectInput,
  options?: Quiet,
) => Promise<Result<Project>> {
  const mode = useMode();
  const toast = useToast();
  const { connected, owner, actingId, timeZone } = mode;
  const today = todayIn(timeZone);
  return useCallback(
    async (input, options) => {
      const result: Result<Project> =
        connected && owner
          ? await apiCreateProject(owner, input)
          : demoRun(actingId || null, today, (book, ctx) => {
              const out = bookCreateProject(book, input, ctx);
              return { book: out.book, value: out.project };
            });
      if (!result.ok && !options?.quiet) {
        toast.push({
          tone: "danger",
          title: "Could not create the project",
          detail: result.message,
        });
      }
      return result;
    },
    [connected, owner, actingId, today, toast],
  );
}
