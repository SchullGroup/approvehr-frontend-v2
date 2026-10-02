import { describe, expect, it } from "vitest";
import {
  bannerFor,
  daysLabel,
  isLockedOut,
  moduleLocked,
  wholeDaysUntil,
} from "@/lib/billing";
import type { ApiBilling } from "@/lib/api/endpoints";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const base: ApiBilling = {
  status: "ACTIVE",
  entitled: true,
  enforced: true,
  reason: null,
  plan: { name: "Growth", priceKobo: 5_000_000 },
  modules: ["CORE_HR", "PAYROLL"],
  trialEndsAt: null,
  currentPeriodEnd: iso(20 * DAY),
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: null,
  unappliedKobo: 0,
};

describe("wholeDaysUntil / daysLabel", () => {
  it("rounds down and says today at zero", () => {
    expect(wholeDaysUntil(iso(2.9 * DAY), NOW)).toBe(2);
    expect(wholeDaysUntil(iso(0.5 * DAY), NOW)).toBe(0);
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(1)).toBe("in 1 day");
    expect(daysLabel(3)).toBe("in 3 days");
  });
});

describe("bannerFor", () => {
  it("is null with no billing", () => expect(bannerFor(null, NOW)).toBeNull());
  it("shows in the last 3 days of a trial only", () => {
    const trial = (d: number) => ({
      ...base,
      status: "TRIALING" as const,
      trialEndsAt: iso(d * DAY),
    });
    expect(bannerFor(trial(3.5), NOW)).toEqual({ kind: "trial", days: 3 });
    expect(bannerFor(trial(4.1), NOW)).toBeNull();
    expect(bannerFor(trial(0.2), NOW)).toEqual({ kind: "trial", days: 0 });
  });
  it("shows throughout grace, counting to graceEndsAt", () => {
    expect(
      bannerFor({ ...base, status: "GRACE", graceEndsAt: iso(6.5 * DAY) }, NOW),
    ).toEqual({ kind: "grace", days: 6 });
  });
  it("shows nothing when active", () =>
    expect(bannerFor(base, NOW)).toBeNull());
});

describe("isLockedOut / moduleLocked", () => {
  it("locks only when enforced and not entitled", () => {
    expect(isLockedOut(null)).toBe(false);
    expect(isLockedOut({ ...base, entitled: false, enforced: false })).toBe(
      false,
    );
    expect(isLockedOut({ ...base, entitled: false, status: "LOCKED" })).toBe(
      true,
    );
  });
  it("locks a module only when enforced and missing from the plan", () => {
    expect(moduleLocked(base, "RECRUITMENT")).toBe(true);
    expect(moduleLocked(base, "PAYROLL")).toBe(false);
    expect(moduleLocked({ ...base, enforced: false }, "RECRUITMENT")).toBe(
      false,
    );
    expect(moduleLocked(null, "RECRUITMENT")).toBe(false);
  });
});
