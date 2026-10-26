"use client";

import { useEffect, useMemo, useState } from "react";
import {
  payComponentsApi as api,
  type ApiScheduledAllowance,
  type ApiScheduledAllowances,
} from "@/lib/api/pay-components";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Which allowances fall due on an open payroll run, and which were held back,
 * per person.
 *
 * Offline there is no answer and no pretence of one: when an allowance falls due
 * is decided by the API from the person's dates, one function shared with the run
 * itself, so a copy of it in a browser would be a second opinion about money.
 *
 * Read again whenever the run is calculated again (`preparedAt` moves): it is a
 * live read of the schedule, not a payroll figure, and an answer for the
 * previous calculation must not sit beside the next one. The answer is held with
 * the key it was asked for and read only against the current key.
 *
 * It answers nothing for an approved, paid or cancelled run (`open: false`,
 * `people: []`): that run's payslips are the record of what was paid, and a
 * schedule that may have changed since is not.
 *
 * **A failed read is not "nothing held back".** Any failure reports unavailable
 * and the screen says nothing, which is the honest thing to say about a fact it
 * does not have.
 */

export type ScheduledAllowancesState = {
  /** The API answered. False offline, on an API that predates schedules, or without permission. */
  available: boolean;
  loading: boolean;
  /** Null until it has answered: unknown, which is not the same as "nobody". */
  answer: ApiScheduledAllowances | null;
  /** By employee. Only people with an allowance on a schedule are in it. */
  byEmployee: ReadonlyMap<string, readonly ApiScheduledAllowance[]>;
};

const NONE: ReadonlyMap<string, readonly ApiScheduledAllowance[]> = new Map();

export function useScheduledAllowances(
  runId: string | null,
  preparedAt: string | null,
): ScheduledAllowancesState {
  const { isConnected, can } = useSession();
  const allowed = isConnected && (can("RUN_PAYROLL") || can("VIEW_SALARIES"));
  const key = runId ? `${runId}:${preparedAt ?? ""}` : null;
  const revalidation = useRevalidation();
  const [held, setHeld] = useState<{
    key: string;
    answer: ApiScheduledAllowances | null;
  } | null>(null);

  useEffect(() => {
    if (!allowed || !runId || key === null) return;
    const controller = new AbortController();
    let current = true;
    api
      .scheduledForRun(runId, controller.signal)
      .then((answer) => {
        if (current) setHeld({ key, answer });
      })
      .catch(() => {
        if (current) setHeld({ key, answer: null });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [allowed, runId, key, revalidation]);

  const mine = held && held.key === key ? held : null;
  const answer = mine?.answer ?? null;
  const byEmployee = useMemo(() => {
    if (!answer) return NONE;
    return new Map(
      answer.people.map((person) => [person.employeeId, person.allowances]),
    );
  }, [answer]);

  return {
    available: allowed && answer !== null,
    loading: allowed && key !== null && mine === null,
    answer,
    byEmployee,
  };
}
