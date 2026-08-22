"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { missingForPayroll, type Employee } from "@/lib/types";
import { isUuid } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/client";
import {
  employees as api,
  toEmployee,
  toKobo,
  type ApiEmployee,
  type EmployeeListParams,
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
    /* Demo mode: filter and search the in-memory directory so the screen
       behaves the same way, just without a server. */
    const parsed = JSON.parse(key) as EmployeeListParams;
    let rows = parsed.includeArchived ? local.all : local.directory;
    if (parsed.q) {
      const needle = parsed.q.toLowerCase();
      rows = rows.filter((e) =>
        [e.firstName, e.lastName, e.email, e.employeeNo, e.jobTitle]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    }
    if (parsed.payrollBlocked) {
      rows = rows.filter((e) => !e.bankAccount || !e.pensionPin || !e.tin);
    }
    /* The API's statuses are `ONBOARDING`; the local ones are `onboarding`,
       because `toEmployee` lower-cases on the way in. Compared case-insensitively
       so a screen can pass one value and get the same answer from either source
       — the onboarding screen passes `status: "ONBOARDING"` and does not know
       which mode it is in. */
    if (parsed.status) {
      const wanted = parsed.status.toLowerCase();
      rows = rows.filter((e) => e.status.toLowerCase() === wanted);
    }
    return {
      employees: rows,
      total: rows.length,
      loading: false,
      error: null,
      connected: false,
      archivedIds: new Set(local.archived),
      reload: () => {},
    };
  }

  return { ...state, reload: load };
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
        grossMonthlyKobo: toKobo(draft.grossMonthly ?? 0),
        /* Omitted rather than defaulted to Lagos. `POST /employees` now falls
           back to the *company's* own PAYE state, which is the honest answer
           for a company in Kano — and "Lagos" here was a guess that looked like
           a decision. The API refuses only if the company has no state either,
           and says where to set one. */
        ...(draft.taxState ? { taxState: draft.taxState } : {}),
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
        ...(departmentId === undefined ? {} : { departmentId }),
        ...(workLocationId === undefined ? {} : { workLocationId }),
        /* The enums are upper case on the wire and lower case in `Employee` —
           `toEmployee` lower-cases on the way in, so this is the way back. */
        ...(status ? { status: status.toUpperCase() } : {}),
        ...(employmentType
          ? { employmentType: employmentType.toUpperCase() }
          : {}),
        ...(grossMonthly === undefined
          ? {}
          : { grossMonthlyKobo: toKobo(grossMonthly) }),
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
