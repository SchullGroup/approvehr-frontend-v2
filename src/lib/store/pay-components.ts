"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  payComponentsApi as api,
  type ApiEmployeeAssignments,
  type ApiPayComponent,
  type ApiPayComponentDetail,
  type ApiPreview,
  type ApiResolvedAssignment,
  type AssignBody,
  type AssignToManyBody,
  type CreatePayComponentBody,
  type PayComponentListParams,
  type PreviewParams,
  type UpdateAssignmentBody,
  type UpdatePayComponentBody,
} from "@/lib/api/pay-components";
import { EMPLOYEES } from "@/lib/mock/people";
import { TODAY } from "@/lib/today";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Pay components, from whichever source is available.
 *
 * Same two modes as every other store — the API when it answers, seed data when
 * it does not. Where the line falls here is the thing to read before changing
 * anything:
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read the definitions and their flags | yes | yes — the eight defaults, as shipped |
 * | Read one person's components and totals | yes | yes, from seed assignments |
 * | **Effect of a change on take-home pay** | yes | **only where it is exact** — see below |
 * | Define, edit or archive a component | yes | refused, with a reason |
 * | Assign one to somebody | yes | refused, with a reason |
 *
 * ## Why the take-home preview mostly refuses offline
 *
 * The whole value of this screen is the sentence "this puts ₦34,512.80 more in
 * their account". Producing that number means running PAYE, pension and NHF
 * with the component's `taxable` / `pensionable` / `preTax` flags honoured, and
 * the only implementation that does that is the one on the server. There was a
 * second one in this browser — it predated the flags, treated every addition as
 * pensionable, and was left on the 2011 PAYE bands for a while after the Nigeria
 * Tax Act 2025 went into the API. It has been deleted, and it is not coming
 * back: reimplementing tax law here to make a demo look complete would give two
 * answers to a question that has one, and the wrong one would be the one on the
 * laptop in the room.
 *
 * So demo mode answers only where the arithmetic is exact and needs no engine:
 * an **after-tax deduction takes exactly its own amount off take-home**, because
 * nothing before it in the calculation changes. Everything else — every
 * allowance, every before-tax deduction — says the figure needs the API rather
 * than guessing it. `demoNetEffectKobo` is that rule, in one function.
 */

/* ------------------------------------------------------------- refusals */

function refuse(what: string): never {
  throw new ApiError(
    0,
    "offline",
    `${what} needs the API. An allowance or a deduction kept in this browser ` +
      `would never reach a payroll run, so the demo will not pretend it has.`,
  );
}

/* ------------------------------------------------------------ the defaults */

/**
 * The eight components the API seeds for a new company, mirrored for the demo.
 *
 * Copied deliberately rather than fetched: these are what the product *ships*,
 * so showing them offline states nothing that is not true. Every flag matches
 * `seedDefaultPayComponents` in the backend, and the statutory reasoning for
 * each lives there — the short version is that an allowance is pensionable only
 * when it is contractual monthly pay, which is why exactly one of these is.
 *
 * If the backend seed list changes, this list is stale and the demo is wrong.
 * That is the cost of a demo that runs with no database; the alternative was a
 * screen that shows nothing without one.
 *
 * ## `active` is the one field that is not a straight copy
 *
 * The API seeds all eight **off** — nobody chose them, so nothing is charged
 * until somebody switches one on. All four allowances arrive off here too,
 * exactly as a real new company finds them: an allowance is a discretionary
 * extra, and switching one on sight-unseen is not a decision this product
 * makes for anybody.
 *
 * Two of the four deductions, `COOPERATIVE` and `NHIS`, are on in `DEFAULTS`
 * and carry entries in `DEMO_PACKAGE` below, because the demo is also meant to
 * show what an *operating* company looks like and a screen with nothing ever
 * assigned reads as broken rather than new. The API refuses to put anybody on
 * a switched-off component, so a component with assignments has to be on —
 * which is why this is two deliberately-chosen deductions rather than all
 * eight: showing an allowance both "Off" and already paid to two people would
 * contradict the product it is demonstrating.
 */
const DEFAULTS: readonly Omit<ApiPayComponent, "id" | "assignmentCount">[] = [
  {
    code: "LEAVE_ALLOWANCE",
    name: "Leave allowance",
    kind: "ALLOWANCE",
    basis: "FIXED",
    /* Taxed. Not pensionable: paid once a year, so not monthly emoluments. No
       default, because the customary figure is a tenth of ANNUAL basic and a
       monthly rate would silently pay it twelve times. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 10,
    active: false,
    isSystem: true,
    archived: false,
  },
  {
    code: "THIRTEENTH_MONTH",
    name: "13th month",
    kind: "ALLOWANCE",
    basis: "PERCENT_OF_GROSS",
    /* One month's contractual pay is the definition of the thing, so the rate
       is 1.0 and it follows a pay rise on its own. Not pensionable: a
       thirteenth payment is not one of the twelve monthly emoluments. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: 1,
    sortOrder: 20,
    active: false,
    isSystem: true,
    archived: false,
  },
  {
    code: "TRANSPORT_TOP_UP",
    name: "Car / transport top-up",
    kind: "ALLOWANCE",
    basis: "FIXED",
    /* Not pensionable, and this is the one worth spelling out: transport is
       already inside the contractual split and pension is charged on it there.
       This is the amount above it. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 30,
    active: false,
    isSystem: true,
    archived: false,
  },
  {
    code: "HOUSING_TOP_UP",
    name: "Housing top-up",
    kind: "ALLOWANCE",
    basis: "FIXED",
    /* The only pensionable default. Housing is named in the Pension Reform Act
       2014 as monthly emoluments. It still does not move the NHF base, which
       the Act ties to basic. */
    taxable: true,
    pensionable: true,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 40,
    active: false,
    isSystem: true,
    archived: false,
  },
  {
    code: "NHIS",
    name: "NHIS contribution",
    kind: "DEDUCTION",
    basis: "FIXED",
    /* Before tax — a recognised health insurance contribution belongs in the
       statutory relief block, not with the deductions a company invents. */
    taxable: true,
    pensionable: false,
    preTax: true,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 210,
    active: true,
    isSystem: true,
    archived: false,
  },
  {
    code: "UNION_DUES",
    name: "Union dues",
    kind: "DEDUCTION",
    basis: "PERCENT_OF_BASIC",
    /* A check-off deduction is a fraction of basic set in the recognition
       agreement, so the rate comes from that agreement and not from us. After
       tax: compulsory is not the same as deductible. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 220,
    active: false,
    isSystem: true,
    archived: false,
  },
  {
    code: "COOPERATIVE",
    name: "Cooperative contribution",
    kind: "DEDUCTION",
    basis: "FIXED",
    /* A savings arrangement between members. Nothing makes it deductible, and
       the member chooses the figure, so there is no default. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 230,
    active: true,
    isSystem: true,
    archived: false,
  },
  {
    code: "SALARY_ADVANCE",
    name: "Salary advance recovery",
    kind: "DEDUCTION",
    basis: "FIXED",
    /* Sorted last, so when net runs out this is the line that goes unrecovered
       rather than a statutory one. Recovering money already paid is not a
       relief — the tax on it was due when it was earned. */
    taxable: true,
    pensionable: false,
    preTax: false,
    defaultAmountKobo: null,
    defaultRate: null,
    sortOrder: 240,
    active: false,
    isSystem: true,
    archived: false,
  },
];

const demoId = (code: string) => `demo-pc-${code.toLowerCase()}`;

/* --------------------------------------------------- the demo's assignments */

/**
 * Who is on what, in the demo.
 *
 * Seed data, in the same spirit as the seed salaries and the seed leave
 * requests: an *operating* company with nothing ever assigned makes the panel
 * look broken rather than new. Deterministic from the employee's position in
 * the directory so the same person always has the same package, and **fixed
 * amounts only** — a percentage line would need the salary split resolved,
 * and there is no reason for a second copy of that arithmetic to exist here.
 *
 * Deductions only, deliberately. The two allowances that used to be in this
 * list (`HOUSING_TOP_UP`, `TRANSPORT_TOP_UP`) arrive off in `DEFAULTS` now,
 * same as every other allowance, and an assignment to an off component is
 * exactly the state the real API refuses to create — see the note above
 * `DEFAULTS`.
 */
const DEMO_PACKAGE: readonly {
  code: string;
  amountKobo: number;
  every: number;
  offset: number;
}[] = [
  { code: "COOPERATIVE", amountKobo: 1_500_000, every: 2, offset: 0 },
  { code: "NHIS", amountKobo: 1_200_000, every: 4, offset: 3 },
];

/** First of the current month, as the API would compute the period. */
function periodStart(): string {
  return `${TODAY.slice(0, 7)}-01`;
}

function demoDefinition(code: string) {
  const found = DEFAULTS.find((row) => row.code === code);
  if (!found) throw new Error(`No demo pay component ${code}`);
  return found;
}

function demoAssignments(employeeId: string): ApiResolvedAssignment[] {
  const index = EMPLOYEES.findIndex((employee) => employee.id === employeeId);
  if (index < 0) return [];

  return DEMO_PACKAGE.filter((line) => index % line.every === line.offset).map(
    (line) => {
      const component = demoDefinition(line.code);
      return {
        id: `demo-epc-${employeeId}-${line.code.toLowerCase()}`,
        employeeId,
        componentId: demoId(line.code),
        code: component.code,
        name: component.name,
        kind: component.kind,
        basis: component.basis,
        taxable: component.taxable,
        pensionable: component.pensionable,
        preTax: component.preTax,
        amountKobo: line.amountKobo,
        rate: null,
        fromDefault: false,
        effectiveFrom: periodStart(),
        effectiveTo: null,
        note: null,
        componentActive: true,
        resolvedKobo: line.amountKobo,
        appliesInPeriod: true,
      };
    },
  );
}

function demoComponents(): ApiPayComponent[] {
  const counts = new Map<string, number>();
  for (const employee of EMPLOYEES) {
    for (const assignment of demoAssignments(employee.id)) {
      counts.set(assignment.code, (counts.get(assignment.code) ?? 0) + 1);
    }
  }
  return DEFAULTS.map((row) => ({
    ...row,
    id: demoId(row.code),
    assignmentCount: counts.get(row.code) ?? 0,
  }));
}

/**
 * The one net effect demo mode may state, and the rule for when it may not.
 *
 * An after-tax deduction is subtracted from net after PAYE, pension and NHF are
 * all settled, so take-home falls by exactly its own amount and no engine is
 * needed to say so. (The engine caps it at the net available and reports the
 * shortfall; at seed salaries there is no shortfall, and the panel shows the
 * figure as an effect on this month rather than a promise about every month.)
 *
 * Everything else returns null, which the panel renders as "needs the API"
 * rather than as zero.
 */
export function demoNetEffectKobo(
  component: Pick<ApiPayComponent, "kind" | "preTax" | "basis">,
  amountKobo: number | null,
): number | null {
  if (component.kind !== "DEDUCTION") return null;
  if (component.preTax) return null;
  if (component.basis !== "FIXED" || amountKobo === null) return null;
  return -amountKobo;
}

/* ==================================================== the definitions list */

export type PayComponentsState = {
  rows: ApiPayComponent[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** True when the API is answering. False means demo data, read-only. */
  connected: boolean;
};

const LOADING: PayComponentsState = {
  rows: [],
  total: 0,
  loading: true,
  error: null,
  connected: false,
};

/**
 * The component library, plus every write against it.
 *
 * `params` is serialised into the effect key rather than compared by reference:
 * a caller passing `{ q: search }` inline hands over a new object on every
 * keystroke's render. The ticket beside it guards the other half of the same
 * problem — a slow answer for "car" must not overwrite a fast one for "car
 * allowance".
 */
export function usePayComponents(params: PayComponentListParams = {}) {
  const { isConnected, isLoading, can } = useSession();
  const [state, setState] = useState<PayComponentsState>(LOADING);
  const key = JSON.stringify(params);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    if (isLoading) return;
    const parsed = JSON.parse(key) as PayComponentListParams;

    if (!isConnected) {
      const needle = parsed.q?.trim().toLowerCase();
      const rows = demoComponents()
        .filter((row) => (parsed.kind ? row.kind === parsed.kind : true))
        .filter((row) =>
          parsed.active === undefined ? true : row.active === parsed.active,
        )
        .filter(
          (row) =>
            !needle ||
            row.name.toLowerCase().includes(needle) ||
            row.code.toLowerCase().includes(needle),
        )
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
        );
      setState({
        rows,
        total: rows.length,
        loading: false,
        error: null,
        connected: false,
      });
      return;
    }

    const mine = ++ticket.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.list(parsed);
      if (mine !== ticket.current) return;
      setState({
        rows: result.data,
        total: result.meta.total,
        loading: false,
        error: null,
        connected: true,
      });
    } catch (error) {
      if (mine !== ticket.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        connected: true,
        error: error instanceof ApiError ? error : null,
      }));
    }
    /* `can` is deliberately NOT a dependency here, and neither is anything else
       whose identity changes per render. `useSession()` builds `can` fresh every
       time it is called, so a `load` that closed over it would be a new function
       on every render, the effect below would re-run, its setState would render
       again — and the screen would sit in an infinite request loop. Permission is
       derived at the bottom of this hook instead, where it belongs: it is a
       property of the reader, not of the response. */
  }, [isConnected, isLoading, key]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  const guard = useCallback(
    (what: string) => {
      if (!isConnected) refuse(what);
    },
    [isConnected],
  );

  return {
    ...state,
    /** Define, edit, switch off, archive. Needs MANAGE_PAY_STRUCTURE. */
    editable: state.connected && can("MANAGE_PAY_STRUCTURE"),
    reload: load,

    create: useCallback(
      async (body: CreatePayComponentBody) => {
        guard("Adding a pay component");
        const created = await api.create(body);
        await load();
        return created;
      },
      [guard, load],
    ),

    update: useCallback(
      async (id: string, body: UpdatePayComponentBody) => {
        guard("Editing a pay component");
        const updated = await api.update(id, body);
        await load();
        return updated;
      },
      [guard, load],
    ),

    /**
     * Stop charging it from the next run, without touching last year's
     * payslips. This is what the archive refusal points at, and it is
     * reversible in one click.
     */
    setActive: useCallback(
      async (id: string, active: boolean) => {
        guard(
          active ? "Turning a pay component on" : "Turning a pay component off",
        );
        const updated = await api.update(id, { active });
        await load();
        return updated;
      },
      [guard, load],
    ),

    archive: useCallback(
      async (id: string) => {
        guard("Archiving a pay component");
        const result = await api.archive(id);
        await load();
        return result;
      },
      [guard, load],
    ),
  };
}

/* ------------------------------------------------------- one definition */

/**
 * One component and who is on it. For the drawer behind a row.
 *
 * The demo answer is a `useMemo`, not a `setState` in the effect: it is derived
 * from data already in memory, so computing it during render is both correct and
 * one render cheaper. The effect exists only for the request.
 */
export function usePayComponentDetail(id: string | null) {
  const { isConnected, isLoading } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    detail: ApiPayComponentDetail | null;
    error: ApiError | null;
  } | null>(null);

  /* Null unless there is a request to make, so the effect has one condition
     and the demo path never enters it. */
  const wanted = isConnected && !isLoading ? id : null;

  /* Bumped by `reload` below. In the effect's own dependency list for
     exactly that reason — `wanted` alone has no reason to change after
     somebody assigns a component to a fresh batch of people, and without
     this the drawer would keep showing the list it opened with. */
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void (async () => {
      try {
        const detail = await api.get(wanted);
        if (!cancelled) setFetched({ id: wanted, detail, error: null });
      } catch (error) {
        if (!cancelled) {
          setFetched({
            id: wanted,
            detail: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wanted, revalidation, tick]);

  const demo = useMemo<ApiPayComponentDetail | null>(() => {
    if (isConnected || !id) return null;
    const row = demoComponents().find((component) => component.id === id);
    if (!row) return null;
    const assignees = EMPLOYEES.flatMap((employee) =>
      demoAssignments(employee.id)
        .filter((assignment) => assignment.componentId === id)
        .map((assignment) => ({
          assignmentId: assignment.id,
          employeeId: employee.id,
          employeeNo: employee.employeeNo,
          name: `${employee.firstName} ${employee.lastName}`,
          amountKobo: assignment.amountKobo,
          rate: assignment.rate,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo,
        })),
    );
    return { ...row, liveAssignments: assignees.length, assignees };
  }, [isConnected, id]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  if (!isConnected) {
    return { detail: demo, error: null, loading: isLoading, reload };
  }

  /* Matched on the id it was fetched for, so a slow answer for a row you have
     already closed cannot be shown, and there is nothing to clear on change. */
  const matched = wanted !== null && fetched !== null && fetched.id === wanted;
  return {
    detail: matched ? fetched.detail : null,
    error: matched ? fetched.error : null,
    loading: wanted !== null && !matched,
    reload,
  };
}

/**
 * One component, assigned to several people in one action.
 *
 * Separate from `usePayComponentDetail` above, which only ever reads — this
 * is the write half, callable from the same drawer without tying the two
 * together. No demo path, same rule as `usePayComponentsForEmployee`'s own
 * `assign`: an allowance kept in this browser would never reach a payroll
 * run, so this refuses rather than fabricate an assignment nothing can
 * compute against.
 */
export function useAssignManyToComponent() {
  const { isConnected, can } = useSession();

  return {
    /** Needs `EDIT_RECORDS` — the same permission as assigning one at a time. */
    editable: isConnected && can("EDIT_RECORDS"),

    assignToMany: useCallback(
      (componentId: string, body: AssignToManyBody) => {
        if (!isConnected) refuse("Assigning a pay component to several people");
        return api.assignToMany(componentId, body);
      },
      [isConnected],
    ),
  };
}

/* ============================================ one person's pay components */

export type EmployeeComponentsState = {
  data: ApiEmployeeAssignments | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
};

/**
 * What one person gets, with what each line comes to this period.
 *
 * The amounts are the engine's own — the API resolves the specs through
 * `computePayslip` and hands back the lines in the order they went in — so a
 * figure here and a figure on the payslip cannot disagree.
 */
export function useEmployeePayComponents(
  employeeId: string | null,
  options: { period?: string; includeInactive?: boolean } = {},
) {
  const { isConnected, isLoading, can } = useSession();
  const [state, setState] = useState<EmployeeComponentsState>({
    data: null,
    loading: true,
    error: null,
    connected: false,
  });

  const key = JSON.stringify(options);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    if (isLoading || !employeeId) return;
    const parsed = JSON.parse(key) as {
      period?: string;
      includeInactive?: boolean;
    };

    if (!isConnected) {
      const employee = EMPLOYEES.find((row) => row.id === employeeId);
      const assignments = demoAssignments(employeeId);
      const sum = (rows: ApiResolvedAssignment[]) =>
        rows.reduce((total, row) => total + row.resolvedKobo, 0);
      setState({
        data: employee
          ? {
              employee: {
                id: employee.id,
                employeeNo: employee.employeeNo,
                name: `${employee.firstName} ${employee.lastName}`,
                grossMonthlyKobo:
                  employee.grossMonthly === null
                    ? null
                    : Math.round(employee.grossMonthly * 100),
              },
              period: { start: periodStart(), end: TODAY },
              assignments,
              totals: {
                allowanceKobo: sum(
                  assignments.filter((a) => a.kind === "ALLOWANCE"),
                ),
                preTaxDeductionKobo: sum(
                  assignments.filter((a) => a.kind === "DEDUCTION" && a.preTax),
                ),
                postTaxDeductionKobo: sum(
                  assignments.filter(
                    (a) => a.kind === "DEDUCTION" && !a.preTax,
                  ),
                ),
              },
            }
          : null,
        loading: false,
        error: null,
        connected: false,
      });
      return;
    }

    const mine = ++ticket.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.forEmployee(employeeId, parsed);
      if (mine !== ticket.current) return;
      setState({ data, loading: false, error: null, connected: true });
    } catch (error) {
      if (mine !== ticket.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        connected: true,
        error: error instanceof ApiError ? error : null,
      }));
    }
    /* As above: `can` is not a dependency. See the note in `usePayComponents`
       — it is a new function on every render and would loop this hook. */
  }, [employeeId, isConnected, isLoading, key]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  const guard = useCallback(
    (what: string) => {
      if (!isConnected) refuse(what);
    },
    [isConnected],
  );

  return {
    ...state,
    /** Assign and remove. Needs EDIT_RECORDS. */
    editable: state.connected && can("EDIT_RECORDS"),
    reload: load,

    assign: useCallback(
      async (body: AssignBody) => {
        guard("Adding a line to somebody's pay");
        if (!employeeId) throw new Error("No employee");
        const created = await api.assign(employeeId, body);
        await load();
        return created;
      },
      [employeeId, guard, load],
    ),

    updateAssignment: useCallback(
      async (id: string, body: UpdateAssignmentBody) => {
        guard("Changing a line on somebody's pay");
        const updated = await api.updateAssignment(id, body);
        await load();
        return updated;
      },
      [guard, load],
    ),

    /** Ends the window; only deletes the row if it had not started yet. */
    remove: useCallback(
      async (id: string) => {
        guard("Stopping a line on somebody's pay");
        const result = await api.removeAssignment(id);
        await load();
        return result;
      },
      [guard, load],
    ),
  };
}

/* ================================================== the take-home preview */

export type PreviewChange = {
  addComponentId?: string;
  addAmountKobo?: number;
  addRate?: number;
  dropAssignmentId?: string;
};

export type PreviewState = {
  data: ApiPreview | null;
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode: the engine that answers this lives on the server. */
  available: boolean;
  /** Ask again without changing what is being asked — after a save. */
  reload: () => void;
};

/**
 * One person's payslip on their live components — and, with a change, beside it.
 *
 * The single most useful call in the module. Every figure comes from the same
 * engine the payroll run uses, so "adds ₦12,486.40 to their take-home" is a
 * statement about what will actually be paid rather than an estimate.
 *
 * Callers debounce the amount they are typing. This hook does not: a debounce
 * inside it would apply to the component picker too, which should answer
 * immediately.
 */
export function usePayPreview(
  employeeId: string | null,
  change: PreviewChange = {},
  options: { period?: string; unpaidDays?: number } = {},
) {
  const { isConnected, isLoading } = useSession();

  /**
   * The answer, carrying the request it belongs to.
   *
   * Keeping the key beside the data is what makes `loading` **derived** rather
   * than tracked: we are loading exactly while the request in hand has no
   * matching answer yet. That removes the "set loading true, fire, set loading
   * false" dance, and with it the class of bug where a slow answer for
   * ₦50,000 lands after a fast one for ₦75,000 and is shown against it.
   */
  const [result, setResult] = useState<{
    key: string;
    data: ApiPreview | null;
    error: ApiError | null;
  } | null>(null);

  /* Bumped by `reload`, and part of the key — so asking again after a save
     changes the request without changing what is being asked. */
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify({ ...change, ...options, nonce });

  /* Null offline, which keeps the demo path out of the request entirely: there
     is no engine in the browser to run, so there is nothing to ask. */
  const wanted = isConnected && !isLoading ? employeeId : null;

  useEffect(() => {
    if (!wanted) return;

    const parsed = JSON.parse(key) as PreviewChange & {
      period?: string;
      unpaidDays?: number;
    };
    const params: PreviewParams = {
      ...(parsed.period ? { period: parsed.period } : {}),
      ...(parsed.unpaidDays === undefined
        ? {}
        : { unpaidDays: parsed.unpaidDays }),
      ...(parsed.addComponentId
        ? { addComponentId: parsed.addComponentId }
        : {}),
      ...(parsed.addAmountKobo === undefined
        ? {}
        : { addAmountKobo: parsed.addAmountKobo }),
      ...(parsed.addRate === undefined ? {} : { addRate: parsed.addRate }),
      ...(parsed.dropAssignmentId
        ? { dropAssignmentId: parsed.dropAssignmentId }
        : {}),
    };

    /* Aborted on the way out. This hook is called on every debounced keystroke
       of an amount, and a request for a figure nobody is looking at any more is
       bandwidth spent on a wrong answer. */
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const data = await api.preview(wanted, params, controller.signal);
        if (!cancelled) setResult({ key, data, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setResult({
            key,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [wanted, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    return {
      data: null,
      loading: false,
      error: null,
      available: false,
      reload,
    };
  }

  const matched = result !== null && result.key === key;
  return {
    data: matched ? result.data : null,
    error: matched ? result.error : null,
    loading: wanted !== null && !matched,
    available: true,
    reload,
  };
}

/* --------------------------------------------------------------- totals */

/** What the library costs across everyone on it. Read from the rows in hand. */
export function usePayComponentTotals(rows: ApiPayComponent[]) {
  return useMemo(
    () => ({
      allowances: rows.filter(
        (row) => row.kind === "ALLOWANCE" && !row.archived,
      ).length,
      deductions: rows.filter(
        (row) => row.kind === "DEDUCTION" && !row.archived,
      ).length,
      switchedOff: rows.filter((row) => !row.active && !row.archived).length,
      assignments: rows.reduce((total, row) => total + row.assignmentCount, 0),
    }),
    [rows],
  );
}
