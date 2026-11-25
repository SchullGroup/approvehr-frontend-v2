import { describe, expect, it } from "vitest";
import type { ApiLoan, LoanStatus } from "@/lib/api/loans";
import {
  MAX_LOANS_ON_PAGE,
  chooseOthers,
  orderLoans,
  statusLine,
  summaryOf,
} from "@/lib/loans/person-page";

/**
 * What a person's loan page is made of, apart from how it is drawn: which loan
 * comes first and in what order the rest follow, what the summary adds up, and
 * the line that says how many are in which state.
 */

const loan = (
  id: string,
  status: LoanStatus,
  over: Partial<ApiLoan> = {},
): ApiLoan => ({
  id,
  employeeId: "e1",
  employeeName: "Chinedu Okwu",
  employeeNo: "EMP-1",
  jobTitle: "Welder",
  principalKobo: 100_000_00,
  interestRate: 0,
  interestKobo: 0,
  totalRepayableKobo: 100_000_00,
  termMonths: 10,
  monthlyRepaymentKobo: 10_000_00,
  outstandingKobo: 80_000_00,
  status,
  reason: null,
  startPeriod: "2026-10-01",
  decidedById: null,
  decidedByName: null,
  decidedAt: null,
  declinedReason: null,
  completedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("the order the loans after the first are listed in", () => {
  it("puts a waiting loan first, then those being repaid, then the history", () => {
    const ordered = orderLoans([
      loan("declined", "DECLINED"),
      loan("settled", "SETTLED"),
      loan("active", "ACTIVE"),
      loan("pending", "PENDING"),
      loan("folded", "CONSOLIDATED"),
    ]).map((l) => l.id);
    expect(ordered).toEqual([
      "pending",
      "active",
      "settled",
      "declined",
      "folded",
    ]);
  });

  it("treats an approved loan as one being repaid", () => {
    const ordered = orderLoans([
      loan("a", "ACTIVE", { createdAt: "2026-10-01T00:00:00.000Z" }),
      loan("b", "APPROVED", { createdAt: "2026-11-01T00:00:00.000Z" }),
    ]).map((l) => l.id);
    /* Same rank, so newest first. Were APPROVED ranked apart, `a` would lead. */
    expect(ordered).toEqual(["b", "a"]);
  });

  it("puts the newest first inside a status, and keeps equal times in the order given", () => {
    const same = "2026-10-01T00:00:00.000Z";
    const ordered = orderLoans([
      loan("old", "ACTIVE", { createdAt: "2026-08-01T00:00:00.000Z" }),
      loan("tie-1", "ACTIVE", { createdAt: same }),
      loan("new", "ACTIVE", { createdAt: "2026-11-01T00:00:00.000Z" }),
      loan("tie-2", "ACTIVE", { createdAt: same }),
    ]).map((l) => l.id);
    expect(ordered).toEqual(["new", "tie-1", "tie-2", "old"]);
  });

  it("does not reorder what it was given", () => {
    const given = [loan("b", "SETTLED"), loan("a", "PENDING")];
    orderLoans(given);
    expect(given.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("the loans under the one that was opened", () => {
  it("leaves the opened loan out, whatever its place in the list", () => {
    const { shown } = chooseOthers(
      "b",
      [loan("a", "ACTIVE"), loan("b", "PENDING"), loan("c", "SETTLED")],
      3,
    );
    expect(shown.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("says nothing was left off when every loan fits", () => {
    expect(
      chooseOthers("a", [loan("a", "ACTIVE"), loan("b", "ACTIVE")], 2).leftOff,
    ).toBe(0);
  });

  it("stops at the room the page has and says how many it left off", () => {
    const many = Array.from({ length: MAX_LOANS_ON_PAGE + 5 }, (_, n) =>
      loan(`l${String(n)}`, "SETTLED", {
        createdAt: `2026-01-${String(n + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const { shown, leftOff } = chooseOthers("l0", many, many.length);
    /* One place is the opened loan's, so there are room-1 below it. */
    expect(shown).toHaveLength(MAX_LOANS_ON_PAGE - 1);
    expect(leftOff).toBe(many.length - 1 - (MAX_LOANS_ON_PAGE - 1));
  });

  it("counts the loans a short list did not carry, from the total the API gave", () => {
    const { shown, leftOff } = chooseOthers(
      "a",
      [loan("a", "ACTIVE"), loan("b", "ACTIVE")],
      230,
    );
    expect(shown).toHaveLength(1);
    expect(leftOff).toBe(229 - 1);
  });

  it("counts every loan as another when the opened one is not in the list (it was folded)", () => {
    const { shown, leftOff } = chooseOthers(
      "folded",
      [loan("a", "ACTIVE"), loan("b", "SETTLED")],
      2,
    );
    expect(shown.map((l) => l.id)).toEqual(["a", "b"]);
    expect(leftOff).toBe(0);
  });
});

describe("the summary over a person's loans", () => {
  it("adds up what was borrowed, what is left and what comes out a month", () => {
    const summary = summaryOf([
      loan("a", "ACTIVE", {
        principalKobo: 200_000_00,
        outstandingKobo: 150_000_00,
        monthlyRepaymentKobo: 50_000_00,
      }),
      loan("b", "ACTIVE", {
        principalKobo: 150_000_00,
        outstandingKobo: 100_000_00,
        monthlyRepaymentKobo: 50_000_00,
      }),
    ]);
    expect(summary?.figures).toMatchObject({
      borrowedKobo: 350_000_00,
      leftKobo: 250_000_00,
      monthlyKobo: 100_000_00,
    });
    expect(summary?.count).toBe(2);
  });

  it("does not count a waiting loan as money lent, and says it was left out", () => {
    const summary = summaryOf([
      loan("a", "ACTIVE", { principalKobo: 200_000_00 }),
      loan("b", "PENDING", { principalKobo: 10_000_00 }),
    ]);
    expect(summary?.figures.borrowedKobo).toBe(200_000_00);
    expect(summary?.leavesOutRequests).toBe(true);
  });

  it("does not say anything was left out when nothing is waiting or declined", () => {
    const summary = summaryOf([loan("a", "ACTIVE"), loan("b", "SETTLED")]);
    expect(summary?.leavesOutRequests).toBe(false);
  });

  it("never adds a loan that was folded into another, which would count it twice", () => {
    const summary = summaryOf([
      loan("took-over", "ACTIVE", {
        principalKobo: 150_000_00,
        outstandingKobo: 100_000_00,
      }),
      loan("folded", "CONSOLIDATED", {
        principalKobo: 100_000_00,
        outstandingKobo: 100_000_00,
      }),
    ]);
    expect(summary?.count).toBe(1);
    expect(summary?.figures.borrowedKobo).toBe(150_000_00);
    expect(summary?.figures.leftKobo).toBe(100_000_00);
  });

  it("is absent, not zero, for a person with nothing to add up", () => {
    expect(summaryOf([])).toBeNull();
    expect(summaryOf([loan("folded", "CONSOLIDATED")])).toBeNull();
  });

  it("leaves a figure null when none of the loans has one, rather than printing nil", () => {
    const summary = summaryOf([loan("a", "PENDING"), loan("b", "DECLINED")]);
    expect(summary?.figures.borrowedKobo).toBeNull();
    expect(summary?.figures.leftKobo).toBeNull();
    expect(summary?.figures.monthlyKobo).toBeNull();
  });
});

describe("the line that says how many loans are in which state", () => {
  const word = (status: LoanStatus) =>
    ({
      PENDING: "Waiting",
      APPROVED: "Approved",
      ACTIVE: "Being repaid",
      SETTLED: "Fully repaid",
      DECLINED: "Declined",
      CONSOLIDATED: "Combined",
    })[status];
  const counts = (over: Partial<Record<LoanStatus, number>>) => ({
    PENDING: 0,
    APPROVED: 0,
    ACTIVE: 0,
    SETTLED: 0,
    DECLINED: 0,
    CONSOLIDATED: 0,
    ...over,
  });

  it("names what is waiting first, in the screen's own words, and leaves out nothing present", () => {
    expect(statusLine(counts({ PENDING: 1, ACTIVE: 2 }), word)).toBe(
      "1 waiting, 2 being repaid",
    );
    expect(
      statusLine(counts({ ACTIVE: 1, SETTLED: 3, DECLINED: 1 }), word),
    ).toBe("1 being repaid, 3 fully repaid, 1 declined");
  });

  it("leaves a state out when there are none, rather than saying 0", () => {
    expect(statusLine(counts({ SETTLED: 2 }), word)).toBe("2 fully repaid");
  });

  it("counts an approved loan with those being repaid, as the list does", () => {
    expect(statusLine(counts({ ACTIVE: 1, APPROVED: 1 }), word)).toBe(
      "2 being repaid",
    );
  });
});
