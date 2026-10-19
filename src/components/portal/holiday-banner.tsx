"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PartyPopper, X } from "lucide-react";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { usePublicHolidays } from "@/lib/store/holidays";
import { formatDate, weekdayIn, todayIn } from "@/lib/time";
import { TODAY } from "@/lib/today";

/**
 * "There is a public holiday coming" — the banner side of the reminder
 * `leave/holiday-reminder.ts` emails out on the API.
 *
 * Same shape as `InstallPrompt`: a strip inside `shell.tsx`'s shared sticky
 * banner wrapper, own dismiss button, closed state remembered in
 * `localStorage` rather than a session `useState` — a holiday notice that
 * returns every sign-in for the next two days would be the irritation
 * `install-prompt.tsx`'s own header warns about. Keyed **per holiday id**,
 * not one blanket flag, so dismissing this one does not silently suppress
 * the next one — no expiry logic needed either, since a new id simply
 * starts undismissed.
 *
 * Known gap, deliberately not papered over here: the demo seed
 * (`lib/mock/workflows.ts#PUBLIC_HOLIDAYS`) has nothing near the frozen
 * `TODAY`, so this renders nothing in a canned demo walkthrough until a
 * holiday is added near that date. Real organisations, and any live demo
 * run connected against a seeded org, are unaffected.
 *
 * "Today" and "tomorrow" are the organisation's own calendar day
 * (`todayIn(timeZone)`, `useOrgTimezone()` from `store/session`), not the
 * viewer's browser clock — the same reason `leave-screen.tsx` reads its
 * `today` the identical way. A remote colleague in a different zone must
 * see the same holiday window everyone else at the company does.
 */

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A holiday is a calendar day, not a moment, so it is formatted in UTC and
 * never in the company's zone — the same rule `attendance/history/
 * day-holiday.tsx` states for the same value. `formatDate` and `weekdayIn`
 * read a bare `2026-10-01` as midnight UTC, so handing them the company's zone
 * would print the day before for a company west of UTC (the settings list
 * offers New York, Chicago and Los Angeles): "Wednesday, 30 September" over a
 * holiday that is on Thursday the 1st.
 */
function longDate(isoDate: string): string {
  return `${weekdayIn(isoDate, "UTC")}, ${formatDate(isoDate, "UTC")}`;
}

const dismissKey = (holidayId: string) =>
  `approvehr.holiday-banner.dismissed.${holidayId}`;

/**
 * Whether this holiday id was already closed, in this browser.
 *
 * SSR-safe the way `install-prompt.tsx#useCouldInstall` is, and for the same
 * reason `react-hooks/set-state-in-effect` exists to catch: the server has
 * no `localStorage`, so the snapshot is `false`, and the client corrects
 * itself after hydration. Nothing subscribes -- the one thing that *can*
 * change this, the dismiss click, is handled by a real `useState` beside it,
 * not by this store.
 */
function useWasDismissed(holidayId: string | undefined): boolean {
  const subscribe = useCallback(() => () => undefined, []);
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!holidayId) return false;
      try {
        return window.localStorage.getItem(dismissKey(holidayId)) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
}

export function HolidayBanner() {
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  const today = isConnected ? todayIn(timeZone) : TODAY;
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const currentYear = Number(today.slice(0, 4));

  /* Two years, unconditionally -- covers the Dec 31 -> Jan 1 boundary a
     single `usePublicHolidays(year)` call can't see on its own. Both calls
     are cheap: connected, they share the same underlying resource cache
     `/people/leave` already primes; in demo mode neither touches the
     network at all. */
  const cal0 = usePublicHolidays(currentYear);
  const cal1 = usePublicHolidays(currentYear + 1);

  const due = useMemo(
    () =>
      [...cal0.holidays, ...cal1.holidays].find(
        (h) => h.confirmed && (h.date === today || h.date === tomorrow),
      ),
    [cal0.holidays, cal1.holidays, today, tomorrow],
  );

  const wasDismissed = useWasDismissed(due?.id);
  const [closedNow, setClosedNow] = useState(false);

  if (!due || wasDismissed || closedNow) return null;

  function close() {
    setClosedNow(true);
    try {
      window.localStorage.setItem(dismissKey(due!.id), "1");
    } catch {
      /* Private mode, or storage disabled. It reappears next visit, which is
         the honest failure for a browser that keeps nothing. */
    }
  }

  const isToday = due.date === today;

  return (
    <div
      className="flex items-start gap-3 border-b border-line bg-accent-soft px-5 py-3"
      role="region"
      aria-label="Public holiday"
    >
      <PartyPopper
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-accent-text"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-ink">
          {due.name} is {isToday ? "today" : "tomorrow"}
        </p>
        <p className="mt-0.5 text-meta text-body">
          {longDate(due.date)} is a public holiday.{" "}
          <Link
            href="/people/leave"
            className="underline underline-offset-2 hover:text-ink"
          >
            View the leave calendar
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 text-muted hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
