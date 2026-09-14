import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nowTime } from "@/lib/store/attendance";

/**
 * `nowTime` is the clock-in time — the user explicitly named this one as
 * something that must be in company time. Someone travelling clocks in at
 * 09:00 their time and the timesheet must record the company's 09:00, not
 * theirs.
 *
 * This machine defaults to `Africa/Lagos`, so a test that only checked that
 * zone would pass just as well against the old `now.getHours()` — that reads
 * the *system's* local clock, which happens to agree with Lagos. Asserting
 * against a different zone is what proves the parameter is actually honoured.
 */
describe("nowTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the company's clock, not the machine's", () => {
    /* 05:00 UTC is 06:00 in Lagos (this machine) and 17:00 in Auckland. */
    vi.setSystemTime(new Date("2026-09-12T05:00:00Z"));
    expect(nowTime("Africa/Lagos")).toBe("06:00");
    expect(nowTime("Pacific/Auckland")).toBe("17:00");
  });
});
