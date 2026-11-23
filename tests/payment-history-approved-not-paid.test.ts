/**
 * U34 (PAY-12): payment history said "Downloaded (paid at your bank)" for
 * every salary in an approved batch, the moment it was approved, though
 * nothing had been paid and nobody had recorded a payment; and a "Net paid"
 * card added up only the fifty rows on the page. A payment in an approved
 * batch reads "Approved, not paid" until somebody records the bank paid it,
 * and the page-sum card is gone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { paymentOutcome } from "@/lib/api/payments";

describe("a pending payment in an approved batch", () => {
  it("is approved, not paid, and moved nothing", () => {
    const outcome = paymentOutcome({
      status: "PENDING",
      batchStatus: "APPROVED",
    });
    expect(outcome.label).toBe("Approved, not paid");
    expect(outcome.moved).toBe("no");
  });
  it("is still Paid once the bank payment is recorded", () => {
    expect(
      paymentOutcome({ status: "SETTLED", batchStatus: "COMPLETED" }).label,
    ).toBe("Paid");
  });
});

describe("payment history", () => {
  it("has no card summing one page", () => {
    const screen = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../src/app/(app)/payroll/payments/history/history-screen.tsx",
      ),
      "utf8",
    );
    expect(screen).not.toContain("pageNetKobo");
  });
});
