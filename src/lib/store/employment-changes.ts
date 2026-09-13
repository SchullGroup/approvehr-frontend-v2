"use client";

import { useCallback, useEffect } from "react";
import { ApiError } from "@/lib/api/client";
import {
  employees as employeesApi,
  type ApiEmploymentChangeRow,
  type EmploymentChangeBody,
} from "@/lib/api/endpoints";
import { createSharedResource } from "@/lib/shared-resource";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Promotions, transfers, regrades and pay changes in flight.
 *
 * ## Demo mode refuses every write, and the reason is specific
 *
 * The whole point of this feature is that an approved change is written on its
 * **effective date** and not before, by a sweep that runs in the API. There is
 * no sweep in a browser. A change agreed in demo mode would sit at `SCHEDULED`
 * for ever, or — worse — a local implementation would write it immediately and
 * teach exactly the behaviour this feature exists to prevent.
 *
 * The list refuses too, rather than showing an empty queue. Empty and
 * unavailable render identically and mean opposite things: "nobody is waiting
 * on you" is a claim, and it is one this mode cannot make. Same judgement
 * `useCycleRegister` makes about a cycle's register.
 */

type Outcome = { value: ApiEmploymentChangeRow[]; error: ApiError | null };

const inFlight = createSharedResource<Outcome>(async (_key, signal) => {
  try {
    return {
      value: await employeesApi.employmentChangesInFlight(signal),
      error: null,
    };
  } catch (error) {
    /* An abort is the resource dropping its own request, not an answer. */
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return { value: [], error: error instanceof ApiError ? error : null };
  }
});

/**
 * Split in two, and composed rather than written twice.
 *
 * A callout gets the heading and the reason separately, because a body that
 * restates its own heading is the thing the product owner has asked to stop
 * more than once. A thrown error gets the pair joined, because there it has to
 * stand alone in a toast with no heading above it.
 */
export const DEMO_CHANGE_HEADING = "Promotions and transfers need the API";

/** The non-obvious half: not "no server", but "nothing to run the sweep". */
export const DEMO_CHANGE_REASON =
  "A change is agreed on one day and written on another, by a job that runs " +
  "on the server — in a browser there is nothing to write it, so one agreed " +
  "here would never take effect.";

export const DEMO_CHANGE_REFUSAL = `${DEMO_CHANGE_HEADING}. ${DEMO_CHANGE_REASON}`;

export function useEmploymentChanges() {
  const { isConnected } = useSession();
  const outcome = inFlight.use(isConnected ? "in-flight" : null);

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || revalidation === 0) return;
    inFlight.refresh("in-flight");
  }, [isConnected, revalidation]);

  const reload = useCallback(() => inFlight.refresh("in-flight"), []);

  return {
    rows: outcome?.value ?? [],
    loading: isConnected && outcome === undefined,
    error: outcome?.error ?? null,
    /** True offline. The screen states the reason rather than showing nothing. */
    unavailable: !isConnected,
    reload,
  };
}

/**
 * The three writes.
 *
 * Each refreshes the queue afterwards. A decision visible on the record and not
 * in the queue it was taken from is two screens disagreeing about whether
 * somebody has been promoted.
 */
export function useEmploymentChangeActions() {
  const { isConnected } = useSession();

  const propose = useCallback(
    async (body: EmploymentChangeBody) => {
      if (!isConnected) throw new Error(DEMO_CHANGE_REFUSAL);
      const result = await employeesApi.proposeEmploymentChange(body);
      inFlight.refresh("in-flight");
      return result;
    },
    [isConnected],
  );

  const decide = useCallback(
    async (id: string, approve: boolean, note?: string) => {
      if (!isConnected) throw new Error(DEMO_CHANGE_REFUSAL);
      const result = await employeesApi.decideEmploymentChange(id, {
        approve,
        ...(note ? { note } : {}),
      });
      inFlight.refresh("in-flight");
      return result;
    },
    [isConnected],
  );

  const cancel = useCallback(
    async (id: string, note: string) => {
      if (!isConnected) throw new Error(DEMO_CHANGE_REFUSAL);
      const result = await employeesApi.cancelEmploymentChange(id, note);
      inFlight.refresh("in-flight");
      return result;
    },
    [isConnected],
  );

  return { propose, decide, cancel, readOnly: !isConnected };
}
