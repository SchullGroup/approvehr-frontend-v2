"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApiAttendancePolicy } from "@/lib/api/attendance";

/**
 * How long you have been on the clock, ticking.
 *
 * ## Why this counts up rather than down
 *
 * The obvious build is a countdown to closing time, and it is the wrong one for
 * three reasons.
 *
 * **It counts down to leaving, not to having worked.** Nobody's pay depends on
 * when the office closes; it depends on hours put in. A number that treats the
 * end of the day as the goal is a slightly grim thing to put in front of
 * somebody, and it is not the figure the company cares about either.
 *
 * **It is wrong the moment somebody arrives late.** On an 08:00–17:00 shift,
 * clocking in at 10:00 and reading "7 hours until closing" implies a full day
 * on leaving. It is seven hours, not nine. The honest milestone counts from
 * when *this person* started, which is what `fullDayAt` does.
 *
 * **A shift is optional in this product.** A company can leave `shiftStart` and
 * `shiftEnd` unset, and inventing nine-to-five to have something to count
 * against would be exactly the invented figure this codebase refuses
 * everywhere else. With no shift, the elapsed time still ticks and no milestone
 * is claimed.
 *
 * So: **elapsed, with the next real milestone named.** "2h 14m on the clock ·
 * a full day at 16:52" rather than "6h 32m until 17:00".
 *
 * ## What it is actually for
 *
 * The reported problem was that clocking in looked like nothing had happened.
 * The first job of this component is therefore **confirmation** — a number that
 * moves is proof the press registered, in a way a static "Still clocked in" was
 * not. The milestone is the second job.
 *
 * ## The clock it trusts, and the hour this got wrong
 *
 * Both `clockIn` and `serverTime` come from the server, which renders every
 * attendance time in UTC as "the organisation's day" (see `timeOf` in
 * `modules/attendance/service.ts`). The first build of this component ticked
 * off `new Date()` in the browser and read **"1h on the clock" one minute after
 * clocking in** — the browser was UTC+1, and the difference went straight into
 * the figure.
 *
 * So the offset between the two clocks is measured once, on mount, and every
 * tick after that is browser elapsed *plus* that offset. The browser is a good
 * stopwatch and a bad calendar; this uses it only as the former.
 *
 * A readout an hour wrong is worse than no readout, and it is exactly the kind
 * of plausible wrong number this codebase exists to refuse. Nothing here is
 * paid on — the timesheet and payroll read the stored entry, computed
 * server-side — but a figure somebody glances at and trusts has to be right.
 */

/** Minutes since midnight, from `HH:MM`. Null on anything else. */
function minutesOf(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

const clock = (totalMinutes: number): string => {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * "2h 14m", "46m", "8h".
 *
 * No seconds. A second-by-second readout is a stopwatch, and a stopwatch on
 * somebody's working day reads as surveillance rather than as feedback — the
 * minute is the unit the timesheet stores and the unit anybody cares about.
 * It still ticks every thirty seconds so the change is visible.
 */
function spell(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours === 0) return `${String(mins)}m`;
  if (mins === 0) return `${String(hours)}h`;
  return `${String(hours)}h ${String(mins)}m`;
}

export function DayTimer({
  /** `HH:MM` from the roster row. */
  clockIn,
  /** `HH:MM` from the roster itself — the server's clock, not the browser's. */
  serverTime,
  policy,
  className,
}: {
  clockIn: string;
  serverTime: string;
  policy: ApiAttendancePolicy | null;
  className?: string;
}) {
  /* Thirty seconds, not one. The readout is in minutes, so a per-second timer
     would re-render sixty times to change the display twice — and this sits on
     a screen that also holds a roster and a timesheet. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* The browser's clock at the moment the server told us its own. Everything
     after this is a difference between two browser readings, which is sound
     however far the browser is from the truth in absolute terms. */
  const [anchor] = useState(() => ({
    server: minutesOf(serverTime),
    at: Date.now(),
  }));

  const started = minutesOf(clockIn);
  if (started === null || anchor.server === null) return null;

  const nowMinutes = anchor.server + Math.floor((tick - anchor.at) / 60_000);
  /* Someone who clocked in before midnight and is still on shift. Rare, and a
     negative elapsed time would be worse than the wrap. */
  const elapsed = nowMinutes >= started ? nowMinutes - started : nowMinutes + 1440 - started;

  const shiftStart = minutesOf(policy?.shiftStart);
  const shiftEnd = minutesOf(policy?.shiftEnd);

  /**
   * A full working day, in minutes, from the company's own shift.
   *
   * Null when the shift is not set — and null means the milestone is simply not
   * claimed, rather than a default day being assumed. An overnight shift
   * (`shiftEnd` before `shiftStart`) wraps rather than coming out negative.
   */
  const fullDay =
    shiftStart !== null && shiftEnd !== null
      ? shiftEnd > shiftStart
        ? shiftEnd - shiftStart
        : shiftEnd + 1440 - shiftStart
      : null;

  const fullDayAt = fullDay === null ? null : clock(started + fullDay);
  const reachedFullDay = fullDay !== null && elapsed >= fullDay;
  const remaining = fullDay === null ? null : Math.max(0, fullDay - elapsed);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <Timer aria-hidden="true" className="size-4 text-accent-text" />
        {/* `aria-live="polite"` and not `assertive`: it changes twice an hour
            and must not interrupt somebody reading the rest of the page. */}
        <span
          aria-live="polite"
          className="tabular text-body-sm font-semibold text-ink"
        >
          {spell(elapsed)}
        </span>
        <span className="text-body-sm text-muted">on the clock</span>
      </span>

      {/* The milestone, only where the company has said what a day is. */}
      {fullDayAt !== null && (
        <span className="text-meta text-muted">
          {reachedFullDay ? (
            <>
              &middot; a full day was {fullDayAt}
              {/* Past the line, this is the actionable fact — this product has
                  an overtime module, and extra hours are claimed rather than
                  assumed. Stated, not totalled: what counts as overtime is the
                  overtime screen's rule and not this readout's. */}
              {elapsed > (fullDay ?? 0) && (
                <>
                  {" "}
                  &middot;{" "}
                  <span className="font-medium text-warning-text">
                    {spell(elapsed - (fullDay ?? 0))} over
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              &middot; a full day at {fullDayAt}
              {remaining !== null && remaining > 0 && (
                <> &middot; {spell(remaining)} to go</>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}
