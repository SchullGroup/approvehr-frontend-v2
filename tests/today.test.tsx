import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { DEMO_TODAY, todayFor, workingToday } from "@/lib/today";
import { useToday } from "@/lib/use-today";

/**
 * Which day the product calls "today".
 *
 * The demo dataset is a fixed snapshot with a fixed "now", and that date used to
 * be handed to every build: in October the payroll wizard opened on August, the
 * overtime screen defaulted to August, and nothing looked wrong because a month
 * is a month. The one thing worth pinning is the guarantee that matters to a
 * customer: **a build with no demo never answers with the demo's date.**
 *
 * `DEMO_ENABLED` is a compile-time literal (`vitest.config.ts` defines it as
 * `true`), so the "no demo" half is exercised through `todayFor`, which takes
 * the flag as an argument — the same function `workingToday` calls with the
 * build's own.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: vi.fn(),
  useOrgTimezone: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  /* 23:30 UTC on 20 Oct is already the 21st in Lagos — late enough to tell the
     company's day from the browser's. */
  vi.setSystemTime(new Date("2026-10-20T23:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("todayFor", () => {
  it("never answers with the demo's day when there is no demo", () => {
    for (const connected of [true, false]) {
      expect(
        todayFor({ connected, demo: false, timeZone: "Africa/Lagos" }),
      ).not.toBe(DEMO_TODAY);
    }
  });

  it("is the real day for a connected company, even in a build that has a demo", () => {
    expect(
      todayFor({ connected: true, demo: true, timeZone: "Africa/Lagos" }),
    ).toBe("2026-10-21");
  });

  it("is the demo's day only when there is a demo and nobody is connected", () => {
    expect(
      todayFor({ connected: false, demo: true, timeZone: "Africa/Lagos" }),
    ).toBe(DEMO_TODAY);
  });

  it("reads the day in the company's zone, not the browser's", () => {
    expect(
      todayFor({ connected: true, demo: false, timeZone: "Africa/Lagos" }),
    ).toBe("2026-10-21");
    expect(
      todayFor({ connected: true, demo: false, timeZone: "America/New_York" }),
    ).toBe("2026-10-20");
  });

  it("is the real day before sign-in in a build with no demo", () => {
    expect(
      todayFor({ connected: false, demo: false, timeZone: "Africa/Lagos" }),
    ).toBe("2026-10-21");
  });
});

describe("workingToday", () => {
  it("answers connected from the clock, whatever the demo says", () => {
    expect(workingToday(true, "Africa/Lagos")).toBe("2026-10-21");
  });
});

describe("useToday", () => {
  it("is the company's own day once signed in", () => {
    vi.mocked(useSession).mockReturnValue({ isConnected: true } as ReturnType<
      typeof useSession
    >);
    vi.mocked(useOrgTimezone).mockReturnValue("Africa/Lagos");

    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-10-21");
  });

  it("follows the company's zone", () => {
    vi.mocked(useSession).mockReturnValue({ isConnected: true } as ReturnType<
      typeof useSession
    >);
    vi.mocked(useOrgTimezone).mockReturnValue("America/New_York");

    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-10-20");
  });

  it("is the demo's day in demo mode", () => {
    vi.mocked(useSession).mockReturnValue({ isConnected: false } as ReturnType<
      typeof useSession
    >);
    vi.mocked(useOrgTimezone).mockReturnValue("Africa/Lagos");

    const { result } = renderHook(() => useToday());
    expect(result.current).toBe(DEMO_TODAY);
  });
});
