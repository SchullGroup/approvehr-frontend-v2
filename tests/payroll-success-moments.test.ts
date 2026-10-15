import { describe, expect, it } from "vitest";
import {
  approvedRunCopy,
  settledLine,
  stillUnpaid,
  type ApprovedRunFacts,
} from "@/app/(app)/payroll/runs/new/approved-moment";
import { recordedPaymentCopy } from "@/components/payroll/payment-recorded";
import type { RecordedPayment } from "@/components/payroll/record-paid-dialog";

/**
 * The words said when the two biggest money moments finish.
 *
 * These are tested because the whole point of them is that every sentence is
 * true of the thing that just happened: a count that is wrong, a "nobody has
 * been paid" said after somebody has, or a plural that does not agree is the
 * kind of defect nobody finds until it is on a customer's screen.
 */

const facts: ApprovedRunFacts = {
  runId: "run-1",
  period: "2026-05",
  netKobo: 1_842_000_000,
  employeeCount: 42,
  settled: { loans: 2, claims: 1, overtime: 0 },
};

describe("settledLine", () => {
  it("names what was settled, and only that", () => {
    expect(settledLine({ loans: 2, claims: 1, overtime: 0 })).toBe(
      "2 loan instalments and 1 expense claim were settled.",
    );
    expect(settledLine({ loans: 1, claims: 0, overtime: 0 })).toBe(
      "1 loan instalment was settled.",
    );
    expect(settledLine({ loans: 0, claims: 0, overtime: 3 })).toBe(
      "3 overtime entries were settled.",
    );
    expect(settledLine({ loans: 1, claims: 2, overtime: 1 })).toBe(
      "1 loan instalment, 2 expense claims and 1 overtime entry were settled.",
    );
  });

  it("says so when there was nothing to settle", () => {
    expect(settledLine({ loans: 0, claims: 0, overtime: 0 })).toBe(
      "Nothing else needed settling.",
    );
  });
});

describe("approvedRunCopy", () => {
  it("carries the figure and says nobody has been paid", () => {
    const copy = approvedRunCopy(facts, {
      id: "b",
      reference: "PAY-7",
      status: "DRAFT",
    });
    expect(copy.title).toBe("May 2026 payroll is approved");
    expect(copy.lead).toBe(
      "42 payslips, ₦18,420,000.00 net. Nobody has been paid yet.",
    );
    expect(copy.details).toContain("Payment PAY-7 is prepared.");
  });

  it("does not claim a payment exists when none was built", () => {
    const copy = approvedRunCopy(facts, null);
    expect(copy.lead).toContain("Nobody has been paid yet.");
    expect(copy.details.join(" ")).not.toContain("is prepared");
  });

  it("agrees with a single payslip", () => {
    const copy = approvedRunCopy({ ...facts, employeeCount: 1 }, null);
    expect(copy.lead.startsWith("1 payslip,")).toBe(true);
  });
});

describe("stillUnpaid", () => {
  it("holds until a batch is recorded, sent, failed or stopped", () => {
    expect(stillUnpaid(null)).toBe(true);
    for (const status of ["DRAFT", "AWAITING_APPROVAL", "APPROVED"]) {
      expect(stillUnpaid({ id: "b", reference: "R", status })).toBe(true);
    }
    for (const status of [
      "COMPLETED",
      "SUBMITTED",
      "PARTIALLY_SETTLED",
      "FAILED",
      "CANCELLED",
    ]) {
      expect(stillUnpaid({ id: "b", reference: "R", status })).toBe(false);
    }
  });
});

describe("recordedPaymentCopy", () => {
  const recorded: RecordedPayment = {
    batchId: "b",
    reference: "PAY-7",
    totalKobo: 1_842_000_000,
    settled: 42,
    people: "42 people",
    paidOn: "2026-05-29",
    bankReference: null,
  };

  it("states the amount, the people and the date that was typed", () => {
    const copy = recordedPaymentCopy(recorded);
    expect(copy.title).toBe("PAY-7 is recorded as paid by your bank");
    expect(copy.lead).toBe("₦18,420,000.00 to 42 people, paid on 29 May 2026.");
    expect(copy.details).toEqual(["The wallet has come down by that amount."]);
  });

  it("says today when no date was typed, and keeps the bank's reference", () => {
    const copy = recordedPaymentCopy({
      ...recorded,
      paidOn: null,
      bankReference: "NIP-99887766",
    });
    expect(copy.lead).toBe("₦18,420,000.00 to 42 people, dated today.");
    expect(copy.details).toContain(
      "Your bank's reference, NIP-99887766, is saved on the ledger line.",
    );
  });

  it("does not describe a repeat press as a fresh recording", () => {
    const copy = recordedPaymentCopy({ ...recorded, settled: 0 });
    expect(copy.title).toBe("PAY-7 was already recorded as paid");
    expect(copy.details).toEqual([]);
  });
});

describe("voice", () => {
  it("has no exclamation marks, congratulation or emoji anywhere", () => {
    const batch = { id: "b", reference: "PAY-7", status: "APPROVED" };
    const lines = [
      ...Object.values(approvedRunCopy(facts, batch)).flat(),
      ...Object.values(approvedRunCopy(facts, null)).flat(),
      ...Object.values(
        recordedPaymentCopy({
          batchId: "b",
          reference: "PAY-7",
          totalKobo: 100,
          settled: 1,
          people: "1 person",
          paidOn: null,
          bankReference: "X",
        }),
      ).flat(),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/!|congratulat|well done|success/i);
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
