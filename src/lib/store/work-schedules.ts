"use client";

import { useCallback, useEffect, useState } from "react";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  attendanceApi,
  type ApiSpecialDay,
  type ApiWorkSchedule,
  type SpecialDayBody,
  type SpecialDayParams,
  type SpecialDayPatch,
  type WorkScheduleBody,
  type WorkSchedulePatch,
} from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Work schedules and special days: who works which hours, and the dates that
 * break the pattern.
 *
 * ## Connected only, and it says so
 *
 * There is no demo version of either, deliberately. Both are company settings
 * the roster, the clock card and the timesheet read **on the server**, and a
 * browser-only copy would show a Saturday crew on a screen while every roster in
 * the demo kept resting them. Nothing is invented offline: the hooks answer an
 * empty list, `available: false` and `editable: false`, and the screen leaves
 * the tabs out altogether instead of showing a control that cannot do anything.
 *
 * ## Shape
 *
 * `useAttendancePolicy` is the model. The read runs in an async IIFE inside an
 * effect behind a `cancelled` guard; whether it has answered is **derived** from
 * the key during render, never cleared in an effect. A write is followed by a
 * re-read rather than by trusting the body that was sent, because the API
 * decides what it stored — most of all for a schedule's people, which it
 * resolves to names and departments.
 *
 * `reload` bumps a counter that sits in the effect's dependency list and **not**
 * in the key, the same arrangement the roster uses: the new answer replaces the
 * old one when it lands, and the list somebody just saved from does not flash a
 * skeleton.
 *
 * `MANAGE_SETTINGS` on every write, the same permission `updatePolicy` needs:
 * this is when people are expected at work, not what they are paid for it.
 */

type ConnectedRead<T> = {
  /** Null until the first answer for this key. */
  value: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
};

/**
 * One read of the API, kept while the screen is on it. Does nothing offline.
 *
 * `key` names the question. It changes when the question does, and an answer to
 * an earlier question is not shown as the answer to this one.
 */
function useConnectedRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  key: string,
): ConnectedRead<T> {
  const { isConnected } = useSession();
  const [answer, setAnswer] = useState<{ key: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    error: ApiError;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ask = useStableCallback(read);

  /* Re-ask when somebody comes back to the window. Not in the key, so the
     answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const value = await ask(controller.signal);
        if (cancelled) return;
        setAnswer({ key, value });
        setFailure(null);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setFailure({
          key,
          error:
            caught instanceof ApiError
              ? caught
              : new ApiError(0, "unknown", "Could not read this."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key, attempt, revalidation, ask]);

  const value = answer !== null && answer.key === key ? answer.value : null;
  const error = failure !== null && failure.key === key ? failure.error : null;

  return {
    value,
    error,
    /* Derived, not tracked: connected with nothing for this key yet *is*
       loading. */
    loading: isConnected && value === null && error === null,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

/* ---------------------------------------------------------------- schedules */

export type WorkSchedulesState = {
  schedules: ApiWorkSchedule[];
  loading: boolean;
  error: ApiError | null;
  /** Whether there is an API to ask. False offline, where the tabs are not offered. */
  available: boolean;
  /** `MANAGE_SETTINGS`, and connected. Without it the list is read-only. */
  editable: boolean;
  reload: () => void;
  create: (body: WorkScheduleBody) => Promise<ApiWorkSchedule>;
  update: (id: string, patch: WorkSchedulePatch) => Promise<ApiWorkSchedule>;
  remove: (id: string) => Promise<void>;
};

const NO_SCHEDULES: ApiWorkSchedule[] = [];

export function useWorkSchedules(): WorkSchedulesState {
  const { isConnected } = useSession();
  const can = useCan("MANAGE_SETTINGS");
  const read = useConnectedRead(
    (signal) => attendanceApi.schedules(signal),
    "schedules",
  );
  const { reload } = read;

  const create = useCallback(
    async (body: WorkScheduleBody) => {
      const made = await attendanceApi.createSchedule(body);
      reload();
      return made;
    },
    [reload],
  );
  const update = useCallback(
    async (id: string, patch: WorkSchedulePatch) => {
      const saved = await attendanceApi.updateSchedule(id, patch);
      reload();
      return saved;
    },
    [reload],
  );
  const remove = useCallback(
    async (id: string) => {
      await attendanceApi.deleteSchedule(id);
      reload();
    },
    [reload],
  );

  return {
    schedules: read.value ?? NO_SCHEDULES,
    loading: read.loading,
    error: read.error,
    available: isConnected,
    editable: isConnected && can,
    reload,
    create,
    update,
    remove,
  };
}

/* -------------------------------------------------------------- special days */

export type SpecialDaysState = {
  /** As the API sent them. `orderSpecialDays` puts them in the order to show. */
  days: ApiSpecialDay[];
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  editable: boolean;
  reload: () => void;
  create: (body: SpecialDayBody) => Promise<ApiSpecialDay>;
  update: (id: string, patch: SpecialDayPatch) => Promise<ApiSpecialDay>;
  remove: (id: string) => Promise<void>;
};

const NO_DAYS: ApiSpecialDay[] = [];

/**
 * Special days, every one unless `params` narrows the dates.
 *
 * `params` is read by value, so an inline object does not re-ask on every render.
 */
export function useSpecialDays(
  params: SpecialDayParams = {},
): SpecialDaysState {
  const { isConnected } = useSession();
  const can = useCan("MANAGE_SETTINGS");
  const from = params.from;
  const to = params.to;
  const read = useConnectedRead(
    (signal) =>
      attendanceApi.specialDays(
        {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
        signal,
      ),
    `special-days|${from ?? ""}|${to ?? ""}`,
  );
  const { reload } = read;

  const create = useCallback(
    async (body: SpecialDayBody) => {
      const made = await attendanceApi.createSpecialDay(body);
      reload();
      return made;
    },
    [reload],
  );
  const update = useCallback(
    async (id: string, patch: SpecialDayPatch) => {
      const saved = await attendanceApi.updateSpecialDay(id, patch);
      reload();
      return saved;
    },
    [reload],
  );
  const remove = useCallback(
    async (id: string) => {
      await attendanceApi.deleteSpecialDay(id);
      reload();
    },
    [reload],
  );

  return {
    days: read.value ?? NO_DAYS,
    loading: read.loading,
    error: read.error,
    available: isConnected,
    editable: isConnected && can,
    reload,
    create,
    update,
    remove,
  };
}
