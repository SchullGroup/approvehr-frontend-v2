import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayslipDocument } from "@/components/payroll/payslip-document";
import type { Payslip, RateWorking } from "@/lib/api/payroll";

/**
 * "8% of what?" — the sentence a pension line was missing.
 *
 * Christianah asked for transparency about tax **and pension**. The tax half is
 * the band table; this is the other, and it is one line under each statutory
 * deduction saying the rate, the base, and which parts of the pay were counted.
 *
 * Two things worth a test, neither visible to `tsc`:
 *
 *  - it renders the API's figures rather than deriving a percentage back out of
 *    the deduction, which is what this document has always refused to do;
 *  - **absent stays absent.** The API sends a working only where the rate times
 *    the base reproduces the figure exactly, and the common case — an older
 *    payslip, or somebody with a pensionable allowance — is null. A line that
 *    grew a confident working there would be quoting a base that did not
 *    produce the deduction, to the one reader who came to check it.
 */

const PENSION: RateWorking = {
  rate: 0.08,
  baseKobo: 500_000_00,
  amountKobo: 40_000_00,
  baseLabel: "basic, housing and transport",
};

const NHF: RateWorking = {
  rate: 0.025,
  baseKobo: 300_000_00,
  amountKobo: 7_500_00,
  baseLabel: "basic salary",
};

const slipWith = (workings: Payslip["workings"]): Payslip =>
  ({
    id: "ps-1",
    employeeId: "e-1",
    employeeNo: "AHR-0001",
    name: "Example Alpha",
    grossKobo: 500_000_00,
    basicKobo: 300_000_00,
    housingKobo: 100_000_00,
    transportKobo: 100_000_00,
    pensionEmployeeKobo: 40_000_00,
    pensionEmployerKobo: 50_000_00,
    nhfKobo: 7_500_00,
    taxableIncomeKobo: 400_000_00,
    reliefKobo: 50_000_00,
    payeKobo: 63_950_00,
    payeOverridden: false,
    payeOverrideReason: null,
    workings,
    operates: { paye: "DEDUCTED", pension: "DEDUCTED", nhf: "DEDUCTED" },
    otherDeductionsKobo: 0,
    netKobo: 388_550_00,
    unpaidDays: 0,
    proratedDeductionKobo: 0,
    publishedAt: null,
    emailedAt: null,
    viewedAt: null,
    lines: [],
  }) as unknown as Payslip;

const draw = (workings: Payslip["workings"]) =>
  render(
    <PayslipDocument
      employee={{ name: "Example Alpha", employeeNo: "AHR-0001" }}
      slip={slipWith(workings)}
      period="August 2026"
      payDate="25 August 2026"
      /* Required, and required on purpose: this prop used to default to a
         fabricated legal name and RC number, which any caller that omitted it
         printed on a real person's payslip. See the note on it. */
      company={{ name: "Example Ltd", rc: "RC000000", address: "1 Example Way" }}
    />,
  );

describe("what a statutory deduction was charged on", () => {
  it("says the rate, the base and which parts of the pay counted", () => {
    draw({ paye: null, pension: PENSION, nhf: NHF });
    expect(
      screen.getByText("8% of ₦500,000.00 — basic, housing and transport"),
    ).toBeInTheDocument();
    /* A fractional rate keeps its decimals; a whole one does not grow any. */
    expect(
      screen.getByText("2.50% of ₦300,000.00 — basic salary"),
    ).toBeInTheDocument();
  });

  it("says nothing where the API could not stand behind a working", () => {
    draw({ paye: null, pension: null, nhf: null });
    /* The lines themselves still print — the deductions happened. What is gone
       is the claim about what they were charged on. */
    expect(screen.getByText("₦40,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/% of ₦/)).not.toBeInTheDocument();
  });

  it("says nothing on a payslip from before the workings existed", () => {
    draw(undefined);
    expect(screen.getByText("₦40,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/% of ₦/)).not.toBeInTheDocument();
  });
});
