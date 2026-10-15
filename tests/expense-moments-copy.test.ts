import { describe, expect, it } from "vitest";
import {
  claimApprovedCopy,
  claimDeclinedToast,
  claimSentCopy,
  expenseTypeSavedTitle,
} from "@/app/(app)/payroll/expenses/expense-moments-copy";

/**
 * What is said when an expense claim is sent, approved or declined.
 *
 * Tested because the sentences are the feature: each has to be true of the
 * thing that just happened. The two easiest to get wrong are saying "your claim"
 * when somebody filed it for a colleague, and closing an approval on a line that
 * reads as though the money had moved.
 */

const claim = {
  amount: 4500,
  type: "Fuel",
  incurredOn: "2026-10-12",
};

describe("a claim that was just sent", () => {
  const copy = claimSentCopy(claim);

  it("says what happened, about the claim", () => {
    expect(copy.title).toBe("Your claim is sent for approval");
  });

  it("carries the figure, the kind and the day", () => {
    expect(copy.lead).toBe("₦4,500.00 under Fuel, spent 12 Oct.");
  });

  it("says what is not true yet, and what can still be done", () => {
    expect(copy.details).toEqual([
      "Nothing is owed to you until somebody approves it.",
      "You can change it while it is waiting for a decision.",
    ]);
  });

  it("never says anybody has been told", () => {
    const all = [copy.title, copy.lead, ...copy.details].join(" ");
    expect(all).not.toMatch(/told|notified|informed|alerted/i);
    expect(all).not.toMatch(/!/);
  });

  it("keeps the kobo", () => {
    expect(claimSentCopy({ ...claim, amount: 1234.5 }).lead).toBe(
      "₦1,234.50 under Fuel, spent 12 Oct.",
    );
  });
});

describe("a claim filed for somebody else", () => {
  const copy = claimSentCopy({ ...claim, forName: "Chidi Nwosu" });

  it("is about them, not about you", () => {
    expect(copy.title).toBe("Chidi Nwosu's claim is sent for approval");
    expect(copy.details).toEqual([
      "Nothing is owed to Chidi until somebody approves it.",
      "It can be changed while it is waiting for a decision.",
    ]);
    expect([copy.title, ...copy.details].join(" ")).not.toMatch(
      /\byou\b|\byour\b/i,
    );
  });

  it("reads as your own when the name is empty", () => {
    expect(claimSentCopy({ ...claim, forName: "  " }).title).toBe(
      "Your claim is sent for approval",
    );
    expect(claimSentCopy({ ...claim, forName: null }).title).toBe(
      "Your claim is sent for approval",
    );
  });
});

describe("a claim an approver just approved", () => {
  const copy = claimApprovedCopy({ ...claim, employeeName: "Chidi Nwosu" });

  it("names whose claim, and says approved", () => {
    expect(copy.title).toBe("Chidi Nwosu's expense claim is approved");
    expect(copy.lead).toBe("₦4,500.00 under Fuel, spent 12 Oct.");
  });

  it("says it is owed, not paid", () => {
    expect(copy.details[0]).toBe(
      "₦4,500.00 is now owed to Chidi until it is paid.",
    );
    expect(copy.details.join(" ")).not.toMatch(
      /\b(has been|was|already) paid\b/,
    );
  });

  it("says how it gets paid, as two ways and not a promise of timing", () => {
    expect(copy.details[1]).toBe(
      "It can be paid through payroll, or marked paid once you have sent it.",
    );
  });
});

describe("a claim that was declined", () => {
  it("names whose, and says where the reason is read", () => {
    expect(claimDeclinedToast({ employeeName: "Chidi Nwosu" })).toEqual({
      title: "Declined Chidi Nwosu's claim",
      detail: "They can read your reason on the claim.",
    });
  });
});

describe("an expense type that was saved", () => {
  it("says which one", () => {
    expect(expenseTypeSavedTitle("Fuel")).toBe("Fuel saved");
  });

  it("does not say 'undefined saved' when the name is not to hand", () => {
    expect(expenseTypeSavedTitle(undefined)).toBe("Expense type saved");
    expect(expenseTypeSavedTitle("  ")).toBe("Expense type saved");
  });
});
