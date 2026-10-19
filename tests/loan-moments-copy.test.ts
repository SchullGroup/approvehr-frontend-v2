import { describe, expect, it } from "vitest";
import {
  loanApprovedCopy,
  loanRequestedCopy,
} from "@/app/(app)/payroll/loans/loan-moments-copy";

/**
 * What is said when a staff loan is asked for, or approved.
 *
 * Tested because each sentence has to be true of what just happened: a request
 * deducts nothing and decides nothing, an approval on different terms is not
 * the loan that was applied for, and nobody is said to have been told.
 */

const loan = {
  principalKobo: 30_000_000,
  termMonths: 6,
  monthlyRepaymentKobo: 5_000_000,
  interestKobo: 0,
};

describe("a loan that was just asked for", () => {
  const copy = loanRequestedCopy({ loan, startPeriod: "2026-11-01" });

  it("says what happened, about the request", () => {
    expect(copy.title).toBe("Your loan request is sent for approval");
  });

  it("carries the amount, the term and the monthly figure", () => {
    expect(copy.lead).toBe("₦300,000.00 over 6 months, ₦50,000.00 a month.");
  });

  it("says nothing is deducted, and asks for a start month rather than fixing one", () => {
    expect(copy.details).toEqual([
      "Nothing is deducted until somebody approves it.",
      "You asked for the first deduction in November 2026.",
      "You can withdraw it while it is waiting.",
    ]);
  });

  it("names interest only when there is some", () => {
    const withInterest = loanRequestedCopy({
      loan: { ...loan, interestKobo: 750_000 },
      startPeriod: "2026-11-01",
    });
    expect(withInterest.details).toContain("It includes ₦7,500.00 interest.");
    expect(copy.details.join(" ")).not.toMatch(/interest/i);
  });

  it("says a month in the singular", () => {
    const one = loanRequestedCopy({
      loan: { ...loan, termMonths: 1, monthlyRepaymentKobo: 30_000_000 },
      startPeriod: "2026-11-01",
    });
    expect(one.lead).toBe("₦300,000.00 over 1 month, ₦300,000.00 a month.");
  });

  it("never says anybody has been told", () => {
    const all = [copy.title, copy.lead, ...copy.details].join(" ");
    expect(all).not.toMatch(/told|notified|informed|alerted/i);
    expect(all).not.toMatch(/!/);
  });
});

describe("a loan applied for on somebody else's behalf", () => {
  const copy = loanRequestedCopy({
    loan,
    startPeriod: "2026-11-01",
    forName: "Chidi Nwosu",
  });

  it("is about them, and does not offer them a withdrawal that is theirs to make", () => {
    expect(copy.title).toBe("Chidi Nwosu's loan request is sent for approval");
    expect(copy.details).toEqual([
      "Nothing is deducted until somebody approves it.",
      "The first deduction asked for is November 2026.",
    ]);
    expect([copy.title, ...copy.details].join(" ")).not.toMatch(
      /\byou\b|\byour\b/i,
    );
  });
});

describe("a loan an approver just approved", () => {
  const approved = {
    ...loan,
    employeeName: "Chidi Nwosu",
    startPeriod: "2026-11-01",
  };
  const copy = loanApprovedCopy({ loan: approved });

  it("names whose loan, and says approved", () => {
    expect(copy.title).toBe("Chidi Nwosu's loan is approved");
    expect(copy.lead).toBe("₦300,000.00 over 6 months, ₦50,000.00 a month.");
  });

  it("says when it starts and where it comes out of", () => {
    expect(copy.details).toEqual([
      "The first deduction is November 2026.",
      "It comes out of their net pay, after tax.",
    ]);
  });

  it("has no start line when the API has not set one", () => {
    const none = loanApprovedCopy({
      loan: { ...approved, startPeriod: null },
    });
    expect(none.details).toEqual(["It comes out of their net pay, after tax."]);
  });

  it("says so when the approval changed the terms, and what was asked for", () => {
    const changed = loanApprovedCopy({
      loan: {
        ...approved,
        principalKobo: 20_000_000,
        monthlyRepaymentKobo: 3_333_334,
      },
      askedFor: { principalKobo: 30_000_000, termMonths: 3 },
    });
    expect(changed.title).toBe(
      "Chidi Nwosu's loan is approved on different terms",
    );
    expect(changed.lead).toBe("₦200,000.00 over 6 months, ₦33,333.34 a month.");
    expect(changed.details).toContain(
      "They asked for ₦300,000.00 over 3 months.",
    );
  });

  it("does not call it different terms when only the start month moved", () => {
    const same = loanApprovedCopy({
      loan: approved,
      askedFor: { principalKobo: 30_000_000, termMonths: 6 },
    });
    expect(same.title).toBe("Chidi Nwosu's loan is approved");
    expect(same.details.join(" ")).not.toMatch(/asked for/);
  });
});
