"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  oneOnOnesApi,
  type ApiCadence,
  type ApiCoverage,
  type ApiItemKind,
  type ApiOneOnOne,
  type ApiOneOnOneItem,
  type ApiOneOnOneMeeting,
} from "@/lib/api/one-on-ones";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * One-to-ones, connected only.
 *
 * ## There is no demo mode here, and that is a decision rather than a gap
 *
 * Every other store in this directory has an offline branch, because the
 * product gets shown on laptops with no database and the rule is that it must
 * never *look* connected when it is not. This one refuses, for a reason the
 * others do not have:
 *
 * A 1:1 is a private conversation between two named people. Demo mode's people
 * are the seeded personas, so a demo 1:1 would be **invented notes attributed
 * to a real-looking employee about their real-looking manager** — a fabricated
 * record of a private conversation, which is the exact class of artefact
 * `scripts/verify-demo.ts` exists to keep out of a build. The alternative,
 * empty boxes on every screen, at least says what it is.
 *
 * The refusals below say so, in those words, rather than "needs the API".
 */

const OFFLINE =
  "One-to-ones need the API. There is no demo version on purpose: a " +
  "one-to-one is a private conversation between two named people, and " +
  "inventing one would put made-up notes about a made-up colleague on screen.";

type Fetched<T> = { key: string; data: T | null; error: ApiError | null };

/** The shared read shape. Every hook below returns this. */
export type Read<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
};

function useRead<T>(
  key: string,
  active: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Read<T> {
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<Fetched<T> | null>(null);
  const full = `${key}|${String(tick)}`;

  /* Re-ask when somebody comes back to the window. Not in the key, so the
     answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!cancelled) setFetched({ key: full, data, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setFetched({
            key: full,
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
  }, [active, full, load, revalidation]);

  const fresh = fetched?.key === full;
  return {
    data: fresh ? fetched.data : null,
    loading: active && !fresh,
    error: fresh ? fetched.error : null,
    available: active,
    refusal: OFFLINE,
    reload: useCallback(() => {
      setTick((value) => value + 1);
    }, []),
  };
}

/** Every 1:1 the signed-in person is in, both sides of the reporting line. */
export function useMyOneOnOnes(): Read<ApiOneOnOne[]> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => oneOnOnesApi.mine(signal),
    [],
  );
  return useRead("mine", isConnected, load);
}

/**
 * The meetings on one series.
 *
 * A 403 here is the ordinary answer for anybody who is not one of the two
 * people, and the screen renders the API's own sentence rather than a generic
 * failure — "you are not in this one-to-one" is the whole explanation, and the
 * reader needs to understand it is by design rather than a bug.
 */
export function useOneOnOneMeetings(
  seriesId: string | null,
): Read<ApiOneOnOneMeeting[]> {
  const { isConnected } = useSession();
  const active = isConnected && seriesId !== null;
  const load = useCallback(
    (signal: AbortSignal) => oneOnOnesApi.meetings(seriesId ?? "", signal),
    [seriesId],
  );
  return useRead(`meetings|${seriesId ?? "none"}`, active, load);
}

/**
 * Who is meeting and who is not.
 *
 * `enabled` is `EDIT_RECORDS`, asked by the screen — the store does not reach
 * for `useCan` itself, or every consumer pays for the permissions fetch.
 */
export function useOneOnOneCoverage(enabled: boolean): Read<ApiCoverage> {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => oneOnOnesApi.coverage(signal),
    [],
  );
  return useRead("coverage", isConnected && enabled, load);
}

/**
 * The writes.
 *
 * Every one refuses offline with the same sentence the reads carry. Nothing
 * here writes locally: see the header.
 */
export function useOneOnOneMutations() {
  const { isConnected } = useSession();
  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,
    refusal: OFFLINE,

    start: useCallback(
      async (employeeId: string, cadence?: ApiCadence) => {
        guard();
        return oneOnOnesApi.start({
          employeeId,
          ...(cadence ? { cadence } : {}),
        });
      },
      [guard],
    ),

    updateSeries: useCallback(
      async (id: string, body: { cadence?: ApiCadence; active?: boolean }) => {
        guard();
        return oneOnOnesApi.updateSeries(id, body);
      },
      [guard],
    ),

    schedule: useCallback(
      async (seriesId: string, scheduledFor: string) => {
        guard();
        return oneOnOnesApi.schedule(seriesId, scheduledFor);
      },
      [guard],
    ),

    /**
     * Notes and held, kept apart at every layer.
     *
     * Marking a meeting held is what the coverage report counts, so a screen
     * must never send `held` as a side effect of a note being typed.
     */
    updateMeeting: useCallback(
      async (id: string, body: { notes?: string | null; held?: boolean }) => {
        guard();
        return oneOnOnesApi.updateMeeting(id, body);
      },
      [guard],
    ),

    cancelMeeting: useCallback(
      async (id: string) => {
        guard();
        return oneOnOnesApi.cancelMeeting(id);
      },
      [guard],
    ),

    addItem: useCallback(
      async (
        meetingId: string,
        body: {
          kind: ApiItemKind;
          text: string;
          ownerId?: string | null;
          dueDate?: string | null;
        },
      ): Promise<ApiOneOnOneItem> => {
        guard();
        return oneOnOnesApi.addItem(meetingId, body);
      },
      [guard],
    ),

    setItemDone: useCallback(
      async (id: string, done: boolean) => {
        guard();
        return oneOnOnesApi.setItemDone(id, done);
      },
      [guard],
    ),

    removeItem: useCallback(
      async (id: string) => {
        guard();
        return oneOnOnesApi.removeItem(id);
      },
      [guard],
    ),
  };
}
