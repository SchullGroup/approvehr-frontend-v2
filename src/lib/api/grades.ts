"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { Band, BandPlacement } from "@/lib/grades/band";

/**
 * Salary grades — `/api/v1/grades`.
 *
 * Typed wrappers only, hand-written in the same style as `endpoints.ts`.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one says
 * so in its name. The two functions at the bottom of this file are the whole
 * boundary: `naira()` on the way to a screen, `kobo()` on the way back from a
 * form. Nothing else in this module or the store divides by 100, and no screen
 * should either — a band edge that has been through a float is a band edge that
 * no longer matches the offer letter quoting it.
 *
 * ## `GET /:id/employees` does not carry the grade
 *
 * The route serialises through the API's `page()` helper, which answers
 * `{ data: rows, meta }` — so the `grade` the service assembles alongside the
 * rows never reaches the wire, whatever the route table says. Not a problem
 * worth a backend change: every caller here already holds the grade it clicked,
 * and passing the band down beats re-reading it. Recorded because the shape of
 * the response is otherwise a surprise.
 */

/* ------------------------------------------------------------------- shapes */

/** A grade row, as the list and detail endpoints return it. */
export type ApiGrade = Band & {
  id: string;
  code: string;
  name: string;
  /** Rank. Orders the ladder; not derived from `code`. */
  level: number;
  /** `max - min`. Zero is legal — a single-point grade — and callers must cope. */
  bandWidthKobo: number;
  /** Active people on it. Archived employees are not counted. */
  employees: number;
  monthlyPayrollKobo: number;
  /** How many of its people sit outside their own band. The actionable number. */
  outsideBand: number;
  archived: boolean;
};

/** Enough of a grade to name it and link to it. */
export type ApiGradeRef = {
  id: string;
  code: string;
  name: string;
  level: number;
};

export type ApiGradeDetail = ApiGrade & {
  /** Resolved by level, so a promotion screen never pages the list. */
  oneGradeDown: ApiGradeRef | null;
  oneGradeUp: ApiGradeRef | null;
};

export type ApiGradeEmployee = {
  id: string;
  employeeNo: string;
  /** Already joined by the API. One name, not two fields. */
  name: string;
  jobTitle: string;
  grossMonthlyKobo: number;
  position: BandPlacement;
};

/**
 * `GET /position/:employeeId`.
 *
 * `grade: null` with `position: null` is a **200**, not a 404: somebody on no
 * grade is a state, and the screen's answer to it is a button putting them on
 * one. Callers must handle the null pair rather than treating it as a failure.
 */
export type ApiBandPosition = {
  employee: {
    id: string;
    employeeNo: string;
    name: string;
    jobTitle: string;
    grossMonthlyKobo: number;
  };
  grade: (ApiGradeRef & Band & { archived: boolean; bandWidthKobo: number }) | null;
  position: BandPlacement | null;
};

/** One person's line in a grade-wide rise. */
export type ApiIncreaseLine = {
  id: string;
  employeeNo: string;
  name: string;
  currentGrossKobo: number;
  newGrossKobo: number;
  increaseKobo: number;
  /** True when the rise takes them past the top of their own band. */
  leavesBandAbove: boolean;
};

/**
 * The answer to `POST /:id/apply-increase`, in both passes.
 *
 * `applied` is the field that matters. `false` means this was the preview and
 * **nothing was written** — same shape, same totals, no side effect. There is
 * deliberately no separate preview endpoint: one shape means a screen cannot
 * render a preview using a code path that has never seen the real thing.
 */
export type ApiIncreaseResult = {
  grade: ApiGradeRef & Band;
  basis: IncreaseBasis;
  percent?: number;
  amountKobo?: number;
  employees: number;
  lines: ApiIncreaseLine[];
  totals: {
    currentMonthlyKobo: number;
    newMonthlyKobo: number;
    monthlyIncreaseKobo: number;
    /** Twelve months of the same rise. What a business actually decides against. */
    annualIncreaseKobo: number;
  };
  /** How many end up above the top of their band. Surfaced, not refused. */
  leavingBand: number;
  applied: boolean;
  appliedCount: number;
  note: string;
};

export type IncreaseBasis = "PERCENT" | "AMOUNT";

/* -------------------------------------------------------------------- input */

export type GradeListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  /** Allow-list: level | code | name | minGross | maxGross | createdAt. */
  sort?: "level" | "code" | "name" | "minGross" | "maxGross" | "createdAt";
  order?: "asc" | "desc";
  includeArchived?: boolean;
};

export type GradeEmployeeParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: "grossMonthly" | "firstName" | "lastName" | "employeeNo" | "jobTitle";
  order?: "asc" | "desc";
};

export type CreateGradeBody = {
  code: string;
  name: string;
  level: number;
  minGrossKobo: number;
  midGrossKobo: number;
  maxGrossKobo: number;
};

export type UpdateGradeBody = Partial<CreateGradeBody>;

/**
 * A grade-wide rise.
 *
 * `confirm` is required here even though the API defaults it to `false`. The
 * default is the API's safety net; making the field mandatory on this side means
 * no call site can *forget* which pass it is asking for, and a reader of the call
 * can see it. Exactly one of `percent` / `amountKobo`, matching `basis`.
 */
export type ApplyIncreaseBody = {
  basis: IncreaseBasis;
  percent?: number;
  amountKobo?: number;
  confirm: boolean;
  note?: string;
};

/* -------------------------------------------------------------------- calls */

export const grades = {
  list: (params: GradeListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGrade>("/grades", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
        order: params.order,
        /* The API reads this as the string "true"/"false", not a boolean. */
        includeArchived: params.includeArchived ? "true" : undefined,
      },
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiGradeDetail>(`/grades/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** Paginated. See the note above: the grade is not in the envelope. */
  employees: (
    id: string,
    params: GradeEmployeeParams = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiGradeEmployee>(`/grades/${id}/employees`, {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
        order: params.order,
      },
      ...(signal ? { signal } : {}),
    }),

  position: (employeeId: string, signal?: AbortSignal) =>
    request<ApiBandPosition>(`/grades/position/${employeeId}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateGradeBody) =>
    request<ApiGradeDetail>("/grades", { method: "POST", body }),

  update: (id: string, body: UpdateGradeBody) =>
    request<ApiGradeDetail>(`/grades/${id}`, { method: "PATCH", body }),

  /** Archive, not delete. Refuses with a 409 while anyone is on it. */
  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(`/grades/${id}`, {
      method: "DELETE",
    }),

  restore: (id: string) =>
    request<ApiGradeDetail>(`/grades/${id}/restore`, { method: "POST" }),

  /**
   * One endpoint, two passes.
   *
   * `confirm: false` prices the rise and writes nothing. `confirm: true` re-reads
   * current pay on the server and redoes the arithmetic, so a preview left open
   * for five minutes cannot undo an individual rise granted in the meantime —
   * which is why the confirmed call sends the same body again rather than the
   * lines it was shown.
   */
  applyIncrease: (id: string, body: ApplyIncreaseBody) =>
    request<ApiIncreaseResult>(`/grades/${id}/apply-increase`, {
      method: "POST",
      body,
    }),
};

export type PagedGrades = Paged<ApiGrade>;
export type PagedGradeEmployees = Paged<ApiGradeEmployee>;

/* --------------------------------------------------------------- the money */

/**
 * Kobo to naira, for the screen. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract and a
 * fractional one means something upstream is already wrong — rounding it here
 * keeps the display honest instead of rendering ₦1,234.5678.
 */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/** Naira to kobo, for a form. The only multiplication by 100 on this side. */
export const kobo = (amount: number): number => Math.round(amount * 100);
