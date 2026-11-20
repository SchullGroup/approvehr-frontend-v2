import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { PlanProviderDialog } from "@/app/(app)/payroll/pay-setup/plan-provider-dialog";
import type { ApiBenefitPlan } from "@/lib/api/benefits";

/**
 * "Change provider" on a benefit plan.
 *
 * A plan could be created with a provider and never edited, so a misspelt HMO
 * stayed misspelt for good. This dialog changes the provider and **nothing
 * else**: the prices and the pre-tax switch decide what comes off a payslip, and
 * a spelling fix must not be able to reprice a plan. Both halves are pinned —
 * what it sends, and what it does not.
 */

const mocks = vi.hoisted(() => ({ updatePlan: vi.fn() }));

vi.mock("@/lib/store/benefits", async (original) => ({
  ...(await original<typeof import("@/lib/store/benefits")>()),
  useBenefitMutations: () => ({ updatePlan: mocks.updatePlan }),
}));

const plan: ApiBenefitPlan = {
  id: "p-1",
  name: "Company HMO",
  kind: "HEALTH",
  kindLabel: "Health cover",
  provider: "Hygea HMO",
  description: null,
  employerMonthlyKobo: 2_000_000,
  employeeMonthlyKobo: 500_000,
  preTax: false,
  archived: false,
  enrolled: 3,
  monthlyEmployerCostKobo: 6_000_000,
};

const mount = (over: Partial<ApiBenefitPlan> = {}) => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <ToastProvider>
      <PlanProviderDialog
        plan={{ ...plan, ...over }}
        onClose={onClose}
        onDone={onDone}
      />
    </ToastProvider>,
  );
  return { onClose, onDone };
};

/* The dialog's own title also begins "Provider", so ask for the box by role. */
const box = () => screen.getByRole("textbox");

beforeEach(() => {
  mocks.updatePlan.mockReset().mockResolvedValue(plan);
});

describe("PlanProviderDialog", () => {
  it("opens holding the provider on file", () => {
    mount();
    expect(box()).toHaveValue("Hygea HMO");
  });

  it("saves the corrected name, trimmed, and sends nothing but the provider", async () => {
    const { onDone } = mount();
    fireEvent.change(box(), { target: { value: "  Hygeia HMO " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updatePlan).toHaveBeenCalledTimes(1));
    /* Exactly this: no price, no pre-tax switch, no name, no archive flag. */
    expect(mocks.updatePlan).toHaveBeenCalledWith("p-1", {
      provider: "Hygeia HMO",
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("takes the provider off with null when the box is emptied", async () => {
    mount();
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.updatePlan).toHaveBeenCalledWith("p-1", { provider: null }),
    );
  });

  it("opens blank for a plan that has no provider, rather than the word null", () => {
    mount({ provider: null });
    expect(box()).toHaveValue("");
  });

  it("stays open and says so when the save is refused", async () => {
    mocks.updatePlan.mockRejectedValue(new Error("nope"));
    const { onDone } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updatePlan).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });
});
