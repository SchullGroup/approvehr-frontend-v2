"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { missingForPayroll, type Employee } from "@/lib/types";
import { isUuid } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/client";
import {
  employees as api,
  toEmployee,
  toKobo,
  type ApiEmployee,
  type EmployeeListParams,
  type EmployeeSummary,
} from "@/lib/api/endpoints";
import { demoDepartmentName } from "./demo-structure";
import { useEmployeeStore } from "./employees";
import { useSession } from "./session";

/**
 * The employee directory, from whichever source is available.
 *
 * ## Why this wraps rather than replaces
 *
 * `useEmployeeStore` is the localStorage store, and it still works — it is what
 * the demo runs on when there is no API. Rather than deleting it and making the
 * whole product require a database, this hook picks:
 *
 *   connected  → the API, with server-side search, filtering and paging
 *   demo       → the existing store, unchanged
 *
 * Every screen calls this one hook and does not care which it got. That is what
 * makes the cutover reviewable a screen at a time instead of as one large
 * irreversible commit.
 *
 * ## What differs between the two, honestly
 *
 * In demo mode the whole directory is in memory, so search and paging are local
 * and instant. Connected, they are server-side: `total` is the real count rather
 * than the length of the array you happen to hold, and a search is a request.
 * Screens that assumed "I have all the employees" are the ones to check when
 * switching a screen over — the directory did, and now takes `total` from meta.
 */

export type DirectoryState = {
  employees: Employee[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** True when reading from the API rather than local storage. */
  connected: boolean;
  /**
   * Ids that are archived.
   *
   * Exposed as a set because archived-ness lives in different places in the two
   * modes — a boolean on the API row, a separate array in the local store — and
   * a screen should not have to know which. `Employee` has no `archived` field
   * and deliberately still does not: it is a property of the *record's state*,
   * not of the person.
   */
  archivedIds: Set<string>;
};

export function useEmployeeDirectory(params: EmployeeListParams = {}) {
  const { isConnected } = useSession();
  const local = useEmployeeStore();

  const [state, setState] = useState<DirectoryState>({
    employees: [],
    total: 0,
    loading: isConnected,
    error: null,
    connected: isConnected,
    archivedIds: new Set(),
  });

  /* Serialised so the effect re-runs on a *value* change rather than on every
     render — an object literal passed inline is a new reference each time. */
  const key = JSON.stringify(params);

  /* Guards against a slow response for an old query overwriting a fast one for
     the new query. A search box types faster than a network answers. */
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await api.list(JSON.parse(key) as EmployeeListParams, controller.signal);
      if (ticket !== latest.current) return;
      setState({
        employees: page.data.map(toEmployee),
        total: page.meta.total,
        loading: false,
        error: null,
        connected: true,
        archivedIds: new Set(
          page.data.filter((row) => row.archived).map((row) => row.id),
        ),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isConnected) {
    /* Demo mode: filter, sort and page the in-memory directory so the screen
       behaves the same way, just without a server. `total` is the count *before*
       the page is cut, exactly as `meta.total` is connected — a demo that
       reported the page length would teach the screen a habit that breaks the
       moment a database arrives. */
    const parsed = JSON.parse(key) as EmployeeListParams;
    const rows = filterLocally(
      parsed.archivedOnly || parsed.includeArchived ? local.all : local.directory,
      parsed,
      new Set(local.archived),
    );
    const sorted = sortLocally(rows, parsed);
    const size = parsed.pageSize ?? 25;
    const start = ((parsed.page ?? 1) - 1) * size;
    return {
      employees: sorted.slice(start, start + size),
      total: sorted.length,
      loading: false,
      error: null,
      connected: false,
      archivedIds: new Set(local.archived),
      reload: () => {},
    };
  }

  return { ...state, reload: load };
}

/**
 * The demo's copy of the API's `where`.
 *
 * A second implementation, and the header above already says why the demo store
 * exists at all. The rule it has to keep is that the *shape* of the answer
 * matches: filter first, then count, then cut the page. Filtering after the cut
 * is the bug this whole change is about, and it would be just as wrong here.
 */
function filterLocally(
  input: Employee[],
  params: EmployeeListParams,
  archived: Set<string>,
): Employee[] {
  let rows = input;

  if (params.archivedOnly) rows = rows.filter((e) => archived.has(e.id));

  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((e) =>
      [e.firstName, e.lastName, e.email, e.employeeNo, e.jobTitle]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }

  /* Three states, matching the API: blocked only, ready only, or no filter. */
  if (params.payrollBlocked === true) {
    rows = rows.filter((e) => missingForPayroll(e).length > 0);
  } else if (params.payrollBlocked === false && params.payrollReady) {
    rows = rows.filter((e) => missingForPayroll(e).length === 0);
  }

  /* The API's statuses are `ONBOARDING`; the local ones are `onboarding`,
     because `toEmployee` lower-cases on the way in. Compared case-insensitively
     so a screen can pass one value and get the same answer from either source
     — the onboarding screen passes `status: "ONBOARDING"` and does not know
     which mode it is in. */
  if (params.status) {
    const wanted = params.status.toLowerCase();
    rows = rows.filter((e) => e.status.toLowerCase() === wanted);
  }
  if (params.employmentType) {
    const wanted = params.employmentType.toLowerCase();
    rows = rows.filter((e) => e.employmentType?.toLowerCase() === wanted);
  }

  /* Offline, a department is a **name** on the person and a location is a city
     string — there is no id to compare against. `demoDepartmentName` resolves
     the id the picker sent; a location id resolves to nothing, so that filter
     is honestly unavailable rather than silently matching everybody. */
  if (params.departmentId) {
    const name = demoDepartmentName(params.departmentId);
    rows = name ? rows.filter((e) => e.department === name) : [];
  }

  return rows;
}

/**
 * The demo's copy of the API's `orderBy` — **including the tiebreaker**.
 *
 * `id` last, for the same reason the API does it: `Array.prototype.sort` is
 * stable in every engine that matters, but the array it is stabilising is the
 * store's insertion order, which changes whenever somebody edits a record. So
 * paging a demo directory of two hundred could show the same person twice
 * across two pages. Cheaper to fix than to explain.
 */
function sortLocally(rows: Employee[], params: EmployeeListParams): Employee[] {
  const dir = params.order === "desc" ? -1 : 1;
  const key = params.sort ?? "firstName";

  const value = (employee: Employee): string | number => {
    switch (key) {
      case "lastName":
        return employee.lastName.toLowerCase();
      case "employeeNo":
        return employee.employeeNo.toLowerCase();
      case "jobTitle":
        return employee.jobTitle.toLowerCase();
      case "startDate":
        return employee.startDate;
      case "grossMonthly":
        /* -1 so somebody with no agreed figure sorts below every real salary
           rather than in among the lowest-paid. A sort key, never displayed. */
        return employee.grossMonthly ?? -1;
      default:
        return employee.firstName.toLowerCase();
    }
  };

  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left < right) return -dir;
    if (left > right) return dir;
    /* The tiebreaker. Without it the order between equal rows is the store's,
       which is not stable across edits. */
    return a.id < b.id ? -dir : a.id > b.id ? dir : 0;
  });
}

/**
 * The directory's header counts, from the server, under the same filter.
 *
 * Separate from `useEmployeeDirectory` because it is a separate request and its
 * numbers have to survive a page change without a flicker: paging from 1 to 2
 * does not change how many people are in a filter, so re-fetching the counts
 * with every page would make four stat cards blink for nothing. The page is
 * therefore stripped from the key before the request goes out.
 *
 * Offline every figure is derived from the same filtered array the table shows,
 * which is the one place a local total and a local count cannot disagree.
 */
export type DirectorySummary = {
  /** People matching the filter. Absent — not zero — until the server answers. */
  total: number | undefined;
  departments: number | undefined;
  /** Integer kobo. Summed by the database, or over the demo's own array. */
  grossMonthlyKobo: number | undefined;
  /** Incomplete records **within the filter**. */
  incomplete: number | undefined;
  /** Every archived record, whatever the filter. For the view switcher. */
  archived: number | undefined;
  /** Every incomplete record, whatever the filter. For the view switcher. */
  blockedEverywhere: number | undefined;
  /**
   * Headcount by employment status, for the filter in force.
   *
   * On the wire since the endpoint existed and read by nothing until now.
   * `undefined` until the server answers — absent, never zeroed.
   */
  byStatus: Record<string, number> | undefined;
  loading: boolean;
  error: ApiError | null;
};

export function useDirectorySummary(
  params: EmployeeListParams = {},
): DirectorySummary {
  const { isConnected } = useSession();
  const local = useEmployeeStore();

  /* Paging and sorting do not change a count, so neither is part of the key.
     Re-fetching six aggregates every time somebody turns a page would make four
     stat cards blink for figures that had not moved. */
  const key = useMemo(() => {
    const filters: Record<string, unknown> = { ...params };
    delete filters["page"];
    delete filters["pageSize"];
    delete filters["sort"];
    delete filters["order"];
    return JSON.stringify(filters);
  }, [params]);

  const [state, setState] = useState<{
    key: string;
    row: EmployeeSummary | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const row = await api.summary(
          JSON.parse(key) as EmployeeListParams,
          controller.signal,
        );
        if (!cancelled) setState({ key, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setState({
            key,
            row: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key]);

  const demo = useMemo(() => {
    if (isConnected) return null;
    const parsed = JSON.parse(key) as EmployeeListParams;
    const archivedIds = new Set(local.archived);
    const rows = filterLocally(
      parsed.archivedOnly || parsed.includeArchived ? local.all : local.directory,
      parsed,
      archivedIds,
    );
    return {
      total: rows.length,
      departments: new Set(
        rows.map((e) => e.department).filter((name) => Boolean(name)),
      ).size,
      /* `grossMonthly` is naira on `Employee` — a legacy the type is waiting to
         shed. Converted **per row** and then added as integers, never summed as
         naira and converted once: floats do not add exactly, and a payroll total
         that is a kobo out is a payroll total nobody can reconcile. */
      /* Over the rows that have a figure. Somebody whose pay is not agreed
         adds nothing rather than a zero — a zero cannot be told apart from a
         real ₦0 and would make the total quietly wrong. */
      grossMonthlyKobo: rows.reduce(
        (sum, e) => sum + (e.grossMonthly === null ? 0 : toKobo(e.grossMonthly)),
        0,
      ),
      incomplete: rows.filter((e) => missingForPayroll(e).length > 0).length,
      /* Derived from the same rows the other figures are over, so the demo's
         status chart and its total cannot disagree. */
      byStatus: rows.reduce<Record<string, number>>((acc, e) => {
        acc[e.status] = (acc[e.status] ?? 0) + 1;
        return acc;
      }, {}),
      archived: archivedIds.size,
      blockedEverywhere: local.directory.filter(
        (e) => missingForPayroll(e).length > 0,
      ).length,
    };
  }, [isConnected, key, local]);

  if (demo) return { ...demo, loading: false, error: null };

  const matched = state !== null && state.key === key;
  const row = matched ? state.row : null;

  /* Every figure is `undefined` until the server has answered for *this* filter.
     A zero here would be a claim — "no employees match" — and the reader has no
     way to tell it from a request in flight. */
  return {
    total: row?.total,
    departments: row?.departments,
    grossMonthlyKobo: row?.grossMonthlyKobo,
    incomplete: row?.payrollBlockedInFilter,
    archived: row?.archived,
    blockedEverywhere: row?.payrollBlocked,
    /**
     * Headcount by employment status, for the filter in force.
     *
     * `EmployeeSummary.byStatus` has been on every directory response since the
     * endpoint existed and this hook returned six named fields and dropped it —
     * so the eight statuses were visible only one badge at a time, down a
     * table. `undefined` until the server has answered, like every field beside
     * it: a zero here is a claim the reader cannot tell from a request in
     * flight.
     */
    byStatus: row?.byStatus,
    loading: !matched,
    error: matched ? state.error : null,
  };
}

/* ------------------------------------------------------- one whole record */

export type EmployeeRecordState = {
  employee: Employee | null;
  /**
   * What payroll cannot file without.
   *
   * Taken from the API's own `missingForPayroll` when connected rather than
   * recomputed here. The server derives it from the row it just read, so if the
   * two ever disagree the server is right — and a second implementation of
   * "is this record ready" is exactly how a screen ends up clearing a blocker
   * the run still refuses.
   */
  missing: string[];
  archived: boolean;
  /** The manager's name, which the detail response carries without a lookup. */
  managerName: string | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  /** No such record — or none this organisation can see. */
  notFound: boolean;
  /**
   * The id is a demo id (`p-08`) and this session is connected.
   *
   * Its own flag because it is not a missing record, it is a link from the other
   * mode — a bookmark, or a URL pasted out of a demo — and the sentence for it
   * is different.
   */
  demoId: boolean;
  /** The record exists; this account may not read it. */
  forbidden: boolean;
  reload: () => void;
};

/**
 * One employee, in full.
 *
 * `GET /employees/:id` and the directory list are **not** the same read. The
 * list needs no permission — knowing who your colleagues are is not privileged
 * — but the detail endpoint carries pay, bank details and a pension PIN, so it
 * needs `VIEW_SALARIES` or for the record to be your own. That asymmetry is why
 * the record page cannot just pick its person out of the directory: the
 * directory would answer, and the answer would be missing the half of the
 * record this screen exists to show.
 *
 * `forbidden` is separated from a general error for that reason. "You cannot
 * see this" and "something went wrong" need different sentences.
 *
 * State is kept as `{ id, nonce, row }` rather than a bare row, the same shape
 * as `useDepartment`: the result carries the request it belongs to, so `loading`
 * is derived rather than tracked and a slow answer for the record you have just
 * navigated away from cannot be rendered against this one. Nothing needs
 * clearing when `id` changes — the stale value simply stops matching.
 */
export function useEmployee(id: string): EmployeeRecordState {
  const { isConnected, isLoading } = useSession();
  const local = useEmployeeStore();

  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    nonce: number;
    row: ApiEmployee | null;
    error: ApiError | null;
  } | null>(null);

  /* `isLoading` matters here: the session restores asynchronously, and firing
     this read before it resolves would send an unauthenticated request that
     comes back 401 and looks like a permission problem. */
  const active = isConnected && !isLoading;

  /**
   * An id the API would refuse is not a request worth making.
   *
   * Every route param is validated as a uuid, so `GET /employees/p-08` comes
   * back 422 "Some fields are not valid" — which renders as a broken record
   * page when the truth is that the link was made in demo mode. Found by
   * clicking a demo bookmark while signed in. The same guard is in
   * `lib/store/audit.ts` for the same reason.
   */
  const askable = active && isUuid(id);

  useEffect(() => {
    if (!askable) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const row = await api.get(id, controller.signal);
        if (!cancelled) setFetched({ id, nonce, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            id,
            nonce,
            row: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, nonce, askable]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (active && !askable) {
    return {
      employee: null,
      missing: [],
      archived: false,
      managerName: null,
      loading: false,
      error: null,
      connected: true,
      notFound: true,
      demoId: true,
      forbidden: false,
      reload,
    };
  }

  if (!active) {
    const employee = local.get(id) ?? null;
    const manager = employee?.managerId ? local.get(employee.managerId) : undefined;
    return {
      employee,
      missing: employee ? missingForPayroll(employee) : [],
      archived: local.isArchived(id),
      managerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
      loading: false,
      error: null,
      connected: false,
      notFound: employee === null,
      demoId: false,
      forbidden: false,
      reload,
    };
  }

  const matched =
    fetched !== null && fetched.id === id && fetched.nonce === nonce;
  const row = matched ? fetched.row : null;
  const error = matched ? fetched.error : null;

  return {
    employee: row ? toEmployee(row) : null,
    missing: row?.missingForPayroll ?? [],
    archived: row?.archived ?? false,
    managerName: row?.managerName ?? null,
    loading: !matched,
    error,
    connected: true,
    notFound: error?.status === 404,
    demoId: false,
    forbidden: error?.status === 403,
    reload,
  };
}

/**
 * What a screen may change about somebody.
 *
 * `Employee` plus the two ids the record has but the display type does not.
 * `Employee.department` is a name because that is what a table cell shows;
 * assigning somebody to a department is a different act and needs the id.
 */
export type EmployeePatch = Partial<Employee> & {
  departmentId?: string;
  workLocationId?: string;
};

/**
 * Mutations, routed to whichever source is live.
 *
 * The API takes kobo and the frontend's `Employee` is in naira, so the
 * conversion happens here — the same boundary rule as `endpoints.ts`.
 */
export function useEmployeeMutations() {
  const { isConnected } = useSession();
  const local = useEmployeeStore();

  /**
   * Creates a record, and refuses rather than pretending when there is no API.
   *
   * Demo mode does **not** fall through to the local store here, unlike
   * `update`. `useEmployeeStore.create` mints its own `p-NN` id, and a record
   * with a demo id created while connected would be a person the payroll run
   * cannot see and whose record page 404s in any other browser. The new-starter
   * form calls the local store directly in demo mode, where that is the honest
   * answer and the screen says so.
   *
   * `departmentId` and `managerId` are sent, `department` and `location` are
   * not: they are display names, and zod strips an unknown key rather than
   * refusing it — so a name sent here would look saved and change nothing. The
   * form sends ids from real pickers instead.
   */
  const create = useCallback(
    async (
      draft: Partial<Employee> & {
        firstName: string;
        lastName: string;
        departmentId?: string;
        workLocationId?: string;
      },
    ) => {
      if (!isConnected) {
        throw new ApiError(
          0,
          "offline",
          "Creating employees needs the API. Start it and sign in again.",
        );
      }
      const created = await api.create({
        firstName: draft.firstName,
        lastName: draft.lastName,
        jobTitle: draft.jobTitle ?? "Not set",
        startDate: draft.startDate ?? new Date().toISOString().slice(0, 10),
        /* Omitted when nobody has agreed a figure. It used to be
           `toKobo(draft.grossMonthly ?? 0)`, which created the person on ₦0 a
           month — a figure the payroll run would then have prorated. */
        ...(draft.grossMonthly == null
          ? {}
          : { grossMonthlyKobo: toKobo(draft.grossMonthly) }),
        /* Omitted rather than defaulted to Lagos. `POST /employees` now falls
           back to the *company's* own PAYE state, which is the honest answer
           for a company in Kano — and "Lagos" here was a guess that looked like
           a decision. The API refuses only if the company has no state either,
           and says where to set one. */
        ...(draft.taxState ? { taxState: draft.taxState } : {}),
        ...(draft.canLogin === undefined ? {} : { canLogin: draft.canLogin }),
        ...(draft.email ? { email: draft.email } : {}),
        ...(draft.phone ? { phone: draft.phone } : {}),
        ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
        ...(draft.bankName ? { bankName: draft.bankName } : {}),
        ...(draft.bankAccount ? { bankAccount: draft.bankAccount } : {}),
        ...(draft.pensionPin ? { pensionPin: draft.pensionPin } : {}),
        ...(draft.pensionProvider
          ? { pensionProvider: draft.pensionProvider }
          : {}),
        ...(draft.tin ? { tin: draft.tin } : {}),
        ...(draft.nhfNumber ? { nhfNumber: draft.nhfNumber } : {}),
        ...(draft.addressLine ? { addressLine: draft.addressLine } : {}),
        ...(draft.nin ? { nin: draft.nin } : {}),
        ...(draft.stateOfOrigin ? { stateOfOrigin: draft.stateOfOrigin } : {}),
        ...(draft.lgaOfOrigin ? { lgaOfOrigin: draft.lgaOfOrigin } : {}),
        ...(draft.religion ? { religion: draft.religion } : {}),
        /* `!= null` rather than truthiness: zero declared rent is a declaration
           — "I pay none" — and dropping it would leave the person looking
           undeclared to the payroll run that warns about exactly that. */
        ...(draft.annualRentKobo != null
          ? { annualRentKobo: draft.annualRentKobo }
          : {}),
        ...(draft.departmentId ? { departmentId: draft.departmentId } : {}),
        ...(draft.workLocationId
          ? { workLocationId: draft.workLocationId }
          : {}),
        ...(draft.managerId ? { managerId: draft.managerId } : {}),
        ...(draft.canLogin === undefined ? {} : { canLogin: draft.canLogin }),
        /* Upper case on the wire, lower case in `Employee` — the same seam as
           `update` below. */
        ...(draft.status ? { status: draft.status.toUpperCase() } : {}),
        ...(draft.employmentType
          ? { employmentType: draft.employmentType.toUpperCase() }
          : {}),
      });
      return toEmployee(created);
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, patch: EmployeePatch) => {
      const { departmentId, workLocationId, ...fields } = patch;

      if (!isConnected) {
        /* The local store holds display names, so a `departmentId` has to be
           resolved to one before it can be written. It used to be dropped here
           with a comment saying an id means nothing to the local store — true,
           and the consequence was that the record page's department picker
           looked saved and moved nobody. `demoDepartmentName` is the seam;
           `workLocationId` still has the bug, because locations live in
           `store/attendance.ts` and that is a different fix. */
        local.update(id, {
          ...fields,
          ...(departmentId === undefined
            ? {}
            : { department: demoDepartmentName(departmentId) }),
        });
        return undefined;
      }

      const {
        grossMonthly,
        nextOfKin,
        status,
        employmentType,
        department,
        location,
        pensionPin,
        tin,
        bankAccount,
        nin,
        phone,
        ...rest
      } = fields;

      /* `department` and `location` are display names. The API takes ids, and a
         name sent to it is stripped by zod rather than refused — which would
         make an edit look saved and change nothing. So they are dropped here on
         purpose, and a screen that wants to reassign somebody sends
         `departmentId` from a real picker instead. */
      void department;
      void location;

      const updated = await api.update(id, {
        ...rest,
        /* Three states again, same as `grossMonthly` below: absent leaves the
           assignment alone, `""` — the picker's "Not assigned" / "Not set" —
           means withdraw it and has to cross the wire as `null`, because the
           API's schema wants a real UUID or nothing, never an empty string. */
        ...(departmentId === undefined
          ? {}
          : { departmentId: departmentId === "" ? null : departmentId }),
        ...(workLocationId === undefined
          ? {}
          : { workLocationId: workLocationId === "" ? null : workLocationId }),
        /* Same shape again: each of these is format-checked when present — an
           RSA PIN, a TIN, a NUBAN account, a NIN, a phone number — so `""`
           fails that check instead of clearing the field, and only `null` does. */
        ...(pensionPin === undefined
          ? {}
          : { pensionPin: pensionPin === "" ? null : pensionPin }),
        ...(tin === undefined ? {} : { tin: tin === "" ? null : tin }),
        ...(bankAccount === undefined
          ? {}
          : { bankAccount: bankAccount === "" ? null : bankAccount }),
        ...(nin === undefined ? {} : { nin: nin === "" ? null : nin }),
        ...(phone === undefined ? {} : { phone: phone === "" ? null : phone }),
        /* The enums are upper case on the wire and lower case in `Employee` —
           `toEmployee` lower-cases on the way in, so this is the way back. */
        ...(status ? { status: status.toUpperCase() } : {}),
        ...(employmentType
          ? { employmentType: employmentType.toUpperCase() }
          : {}),
        /* Three states, not interchangeable: absent from the patch leaves the
           figure alone, `null` withdraws it, a number sets it. Same shape as
           the rent declaration. */
        ...(grossMonthly === undefined
          ? {}
          : {
              grossMonthlyKobo:
                grossMonthly === null ? null : toKobo(grossMonthly),
            }),
        ...(nextOfKin
          ? {
              nextOfKinName: nextOfKin.name,
              nextOfKinRelationship: nextOfKin.relationship,
              nextOfKinPhone: nextOfKin.phone,
            }
          : {}),
      });
      return toEmployee(updated);
    },
    [isConnected, local],
  );

  const archive = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.archive(id);
        return;
      }
      await api.archive(id);
    },
    [isConnected, local],
  );

  const restore = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.restore(id);
        return;
      }
      await api.restore(id);
    },
    [isConnected, local],
  );

  return { create, update, archive, restore, connected: isConnected };
}
