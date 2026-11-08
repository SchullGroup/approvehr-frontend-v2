"use client";

import { requestPaged, type Paged } from "@/lib/api/client";

/**
 * The weekly delivery report: `/api/v1/delivery-report`.
 *
 * What was logged against objectives in one week, and how it was graded. The
 * data is the weekly tasks people already log under Performance; this adds no
 * new record and no new visibility. It is not wellness data and carries none of
 * that module's privacy rules, but it sits behind the same company switch
 * (`wellness`), so a screen for it lives in the Wellness frame.
 *
 * ## Who is in it is the API's decision, and this file does not second-guess it
 *
 * Everybody gets their own week (`me`). A line manager gets their direct reports
 * and the head of a department the people in it (`scope: "REPORTS"`); whoever
 * holds `EDIT_RECORDS` gets everybody (`scope: "ALL"`). Everybody else gets
 * `scope: null`, no rows and no summary. A screen decides what to draw from
 * `scope`, never from a permission it holds: the permission is not what the API
 * went by, and a screen that guessed from it could draw a team the API did not
 * send or hide one it did.
 *
 * ## The rate
 *
 * Done is a point, partly done is half, and rejected and not done are nothing
 * and stay in the count. It is taken over what has been **graded**, and ungraded
 * tasks are counted beside it, not in it. With nothing graded it is `null`, which
 * is not a zero: a week nobody has reviewed is not a week of nothing done. A real
 * 0 is something graded and not done. `rate` is a whole percentage.
 *
 * ## Nothing here ranks anybody
 *
 * The rows come back by name, and that is the only order there is. There is no
 * sort parameter and none should be added.
 */

/** A person's week, or the whole company's, counted by what happened to each task. */
export type ApiDeliveryCounts = {
  /** Tasks the person logged. Graded and not yet graded together. */
  logged: number;
  completed: number;
  partial: number;
  notCompleted: number;
  rejected: number;
  /** Logged and not yet looked at by a grader. A reviewer's backlog, not a mark. */
  ungraded: number;
  /** A whole percentage over what is graded, or `null` with nothing graded. */
  rate: number | null;
};

export type ApiDeliveryRow = ApiDeliveryCounts & {
  /** For a stable key only. Never sent anywhere. */
  employeeId: string;
  name: string;
};

export type ApiDeliveryScope = "ALL" | "REPORTS";

export type ApiDeliverySummary = {
  /** People who logged something. */
  people: number;
  logged: number;
  graded: number;
  /** Pooled over everything graded. `null` with nothing graded. */
  rate: number | null;
};

export type ApiDeliveryMeta = {
  week: {
    /** The Monday, `YYYY-MM-DD`. */
    start: string;
    /** The Sunday. */
    end: string;
    /** The week has ended. */
    closed: boolean;
  };
  /** The caller's own week. `null` for a sign-in with no staff record. */
  me: ApiDeliveryCounts | null;
  /** `null`: the caller leads nobody, and gets no team. */
  scope: ApiDeliveryScope | null;
  summary: ApiDeliverySummary | null;
  /** People in scope who logged nothing. `null` when there is no scope. */
  silent: number | null;
};

export type ApiDeliveryReport = Paged<ApiDeliveryRow, ApiDeliveryMeta>;

export const deliveryReportApi = {
  /**
   * One week. `weekStart` is any date in it, read as that Monday to Sunday;
   * left out, this week. A week with nothing logged is an empty answer, not an
   * error, and asking does not open it.
   */
  report: (
    query: { weekStart?: string; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<ApiDeliveryReport> =>
    requestPaged<ApiDeliveryRow, ApiDeliveryMeta>("/delivery-report", {
      query,
      ...(signal ? { signal } : {}),
    }),
};

/* ----------------------------------------------------------------- reading */

/** Tasks somebody has graded: the four outcomes, which is what a rate is over. */
export function gradedCount(counts: ApiDeliveryCounts): number {
  return (
    counts.completed + counts.partial + counts.notCompleted + counts.rejected
  );
}

/**
 * A rate as it is read: `63%`, or the sentence for no rate.
 *
 * A single place for the absence, so no screen prints `0%` for a week nobody has
 * graded. A graded week that came to nothing is a real `0%` and is printed as one.
 */
export function rateText(rate: number | null): string {
  return rate === null ? "Nothing graded yet" : `${String(rate)}%`;
}
