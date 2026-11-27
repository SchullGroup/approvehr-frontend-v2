import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The first-time set-up asks what counts, how much, and what is rated, one
 * screen at a time, and starts from what the company is scored on today.
 *
 * It never asks for a total: the last weight is worked out from the others, so
 * the weights add up to 100 and Continue is never refused. And Tasks done is
 * offered only where there is Projects to do tasks in.
 */

let projects = true;

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
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ projects, loading: false }),
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

beforeEach(() => {
  vi.clearAllMocks();
  projects = true;
});

describe("the set-up wizard", () => {
  it("starts from what the company is scored on today", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    expect(
      screen.getByRole("heading", {
        name: "What counts towards someone's score?",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Objectives they delivered")).toHaveValue(45);
    expect(screen.getByLabelText("Leadership")).toHaveValue(15);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
  });

  it("works the last weight out, so the total is 100 and Continue is never refused", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    /* The last one is shown, not typed. */
    expect(screen.getByLabelText("Leadership")).toHaveAttribute("readonly");
    const first = screen.getByLabelText("Objectives they delivered");
    await user.clear(first);
    await user.type(first, "50");

    /* 50 + 25 + 15 of the rest, so 10 is what is left for the last. */
    expect(screen.getByLabelText("Leadership")).toHaveValue(10);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    expect(screen.queryByText(/off somewhere|more somewhere/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("holds a box to what the others have left, and never to more than 100", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const first = screen.getByLabelText("Objectives they delivered");
    await user.clear(first);
    await user.type(first, "90");

    /* The other two typed parts hold 25 + 15, so 60 is the most this can have. */
    expect(first).toHaveValue(60);
    expect(screen.getByLabelText("Leadership")).toHaveValue(0);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("stays enabled while a box is empty, which counts as 0", async () => {
    const user = userEvent.setup();
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Core competencies"));
    expect(screen.getByLabelText("Leadership")).toHaveValue(40);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("Tasks done", () => {
  it("is offered when Projects is on", () => {
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Tasks done" }),
    ).toBeInTheDocument();
  });

  it("is not offered when Projects is off", () => {
    projects = false;
    render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Objectives they delivered" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tasks done" })).toBeNull();
  });
});
