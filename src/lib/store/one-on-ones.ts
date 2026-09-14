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
  type ApiPossibleReport,
} from "@/lib/api/one-on-ones";
import { useRevalidation } from "@/lib/revalidate";
import { createSharedResource } from "@/lib/shared-resource";
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
 * Who this person could start one with.
 *
 * `enabled` is passed in — the dialog asks only while it is open, and a picker
 * nobody has opened should not cost a request. The same call the screen uses
 * to decide whether to offer the button at all is `useIsManager()`, which is
 * already cached for other reasons; this is the list, wanted later and only
 * once.
 */
export function useWhoICanStartWith(
  enabled: boolean,
): Read<ApiPossibleReport[]> {
  const { isConnected, employeeId } = useSession();
  const active = isConnected && enabled && employeeId !== null;
  const load = useCallback(
    (signal: AbortSignal) => oneOnOnesApi.reports(employeeId ?? "", signal),
    [employeeId],
  );
  return useRead(`reports|${employeeId ?? "none"}`, active, load);
}

/**
 * Whether this person is in any one-to-one at all — the count, kept as a fact
 * about them rather than as a screen's data.
 *
 * ## Why the sidebar needs this and could not have it before
 *
 * The nav entry was `always: true`, with a reason that was true as far as it
 * went: whether somebody may *read* a 1:1 is a property of the row, and no
 * permission in the browser can answer it. The conclusion drawn from that was
 * to show the row to everybody, and the feedback on it was exact — *"I
 * shouldn't have one-to-ones if I am not a departmental manager and above, as
 * this creates always errors for the employee role."*
 *
 * Row-level is not the same as unanswerable. **Ask the rows.** For somebody
 * with no reports and no series, the honest answer is that this module is not
 * theirs yet, and a permission was never the thing that would have said so.
 *
 * ## Shared, and skipped entirely for a manager
 *
 * `createSharedResource` for the same reason `directReports` uses it: the
 * sidebar, the mobile sheet and the command palette all ask, and it is one
 * fact about one person however many of them do. Cached for the session, so a
 * page change does not re-ask.
 *
 * The shell passes a `null` key when somebody already manages people — the
 * item is showing on that ground alone, so the request is not worth making.
 * Which means the cost of this falls on exactly the population it is for, at
 * one request per session, and usually returns an empty array.
 *
 * `null` is "not answered yet" and reads as *no*, which is the right
 * direction: an item that appears a moment late is better than one that
 * appears and is taken away under somebody's pointer. Same call
 * `useIsManager` and `useAssistantAvailable` both document.
 */
const anySeries = createSharedResource<number>((_employeeId, signal) =>
  /* `/one-on-ones` is implicitly "mine" — it takes no id and reads the token's
     own claim. The key is what scopes the cache, so signing in as somebody
     else does not inherit the last person's answer; it is not a parameter. */
  oneOnOnesApi.mine(signal).then((series) => series.length),
);

/** True when this person is in at least one. See `anySeries`. */
export function useAmIInAOneOnOne(enabled: boolean): boolean {
  const { isConnected, employeeId } = useSession();
  const count = anySeries.use(isConnected && enabled ? employeeId : null);
  return count !== null && count > 0;
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
