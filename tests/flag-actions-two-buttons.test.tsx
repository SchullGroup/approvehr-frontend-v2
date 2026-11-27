import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * A flagged score is decided with two buttons: the score stands, or it changes.
 * Sending the review back is rarer, so it is in a menu, under the word the
 * period's own Scores menu uses.
 */

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/performance", () => ({
  useFlagDecisions: () => ({ stands: vi.fn(), reopen: vi.fn() }),
  useCycleMutations: () => ({ requestRevision: vi.fn() }),
  useReviewFlag: () => ({ flag: null }),
}));

const { ToastProvider } = await import("@/components/ui");
const { FlagActions } =
  await import("@/app/(app)/performance/periods/[id]/fairness/flag-actions");

const person = {
  employeeId: "e1",
  name: "Ada Obi",
  firstName: "Ada",
  managerName: "Chidi",
  markBp: 6200,
  managerReviewSubmitted: true,
  resolution: { state: "open" },
} as never;

const draw = () =>
  render(
    <ToastProvider>
      <FlagActions
        cycleId="c1"
        person={person}
        stage="CALIBRATION"
        onChanged={() => {}}
      />
    </ToastProvider>,
  );

describe("deciding a flagged score", () => {
  it("has two buttons, no heading and no sentence about publishing", () => {
    draw();
    expect(
      screen.getByRole("button", { name: "Score stands" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change the score" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask the manager" }),
    ).toBeNull();
    expect(screen.queryByText("Decision")).toBeNull();
    expect(screen.queryByText(/Publishing waits/)).toBeNull();
    expect(screen.queryByText("Not decided yet.")).toBeNull();
  });

  it("sends the review back from a menu", async () => {
    draw();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Ada" }));
    await user.click(screen.getByRole("menuitem", { name: "Send back" }));
    expect(
      await screen.findByRole("heading", {
        name: "Send Ada Obi's review back",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Which review")).toBeNull();
  });
});
