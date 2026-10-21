"use client";

import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  wellnessApi,
  type ApiBoard,
  type ApiChallenge,
  type ApiChallengeDetail,
  type ApiConsents,
  type ApiLogEntry,
  type ApiRecognition,
  type ApiReminderPolicy,
  type ApiResults,
  type ApiSummary,
  type ApiWellnessSettings,
  type CreateChallengeBody,
  type LogBody,
  type RecognitionBody,
  type ReminderPolicyBody,
  type WellnessPurpose,
} from "@/lib/api/wellness";
import { useFetched } from "@/lib/use-fetched";
import { usePagedList, type PagedList } from "./paged-list";
import { useSession } from "./session";

/**
 * Wellness, connected only.
 *
 * ## There is no demo version, and this one is not close
 *
 * Every other module that skips a demo does so because a seeded answer would be
 * an invented fact. Here it is sharper: the module is a private health log, and
 * the whole claim is that **the server** will not show it to anybody else. A
 * version running in the reader's own browser could not demonstrate that at
 * all, and seeded steps would be made-up data about made-up people.
 *
 * ## Nothing is kept past the screen
 *
 * These hooks hold their answers in component state through `useFetched`, not in
 * a shared cache and not in storage. A person's log and consents are not
 * something to leave in memory for the next screen, or on a shared machine for
 * the next person; the API sends `Cache-Control: no-store` for the same reason.
 * Every screen that wants them asks again, and the answer goes when it unmounts.
 *
 * ## What the reads take, and what they never do
 *
 * No hook here takes an employee id. A person's own reads are `/me/...` on the
 * server and the person comes off the token; there is nothing to forge and
 * nothing for a screen to pass. The one id that goes out is the colleague a
 * kudos is for.
 */

export const WELLNESS_OFFLINE =
  "Wellness needs the API. There is no demo version: what you log is private " +
  "to you, and that is something the server does, so a copy running in this " +
  "browser could not show it.";

export type Read<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

/**
 * A read that waits for a key, and does nothing while there is none.
 *
 * `data` is the last answer **for this key** and stays while the next one is on
 * its way, so a screen that reloads after somebody adds an entry keeps what it
 * shows instead of collapsing to skeletons under their cursor. `loading` is
 * still true meanwhile, which is how a screen tells a first load (no data) from
 * a refresh (data and loading). A failure still replaces it: `error` is set and
 * `LoadState` lets the failure win, because a figure from before a failed
 * refresh is a claim nobody can vouch for.
 *
 * The answer is held in component state and goes with the screen. A different
 * key never sees the previous key's answer.
 */
function useRead<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): Read<T> {
  const { isConnected } = useSession();
  const live = useFetched<T>(key ?? "none", isConnected && key !== null, load);
  const [kept, setKept] = useState<{ key: string | null; value: T } | null>(
    null,
  );
  if (live.data !== null && (kept?.key !== key || kept.value !== live.data)) {
    setKept({ key, value: live.data });
  }
  const data =
    live.data ?? (kept !== null && kept.key === key ? kept.value : null);
  return {
    data,
    loading: live.loading,
    error: live.error,
    reload: live.reload,
  };
}

/** Whether there is an API to ask. The screens say so once, instead of failing. */
export function useWellnessAvailable(): boolean {
  return useSession().isConnected;
}

/* ------------------------------------------------------------------- reads */

/** Open to everybody: the floor, its limits and the company's reminder default. */
export function useWellnessSettings(): Read<ApiWellnessSettings> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.settings(signal),
    [],
  );
  return useRead("settings", load);
}

export function useMyConsents(): Read<ApiConsents> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.consents(signal),
    [],
  );
  return useRead("consents", load);
}

/** The caller's own daily totals between two days. */
export function useMySummary(
  from: string | null,
  to: string | null,
): Read<ApiSummary> {
  const load = useCallback(
    (signal: AbortSignal) =>
      wellnessApi.summary({ from: from ?? "", to: to ?? "" }, signal),
    [from, to],
  );
  return useRead(from && to ? `summary|${from}|${to}` : null, load);
}

/** The caller's own entries since a day, newest first. One page: it is a week. */
export function useMyLogs(from: string | null): Read<ApiLogEntry[]> {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await wellnessApi.logs({ from: from ?? "", pageSize: 100 }, signal))
        .data,
    [from],
  );
  return useRead(from ? `logs|${from}` : null, load);
}

/** Yours if you set your own, else the company's. */
export function useMyReminders(): Read<ApiReminderPolicy> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.myReminders(signal),
    [],
  );
  return useRead("reminders", load);
}

/**
 * Every challenge, in one request.
 *
 * 100 is the API's page ceiling. A challenge runs at most 90 days, so a company
 * would have to start more than one a day for a quarter to reach it.
 */
export function useChallenges(): Read<ApiChallenge[]> {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await wellnessApi.challenges({ pageSize: 100 }, signal)).data,
    [],
  );
  return useRead("challenges", load);
}

/** One challenge, with the join wording. Asked for when somebody is about to join. */
export function useChallengeDetail(
  id: string | null,
): Read<ApiChallengeDetail> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.challenge(id ?? "", signal),
    [id],
  );
  return useRead(id ? `challenge|${id}` : null, load);
}

/** The board, for somebody who joined. Anybody else gets the API's refusal. */
export function useChallengeBoard(id: string | null): Read<ApiBoard> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.board(id ?? "", signal),
    [id],
  );
  return useRead(id ? `board|${id}` : null, load);
}

/** `MANAGE_SETTINGS`: counts and totals above the floor. */
export function useChallengeResults(id: string | null): Read<ApiResults> {
  const load = useCallback(
    (signal: AbortSignal) => wellnessApi.results(id ?? "", signal),
    [id],
  );
  return useRead(id ? `results|${id}` : null, load);
}

export type RecognitionKind = "feed" | "received" | "given";

/**
 * Kudos, a page at a time. `feed` is the company's shared ones; `received` and
 * `given` are the caller's own, private ones included.
 */
export function useRecognitions(
  kind: RecognitionKind,
): PagedList<ApiRecognition> {
  const { isConnected } = useSession();
  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      const page = cursor === null ? 1 : Number(cursor);
      const answer =
        kind === "feed"
          ? await wellnessApi.recognitions({ page, pageSize: 20 }, signal)
          : await wellnessApi.myRecognitions(
              { page, pageSize: 20, direction: kind },
              signal,
            );
      return {
        rows: answer.data,
        total: answer.meta.total,
        next: answer.meta.hasMore ? String(page + 1) : null,
      };
    },
    [kind],
  );
  return usePagedList<ApiRecognition>({
    key: `recognitions|${kind}`,
    enabled: isConnected,
    fetchPage,
    idOf: (row) => row.id,
  });
}

/* ----------------------------------------------------------------- writes */

/**
 * Every act, behind one guard.
 *
 * The caller reloads whatever it shows: nothing here is cached, so there is no
 * second copy to keep in step, which is the point of not keeping one.
 */
export function useWellnessActions() {
  const { isConnected } = useSession();

  const guard = useCallback(() => {
    if (!isConnected) throw new ApiError(0, "offline", WELLNESS_OFFLINE);
  }, [isConnected]);

  return {
    available: isConnected,

    grantConsent: useCallback(
      async (purpose: WellnessPurpose, version: string) => {
        guard();
        return wellnessApi.grantConsent(purpose, version);
      },
      [guard],
    ),
    withdrawConsent: useCallback(
      async (purpose: WellnessPurpose, erase: boolean) => {
        guard();
        return wellnessApi.withdrawConsent(purpose, erase);
      },
      [guard],
    ),

    addLog: useCallback(
      async (body: LogBody) => {
        guard();
        return wellnessApi.addLog(body);
      },
      [guard],
    ),
    deleteLog: useCallback(
      async (id: string) => {
        guard();
        return wellnessApi.deleteLog(id);
      },
      [guard],
    ),
    eraseLogs: useCallback(async () => {
      guard();
      return wellnessApi.eraseLogs();
    }, [guard]),

    setMyReminders: useCallback(
      async (body: ReminderPolicyBody) => {
        guard();
        return wellnessApi.setMyReminders(body);
      },
      [guard],
    ),
    clearMyReminders: useCallback(async () => {
      guard();
      return wellnessApi.clearMyReminders();
    }, [guard]),
    setOrganisationReminders: useCallback(
      async (body: ReminderPolicyBody) => {
        guard();
        return wellnessApi.setOrganisationReminders(body);
      },
      [guard],
    ),

    createChallenge: useCallback(
      async (body: CreateChallengeBody) => {
        guard();
        return wellnessApi.createChallenge(body);
      },
      [guard],
    ),
    updateChallenge: useCallback(
      async (
        id: string,
        body: { title?: string; description?: string | null },
      ) => {
        guard();
        return wellnessApi.updateChallenge(id, body);
      },
      [guard],
    ),
    cancelChallenge: useCallback(
      async (id: string) => {
        guard();
        return wellnessApi.cancelChallenge(id);
      },
      [guard],
    ),
    joinChallenge: useCallback(
      async (id: string, version: string, teamId?: string) => {
        guard();
        return wellnessApi.joinChallenge(id, version, teamId);
      },
      [guard],
    ),
    leaveChallenge: useCallback(
      async (id: string) => {
        guard();
        return wellnessApi.leaveChallenge(id);
      },
      [guard],
    ),

    giveRecognition: useCallback(
      async (body: RecognitionBody) => {
        guard();
        return wellnessApi.giveRecognition(body);
      },
      [guard],
    ),
    removeRecognition: useCallback(
      async (id: string) => {
        guard();
        return wellnessApi.removeRecognition(id);
      },
      [guard],
    ),

    setPrivacyFloor: useCallback(
      async (privacyFloor: number) => {
        guard();
        return wellnessApi.setPrivacyFloor(privacyFloor);
      },
      [guard],
    ),
  };
}
