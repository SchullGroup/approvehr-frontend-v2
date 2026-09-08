import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuoteWorkings } from "@/components/payroll/quote-workings";
import type { ComputedPayslip } from "@/lib/api/payroll";

/**
 * The onboarding wizard's answer to "where does that number come from".
 *
 * The feedback: *"When onboarding an employee manually, there's no visibility
 * into how their pay and pension are calculated… the onboarding flow should
 * show the pay computation logic and pension setup/percentage, not just the
 * final numbers."* The wizard quoted Gross / Pension / NHF / PAYE / Net —
 * exactly the final numbers — and the **pension percentage the item names
 * appeared nowhere in the product**.
 *
 * Two things worth a test, neither visible to `tsc`:
 *
 *  - the percentage and the base it was charged on are both on screen, and
 *    both come from the API rather than being divided back out of the result;
 *  - the band column adds up to the total printed under it. A table a kobo out
 *    is the discrepancy the reader came looking for, and it would be ours.
 */

const WORKINGS = {
  paye: {
    taxableAnnualKobo: 4_800_000_00,
    reliefAnnualKobo: 600_000_00,
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
  /* The base is deliberately **not** gross. Pension is charged on
     basic + housing + transport, so a non-pensionable allowance puts the two
     apart — and with them equal this fixture cannot tell the API's rate from
     one divided back out of the deduction. Tamper-tested: making the component
     compute `pensionEmployeeKobo / grossKobo` passed until this changed. */
  pension: { rate: 0.08, employerRate: 0.1, baseKobo: 450_000_00 },
  nhf: { rate: 0.025, baseKobo: 300_000_00 },
} satisfies ComputedPayslip["workings"];

const slipWith = (workings: ComputedPayslip["workings"]): ComputedPayslip =>
  ({
    operates: { paye: "DEDUCTED", pension: "DEDUCTED", nhf: "DEDUCTED" },
    grossKobo: 500_000_00,
    pensionEmployeeKobo: 36_000_00,
    pensionEmployerKobo: 50_000_00,
    nhfKobo: 7_500_00,
    payeKobo: 63_950_00,
    netKobo: 388_550_00,
    workings,
  }) as unknown as ComputedPayslip;

const open = () =>
  userEvent.click(screen.getByRole("button", { name: /How these figures/ }));

describe("the pension percentage the feedback asked for", () => {
  it("says the rate, the base and the employer's share", async () => {
    render(<QuoteWorkings slip={slipWith(WORKINGS)} />);
    await open();
    expect(
      screen.getByText(/8% of ₦450,000\.00 — ₦36,000\.00 from their pay/),
    ).toBeInTheDocument();
    /* Employer pension is added on top, never subtracted. Every surface that
       renders it says so; this one has to as well. */
    expect(screen.getByText(/employer adds 10% on top/)).toBeInTheDocument();
  });

  it("says the housing fund rate and what it is charged on", async () => {
    render(<QuoteWorkings slip={slipWith(WORKINGS)} />);
    await open();
    expect(
      screen.getByText(/2\.50% of ₦300,000\.00 — ₦7,500\.00/),
    ).toBeInTheDocument();
  });
});

describe("the tax working adds up", () => {
  it("prints a total the band column sums to", async () => {
    render(<QuoteWorkings slip={slipWith(WORKINGS)} />);
    await open();
    const summed = WORKINGS.paye.bands.reduce((t, b) => t + b.taxKobo, 0);
    expect(summed).toBe(767_400_05);
    expect(screen.getByText("₦767,400.05")).toBeInTheDocument();
    /* And it is the sum, not `payeKobo * 12`. The fixture's five kobo are what
       makes those two different — with a round figure the test could not tell
       a read from a recomputation. */
    expect(screen.queryByText("₦767,400.00")).not.toBeInTheDocument();
  });

  it("says the top band is open-ended rather than printing a sentinel", async () => {
    render(<QuoteWorkings slip={slipWith(WORKINGS)} />);
    await open();
    expect(screen.getByText("Everything above that")).toBeInTheDocument();
  });

  it("is closed until somebody asks", () => {
    render(<QuoteWorkings slip={slipWith(WORKINGS)} />);
    /* Somebody adding an employee has a job to do; this is reference. */
    expect(screen.queryByText("Everything above that")).not.toBeInTheDocument();
  });
});

describe("it renders nothing rather than an empty reveal", () => {
  it("on an API that predates the workings", () => {
    const { container } = render(<QuoteWorkings slip={slipWith(undefined)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("and skips a deduction this employer does not operate", async () => {
    render(
      <QuoteWorkings
        slip={slipWith({
          ...WORKINGS,
          /* A company with no scheme has a zero rate, and a "0% of ₦0.00" line
             would be arithmetic nobody performed. */
          pension: { rate: 0, employerRate: 0, baseKobo: 0 },
        })}
      />,
    );
    await open();
    expect(screen.queryByText(/from their pay/)).not.toBeInTheDocument();
    /* The other two still explain themselves. */
    expect(screen.getByText(/2\.50% of ₦300,000\.00/)).toBeInTheDocument();
  });
});
