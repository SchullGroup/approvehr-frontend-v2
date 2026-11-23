import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * The public PAYE calculator's working when NHF is unticked (UAT 23 Nov, L7 /
 * PAY-34). It said "NHF on basic alone, which is why NHF comes to ₦0 rather
 * than ₦22,500", which is wrong twice over: NHF on basic would not be ₦0, and
 * the box was simply unticked.
 */
const slip = (nhf: "DEDUCTED" | "NOT_OPERATED") => ({
  grossKobo: 90_000_000,
  basicKobo: 54_000_000,
  housingKobo: 18_000_000,
  transportKobo: 18_000_000,
  pensionEmployeeKobo: 7_200_000,
  pensionEmployerKobo: 9_000_000,
  nhfKobo: nhf === "DEDUCTED" ? 1_350_000 : 0,
  payeKobo: 12_000_000,
  netKobo: 69_450_000,
  consolidatedReliefMonthlyKobo: 0,
  reliefUnclaimed: false,
  operates: { paye: "DEDUCTED", pension: "DEDUCTED", nhf },
  workings: {
    paye: {
      bands: [
        { rate: 0, widthKobo: 80_000_000, taxedKobo: 80_000_000, taxKobo: 0 },
        {
          rate: 0.15,
          widthKobo: 220_000_000,
          taxedKobo: 100_000_000,
          taxKobo: 15_000_000,
        },
      ],
    },
  },
});
let nhf: "DEDUCTED" | "NOT_OPERATED" = "NOT_OPERATED";
vi.mock("@/lib/marketing/tax-calculator", () => ({
  configured: true,
  calculatePaye: vi.fn(async () => ({
    ok: true,
    value: { slip: slip(nhf), taxSchedule: { effectiveFrom: "2026-01-01" } },
  })),
}));

const { TaxCalculator } =
  await import("@/app/(marketing)/paye-calculator/calculator");

async function working() {
  const user = userEvent.setup();
  render(<TaxCalculator />);
  await user.click(
    await screen.findByRole("button", { name: /Your month, line by line/ }),
  );
}

describe("the line-by-line working", () => {
  it("says NHF is not deducted because it was unticked, and claims no figure for it", async () => {
    nhf = "NOT_OPERATED";
    await working();
    expect(
      await screen.findByText(
        /NHF is not deducted, because NHF deducted is unticked/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/which is why NHF comes to/)).toBeNull();
  });

  it("still explains basic-only NHF when it is deducted", async () => {
    nhf = "DEDUCTED";
    await working();
    expect(
      await screen.findByText(
        /which is why NHF comes to ₦13,500 rather than ₦22,500/,
      ),
    ).toBeInTheDocument();
  });
});
