import { describe, expect, it } from "vitest";
import {
  hasEnded,
  hasStarted,
  splitScheduled,
} from "@/lib/hiring/interviews/timing";

/**
 * A month-old interview is not "Upcoming" (UAT 23 Nov, U91 / PERF-11): the API
 * leaves an interview SCHEDULED until somebody closes it, so the diary splits
 * by the clock.
 */
const NOW = Date.parse("2026-11-23T10:00:00.000Z");
const at = (iso: string, durationMins = 60) => ({
  scheduledFor: iso,
  durationMins,
});

describe("where a scheduled interview stands", () => {
  it("has started at its start time, not before", () => {
    expect(hasStarted(at("2026-11-23T10:00:00.000Z"), NOW)).toBe(true);
    expect(hasStarted(at("2026-11-25T09:00:00.000Z"), NOW)).toBe(false);
  });

  it("has ended once its length has run, so one under way is still upcoming", () => {
    expect(hasEnded(at("2026-11-23T09:30:00.000Z"), NOW)).toBe(false);
    expect(hasEnded(at("2026-11-23T09:00:00.000Z"), NOW)).toBe(true);
  });

  it("puts last month's under Happened, needs closing, in time order", () => {
    const oct24 = at("2026-10-24T09:00:00.000Z");
    const oct23 = at("2026-10-23T14:00:00.000Z");
    const nov25 = at("2026-11-25T09:00:00.000Z");
    expect(splitScheduled([nov25, oct24, oct23], NOW)).toEqual({
      upcoming: [nov25],
      toClose: [oct23, oct24],
    });
  });
});
