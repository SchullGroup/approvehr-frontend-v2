import { describe, expect, it } from "vitest";
import type { LeaveBalanceRow } from "@/lib/api/leave";
import {
  balanceLine,
  leaveDecidedCopy,
} from "@/app/(app)/people/leave/leave-decided-copy";

/**
 * What is said when leave is approved.
 *
 * Tested because the sentences are the feature: each has to be true of the
 * thing that just happened, and the one that is easiest to get wrong is saying
 * "approved" for a first approval that is still waiting on HR.
 */

const request = {
  employeeName: "Chidi Nwosu",
  leaveType: "Annual",
  from: "2026-10-12",
  to: "2026-10-16",
  days: 5,
};

const annual = (over: Partial<LeaveBalanceRow> = {}): LeaveBalanceRow => ({
  leaveTypeId: null,
  leaveType: "Annual",
  year: 2026,
  entitled: 20,
  carriedIn: 0,
  taken: 7,
  pending: 0,
  remaining: 13,
  ...over,
});

describe("a final approval", () => {
  const copy = leaveDecidedCopy({
    request,
    stage: "final",
    balances: [annual()],
  });

  it("says what was approved, for whom", () => {
    expect(copy.title).toBe("Chidi Nwosu's annual leave is approved");
  });

  it("carries the days and the dates", () => {
    expect(copy.lead).toBe("5 days, 12 Oct to 16 Oct.");
  });

  it("says what is left, and that they show as on leave", () => {
    expect(copy.details).toEqual([
      "13 days of 20 annual days left in 2026.",
      "Chidi shows as on leave in attendance for those days.",
    ]);
  });

  it("names one date once, and one day in the singular", () => {
    const one = leaveDecidedCopy({
      request: { ...request, from: "2026-10-12", to: "2026-10-12", days: 1 },
      stage: "final",
      balances: [],
    });
    expect(one.lead).toBe("1 day, 12 Oct.");
  });

  it("does not add 'leave' to a type that already says it", () => {
    const sick = leaveDecidedCopy({
      request: { ...request, leaveType: "Sick leave" },
      stage: "final",
      balances: [],
    });
    expect(sick.title).toBe("Chidi Nwosu's sick leave is approved");
  });
});

describe("a first approval, still waiting on HR", () => {
  const copy = leaveDecidedCopy({
    request,
    stage: "first",
    balances: [annual()],
  });

  it("does not say approved", () => {
    expect(copy.title).toBe("Chidi Nwosu's annual leave has your approval");
    expect(copy.title).not.toMatch(/is approved/);
    expect(copy.lead).toBe("5 days, 12 Oct to 16 Oct. HR decides next.");
  });

  it("says the person is not told yet, and nothing else about the future", () => {
    expect(copy.details).toEqual(["Chidi is not told until HR has decided."]);
  });
});

describe("the balance line", () => {
  it("is absent when the type has no entitlement", () => {
    expect(
      balanceLine(request, [annual({ entitled: 0, remaining: 0 })]),
    ).toBeNull();
    expect(balanceLine(request, [])).toBeNull();
  });

  it("reads the year the leave falls in, not the year it was approved", () => {
    const next = { ...request, from: "2027-01-05", to: "2027-01-09" };
    expect(balanceLine(next, [annual()])).toBeNull();
    expect(balanceLine(next, [annual({ year: 2027, remaining: 18 })])).toBe(
      "18 days of 20 annual days left in 2027.",
    );
  });

  it("says so when the approval takes them past their entitlement", () => {
    expect(balanceLine(request, [annual({ remaining: -2 })])).toBe(
      "This takes them 2 days past their annual entitlement.",
    );
  });

  it("ignores another type's balance", () => {
    expect(
      balanceLine(request, [annual({ leaveType: "Sick", remaining: 3 })]),
    ).toBeNull();
  });
});
