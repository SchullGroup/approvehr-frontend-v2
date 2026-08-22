"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  teamsApi,
  type ApiMembersAdded,
  type ApiMembersRemoved,
  type ApiMoved,
  type ApiTeam,
  type ApiTeamDetail,
  type ApiTeamList,
  type ApiTeamUpdated,
} from "@/lib/api/teams";
import {
  DEMO_STRUCTURE_NOTE,
  demoStructure,
  demoStructureId,
  demoTeamDetail,
  demoTeamList,
  pendingAlignment,
  refuse,
  sameName,
  structurePeople,
  useDemoStructure,
  type DemoStructure,
  type DemoTeamRow,
  type StructurePerson,
} from "./demo-structure";
import { useEmployeeStore } from "./employees";
import { useSession } from "./session";

/**
 * Teams, in both modes — and demo mode can now edit them.
 *
 * ## This file used to refuse outright
 *
 * It did, and the reason was one line of the data model: on a departmental team,
 * adding somebody moves their department, and a department is a payroll
 * reporting boundary, so a team built in browser storage would move a cost
 * centre no payroll run would ever see. The screen said "the teams surface can
 * only be demonstrated against a running API" and showed a callout where the
 * list should be.
 *
 * That argument is the one `store/departments.ts` made, and it has been reversed
 * there for the reason written at length in its header: **it applies to every
 * demo write there is.** Nothing in demo mode reaches a real payroll run. The
 * honest answer is to say so, which `DEMO_STRUCTURE_NOTE` does, not to leave the
 * mode everybody opens first with an empty tab.
 *
 * ## The one rule still holds, and demo mode enforces it the same way
 *
 * A team that belongs to a department implies its members are in that
 * department, enforced by **moving people** rather than by refusing them, and
 * reported as a list of names. `pendingAlignment` in `demo-structure.ts` is the
 * pure half — it computes who would move — and the writes below perform it
 * against the employee store and hand `moved` back, so the toast names the
 * people whose department changed exactly as it does connected. A cost centre
 * changing silently is the bug; the move is not.
 *
 * The inverse is deliberately not enforced here either: taking somebody off a
 * team leaves their department where it is.
 *
 * ## Shape
 *
 * `lib/store/shifts.ts` is the model, and the two rules from it are obeyed:
 * the demo value is a `useMemo` that never touches state, and the fetch runs in
 * an async IIFE inside the effect behind a `cancelled` guard. Staleness is
 * decided by comparing a key **during render** rather than clearing state in an
 * effect, which would be a synchronous setState and a cascaded render.
 */

const EMPTY_LIST: ApiTeamList = {
  teams: [],
  counts: { teams: 0, crossFunctional: 0, peopleOnATeam: 0 },
};

/** Which source a screen is looking at, so it can label itself honestly. */
export type TeamSource = "api" | "demo";

export type TeamsState = {
  teams: ApiTeam[];
  counts: ApiTeamList["counts"];
  loading: boolean;
  error: ApiError | null;
  source: TeamSource;
  /** The sentence to render when `source` is `"demo"`. */
  demoNote: string;
  reload: () => void;
};

export function useTeams(
  params: { includeArchived?: boolean; departmentId?: string } = {},
): TeamsState {
  const { isConnected } = useSession();
  const demo = useDemoStructure();
  const { directory } = useEmployeeStore();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    list: ApiTeamList;
    error: ApiError | null;
  } | null>(null);

  const includeArchived = params.includeArchived ?? false;
  const departmentId = params.departmentId;
  const key = `${String(includeArchived)}|${departmentId ?? ""}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const list = await teamsApi.list(
          { includeArchived, ...(departmentId ? { departmentId } : {}) },
          controller.signal,
        );
        if (!cancelled) setFetched({ key, list, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            list: EMPTY_LIST,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, departmentId, key]);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  /* Never touches state. Derived from the persisted demo structure and the live
     employee directory on every render — the directory rather than the seed, so
     a person created in the demo can be put on a team and actually appear. */
  const people = useMemo(() => structurePeople(directory), [directory]);
  const demoList = useMemo(
    () =>
      demoTeamList(demo, people, {
        includeArchived,
        ...(departmentId ? { departmentId } : {}),
      }),
    [demo, people, includeArchived, departmentId],
  );

  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return {
      ...demoList,
      loading: false,
      error: null,
      source: "demo",
      demoNote: DEMO_STRUCTURE_NOTE,
      reload,
    };
  }

  return {
    teams: matched ? fetched.list.teams : [],
    counts: matched ? fetched.list.counts : EMPTY_LIST.counts,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    demoNote: DEMO_STRUCTURE_NOTE,
    reload,
  };
}

export type TeamDetailState = {
  team: ApiTeamDetail | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

/**
 * One team with its members, for the drawer.
 *
 * Kept as `{ id, team }` rather than a bare team, the same way `useDepartment`
 * does it: the result carries the id it belongs to, so a slow response for a
 * team you have navigated away from cannot be shown, and there is nothing to
 * clear when `id` changes — the stale value simply stops matching.
 */
export function useTeam(id: string | null): TeamDetailState {
  const { isConnected } = useSession();
  const demo = useDemoStructure();
  const { directory } = useEmployeeStore();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    team: ApiTeamDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = Boolean(id) && isConnected;
  const key = `${id ?? ""}|${tick}`;

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const team = await teamsApi.get(id, controller.signal);
        if (!cancelled) setFetched({ key, team, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            team: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, id, key]);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  const people = useMemo(() => structurePeople(directory), [directory]);
  const demoDetail = useMemo(
    () => (isConnected || !id ? null : demoTeamDetail(demo, people, id)),
    [isConnected, id, demo, people],
  );

  if (!isConnected) {
    return { team: demoDetail, loading: false, error: null, reload };
  }

  const matched = active && fetched !== null && fetched.key === key;
  return {
    team: matched ? fetched.team : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    reload,
  };
}

/* -------------------------------------------------------------- demo writes */

const MAX_NAME = 80;
const MAX_PURPOSE = 240;

/** Same limits `modules/teams/schemas.ts` refuses on, in its words. */
function cleanName(value: string): string {
  const name = value.trim();
  if (name.length < 2) {
    refuse(422, "invalid", "Give it a name of at least two characters.");
  }
  if (name.length > MAX_NAME) {
    refuse(
      422,
      "invalid",
      "That name is too long to fit a nav item or a report column.",
    );
  }
  return name;
}

function cleanPurpose(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const purpose = value.trim();
  if (purpose === "") return null;
  if (purpose.length > MAX_PURPOSE) {
    refuse(
      422,
      "invalid",
      "One line is enough. Put the detail in the team's own space.",
    );
  }
  return purpose;
}

function requireTeamRow(state: DemoStructure, id: string): DemoTeamRow {
  const row = state.teams.find((one) => one.id === id);
  if (!row) refuse(404, "not_found", "That team could not be found.");
  return row;
}

function assertNameFree(
  state: DemoStructure,
  name: string,
  exceptId?: string,
): void {
  const clash = state.teams.find(
    (row) => row.id !== exceptId && sameName(row.name, name),
  );
  if (!clash) return;
  refuse(
    409,
    "conflict",
    clash.archived
      ? `"${name}" exists but is archived. Restore it instead of creating a duplicate.`
      : `"${name}" already exists.`,
  );
}

function assertLiveDepartment(state: DemoStructure, id: string): void {
  if (!state.departments.some((row) => row.id === id && !row.archived)) {
    refuse(422, "unprocessable", "That department does not exist.");
  }
}

function assertPersonExists(
  people: readonly StructurePerson[],
  id: string,
): void {
  if (!people.some((person) => person.id === id)) {
    refuse(422, "unprocessable", "That employee does not exist.");
  }
}

/**
 * The directory with a completed alignment folded in.
 *
 * `people` is a render-time memo, so a write that has just moved somebody's
 * department is not in it yet. Only the read-backs that follow an alignment need
 * this; every other reader gets the fresh value on the next render.
 */
function withMoves(
  people: readonly StructurePerson[],
  plan: { toName: string | null; moved: ApiMoved[] },
): StructurePerson[] {
  if (plan.toName === null || plan.moved.length === 0) return [...people];
  const going = new Set(plan.moved.map((one) => one.employeeId));
  const toName = plan.toName;
  return people.map((person) =>
    going.has(person.id) ? { ...person, department: toName } : person,
  );
}

function readBack(
  state: DemoStructure,
  people: readonly StructurePerson[],
  id: string,
): ApiTeamDetail {
  const detail = demoTeamDetail(state, people, id);
  if (!detail) refuse(500, "unexpected", "Could not read that team back.");
  return detail;
}

/**
 * Every write, routed to whichever source is live.
 *
 * Nothing here reloads on your behalf: the writes that matter return what they
 * *did* — `moved`, `added`, `alreadyOn` — and a hook that swallowed the response
 * to trigger a refetch would throw away the only record of a cost centre having
 * changed. The caller shows it, then reloads.
 */
export function useTeamMutations() {
  const { isConnected } = useSession();
  const { directory, update: patchEmployee } = useEmployeeStore();
  const people = useMemo(() => structurePeople(directory), [directory]);

  /**
   * The rule, performed.
   *
   * `pendingAlignment` decides who moves; this writes it. The write is
   * `Employee.department`, because in demo mode that name is the whole of
   * membership — see `demo-structure.ts`. Returns the names so the caller can
   * render them, which is the entire reason the connected endpoints return
   * `moved` at all.
   */
  const align = useCallback(
    (teamId: string): { toName: string | null; moved: ApiMoved[] } => {
      const plan = pendingAlignment(demoStructure.read(), people, teamId);
      if (!plan) return { toName: null, moved: [] };
      for (const one of plan.moved) {
        patchEmployee(one.employeeId, { department: plan.toName });
      }
      return plan;
    },
    [patchEmployee, people],
  );

  const create = useCallback(
    async (body: {
      name: string;
      departmentId?: string;
      leadId?: string;
      purpose?: string;
    }): Promise<ApiTeamDetail> => {
      if (isConnected) return teamsApi.create(body);
      const state = demoStructure.read();
      const name = cleanName(body.name);
      const purpose = cleanPurpose(body.purpose);
      if (body.departmentId) assertLiveDepartment(state, body.departmentId);
      if (body.leadId) assertPersonExists(people, body.leadId);
      assertNameFree(state, name);

      const row: DemoTeamRow = {
        id: demoStructureId("team"),
        name,
        purpose,
        departmentId: body.departmentId ?? null,
        leadId: body.leadId ?? null,
        archived: false,
      };
      const next = { ...state, teams: [...state.teams, row] };
      demoStructure.commit(next);
      /* A team is created empty, so there is nobody to align. */
      return readBack(next, people, row.id);
    },
    [isConnected, people],
  );

  const update = useCallback(
    async (
      id: string,
      body: {
        name?: string;
        departmentId?: string | null;
        leadId?: string | null;
        purpose?: string | null;
      },
    ): Promise<ApiTeamUpdated> => {
      if (isConnected) return teamsApi.update(id, body);
      const state = demoStructure.read();
      const row = requireTeamRow(state, id);
      const name = body.name === undefined ? row.name : cleanName(body.name);
      if (!sameName(name, row.name)) assertNameFree(state, name, id);
      if (body.departmentId) assertLiveDepartment(state, body.departmentId);
      if (body.leadId) assertPersonExists(people, body.leadId);

      const next: DemoStructure = {
        ...state,
        teams: state.teams.map((one) =>
          one.id === id
            ? {
                ...one,
                name,
                ...(body.departmentId === undefined
                  ? {}
                  : { departmentId: body.departmentId }),
                ...(body.leadId === undefined ? {} : { leadId: body.leadId }),
                ...(body.purpose === undefined
                  ? {}
                  : { purpose: cleanPurpose(body.purpose) }),
              }
            : one,
        ),
      };
      demoStructure.commit(next);

      /* Moving a team between departments is one of the two writes that can
         break the rule, so it is one of the two that align. */
      const changedDepartment =
        body.departmentId !== undefined && body.departmentId !== row.departmentId;
      const plan = changedDepartment
        ? align(id)
        : { toName: null, moved: [] as ApiMoved[] };

      /* Read back against the people as they are *after* the move, not as they
         were at last render. `patchEmployee` has committed, but `people` is a
         render-time memo and still holds the old departments — so reading back
         against it would return a detail claiming `departmentMismatch` for
         exactly the people this call just aligned. */
      return {
        ...readBack(demoStructure.read(), withMoves(people, plan), id),
        moved: plan.moved,
      };
    },
    [align, isConnected, people],
  );

  const archive = useCallback(
    async (
      id: string,
    ): Promise<{ id: string; archived: boolean; note: string }> => {
      if (isConnected) return teamsApi.archive(id);
      const state = demoStructure.read();
      const row = requireTeamRow(state, id);
      if (row.archived) refuse(409, "conflict", "That is already archived.");

      /* Softer than the department rule and for a different reason: emptying a
         team costs nobody any money, so the refusal is there to stop a team
         quietly vanishing from under the people on it. */
      const members = state.members.filter((member) => member.teamId === id);
      if (members.length > 0) {
        const names = members
          .slice(0, 3)
          .map(
            (member) =>
              people.find((person) => person.id === member.employeeId)?.name ??
              "somebody",
          )
          .join(", ");
        refuse(
          409,
          "conflict",
          `${members.length} ${members.length === 1 ? "person is" : "people are"} still on ${row.name} (${names}${members.length > 3 ? ", …" : ""}). Take them off first.`,
        );
      }

      demoStructure.commit({
        ...state,
        teams: state.teams.map((one) =>
          one.id === id ? { ...one, archived: true } : one,
        ),
      });
      return {
        id,
        archived: true,
        note: "Archived, not deleted. Appraiser mappings made through it still resolve.",
      };
    },
    [isConnected, people],
  );

  const restore = useCallback(
    async (id: string): Promise<ApiTeamDetail> => {
      if (isConnected) return teamsApi.restore(id);
      const state = demoStructure.read();
      const row = requireTeamRow(state, id);
      if (!row.archived) refuse(409, "conflict", "That is not archived.");

      /* A team restored into an archived department would be invisible wherever
         teams are grouped by department. Make it cross-functional instead, the
         same way a restored department is promoted to the top. */
      const department = row.departmentId
        ? state.departments.find((one) => one.id === row.departmentId)
        : undefined;
      const departmentId =
        department && !department.archived ? row.departmentId : null;

      const next: DemoStructure = {
        ...state,
        teams: state.teams.map((one) =>
          one.id === id ? { ...one, archived: false, departmentId } : one,
        ),
      };
      demoStructure.commit(next);
      return readBack(next, people, id);
    },
    [isConnected, people],
  );

  const addMembers = useCallback(
    async (
      id: string,
      employeeIds: string[],
      roleLabel?: string,
    ): Promise<ApiMembersAdded> => {
      if (isConnected) return teamsApi.addMembers(id, employeeIds, roleLabel);
      const state = demoStructure.read();
      const row = requireTeamRow(state, id);
      if (row.archived) {
        refuse(
          409,
          "conflict",
          `${row.name} is archived. Restore it before putting anybody on it.`,
        );
      }
      const wanted = [...new Set(employeeIds)];
      if (
        wanted.some(
          (employeeId) => !people.some((person) => person.id === employeeId),
        )
      ) {
        refuse(
          422,
          "unprocessable",
          "One or more of those people does not exist or is archived.",
        );
      }

      /* Adding somebody already on the team is not an error worth a 409 — it is
         what a re-submitted form looks like. `alreadyOn` says what happened. */
      const on = new Set(
        state.members
          .filter((member) => member.teamId === id)
          .map((member) => member.employeeId),
      );
      const fresh = wanted.filter((employeeId) => !on.has(employeeId));

      demoStructure.commit({
        ...state,
        members: [
          ...state.members,
          ...fresh.map((employeeId) => ({
            membershipId: demoStructureId("tm"),
            teamId: id,
            employeeId,
            roleLabel: roleLabel?.trim() ? roleLabel.trim() : null,
            joinedAt: new Date().toISOString(),
          })),
        ],
      });

      const { moved } = align(id);
      return {
        teamId: id,
        added: fresh.length,
        alreadyOn: wanted.length - fresh.length,
        moved,
      };
    },
    [align, isConnected, people],
  );

  const removeMembers = useCallback(
    async (id: string, employeeIds: string[]): Promise<ApiMembersRemoved> => {
      if (isConnected) return teamsApi.removeMembers(id, employeeIds);
      const state = demoStructure.read();
      requireTeamRow(state, id);
      const going = new Set(employeeIds);
      const kept = state.members.filter(
        (member) => !(member.teamId === id && going.has(member.employeeId)),
      );
      demoStructure.commit({ ...state, members: kept });
      /* Their department is left exactly as it is — no `align` call here, and
         that is the rule rather than an omission. */
      return {
        teamId: id,
        removed: state.members.length - kept.length,
        note: "Their department is unchanged. Leaving a team is not leaving a cost centre.",
      };
    },
    [isConnected],
  );

  return {
    source: (isConnected ? "api" : "demo") as TeamSource,
    demoNote: DEMO_STRUCTURE_NOTE,
    create,
    update,
    archive,
    restore,
    addMembers,
    removeMembers,
  };
}
