/**
 * Where a scheduled interview stands against the clock (UAT 23 Nov, U91 /
 * PERF-11 and PERF-30).
 *
 * The diary listed every SCHEDULED interview under "Upcoming", so interviews from
 * a month ago sat there looking like next week's, and an interview two days away
 * could be marked complete. Both questions are about time, not status: the API
 * leaves an interview SCHEDULED until somebody closes it.
 *
 * Pure: `now` is handed in, in milliseconds, so the clock is read once by the
 * caller (the gateway's, so a practice board keeps its own).
 */

/** Whether the interview's start time has come. Complete is offered only then. */
export function hasStarted(
  interview: { scheduledFor: string },
  now: number,
): boolean {
  const start = Date.parse(interview.scheduledFor);
  return Number.isNaN(start) ? true : start <= now;
}

/** Whether it has finished (start plus its length) and still waits for an outcome. */
export function hasEnded(
  interview: { scheduledFor: string; durationMins: number },
  now: number,
): boolean {
  const start = Date.parse(interview.scheduledFor);
  if (Number.isNaN(start)) return false;
  return start + interview.durationMins * 60_000 <= now;
}

/**
 * Scheduled interviews split into the ones still to happen and the ones that
 * happened and need closing (complete or no-show), each in time order.
 */
export function splitScheduled<
  T extends { scheduledFor: string; durationMins: number },
>(interviews: readonly T[], now: number): { upcoming: T[]; toClose: T[] } {
  const byTime = [...interviews].sort(
    (a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor),
  );
  return {
    upcoming: byTime.filter((one) => !hasEnded(one, now)),
    toClose: byTime.filter((one) => hasEnded(one, now)),
  };
}
