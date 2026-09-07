"use client";

import { ApiError } from "@/lib/api/client";
import { payrollApi, type ApiPayrollSettings } from "@/lib/api/payroll";
import { createSharedResource } from "@/lib/shared-resource";

/**
 * `GET /payroll/settings`, fetched once per session however many hooks ask.
 *
 * ## Two hooks were reading this endpoint independently
 *
 * `lib/store/payroll-deductions.ts` (what the company deducts) and
 * `lib/payroll/use-settings.ts` (the rates and the working month) each held
 * their own `useState` and their own `useEffect` against the same route. That
 * is four requests on `/payroll` alone, and the request count is the least of
 * it: **each also wrote its own PATCH response into its own state**, so saving
 * through one left the other rendering the previous answer with no way to know.
 * Two caches of one row is two answers about what a company deducts.
 *
 * One cache, and a write refreshes it for both. That is the whole reason this
 * module exists rather than the resource living inside either hook.
 *
 * ## The value is the outcome, not the row
 *
 * The fetcher resolves `{ settings, error }` rather than rejecting. A shared
 * resource caches what its fetcher resolves, so a rejection would arrive as
 * `null` — and `null` here does not read as "the request failed", it reads as
 * "nothing is deducted", which is a false claim about a company's payroll
 * rather than an empty state. The API's own sentence has to survive, so it
 * travels in the value.
 */

export type PayrollSettingsOutcome = {
  settings: ApiPayrollSettings | null;
  /** The API's own sentence, kept apart from the row so a caller can render it. */
  error: ApiError | null;
};

/**
 * The one key.
 *
 * There is a single answer per session; the permission decides whether it is
 * asked for at all, not which answer comes back — so it is not part of the key.
 */
export const PAYROLL_SETTINGS_KEY = "company";

export const payrollSettingsResource =
  createSharedResource<PayrollSettingsOutcome>(async (_key, signal) => {
    try {
      return { settings: await payrollApi.settings(signal), error: null };
    } catch (error) {
      /* An abort is the resource dropping the request, not an answer.
         Rethrowing keeps it out of the cache so the next subscriber starts a
         fresh load rather than inheriting a failure nobody experienced. */
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return {
        settings: null,
        error: error instanceof ApiError ? error : null,
      };
    }
  });

/**
 * Publish what a PATCH just returned, to every screen showing this row.
 *
 * The response **is** the new truth, so it is written into the shared cache
 * rather than re-read. Two things follow, and both are the point:
 *
 * - every other reader updates in the same tick, which is the correctness win
 *   this module exists for — before, each hook wrote the response into its own
 *   state and the others carried on rendering the previous answer;
 * - the screen that saved does not flash a loading state, which `refresh` would
 *   cause because it blanks the value before re-fetching.
 */
export function publishPayrollSettings(settings: ApiPayrollSettings): void {
  payrollSettingsResource.set(PAYROLL_SETTINGS_KEY, { settings, error: null });
}

/** Re-read from the server. For an explicit "try again" after a failed load. */
export function refreshPayrollSettings(): void {
  payrollSettingsResource.refresh(PAYROLL_SETTINGS_KEY);
}
