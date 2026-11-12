import { vi } from "vitest";
import type { Actor } from "@/lib/projects/access";
import { sampleBook } from "@/lib/projects/demo-book";
import {
  programPeople,
  programRollup,
  programsFor,
  visibleProjects,
  workStagesOf,
  workPage,
  workRollup,
  type Scene,
  type Viewer,
  type WorkQuery,
} from "@/lib/projects/programs";
import type { People } from "@/lib/store/project-session";

/**
 * A company with programs, and somebody looking at it, for the program screens.
 *
 * The screens read everything through the store's hooks, so a test stubs the
 * hooks and answers them with the **demo engine** (`lib/projects/programs.ts`)
 * for whoever is looking. What the screen draws is then what the rules say that
 * person is shown, and what a test can prove is the screen's own behaviour: which
 * tabs and controls exist for them, and which call a control makes.
 */

export const TODAY = "2026-10-15";
export const NOW = "2026-10-15T12:00:00.000Z";

const NAMES: Record<string, string> = {
  "p-01": "Adaeze Okonkwo",
  "p-02": "Tunde Bakare",
  "p-03": "Chidi Nwosu",
  "p-04": "Ngozi Eze",
  "p-05": "Fatima Bello",
  "p-06": "Amara Nwachukwu",
  "p-07": "Musa Ibrahim",
  "p-08": "Grace Effiong",
  "p-09": "Emeka Anyanwu",
  "p-10": "Halima Sani",
};
const DEPARTMENT: Record<string, [string, string]> = {
  "p-01": ["d-eng", "Engineering"],
  "p-03": ["d-eng", "Engineering"],
  "p-09": ["d-eng", "Engineering"],
  "p-07": ["d-fin", "Finance"],
  "p-08": ["d-fin", "Finance"],
  "p-02": ["d-fin", "Finance"],
};

const person = (id: string) => ({
  id,
  name: NAMES[id]!,
  jobTitle: "Colleague",
  departmentId: DEPARTMENT[id]?.[0] ?? null,
  department: DEPARTMENT[id]?.[1] ?? null,
});

export const people: People = {
  people: Object.keys(NAMES).map(person),
  byId: new Map(Object.keys(NAMES).map((id) => [id, person(id)])),
  loading: false,
  nameOf: (id) => (id ? (NAMES[id] ?? "Someone") : "Unassigned"),
};

export const book = sampleBook({
  today: TODAY,
  now: NOW,
  people: ["p-01", "p-03", "p-09", "p-04"],
});

export const scene: Scene = {
  programs: book.programs,
  access: book.programAccess,
  projects: Object.values(book.projects),
};

export type Who = {
  id: string | null;
  editRecords?: boolean;
  leadsPeople?: boolean;
  seesAll?: boolean;
};

export const actorOf = (who: Who): Actor => ({
  employeeId: who.id,
  editRecords: who.editRecords ?? false,
  leadsPeople: who.leadsPeople ?? false,
  headsDepartment: false,
  seesAll: who.seesAll ?? false,
});

export const viewerOf = (who: Who): Viewer => ({
  actor: actorOf(who),
  today: TODAY,
  dayOf: (instant) => instant.slice(0, 10),
  nameOf: people.nameOf,
  jobTitleOf: () => "Colleague",
  departmentOf: (id) => ({
    id: DEPARTMENT[id]?.[0] ?? null,
    name: DEPARTMENT[id]?.[1] ?? null,
  }),
});

/** The people the tests act as. */
export const WHO = {
  hr: { id: "p-05", editRecords: true } satisfies Who,
  lead: { id: "p-10", leadsPeople: true } satisfies Who,
  read: { id: "p-07" } satisfies Who,
  write: { id: "p-08" } satisfies Who,
  projectOnly: { id: "p-04" } satisfies Who,
  master: { id: "p-06", seesAll: true } satisfies Who,
  outsider: { id: "p-99" } satisfies Who,
};

type Loaded<T> = {
  status: "loading" | "ready" | "error" | "notFound";
  error: unknown;
  data: T | null;
  reload: () => void;
};

const loaded = <T,>(data: T | null): Loaded<T> => ({
  status: data === null ? "notFound" : "ready",
  error: null,
  data,
  reload: vi.fn(),
});

export const loadMoreSpy = vi.fn();

/** The hooks of `lib/store/programs`, answered by the engine for `who`. */
export function programHooks(who: () => Who) {
  return {
    useProgramList: (includeArchived = false) => {
      const v = viewerOf(who());
      return loaded({
        programs: programsFor(scene, v, includeArchived),
        canCreate: v.actor.editRecords || v.actor.seesAll === true,
        seesAll: v.actor.seesAll === true,
      });
    },
    useProgram: (id: string) =>
      loaded(
        programsFor(scene, viewerOf(who()), true).find((p) => p.id === id) ??
          null,
      ),
    useProgramRollup: (id: string, enabled = true) =>
      loaded(enabled ? programRollup(scene, viewerOf(who()), id, NOW) : null),
    useWorkRollup: () => loaded(workRollup(scene, viewerOf(who()), NOW)),
    useWorkStages: (target: { programId?: string; unassigned?: boolean }) =>
      loaded(
        workStagesOf(
          visibleProjects(scene, viewerOf(who()))
            .map((d) => d.project)
            .filter((p) =>
              target.programId
                ? p.programId === target.programId
                : target.unassigned
                  ? !p.programId
                  : true,
            ),
        ),
      ),
    useProgramPeople: (id: string, enabled: boolean) =>
      loaded(enabled ? programPeople(scene, viewerOf(who()), id) : null),
    useProgramRollups: (ids: readonly string[]) => ({
      status: "ready" as const,
      error: null,
      data: ids
        .map((id) => programRollup(scene, viewerOf(who()), id, NOW))
        .filter((r) => r !== null),
      reload: vi.fn(),
    }),
    useWorkList: (query: WorkQuery, enabled = true) => {
      const page = enabled
        ? workPage(scene, viewerOf(who()), { limit: 50, ...query })
        : { rows: [], total: 0, hasMore: false, nextCursor: null };
      return {
        status: "ready" as const,
        error: null,
        rows: page.rows,
        total: page.total,
        hasMore: page.hasMore,
        capped: false,
        loadingMore: false,
        loadMore: loadMoreSpy,
        reload: vi.fn(),
      };
    },
    useProgramProjects: (
      target: { programId: string } | { unassigned: true },
    ) =>
      loaded(
        visibleProjects(scene, viewerOf(who()))
          .map((d) => ({
            ...d.project,
            openIssueCount: d.issues.length,
            issueCount: d.issues.length,
          }))
          .filter((p) =>
            "programId" in target
              ? p.programId === target.programId
              : !p.programId,
          ),
      ),
  };
}

export function fakeProgramActions() {
  /* A spy that takes anything and answers success, typed so its calls can be read. */
  const done = () =>
    vi.fn<(...args: unknown[]) => Promise<{ ok: true; value: undefined }>>(
      async () => ({ ok: true, value: undefined }),
    );
  return {
    createProgram: vi.fn(async (input: { name: string }) => ({
      ok: true as const,
      value: { id: "pg-new", name: input.name },
    })),
    updateProgram: done(),
    archiveProgram: done(),
    addPeople: vi.fn(async () => ({
      ok: true as const,
      value: { added: 1, changed: 0 },
    })),
    addDepartment: vi.fn(async () => ({
      ok: true as const,
      value: { added: 2 },
    })),
    setLevel: done(),
    removePerson: done(),
    moveProject: done(),
  };
}
