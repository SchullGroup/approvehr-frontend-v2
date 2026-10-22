"use client";

import { useEffect } from "react";
import { meApi } from "@/lib/api/me";
import { useRevalidation } from "@/lib/revalidate";
import { useFeatures } from "@/lib/store/features";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * "This person opened the app today", sent once a day and never waited for.
 *
 * ## What it is for
 *
 * The pilot is judged on how many of the team open the app in a week, and the API
 * measures that from one mark per person per day (`POST /me/app-open`, spec
 * `2026-10-20-today-panel-design.md`). This is the web half of that event. It
 * renders nothing, sits inside the signed-in shell, and the answer is ignored: the
 * API replies 204 whether the mark was new, a repeat, or tracking is off, so there
 * is nothing a caller could act on.
 *
 * ## Why it checks the company's switch first
 *
 * `OrgFeatures.appOpenTracking` is off until a company turns it on, and the API
 * writes nothing while it is. Sending anyway would be a request on every day's
 * first load for no effect, from every company that has not asked, so the app
 * reads the same flag the API does and stays quiet while it is off or not yet
 * known. Reading it is one request the shell already makes (`useFeatures`).
 *
 * ## Once a day, and what "a day" is
 *
 * The API's day is the company's calendar day, so this keys its own guard on the
 * same: `todayIn(timeZone)`. The guard is the last day sent, per account, in
 * `localStorage`, so a second tab, a reload, and a route change all cost nothing.
 * It is per account because two people share one browser on an office machine and
 * the second must not be silenced by the first.
 *
 * The day is written **after** a send succeeds. A failure (offline, throttled, a
 * 5xx) is not retried in a loop, since an app load is not worth one, but it does
 * not use up the day either: the next load tries again.
 *
 * ## A tab left open
 *
 * People pin a tab and leave it for days. Nothing reloads it, so a once-per-load
 * event would count that person on the day they opened it and never again. The
 * beacon therefore also asks when somebody comes back to the window after an
 * absence (`useRevalidation`, which has its own floor), and the day guard turns
 * every one of those into a no-op unless the date has moved on.
 *
 * ## It must never get in the way
 *
 * Every read and write of storage is in a try/catch (a private window or full
 * storage throws), the request is fire and forget with its rejection caught, and
 * nothing here sets state, so nothing about the screen can wait on it.
 */

const KEY_PREFIX = "approvehr.app-open.";

const keyFor = (userId: string): string => `${KEY_PREFIX}${userId}`;

function lastDaySent(userId: string): string | null {
  try {
    return window.localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

function rememberDay(userId: string, day: string): void {
  try {
    window.localStorage.setItem(keyFor(userId), day);
  } catch {
    /* Private window or storage full. The worst case is one more request on the
       next load, which the API treats as a repeat. */
  }
}

/** Sends in flight, so a double-run effect (React strict mode) is one request. */
const inFlight = new Set<string>();

export type AppOpenOutcome = "sent" | "skipped" | "failed";

/**
 * Send the mark if today's has not been, and remember that it was.
 *
 * Exported so the rule can be asserted without mounting a shell. `send` is
 * injectable for the same reason and defaults to the real call.
 */
export async function sendAppOpenOnce(
  userId: string,
  day: string,
  send: () => Promise<void> = meApi.appOpen,
): Promise<AppOpenOutcome> {
  if (lastDaySent(userId) === day) return "skipped";
  const flight = `${userId}:${day}`;
  if (inFlight.has(flight)) return "skipped";
  inFlight.add(flight);
  try {
    await send();
    rememberDay(userId, day);
    return "sent";
  } catch {
    return "failed";
  } finally {
    inFlight.delete(flight);
  }
}

export function AppOpenBeacon() {
  const { isConnected, user } = useSession();
  const features = useFeatures();
  const timeZone = useOrgTimezone();
  const revalidation = useRevalidation();

  /* Only a connected session with an answer from the API that says yes. `loading`
     and a demo company both read as "do not send": the flag's default while it
     loads is false, and a demo has no server to tell. */
  const tracking =
    isConnected &&
    !features.loading &&
    features.source === "api" &&
    features.appOpenTracking;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!tracking || !userId) return;
    void sendAppOpenOnce(userId, todayIn(timeZone));
  }, [tracking, userId, timeZone, revalidation]);

  return null;
}
