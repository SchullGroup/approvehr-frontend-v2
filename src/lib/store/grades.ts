"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  grades as api,
  type ApiBandPosition,
  type ApiGrade,
  type ApiGradeEmployee,
  type ApiIncreaseLine,
  type ApiIncreaseResult,
  type ApplyIncreaseBody,
  type CreateGradeBody,
  type GradeListParams,
  type UpdateGradeBody,
} from "@/lib/api/grades";
import { bandPositionOf, type Band } from "@/lib/grades/band";
import { EMPLOYEES } from "@/lib/mock/people";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Salary grades, from whichever source is available.
 *
 * Same two modes as every other store: the API when it answers, the seed data
 * when it does not. What differs here is **where the line is drawn in demo
 * mode**, and it is drawn deliberately:
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read the ladder, the bands, who is on them | yes | yes, derived from the seed |
 * | Band position, out-of-band counts | yes | yes — the arithmetic is pure |
 * | Price a rise (the preview) | yes | yes — a preview writes nothing anywhere |
 * | Apply a rise, add or edit a grade | yes | **refused, with a reason** |
 *
 * Pricing a rise locally is not a pretence: the preview pass writes nothing on
 * the server either, and the numbers come from the same function the API uses.
 * Applying one is different — it changes what named people are paid, and a pay
 * figure kept in browser storage would never reach a payroll run. So that half
 * refuses rather than lying, the way `store/departments.ts` refuses to build an
 * org tree nobody will ever be paid against.
 *
 * The upside is that the interaction worth demonstrating — preview first, confirm
 * second — is demonstrable on a laptop with no database, which is the whole
 * reason demo mode exists.
 */

/* --------------------------------------------------------------- the demo */

const NAIRA = 100;

/**
 * A four-rung ladder for the seed company.
 *
 * Declared, not derived. A band is a policy decision — what the company has
 * decided a job is worth — so inferring bands from what people already earn
 * would teach the demo's audience the wrong thing about which direction the
 * causation runs. What *is* derived is who sits on which rung, below.
 */
const DEMO_LADDER: { code: string; name: string; level: number; band: Band }[] = DEMO_ENABLED ? [
  {
    code: "G1",
    name: "Associate",
    level: 1,
    band: {
      minGrossKobo: 600_000 * NAIRA,
      midGrossKobo: 700_000 * NAIRA,
      maxGrossKobo: 850_000 * NAIRA,
    },
  },
  {
    code: "G2",
    name: "Senior",
    level: 2,
    band: {
      minGrossKobo: 900_000 * NAIRA,
      midGrossKobo: 1_100_000 * NAIRA,
      maxGrossKobo: 1_300_000 * NAIRA,
    },
  },
  {
    code: "G3",
    name: "Lead",
    level: 3,
    band: {
      minGrossKobo: 1_300_000 * NAIRA,
      midGrossKobo: 1_600_000 * NAIRA,
      maxGrossKobo: 1_900_000 * NAIRA,
    },
  },
  {
    code: "G4",
    name: "Head of function",
    level: 4,
    band: {
      minGrossKobo: 1_900_000 * NAIRA,
      midGrossKobo: 2_300_000 * NAIRA,
      maxGrossKobo: 2_700_000 * NAIRA,
    },
  },
] : [];

const demoId = (code: string) => `demo-grade-${code.toLowerCase()}`;

/**
 * Which rung a seed employee lands on: the grade whose **midpoint** is nearest
 * their pay.
 *
 * That is how a company actually maps an existing payroll onto a new band
 * structure, and it has a property worth having in a demo — it puts one person
 * (₦890,000 against a band topping out at ₦850,000) above the top of their own
 * band, so the out-of-band case the API deliberately does not clamp is visible
 * on screen instead of theoretical.
 */
function demoGradeFor(grossMonthly: number): (typeof DEMO_LADDER)[number] {
  const grossKobo = Math.round(grossMonthly * NAIRA);
  let best = DEMO_LADDER[0]!;
  let bestGap = Math.abs(grossKobo - best.band.midGrossKobo);
  for (const rung of DEMO_LADDER.slice(1)) {
    const gap = Math.abs(grossKobo - rung.band.midGrossKobo);
    if (gap < bestGap) {
      best = rung;
      bestGap = gap;
    }
  }
  return best;
}

type DemoPerson = {
  gradeCode: string;
  row: ApiGradeEmployee;
  employeeId: string;
};

function demoPeople(): DemoPerson[] {
  /* Only people with an agreed figure. A grade is a pay range, so somebody whose
     pay is not set is not on a rung — and a nullable rung would mean every
     reader of this store had to answer "which grade is nobody in". They are
     absent from the register, which is the honest answer, and payroll is where
     their missing pay is named. */
  return EMPLOYEES.filter((e) => e.grossMonthly !== null).map((employee) => {
    const rung = demoGradeFor(employee.grossMonthly!);
    const grossMonthlyKobo = Math.round(employee.grossMonthly! * NAIRA);
    return {
      gradeCode: rung.code,
      employeeId: employee.id,
      row: {
        id: employee.id,
        employeeNo: employee.employeeNo,
        name: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        grossMonthlyKobo,
        position: bandPositionOf(grossMonthlyKobo, rung.band),
      },
    };
  });
}

function demoGrades(): ApiGrade[] {
  const people = demoPeople();
  return DEMO_LADDER.map((rung) => {
    const mine = people.filter((person) => person.gradeCode === rung.code);
    return {
      id: demoId(rung.code),
      code: rung.code,
      name: rung.name,
      level: rung.level,
      ...rung.band,
      bandWidthKobo: rung.band.maxGrossKobo - rung.band.minGrossKobo,
      employees: mine.length,
      monthlyPayrollKobo: mine.reduce((sum, p) => sum + p.row.grossMonthlyKobo, 0),
      outsideBand: mine.filter((p) => !p.row.position.withinBand).length,
      archived: false,
    };
  });
}

/** Refusals carry the reason, in the words the screen shows. */
function refuse(what: string): never {
  throw new ApiError(
    0,
    "offline",
    `${what} needs the API. Pay set against a band in this browser would ` +
      `never reach a payroll run, so the demo will not pretend it has.`,
  );
}

/* --------------------------------------------------------------- the ladder */

export type GradesState = {
  rows: ApiGrade[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** True when the API is answering. False means demo data, read-only. */
  connected: boolean;
};

const LOADING: GradesState = {
  rows: [],
  total: 0,
  loading: true,
  error: null,
  connected: false,
};

/**
 * The grade table, plus every write.
 *
 * `params` is serialised into the effect key rather than compared by reference,
 * because a caller passing `{ q: search }` inline hands over a new object on
 * every keystroke's render. The request ticket beside it guards the other half
 * of the same problem: a slow answer for "eng" must not overwrite a fast one for
 * "engineering".
 *
 * The demo branch is computed **during render**, not in an effect. Same reason
 * `lib/store/employees-api.ts` does it: the seed ladder is a pure function of the
 * query, so setting state for it would cascade a second render to arrive at a
 * value the first one could already have had.
 *
 * ## `can` is not a dependency, and must never become one
 *
 * `useSession().can` is rebuilt on every render, so putting it in `load`'s
 * dependency array gives `load` a new identity every render, which re-runs the
 * effect, which sets state, which renders again — an infinite request loop that
 * only shows up in a browser. It cost a rate-limited dev API to find. `editable`
 * is therefore derived at return time and is not part of the fetched state,
 * which is where it belonged anyway: it is a fact about the account, not about
 * the response.
 */
export function useGrades(params: GradeListParams = {}) {
  const { isConnected, isLoading, can } = useSession();
  const [state, setState] = useState<GradesState>(LOADING);
  const key = JSON.stringify(params);
  const ticket = useRef(0);

  /**
   * The salary ladder is `MANAGE_PAY_STRUCTURE`, and the whole router is behind
   * it — see `modules/grades/router.ts`, which puts `requirePermissions` on the
   * router rather than per route.
   *
   * Asking anyway is what every role except Administrator was doing. `/people/[id]`
   * reads this on every record it opens, so an HR manager — who edits records all
   * day and holds `EDIT_RECORDS` but not this — met a 403 and a red console line
   * on every single person they looked at. The band picker was empty either way;
   * the only thing the request achieved was noise, and noise on every page teaches
   * people that a red console is normal.
   *
   * The empty state is derived at **return time**, not written with `setState`,
   * for the same reason `editable` below is: it is a fact about the account, not
   * about a response, and `load` never running would otherwise leave `loading`
   * true for ever. `mayRead` is a boolean rather than `can` itself, so putting it
   * in the dependency array is safe — see the warning above, which is about the
   * function's identity changing every render, not about the permission.
   *
   * Empty rather than an error is the honest shape: there is no ladder to show
   * this reader, and nothing went wrong. `rows: []` makes `currentGrade`
   * undefined and the picker offer nothing, which is what it should offer
   * somebody who may not set a band.
   */
  /* Reads take VIEW_SALARIES **or** MANAGE_PAY_STRUCTURE
     (`modules/grades/router.ts`): reading a band and setting the company pay
     structure are different acts. HR manager, Payroll analyst and Finance
     approver hold the first and none holds the second, so the narrower gate
     emptied the band picker for exactly the people whose job involves pay.
     Line managers and employees still see nothing, which is the point. */
  const mayRead = can("VIEW_SALARIES") || can("MANAGE_PAY_STRUCTURE");

  const load = useCallback(async () => {
    if (isLoading || !isConnected || !mayRead) return;

    const mine = ++ticket.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.list(JSON.parse(key) as GradeListParams);
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
  }, [isConnected, isLoading, key, mayRead]);

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

  const create = useCallback(
    async (body: CreateGradeBody) => {
      guard("Adding a grade");
      const grade = await api.create(body);
      await load();
      return grade;
    },
    [guard, load],
  );

  const update = useCallback(
    async (id: string, body: UpdateGradeBody) => {
      guard("Editing a grade");
      const grade = await api.update(id, body);
      await load();
      return grade;
    },
    [guard, load],
  );

  const archive = useCallback(
    async (id: string) => {
      guard("Archiving a grade");
      const result = await api.archive(id);
      await load();
      return result;
    },
    [guard, load],
  );

  const restore = useCallback(
    async (id: string) => {
      guard("Restoring a grade");
      const grade = await api.restore(id);
      await load();
      return grade;
    },
    [guard, load],
  );

  const demoRows = useMemo(() => {
    const parsed = JSON.parse(key) as GradeListParams;
    const needle = parsed.q?.trim().toLowerCase();
    return demoGrades().filter(
      (row) =>
        !needle ||
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle),
    );
  }, [key]);

  const writes = { reload: load, create, update, archive, restore };

  if (!isConnected) {
    /* Demo mode: the ladder is derived from the seed and read-only. `loading`
       stays true while the session is still deciding, so a demo ladder never
       flashes at somebody who turns out to be signed in to the API. */
    return {
      rows: isLoading ? [] : demoRows,
      total: isLoading ? 0 : demoRows.length,
      loading: isLoading,
      error: null,
      connected: false,
      editable: false,
      ...writes,
    };
  }

  if (!mayRead) {
    return {
      rows: [],
      total: 0,
      loading: false,
      error: null,
      connected: true,
      editable: false,
      ...writes,
    };
  }

  return { ...state, editable: can("MANAGE_PAY_STRUCTURE"), ...writes };
}

/* ------------------------------------------------------- who is on a grade */

/**
 * The people on one grade, each with their position in it.
 *
 * Takes the band as an argument rather than re-reading the grade: the caller
 * always has the row it clicked, and `GET /:id/employees` does not actually put
 * the grade in its envelope (see the note in `lib/api/grades.ts`). One less
 * request and one less way for the meter to be drawn against a different band
 * than the row above it.
 */
export function useGradeEmployees(gradeId: string | null, band: Band | null) {
  const { isConnected, isLoading } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    rows: ApiGradeEmployee[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  const active = gradeId !== null && band !== null && !isLoading;
  const wanted = isConnected ? gradeId : null;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.employees(wanted, { pageSize: 200 });
        if (!cancelled) {
          setFetched({
            id: wanted,
            rows: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFetched({
            id: wanted,
            rows: [],
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wanted, revalidation]);

  const demoRows = useMemo(() => {
    if (isConnected || !gradeId) return [];
    const code = DEMO_LADDER.find((rung) => demoId(rung.code) === gradeId)?.code;
    return demoPeople()
      .filter((person) => person.gradeCode === code)
      .map((person) => person.row)
      .sort((a, b) => a.grossMonthlyKobo - b.grossMonthlyKobo);
  }, [isConnected, gradeId]);

  if (!isConnected) {
    return {
      rows: active ? demoRows : [],
      total: active ? demoRows.length : 0,
      error: null,
      loading: gradeId !== null && !active,
    };
  }

  /* Matched on the id it was fetched for, so a slow answer for a grade you have
     already closed cannot be shown, and there is nothing to clear on change. */
  const matched = active && fetched !== null && fetched.id === gradeId;
  return {
    rows: matched ? fetched.rows : [],
    total: matched ? fetched.total : 0,
    error: matched ? fetched.error : null,
    loading: active && !matched,
  };
}

/* ------------------------------------------------------------ band position */

/**
 * Where one person sits in their band.
 *
 * `grade: null` is a state, not a failure — it means nobody has put them on a
 * grade — and this hook passes that through untouched rather than turning it
 * into an error, because the two want different things on screen.
 */
export function useBandPosition(employeeId: string | null) {
  const { isConnected, isLoading } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    data: ApiBandPosition | null;
    error: ApiError | null;
  } | null>(null);

  const active = employeeId !== null && !isLoading;
  const wanted = isConnected ? employeeId : null;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await api.position(wanted);
        if (!cancelled) setFetched({ id: wanted, data, error: null });
      } catch (error) {
        if (!cancelled) {
          setFetched({
            id: wanted,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wanted, revalidation]);

  /**
   * The demo answer, derived rather than fetched.
   *
   * `null` for an id the seed does not hold — which is exactly what happens to a
   * record created in another browser — and the component renders that as "not
   * on a grade" rather than as a failure.
   */
  const demo = useMemo((): ApiBandPosition | null => {
    if (isConnected || !employeeId) return null;
    const employee = EMPLOYEES.find((e) => e.id === employeeId);
    if (!employee) return null;
    /* No agreed pay, no position in a band: "below the floor" would be a claim
       about a figure nobody has set. The API refuses this with a message; the
       demo has no panel to put one in, so it shows nothing. */
    if (employee.grossMonthly === null) return null;
    const rung = demoGradeFor(employee.grossMonthly);
    const grossMonthlyKobo = Math.round(employee.grossMonthly! * NAIRA);
    return {
      employee: {
        id: employee.id,
        employeeNo: employee.employeeNo,
        name: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        grossMonthlyKobo,
      },
      grade: {
        id: demoId(rung.code),
        code: rung.code,
        name: rung.name,
        level: rung.level,
        ...rung.band,
        bandWidthKobo: rung.band.maxGrossKobo - rung.band.minGrossKobo,
        archived: false,
      },
      position: bandPositionOf(grossMonthlyKobo, rung.band),
    };
  }, [isConnected, employeeId]);

  if (!isConnected) {
    return {
      data: active ? demo : null,
      error: null,
      loading: employeeId !== null && !active,
      connected: false,
    };
  }

  const matched = active && fetched !== null && fetched.id === employeeId;
  return {
    data: matched ? fetched.data : null,
    error: matched ? fetched.error : null,
    loading: active && !matched,
    connected: true,
  };
}

/* ---------------------------------------------------------- the pay rise */

export type IncreaseDraft = {
  basis: "PERCENT" | "AMOUNT";
  /** 7.5 means 7.5%. Two decimal places at most. */
  percent: number;
  /** Kobo. A flat amount added to everyone on the grade. */
  amountKobo: number;
  note: string;
};

/**
 * Price a grade-wide rise, then apply it.
 *
 * Two functions, never one. `preview` is safe to call as often as a form
 * changes; `apply` is the only thing that writes, it takes the same draft rather
 * than the preview's figures, and it is reachable only from a screen already
 * showing that preview.
 *
 * In demo mode `preview` computes locally with the same arithmetic — kobo,
 * rounded once — and `apply` refuses.
 */
export function useGradeIncrease() {
  const { isConnected, can } = useSession();
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  const localPreview = useCallback(
    (grade: ApiGrade, draft: IncreaseDraft): ApiIncreaseResult => {
      const code = DEMO_LADDER.find((rung) => demoId(rung.code) === grade.id)?.code;
      const rate = draft.basis === "PERCENT" ? draft.percent / 100 : 0;

      const lines: ApiIncreaseLine[] = demoPeople()
        .filter((person) => person.gradeCode === code)
        .map((person) => {
          const currentGrossKobo = person.row.grossMonthlyKobo;
          /* Rounded once, on the kobo figure — the same order the API's
             `rateOf` uses. Rounding per-naira and multiplying up is how a run
             ends up a few kobo out against the bank file. */
          const increaseKobo =
            draft.basis === "PERCENT"
              ? Math.round(currentGrossKobo * rate)
              : draft.amountKobo;
          const newGrossKobo = currentGrossKobo + increaseKobo;
          return {
            id: person.row.id,
            employeeNo: person.row.employeeNo,
            name: person.row.name,
            currentGrossKobo,
            newGrossKobo,
            increaseKobo,
            leavesBandAbove: newGrossKobo > grade.maxGrossKobo,
          };
        });

      const currentMonthlyKobo = lines.reduce((s, l) => s + l.currentGrossKobo, 0);
      const newMonthlyKobo = lines.reduce((s, l) => s + l.newGrossKobo, 0);
      const monthlyIncreaseKobo = newMonthlyKobo - currentMonthlyKobo;

      return {
        grade: {
          id: grade.id,
          code: grade.code,
          name: grade.name,
          level: grade.level,
          minGrossKobo: grade.minGrossKobo,
          midGrossKobo: grade.midGrossKobo,
          maxGrossKobo: grade.maxGrossKobo,
        },
        basis: draft.basis,
        ...(draft.basis === "PERCENT"
          ? { percent: draft.percent }
          : { amountKobo: draft.amountKobo }),
        employees: lines.length,
        lines,
        totals: {
          currentMonthlyKobo,
          newMonthlyKobo,
          monthlyIncreaseKobo,
          annualIncreaseKobo: monthlyIncreaseKobo * 12,
        },
        leavingBand: lines.filter((l) => l.leavesBandAbove).length,
        applied: false,
        appliedCount: 0,
        note: "",
      };
    },
    [],
  );

  const bodyFor = (draft: IncreaseDraft, confirm: boolean): ApplyIncreaseBody => ({
    basis: draft.basis,
    ...(draft.basis === "PERCENT"
      ? { percent: draft.percent }
      : { amountKobo: draft.amountKobo }),
    confirm,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
  });

  return {
    busy,
    connected: isConnected,
    /**
     * Whether the *account* may move somebody's pay.
     *
     * True in demo mode, deliberately. There is no account there, so claiming a
     * permission problem would be the wrong reason on screen — and the button
     * has to stay pressable for the refusal to arrive where the decision is
     * made, rather than as a caveat above it. `apply` is what refuses.
     */
    canApply: isConnected ? can("MANAGE_PAY_STRUCTURE") && can("EDIT_RECORDS") : true,

    preview: useCallback(
      async (grade: ApiGrade, draft: IncreaseDraft): Promise<ApiIncreaseResult> => {
        setBusy("preview");
        try {
          if (!isConnected) {
            if (grade.employees === 0) {
              throw new ApiError(
                422,
                "unprocessable",
                `Nobody is on ${grade.code} ${grade.name}, so there is no pay to move.`,
              );
            }
            return localPreview(grade, draft);
          }
          return await api.applyIncrease(grade.id, bodyFor(draft, false));
        } finally {
          setBusy(null);
        }
      },
      [isConnected, localPreview],
    ),

    apply: useCallback(
      async (grade: ApiGrade, draft: IncreaseDraft): Promise<ApiIncreaseResult> => {
        if (!isConnected) refuse("Applying a pay rise");
        setBusy("apply");
        try {
          /* The draft goes up again, not the preview's lines. The server
             re-reads current pay and redoes the arithmetic, so an individual
             rise granted while this dialog was open is not silently undone. */
          return await api.applyIncrease(grade.id, bodyFor(draft, true));
        } finally {
          setBusy(null);
        }
      },
      [isConnected],
    ),
  };
}

/* ------------------------------------------------------------------ totals */

/** Head count, monthly cost and out-of-band count across a set of grades. */
export function useGradeTotals(rows: ApiGrade[]) {
  return useMemo(
    () => ({
      grades: rows.filter((row) => !row.archived).length,
      employees: rows.reduce((sum, row) => sum + row.employees, 0),
      monthlyPayrollKobo: rows.reduce((sum, row) => sum + row.monthlyPayrollKobo, 0),
      outsideBand: rows.reduce((sum, row) => sum + row.outsideBand, 0),
    }),
    [rows],
  );
}
