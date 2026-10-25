"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  payComponentsApi as api,
  type ApiSchedulePreview,
  type SchedulePreviewBody,
} from "@/lib/api/pay-components";
import { useDebounced } from "@/lib/use-debounced";
import { useSession } from "./session";

/**
 * The sentence, the refusals and the example dates for a schedule being typed.
 *
 * A computation over what the reader is typing, so it does not revalidate on
 * window focus (see `lib/revalidate.ts`): nobody else can change the answer to
 * "what would this schedule do for somebody who started on 15 March 2023".
 *
 * There is no demo answer, and it does not pretend to have one. When an
 * allowance falls due is decided by the API from the person's dates (one
 * function, shared with the payroll run), so a copy of that in a browser would
 * be a second opinion about money. Offline it reports **unavailable**, and the
 * form shows no example rather than an invented one.
 */

export type SchedulePreviewState = {
  /** Whether there is anything to ask: connected, and allowed to define one. */
  available: boolean;
  /** Asked for, not yet answered. */
  loading: boolean;
  /** The API's answer for **what is in the form now**, never for a keystroke ago. */
  data: ApiSchedulePreview | null;
  /** What the same body would be refused with on save, as data. */
  problems: { field: string; message: string }[];
  error: ApiError | null;
};

/**
 * Debounced, so a figure typed in two keystrokes is one request. And the answer
 * is matched against the **live** body, not the debounced one: debouncing alone
 * leaves the example for the previous keystroke on screen beside a field that
 * has already moved, which here would be a month the allowance will not be paid,
 * printed as though it were. Between a keystroke and the answer it reports
 * `loading` instead.
 *
 * Pass `null` when there is nothing to ask (a number that is not a number yet).
 */
export function useSchedulePreview(
  body: SchedulePreviewBody | null,
): SchedulePreviewState {
  const { isConnected, can } = useSession();
  const available = isConnected && can("MANAGE_PAY_STRUCTURE");
  const key = body ? JSON.stringify(body) : null;
  const settled = useDebounced(key, 300);
  const [answer, setAnswer] = useState<{
    key: string;
    data: ApiSchedulePreview | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!available || settled === null) return;
    const controller = new AbortController();
    let current = true;
    api
      .schedulePreview(
        JSON.parse(settled) as SchedulePreviewBody,
        controller.signal,
      )
      .then((data) => {
        if (current) setAnswer({ key: settled, data, error: null });
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setAnswer({
          key: settled,
          data: null,
          error: error instanceof ApiError ? error : null,
        });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [available, settled]);

  const mine = answer && key !== null && answer.key === key ? answer : null;
  return {
    available,
    loading: available && key !== null && mine === null,
    data: mine?.data ?? null,
    problems: mine?.data?.problems ?? [],
    error: mine?.error ?? null,
  };
}
