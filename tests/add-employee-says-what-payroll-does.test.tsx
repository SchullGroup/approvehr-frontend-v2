/**
 * U53 (HR-15, NC-14): the add-employee form said the opposite of what the
 * payroll run does. Skipping tax details "and their payslip will not show
 * PAYE" (it does, on the company's state); skipping pension "the payroll run
 * will hold them back" (it pays them, with a warning). Settings said "Off
 * means payslips show no PAYE" under a heading saying turning one off does
 * not change anybody's pay. And the first-payslip preview rounded to whole
 * naira while the run does not, and showed NHF as "₦-0" with NHF switched off.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FEATURE_COPY, SKIP_CONSEQUENCE } from "@/lib/store/features";

const slip = {
  grossKobo: 60000000,
  pensionEmployeeKobo: 4800000,
  pensionEmployerKobo: 6000000,
  nhfKobo: 0,
  payeKobo: 8867750,
  netKobo: 46332250,
  reliefUnclaimed: false,
  operates: { paye: "DEDUCTED", pension: "DEDUCTED", nhf: "NOT_OPERATED" },
};
vi.mock("@/lib/store/payslip-quote", () => ({
  usePayslipQuote: () => ({
    quote: { slip },
    loading: false,
    error: null,
    available: true,
  }),
}));
vi.mock("@/components/payroll/quote-workings", () => ({
  QuoteWorkings: () => null,
}));

import { FirstPayslip } from "@/app/(app)/people/new/form";

describe("what skipping a group says", () => {
  it("says PAYE is still deducted, not that it will not show", () => {
    expect(SKIP_CONSEQUENCE.taxSetup).not.toMatch(/will not show PAYE/);
    expect(SKIP_CONSEQUENCE.taxSetup).toMatch(/PAYE is still deducted/);
  });
  it("says a missing RSA PIN does not hold back their pay", () => {
    expect(SKIP_CONSEQUENCE.pensionSetup).not.toMatch(/hold them back/);
    expect(SKIP_CONSEQUENCE.pensionSetup).toMatch(
      /does not hold back their pay/,
    );
  });
  it("does not say a record switch turns PAYE or pension off", () => {
    expect(FEATURE_COPY.taxSetup.line).not.toMatch(/show no PAYE/);
    expect(FEATURE_COPY.pensionSetup.line).not.toMatch(
      /no pension is deducted/,
    );
  });
});

describe("the first payslip preview", () => {
  it("shows kobo as the run does, and no NHF row when NHF is off", () => {
    render(<FirstPayslip grossKobo={60000000} annualRentKobo={null} />);
    const row = (label: string) =>
      screen.getByText(label).parentElement?.textContent ?? "";
    expect(row("PAYE")).toContain("−₦88,677.50");
    expect(row("Net monthly")).toContain("₦463,322.50");
    expect(screen.queryByText("NHF")).toBeNull();
    expect(screen.queryByText(/₦-/)).toBeNull();
  });
});
