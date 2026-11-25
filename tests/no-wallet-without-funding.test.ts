/**
 * U30 (PAY-6, PAY-24), web part: a company with no funding account and no
 * payment provider was shown "Pay ₦29,802,261.39 to 62 people", which did
 * nothing, a wallet strip before approval, and a large wallet banner saying
 * there was no account. Wallet payout counts only where a payout can actually
 * run; otherwise the bank file is the primary action, there is no Pay button
 * and no wallet strip, and the Wallet page says one plain line.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { paysFromWallet } from "@/lib/pay/wallet-payout";

const read = (p: string) =>
  readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("whether a payroll is paid from the wallet", () => {
  it("needs the setting and a payout that can run", () => {
    expect(paysFromWallet(true, { payoutAvailable: true })).toBe(true);
    expect(paysFromWallet(true, { payoutAvailable: false })).toBe(false);
    expect(paysFromWallet(true, {})).toBe(false);
    expect(paysFromWallet(false, { payoutAvailable: true })).toBe(false);
  });
});

describe("the screens", () => {
  it("pay panel and approve step ask it", () => {
    expect(read("src/app/(app)/payroll/runs/new/pay-panel.tsx")).toContain(
      "paysFromWallet(paySettings.payout.wallet, run)",
    );
    expect(read("src/app/(app)/payroll/runs/new/approve-step.tsx")).toMatch(
      /paysFromWallet\(/,
    );
  });
  it("the Wallet page has no wallet card without a funding account", () => {
    expect(
      read("src/app/(app)/payroll/payments/payments-screen.tsx"),
    ).toContain("noFundingAccount");
  });
});
