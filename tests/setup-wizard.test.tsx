import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The first-time set-up asks what counts, how much, and what is rated, one
 * screen at a time, and starts from what the company is scored on today.
 */

const parts = { add: vi.fn(), update: vi.fn(), remove: vi.fn() };
const framework = { createCompetency: vi.fn(), updateCompetency: vi.fn() };

vi.mock("@/lib/api/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/performance")>()),
  performanceApi: {
    scoringParts: vi
      .fn()
      .mockResolvedValue({ parts: [], totalBp: 0, sources: [] }),
  },
}));
vi.mock("@/lib/store/performance", () => ({
  useScoringParts: () => ({ loading: false, parts: { parts: [] }, ...parts }),
  useScoringWeights: () => ({
    loading: false,
    reload: vi.fn(),
    weights: {
      rows: [
        {
          component: "OBJECTIVES",
          label: "Delivery",
          weightBp: 4500,
          isPart: true,
        },
        {
          component: "CORE_COMPETENCY",
          label: "Core",
          weightBp: 2500,
          isPart: true,
        },
        {
          component: "BEHAVIOURAL_COMPETENCY",
          label: "Behaviour",
          weightBp: 1500,
          isPart: true,
        },
        {
          component: "LEADERSHIP",
          label: "Leadership",
          weightBp: 1500,
          isPart: true,
        },
        { component: "TASKS", label: "Tasks", weightBp: 0, isPart: false },
      ],
    },
  }),
  useSections: () => ({ sections: [], loading: false, reload: vi.fn() }),
  useFramework: () => ({ competencies: [], reload: vi.fn() }),
  useFrameworkActions: () => framework,
}));

const { SetupWizard } =
  await import("@/app/(app)/performance/setup/setup-wizard");

beforeEach(() => vi.clearAllMocks());

describe("the set-up wizard", () => {
  it("starts from what the company is scored on today", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    expect(
      screen.getByRole("heading", {
        name: "What counts towards someone's mark?",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Objectives they delivered")).toHaveValue(45);
    expect(screen.getByLabelText("Leadership")).toHaveValue(15);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
  });

  it("only lets it go on at exactly 100%", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const field = screen.getByLabelText("Leadership");
    await user.clear(field);
    await user.type(field, "20");
    expect(screen.getByText("Take 5% off somewhere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(field);
    await user.type(field, "15");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
