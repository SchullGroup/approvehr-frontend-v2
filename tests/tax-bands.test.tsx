import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TaxBands } from "@/components/payroll/tax-bands";
import { formatKobo, type Payslip } from "@/lib/api/payroll";

/**
 * The band table on a payslip, and the two ways it must never be wrong.
 *
 * Christianah asked for the workings behind a tax figure to be visible. The
 * whole value of showing them is that somebody can **check** the deduction, so
 * the two properties worth a test are the two that would destroy that:
 *
 *  - **the column adds up to the total printed under it.** A table a kobo out
 *    is the discrepancy the reader came looking for, and it would be ours;
 *  - **nothing renders when the API sent no working.** The API refuses to
 *    offer one it cannot stand behind — a hand-entered tax figure, a nil, a
 *    period whose bands do not reproduce the charge — and a renderer that
 *    filled the gap with an empty table would undo that refusal.
 *
 * Neither is visible to `tsc`: `bands: []` and a total that does not match are
 * both perfectly typed.
 */

/**
 * A payslip with only what this component reads. Everything else on `Payslip`
 * is irrelevant here and casting says so once rather than inventing forty
 * fields that no assertion touches.
 */
const slipWith = (workings: Payslip["workings"], payeKobo = 63_950_00) =>
  ({ payeKobo, workings }) as Payslip;

/**
 * ₦500,000 a month under the Nigeria Tax Act 2025 — the figure the incident
 * this engine was rewritten over turned on. First ₦800,000 exempt, then 15%.
 *
 * The annual total ends in **five kobo on purpose**. `annualPaye` rounds once
 * at the end, so a year's tax lands on any kobo, and the monthly figure is that
 * over twelve, rounded — which means `payeKobo * 12` is *not* the annual total
 * and a component that recomputed it would print a figure five kobo out. With
 * a round fixture the two are identical and the test cannot tell a read from a
 * recomputation, which is exactly the mistake it exists to catch.
 */
const REAL_WORKING = {
  paye: {
    taxableAnnualKobo: 4_800_000_00,
    reliefAnnualKobo: 600_000_00,
    annualKobo: 767_400_05,
    bands: [
      { widthKobo: 800_000_00, rate: 0, taxedKobo: 800_000_00, taxKobo: 0 },
      {
        widthKobo: 2_200_000_00,
        rate: 0.15,
        taxedKobo: 2_200_000_00,
        taxKobo: 330_000_00,
      },
      {
        widthKobo: null,
        rate: 0.18,
        taxedKobo: 1_800_000_00,
        taxKobo: 437_400_05,
      },
    ],
  },
  /* Not what this file is about — `TaxBands` reads only `paye` — but the type
     requires them, which is the type doing its job: a payslip that carries one
     working and silently omits the other two is a payslip half-explained. */
  pension: null,
  nhf: null,
} satisfies Payslip["workings"];

const open = async () =>
  userEvent.click(screen.getByRole("button", { name: /How this tax figure/ }));

describe("the working explains the figure beside it", () => {
  it("adds up to the total it prints", async () => {
    render(<TaxBands slip={slipWith(REAL_WORKING)} />);
    await open();

    const summed = REAL_WORKING.paye.bands.reduce((t, b) => t + b.taxKobo, 0);
    expect(summed).toBe(REAL_WORKING.paye.annualKobo);
    /* And the figure on screen is that total, not a second one worked out
       here. Nothing in this component does arithmetic on money — see the
       fixture's note on why the five kobo are what proves it. */
    expect(
      screen.getByText(formatKobo(REAL_WORKING.paye.annualKobo)),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(formatKobo(63_950_00 * 12)),
    ).not.toBeInTheDocument();
  });

  it("divides by twelve to the payslip's own tax line", async () => {
    render(<TaxBands slip={slipWith(REAL_WORKING, 63_950_00)} />);
    await open();
    expect(screen.getByText("₦63,950.00")).toBeInTheDocument();
  });

  it("says the top band is open-ended rather than printing a sentinel", async () => {
    render(<TaxBands slip={slipWith(REAL_WORKING)} />);
    await open();
    /* `widthKobo: null` means "and everything above". A figure there would be
       a confident claim about a ceiling that does not exist. */
    expect(screen.getByText("Everything above that")).toBeInTheDocument();
    expect(screen.getByText("First ₦800,000.00")).toBeInTheDocument();
  });

  it("shows the relief coming off the taxable base", async () => {
    render(<TaxBands slip={slipWith(REAL_WORKING)} />);
    await open();
    /* Gross taxable, less relief, equals taxed-on — the three lines somebody
       reconciles before they even reach the bands. */
    expect(screen.getByText("₦5,400,000.00")).toBeInTheDocument();
    expect(screen.getByText("− ₦600,000.00")).toBeInTheDocument();
    expect(screen.getByText("₦4,800,000.00")).toBeInTheDocument();
  });

  it("is closed until somebody asks", () => {
    render(<TaxBands slip={slipWith(REAL_WORKING)} />);
    /* Rule 5: reference-shaped detail defaults closed. The figure it explains
       has already been decided, so nothing here needs acting on. */
    expect(screen.queryByText("Everything above that")).not.toBeInTheDocument();
  });
});

describe("it renders nothing rather than an empty explanation", () => {
  it("when the API sent no workings at all", () => {
    const { container } = render(<TaxBands slip={slipWith(undefined)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("when the API refused to offer one", () => {
    /* The common case: no PAYE operated, a figure entered by hand, a nil, or a
       derivation that did not reproduce the charge. All four arrive as null,
       and all four mean there is nothing anybody could check. */
    const { container } = render(
      <TaxBands slip={slipWith({ paye: null, pension: null, nhf: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
