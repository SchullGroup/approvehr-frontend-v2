"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { programsApi } from "@/lib/api/programs";
import { nowIso } from "@/lib/projects/clock";
import {
  type Ctx,
  type DemoBook,
  addProgramPeople,
  archiveProgramInBook,
  createProgramInBook,
  moveProjectInBook,
  removeProgramPerson,
  setProgramLevel,
  updateProgramInBook,
  type NewProgramInput,
  type ProgramPatch,
} from "@/lib/projects/demo-book";
import {
  canCreateProgram,
  type ProgramLevel,
  type ProgramFacts,
} from "@/lib/projects/access";
import {
  factsOf,
  programPeople,
  programRollup,
  programsFor,
  visibleProjects,
  workPage,
  workRollup,
  type Program,
  type ProgramPeople,
  type ProgramRollup,
  type Scene,
  type Viewer,
  type WorkPage,
  type WorkQuery,
  type WorkRollup,
} from "@/lib/projects/programs";
import type { Project } from "@/lib/projects/types";
import { useRevalidation } from "@/lib/revalidate";
import { dayIn, todayIn } from "@/lib/time";
import { useCan } from "@/lib/permissions";
import { onProjectsChanged } from "./program-sync";
import {
  fail,
  ok,
  demoRun,
  refreshProject,
  useDemoBook,
  useMode,
} from "./projects";
import type { Result, ViewStatus } from "./projects";
import { usePeople, useProjectActor } from "./project-session";
import { useSession } from "./session";

/**
 * Programs, and the work across them, from whichever source is available.
 *
 * Connected, the API; with no API, the demo book (`lib/projects/demo-book.ts`),
 * read through the same rules (`lib/projects/programs.ts`). Every screen calls
 * the same hooks and does not care which it got.
 *
 * ## Connected: a keyed cache, asked again rather than guessed at
 *
 * Each answer (the list, one program, a rollup, an access list, a page of work)
 * is a slot under a key. A slot is asked once however many components want it,
 * asked again when the window comes back into focus, and kept when a refresh
 * fails: stale beats gone. Nothing here pages "everything" into the browser: a
 * project holds up to 5,000 tasks and a company holds many projects, so the
 * cross-project lists are the API's pages, never a client-side filter.
 *
 * ## Mutations: optimistic where the answer is predictable, with a way back
 *
 * Changing somebody's level, removing a person, renaming a program or archiving
 * it are applied to the cache first and put back if the API refuses, with an
 * error toast that names the thing ("Could not change Musa's access to
 * Operations"). Making a program is not optimistic: its id comes from the server.
 * Whatever a change touches beyond the row (counts, rollups) is asked again once
 * it settles.
 *
 * ## Who may do what
 *
 * Not decided here. The API answers `access`, `canManage` and `canCreateProject`
 * on every program, and the screens draw only what those allow.
 */

/* ======================================================================== */
/*  The connected cache                                                     */
/* ======================================================================== */

type Slot = {
  value: unknown;
  status: "loading" | "ready" | "error";
  error: unknown;
  notFound: boolean;
};

let owner: string | null = null;
let version = 0;
let epoch = 0;
const slots = new Map<string, Slot>();
const fetchers = new Map<string, (signal?: AbortSignal) => Promise<unknown>>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => version;

function bump() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function claim(next: string) {
  if (owner === next) return;
  owner = next;
  slots.clear();
  fetchers.clear();
  inflight.clear();
  bump();
}

function put(key: string, slot: Slot) {
  slots.set(key, slot);
  bump();
}

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404;

/**
 * Asks for a slot's answer. Joins one already on its way. A refusal never wipes
 * what is on screen; an answer that began before a mutation settled is dropped
 * and asked for again, so an older answer cannot undo a newer change.
 */
async function load(
  own: string,
  key: string,
  fetcher: (signal?: AbortSignal) => Promise<unknown>,
): Promise<void> {
  claim(own);
  fetchers.set(key, fetcher);
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    const prev = slots.get(key);
    const started = epoch;
    if (!prev || prev.status === "error") {
      put(key, {
        value: prev?.value ?? null,
        status: "loading",
        error: null,
        notFound: false,
      });
    }
    try {
      const value = await fetcher();
      if (epoch !== started) {
        inflight.delete(key);
        void load(own, key, fetcher);
        return;
      }
      put(key, { value, status: "ready", error: null, notFound: false });
    } catch (error) {
      if (isNotFound(error)) {
        put(key, { value: null, status: "error", error, notFound: true });
      } else if (!prev || prev.value === null || prev.value === undefined) {
        put(key, { value: null, status: "error", error, notFound: false });
      }
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

/** Asks again for every answer held under a key that starts with one of `prefixes`. */
function refetch(prefixes: readonly string[]) {
  if (!owner) return;
  for (const [key, fetcher] of fetchers) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      void load(owner, key, fetcher);
    }
  }
}

/** Everything a program's change can touch beyond itself. */
const ALL = [
  "programs",
  "program:",
  "rollup:",
  "people:",
  "projects:",
  "work",
  "nav:",
];

onProjectsChanged(() => refetch(ALL));

const keyOf = {
  list: (archived: boolean) => `programs:${archived ? "all" : "live"}`,
  program: (id: string) => `program:${id}`,
  rollup: (id: string) => `rollup:${id}`,
  workRollup: () => "work-rollup",
  people: (id: string) => `people:${id}`,
  projects: (target: string, all: boolean) =>
    `projects:${target}:${all ? "all" : "mine"}`,
  work: (query: WorkQuery) => `work:${JSON.stringify(query)}`,
};

/* ======================================================================== */
/*  The demo's scene                                                        */
/* ======================================================================== */

function useDemoScene(): {
  ready: boolean;
  scene: Scene;
  viewer: Viewer;
} {
  const mode = useMode();
  const people = usePeople();
  const actor = useProjectActor();
  const seesAll = useCan("SEE_ALL_WORK");
  const today = todayIn(mode.timeZone);
  const book = useDemoBook(!mode.connected && !mode.sessionLoading, today);
  const timeZone = mode.timeZone;
  return useMemo(() => {
    const scene: Scene = {
      programs: book.programs,
      access: book.programAccess,
      projects: Object.values(book.projects),
    };
    const viewer: Viewer = {
      actor: { ...actor, seesAll },
      today,
      dayOf: (instant) => dayIn(instant, timeZone),
      nameOf: people.nameOf,
      jobTitleOf: (id) => people.byId.get(id)?.jobTitle ?? "",
      departmentOf: (id) => ({
        id: people.byId.get(id)?.departmentId ?? null,
        name: people.byId.get(id)?.department ?? null,
      }),
    };
    return { ready: book.anchor !== "", scene, viewer };
  }, [book, actor, seesAll, today, timeZone, people]);
}

/**
 * The scene for the sidebar, which has to be cheap: it runs on every page, so it
 * asks for no directory and no departments, only who is signed in and what they
 * hold. Names are not needed to draw a row.
 */
function useNavScene(): { ready: boolean; scene: Scene; viewer: Viewer } {
  const mode = useMode();
  const { actingId } = useSession();
  const editRecords = useCan("EDIT_RECORDS");
  const seesAll = useCan("SEE_ALL_WORK");
  const today = todayIn(mode.timeZone);
  const book = useDemoBook(!mode.connected && !mode.sessionLoading, today);
  const timeZone = mode.timeZone;
  return useMemo(() => {
    const scene: Scene = {
      programs: book.programs,
      access: book.programAccess,
      projects: Object.values(book.projects),
    };
    const viewer: Viewer = {
      actor: {
        employeeId: actingId || null,
        editRecords,
        leadsPeople: false,
        headsDepartment: false,
        seesAll,
      },
      today,
      dayOf: (instant) => dayIn(instant, timeZone),
      nameOf: (id) => id ?? "",
    };
    return { ready: book.anchor !== "", scene, viewer };
  }, [book, actingId, editRecords, seesAll, today, timeZone]);
}

/* ======================================================================== */
/*  Reading                                                                 */
/* ======================================================================== */

export type Loaded<T> = {
  status: ViewStatus;
  error: unknown;
  data: T | null;
  reload: () => void;
};

/** One answer from the connected cache. `key` null reads nothing and asks nothing. */
function useSlot<T>(
  key: string | null,
  fetcher: (signal?: AbortSignal) => Promise<T>,
): Loaded<T> {
  const mode = useMode();
  useSyncExternalStore(subscribe, snapshot, () => 0);
  const revalidation = useRevalidation();
  const own = mode.owner;
  /* The fetcher closes over ids that are already in the key, so the key alone
     says when it has changed; the latest closure is what runs. */
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });

  useEffect(() => {
    if (own && key) void load(own, key, (signal) => latest.current(signal));
  }, [own, key, revalidation]);

  const reload = useCallback(() => {
    if (own && key) void load(own, key, (signal) => latest.current(signal));
  }, [own, key]);

  const slot = own === owner && key ? slots.get(key) : undefined;
  if (!key || !slot || (slot.status === "loading" && slot.value === null)) {
    return { status: "loading", error: null, data: null, reload };
  }
  if (slot.notFound) {
    return { status: "notFound", error: slot.error, data: null, reload };
  }
  if (slot.status === "error" && slot.value === null) {
    return { status: "error", error: slot.error, data: null, reload };
  }
  return { status: "ready", error: null, data: slot.value as T, reload };
}

const demoLoaded = <T>(ready: boolean, data: T | null): Loaded<T> => ({
  status: !ready ? "loading" : data === null ? "notFound" : "ready",
  error: null,
  data,
  reload: () => undefined,
});

export type ProgramList = {
  programs: Program[];
  canCreate: boolean;
  seesAll: boolean;
};

/** The programs the person can see, by name, with what they may do. */
export function useProgramList(includeArchived = false): Loaded<ProgramList> {
  const mode = useMode();
  const demo = useDemoScene();
  const connected = useSlot<ProgramList>(
    mode.connected ? keyOf.list(includeArchived) : null,
    (signal) => programsApi.list(includeArchived, signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    return demoLoaded(demo.ready, {
      programs: programsFor(demo.scene, demo.viewer, includeArchived),
      canCreate: canCreateProgram(demo.viewer.actor),
      seesAll: demo.viewer.actor.seesAll === true,
    });
  }, [mode.connected, connected, demo, includeArchived]);
}

/** One program, or `notFound` for one the person cannot see. */
export function useProgram(id: string): Loaded<Program> {
  const mode = useMode();
  const demo = useDemoScene();
  const connected = useSlot<Program>(
    mode.connected ? keyOf.program(id) : null,
    (signal) => programsApi.get(id, signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    const found = programsFor(demo.scene, demo.viewer, true).find(
      (p) => p.id === id,
    );
    return demoLoaded(demo.ready, found ?? null);
  }, [mode.connected, connected, demo, id]);
}

/** Tiles, project cards and workload for one program. */
export function useProgramRollup(
  id: string,
  enabled = true,
): Loaded<ProgramRollup> {
  const mode = useMode();
  const demo = useDemoScene();
  const connected = useSlot<ProgramRollup>(
    mode.connected && enabled ? keyOf.rollup(id) : null,
    (signal) => programsApi.rollup(id, signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    if (!enabled) return demoLoaded<ProgramRollup>(demo.ready, null);
    return demoLoaded(
      demo.ready,
      programRollup(demo.scene, demo.viewer, id, nowIso()),
    );
  }, [mode.connected, connected, demo, id, enabled]);
}

/** The Master overview and the Unassigned bucket's tiles. */
export function useWorkRollup(enabled = true): Loaded<WorkRollup> {
  const mode = useMode();
  const demo = useDemoScene();
  const connected = useSlot<WorkRollup>(
    mode.connected && enabled ? keyOf.workRollup() : null,
    (signal) => programsApi.workRollup(signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    return demoLoaded(
      demo.ready,
      workRollup(demo.scene, demo.viewer, nowIso()),
    );
  }, [mode.connected, connected, demo]);
}

/** Who is on a program's list. For its lead and HR; anybody else gets `error`. */
export function useProgramPeople(
  id: string,
  enabled: boolean,
): Loaded<ProgramPeople> {
  const mode = useMode();
  const demo = useDemoScene();
  const connected = useSlot<ProgramPeople>(
    mode.connected && enabled ? keyOf.people(id) : null,
    (signal) => programsApi.access(id, signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    if (!enabled) return demoLoaded<ProgramPeople>(demo.ready, null);
    return demoLoaded(demo.ready, programPeople(demo.scene, demo.viewer, id));
  }, [mode.connected, connected, demo, id, enabled]);
}

/**
 * The projects of a program (or the ones in none), as the person can open them.
 * `all` asks for the company's, which only HR and the Master grant are allowed.
 */
export function useProgramProjects(
  target: { programId: string } | { unassigned: true },
  all = false,
): Loaded<Project[]> {
  const mode = useMode();
  const demo = useDemoScene();
  const name = "programId" in target ? target.programId : "unassigned";
  const connected = useSlot<Project[]>(
    mode.connected ? keyOf.projects(name, all) : null,
    (signal) => programsApi.projects(target, all, signal),
  );
  return useMemo(() => {
    if (mode.connected) return connected;
    const inTarget = visibleProjects(demo.scene, demo.viewer)
      .map((d) => ({
        ...d.project,
        openIssueCount: d.issues.filter(
          (i) =>
            i.type !== "EPIC" &&
            d.project.statuses.find((s) => s.id === i.statusId)?.category !==
              "DONE",
        ).length,
        issueCount: d.issues.length,
      }))
      .filter((p) =>
        "programId" in target ? p.programId === target.programId : !p.programId,
      );
    return demoLoaded(demo.ready, inTarget);
  }, [mode.connected, connected, demo, target]);
}

/** What a program's facts say, for the project screen to work out access in the demo. */
export function useProgramFacts(programId: string | null | undefined): {
  facts: ProgramFacts | null;
  seesAll: boolean;
} {
  const demo = useDemoScene();
  return useMemo(
    () => ({
      facts: factsOf(demo.scene, programId),
      seesAll: demo.viewer.actor.seesAll === true,
    }),
    [demo, programId],
  );
}

/* ---- pages of work ------------------------------------------------------ */

export type WorkList = {
  status: ViewStatus;
  error: unknown;
  rows: WorkPage["rows"];
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
};

/**
 * Pages of work for a query: the first on its own, the rest on "Load more".
 *
 * Rows already shown stay on screen while the next page arrives; a new query
 * starts again from the first page. A page that fails keeps the rows already
 * there and says so through `error`.
 */
export function useWorkList(query: WorkQuery, enabled = true): WorkList {
  const mode = useMode();
  const demo = useDemoScene();
  const revalidation = useRevalidation();
  const own = mode.owner;
  const queryKey = JSON.stringify(query);
  const [state, setState] = useState<{
    key: string;
    rows: WorkPage["rows"];
    total: number | null;
    next: string | null;
    hasMore: boolean;
    status: ViewStatus;
    error: unknown;
    loadingMore: boolean;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!mode.connected || !enabled || !own) return;
    const mine = ++run.current;
    const controller = new AbortController();
    void (async () => {
      try {
        const page = await programsApi.work(query, null, controller.signal);
        if (run.current !== mine) return;
        setState({
          key: queryKey,
          rows: page.rows,
          total: page.total,
          next: page.nextCursor,
          hasMore: page.hasMore,
          status: "ready",
          error: null,
          loadingMore: false,
        });
      } catch (error) {
        if (run.current !== mine || controller.signal.aborted) return;
        setState((prev) =>
          prev && prev.key === queryKey
            ? { ...prev, error }
            : {
                key: queryKey,
                rows: [],
                total: null,
                next: null,
                hasMore: false,
                status: isNotFound(error) ? "notFound" : "error",
                error,
                loadingMore: false,
              },
        );
      }
    })();
    return () => controller.abort();
    // `query` is covered by its serialised key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.connected, enabled, own, queryKey, tick, revalidation]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (!prev || !prev.hasMore || prev.loadingMore || !prev.next) return prev;
      const cursor = prev.next;
      const mine = run.current;
      void programsApi
        .work(query, cursor)
        .then((page) => {
          if (run.current !== mine) return;
          setState((now) =>
            now && now.key === prev.key
              ? {
                  ...now,
                  rows: [...now.rows, ...page.rows],
                  total: page.total,
                  next: page.nextCursor,
                  hasMore: page.hasMore,
                  loadingMore: false,
                  error: null,
                }
              : now,
          );
        })
        .catch((error: unknown) => {
          setState((now) =>
            now && now.key === prev.key
              ? { ...now, loadingMore: false, error }
              : now,
          );
        });
      return { ...prev, loadingMore: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const [demoTake, setDemoTake] = useState<{ key: string; pages: number }>({
    key: queryKey,
    pages: 1,
  });
  const pages = demoTake.key === queryKey ? demoTake.pages : 1;

  return useMemo((): WorkList => {
    if (!mode.connected) {
      if (!demo.ready || !enabled) {
        return {
          status: "loading",
          error: null,
          rows: [],
          total: null,
          hasMore: false,
          loadingMore: false,
          loadMore: () => undefined,
          reload,
        };
      }
      /* The demo holds a few hundred tasks at most, so it works out the whole
         answer and hands over as many pages' worth as were asked for. */
      const size = query.limit ?? 50;
      const everything = workPage(demo.scene, demo.viewer, {
        ...query,
        limit: 200,
      });
      const rows = everything.rows.slice(0, size * pages);
      return {
        status: "ready",
        error: null,
        rows,
        total: everything.total,
        hasMore: rows.length < everything.total,
        loadingMore: false,
        loadMore: () =>
          setDemoTake((t) => ({
            key: queryKey,
            pages: (t.key === queryKey ? t.pages : 1) + 1,
          })),
        reload,
      };
    }
    const here = state && state.key === queryKey ? state : null;
    if (!here) {
      return {
        status: "loading",
        error: null,
        rows: [],
        total: null,
        hasMore: false,
        loadingMore: false,
        loadMore,
        reload,
      };
    }
    return {
      status: here.status,
      error: here.error,
      rows: here.rows,
      total: here.total,
      hasMore: here.hasMore,
      loadingMore: here.loadingMore,
      loadMore,
      reload,
    };
  }, [
    mode.connected,
    demo,
    enabled,
    query,
    pages,
    queryKey,
    state,
    loadMore,
    reload,
  ]);
}

/* ======================================================================== */
/*  The sidebar's rows                                                      */
/* ======================================================================== */

export type ProgramNavRow = {
  id: string;
  name: string;
  color: string;
  openTaskCount: number;
};

export type ProgramsNav = {
  programs: ProgramNavRow[];
  /** May start a program: the "All programs" row is worth showing with none. */
  canCreate: boolean;
  /** Holds the Master grant. */
  seesAll: boolean;
  /** There are projects in no program, and the person manages one. */
  unassigned: boolean;
  loaded: boolean;
};

export const NO_PROGRAMS: ProgramsNav = {
  programs: [],
  canCreate: false,
  seesAll: false,
  unassigned: false,
  loaded: false,
};

/**
 * What the sidebar needs to draw the Programs section: the programs the person
 * can see, whether they hold the Master grant, and whether Unassigned is worth a
 * row. One request for the list and, only when there are programs, one for the
 * projects in none; nothing at all while Projects is off.
 */
export function useProgramsNav(enabled: boolean): ProgramsNav {
  const mode = useMode();
  const demo = useNavScene();
  const editRecords = useCan("EDIT_RECORDS");
  const connectedList = useSlot<ProgramList>(
    enabled && mode.connected ? keyOf.list(false) : null,
    (signal) => programsApi.list(false, signal),
  );
  const hasPrograms = (connectedList.data?.programs.length ?? 0) > 0;
  const wide = editRecords || connectedList.data?.seesAll === true;
  const connectedLoose = useSlot<boolean>(
    enabled && mode.connected && hasPrograms
      ? `nav:unassigned:${wide ? "all" : "mine"}`
      : null,
    async (signal) => {
      const loose = await programsApi.projects(
        { unassigned: true },
        wide,
        signal,
      );
      return loose.some((p) => p.canManage === true);
    },
  );

  return useMemo((): ProgramsNav => {
    if (!enabled) return NO_PROGRAMS;
    if (!mode.connected) {
      if (!demo.ready) return NO_PROGRAMS;
      const programs = programsFor(demo.scene, demo.viewer).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        openTaskCount: p.openTaskCount,
      }));
      const loose = visibleProjects(demo.scene, demo.viewer).some(
        (d) => !d.project.programId && d.project.canManage === true,
      );
      return {
        programs,
        canCreate: canCreateProgram(demo.viewer.actor),
        seesAll: demo.viewer.actor.seesAll === true,
        unassigned: programs.length > 0 && loose,
        loaded: true,
      };
    }
    const data = connectedList.data;
    if (!data) return NO_PROGRAMS;
    return {
      programs: data.programs.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        openTaskCount: p.openTaskCount,
      })),
      canCreate: data.canCreate,
      seesAll: data.seesAll,
      unassigned: data.programs.length > 0 && connectedLoose.data === true,
      loaded: true,
    };
  }, [enabled, mode.connected, demo, connectedList.data, connectedLoose.data]);
}

/* ======================================================================== */
/*  Changing                                                                */
/* ======================================================================== */

type Quiet = { quiet?: boolean };

export type ProgramActions = {
  /** Connected, waits for the API: the id comes from the server. */
  createProgram: (
    input: NewProgramInput & { departmentId?: string | null },
    options?: Quiet,
  ) => Promise<Result<Program>>;
  updateProgram: (
    program: Pick<Program, "id" | "name">,
    patch: ProgramPatch,
    options?: Quiet,
  ) => Promise<Result<void>>;
  archiveProgram: (
    program: Pick<Program, "id" | "name">,
    archived: boolean,
    options?: Quiet,
  ) => Promise<Result<void>>;
  addPeople: (
    program: Pick<Program, "id" | "name">,
    employeeIds: string[],
    level: ProgramLevel,
    options?: Quiet,
  ) => Promise<Result<{ added: number; changed: number }>>;
  /** Adds a whole department once, at one level. `peopleIds` is what the demo seeds from. */
  addDepartment: (
    program: Pick<Program, "id" | "name">,
    department: { id: string; name: string },
    level: ProgramLevel,
    peopleIds: string[],
    options?: Quiet,
  ) => Promise<Result<{ added: number }>>;
  setLevel: (
    program: Pick<Program, "id" | "name">,
    person: { employeeId: string; name: string },
    level: ProgramLevel,
    options?: Quiet,
  ) => Promise<Result<void>>;
  removePerson: (
    program: Pick<Program, "id" | "name">,
    person: { employeeId: string; name: string },
    options?: Quiet,
  ) => Promise<Result<void>>;
  /** Moves a project into a program, or out of one (null). */
  moveProject: (
    project: Pick<Project, "id" | "name">,
    programId: string | null,
    options?: Quiet,
  ) => Promise<Result<void>>;
};

export function useProgramActions(): ProgramActions {
  const mode = useMode();
  const toast = useToast();
  const { connected, owner: own, actingId, timeZone } = mode;
  const today = todayIn(timeZone);

  return useMemo((): ProgramActions => {
    const actor = actingId || null;
    const api = connected && own !== null ? own : null;

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

    /** Applies `change` to the cache now; the returned function puts it back. */
    const optimistic = (
      edits: { key: string; change: (value: unknown) => unknown }[],
    ): (() => void) => {
      epoch += 1;
      const before = edits.map((e) => [e.key, slots.get(e.key)] as const);
      for (const e of edits) {
        const slot = slots.get(e.key);
        if (slot && slot.value !== null) {
          slots.set(e.key, { ...slot, value: e.change(slot.value) });
        }
      }
      bump();
      return () => {
        epoch += 1;
        for (const [key, slot] of before) {
          if (slot) slots.set(key, slot);
        }
        bump();
      };
    };

    /** Runs a connected write; on refusal puts the cache back. */
    const write = async <T>(
      call: () => Promise<T>,
      undo: () => void,
      touched: readonly string[],
    ): Promise<Result<T>> => {
      try {
        const value = await call();
        epoch += 1;
        refetch(touched);
        return ok(value);
      } catch (error) {
        undo();
        refetch(touched);
        return fail(error);
      }
    };

    const mapProgram = (
      id: string,
      patch: (p: Program) => Program,
    ): { key: string; change: (value: unknown) => unknown }[] => [
      {
        key: keyOf.program(id),
        change: (v) => patch(v as Program),
      },
      ...(["live", "all"] as const).map((scope) => ({
        key: `programs:${scope}`,
        change: (v: unknown) => {
          const list = v as ProgramList;
          return {
            ...list,
            programs: list.programs.map((p) => (p.id === id ? patch(p) : p)),
          };
        },
      })),
    ];

    return {
      createProgram: async (input, options) =>
        settle(
          api
            ? await (async (): Promise<Result<Program>> => {
                try {
                  const program = await programsApi.create({
                    name: input.name.trim(),
                    ...(input.description?.trim()
                      ? { description: input.description.trim() }
                      : {}),
                    ...(input.color ? { color: input.color } : {}),
                    ...(input.departmentId
                      ? { departmentId: input.departmentId }
                      : {}),
                    ...(input.leadId ? { leadId: input.leadId } : {}),
                  });
                  epoch += 1;
                  refetch(["programs", "nav:", "work-rollup"]);
                  return ok(program);
                } catch (error) {
                  return fail(error);
                }
              })()
            : (() => {
                const result = demo((book, ctx) => {
                  const out = createProgramInBook(book, input, ctx);
                  return { book: out.book, value: out.program.id };
                });
                if (!result.ok) return result;
                return ok({ id: result.value } as Program);
              })(),
          "Could not create the program",
          options,
        ),

      updateProgram: async (program, patch, options) =>
        settle(
          api
            ? await (async (): Promise<Result<void>> => {
                const undo = optimistic(
                  mapProgram(program.id, (p) => ({
                    ...p,
                    ...(patch.name !== undefined ? { name: patch.name } : {}),
                    ...(patch.description !== undefined
                      ? { description: patch.description }
                      : {}),
                    ...(patch.color !== undefined
                      ? { color: patch.color }
                      : {}),
                    ...(patch.departmentId !== undefined
                      ? {
                          departmentId: patch.departmentId,
                          departmentName: patch.departmentId
                            ? p.departmentName
                            : null,
                        }
                      : {}),
                    ...(patch.leadId !== undefined
                      ? { leadId: patch.leadId }
                      : {}),
                  })),
                );
                const result = await write(
                  () =>
                    programsApi.update(program.id, {
                      ...(patch.name !== undefined ? { name: patch.name } : {}),
                      ...(patch.description !== undefined
                        ? { description: patch.description }
                        : {}),
                      ...(patch.color !== undefined
                        ? { color: patch.color }
                        : {}),
                      ...(patch.departmentId !== undefined
                        ? { departmentId: patch.departmentId }
                        : {}),
                      ...(patch.leadId !== undefined
                        ? { leadId: patch.leadId }
                        : {}),
                    }),
                  undo,
                  ALL,
                );
                return result.ok ? ok(undefined) : result;
              })()
            : demo((book, ctx) => ({
                book: updateProgramInBook(book, program.id, patch, ctx.now),
                value: undefined,
              })),
          `Could not save ${program.name}`,
          options,
        ),

      archiveProgram: async (program, archived, options) =>
        settle(
          api
            ? await (async (): Promise<Result<void>> => {
                const undo = optimistic(
                  mapProgram(program.id, (p) => ({
                    ...p,
                    archived,
                    archivedAt: archived ? nowIso() : null,
                  })),
                );
                const result = await write(
                  () =>
                    archived
                      ? programsApi.archive(program.id)
                      : programsApi.unarchive(program.id),
                  undo,
                  ALL,
                );
                return result.ok ? ok(undefined) : result;
              })()
            : demo((book, ctx) => ({
                book: archiveProgramInBook(book, program.id, archived, ctx.now),
                value: undefined,
              })),
          archived
            ? `Could not archive ${program.name}`
            : `Could not restore ${program.name}`,
          options,
        ),

      addPeople: async (program, employeeIds, level, options) =>
        settle(
          api
            ? await (async () => {
                epoch += 1;
                try {
                  const raw = await programsApi.addPeople(
                    program.id,
                    employeeIds,
                    level,
                  );
                  refetch(ALL);
                  const added = Array.isArray(raw["added"])
                    ? raw["added"].length
                    : 0;
                  const changed = Array.isArray(raw["changed"])
                    ? raw["changed"].length
                    : 0;
                  return ok({ added, changed });
                } catch (error) {
                  return fail(error);
                }
              })()
            : demo((book, ctx) => {
                const out = addProgramPeople(
                  book,
                  program.id,
                  employeeIds,
                  level,
                  ctx.now,
                );
                return {
                  book: out.book,
                  value: {
                    added: out.added.length,
                    changed: out.changed.length,
                  },
                };
              }),
          `Could not add people to ${program.name}`,
          options,
        ),

      addDepartment: async (program, department, level, peopleIds, options) =>
        settle(
          api
            ? await (async () => {
                epoch += 1;
                try {
                  const out = await programsApi.seed(
                    program.id,
                    level,
                    department.id,
                  );
                  refetch(ALL);
                  return ok({ added: out.added });
                } catch (error) {
                  return fail(error);
                }
              })()
            : demo((book, ctx) => {
                const out = addProgramPeople(
                  book,
                  program.id,
                  peopleIds,
                  level,
                  ctx.now,
                  { keepExisting: true },
                );
                return { book: out.book, value: { added: out.added.length } };
              }),
          `Could not add ${department.name} to ${program.name}`,
          options,
        ),

      setLevel: async (program, person, level, options) =>
        settle(
          api
            ? await (async (): Promise<Result<void>> => {
                const undo = optimistic([
                  {
                    key: keyOf.people(program.id),
                    change: (v) => {
                      const people = v as ProgramPeople;
                      return {
                        ...people,
                        people: people.people.map((p) =>
                          p.employeeId === person.employeeId
                            ? { ...p, level }
                            : p,
                        ),
                      };
                    },
                  },
                ]);
                const result = await write(
                  () =>
                    programsApi.setLevel(program.id, person.employeeId, level),
                  undo,
                  ["people:", "program:", "programs"],
                );
                return result.ok ? ok(undefined) : result;
              })()
            : demo((book) => ({
                book: setProgramLevel(
                  book,
                  program.id,
                  person.employeeId,
                  level,
                ),
                value: undefined,
              })),
          `Could not change ${person.name}'s access to ${program.name}`,
          options,
        ),

      removePerson: async (program, person, options) =>
        settle(
          api
            ? await (async (): Promise<Result<void>> => {
                const undo = optimistic([
                  {
                    key: keyOf.people(program.id),
                    change: (v) => {
                      const people = v as ProgramPeople;
                      return {
                        ...people,
                        total: Math.max(0, people.total - 1),
                        people: people.people.filter(
                          (p) => p.employeeId !== person.employeeId,
                        ),
                      };
                    },
                  },
                ]);
                const result = await write(
                  () => programsApi.removePerson(program.id, person.employeeId),
                  undo,
                  ALL,
                );
                return result.ok ? ok(undefined) : result;
              })()
            : demo((book) => ({
                book: removeProgramPerson(book, program.id, person.employeeId),
                value: undefined,
              })),
          `Could not remove ${person.name} from ${program.name}`,
          options,
        ),

      moveProject: async (project, programId, options) =>
        settle(
          api
            ? await (async (): Promise<Result<void>> => {
                try {
                  await programsApi.moveProject(project.id, programId);
                  epoch += 1;
                  refetch(ALL);
                  refreshProject(api, project.id);
                  return ok(undefined);
                } catch (error) {
                  return fail(error);
                }
              })()
            : demo((book, ctx) => ({
                book: moveProjectInBook(book, project.id, programId, ctx.now),
                value: undefined,
              })),
          `Could not move ${project.name}`,
          options,
        ),
    };
  }, [connected, own, actingId, today, toast]);
}
