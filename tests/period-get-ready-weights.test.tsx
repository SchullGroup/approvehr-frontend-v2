import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * "Get ready" says whose weights make the mark.
 *
 * It said "The company's weights" over a period that had set its own (F6), so the
 * card contradicted the Settings tab of the same page. It says what the API says
 * the period uses, and nothing where the API does not say.
 */

const canManage = true;
let weights: unknown = undefined;
const reload = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "MANAGE_SETTINGS" ? canManage : true,
}));
vi.mock("@/lib/store/performance", () => ({
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
  outstandingIn: () => [],
  useCycleQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRatingScale: () => ({ scale: { levels: [], max: 5, source: "default" } }),
  useReviewFlags: () => ({
    flags: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleRegister: () => ({
    cycle: {
      id: "cycle-1",
      name: "Q1-Q3 Appraisal",
      stage: "DRAFT",
      stageLabel: "not started",
      scoringFrozen: false,
      ...(weights === undefined ? {} : { weights }),
      departmentIds: [],
      periodStart: null,
      periodEnd: null,
      managersCanAddQuestions: false,
      appraiseOwner: false,
      appraiseHrManager: false,
      questionCount: 0,
      reviewCount: 0,
    },
    participants: null,
    register: null,
    revisionRequests: [],
    revisionsUnavailable: false,
    available: false,
    refusal: "Offline.",
    loading: false,
    error: null,
    reload,
  }),
  useCycleMutations: () => ({ updateCycle: vi.fn() }),
}));
vi.mock("@/app/(app)/performance/period-dialogs", () => ({
  QuestionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/sections-dialog", () => ({
  SectionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/periods/[id]/ask-peers", () => ({
  AskPeersButton: () => null,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/calibration-audit",
  () => ({ CalibrationAudit: () => null }),
);
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/fairness-status",
  () => ({ FairnessStatus: () => null, publishLock: () => null }),
);
vi.mock("@/app/(app)/performance/periods/[id]/period-weights-section", () => ({
  PeriodWeightsSection: () => null,
}));
vi.mock("@/components/performance/calibrate-dialog", () => ({
  CalibrateDialog: () => null,
}));

const { PeriodScreen } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");
const { ToastProvider } = await import("@/components/ui");

async function weightsStep(basis?: "period" | "company" | "frozen") {
  weights =
    basis === undefined
      ? undefined
      : {
          basis,
          values: { OBJECTIVES: 4000, CORE_COMPETENCY: 6000 },
          parts: ["OBJECTIVES", "CORE_COMPETENCY"],
        };
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: /Get ready: .* ready/ }));
  const step = screen
    .getByText("How the score is made up")
    .closest("li") as HTMLElement;
  return within(step);
}

describe("the weights step of Get ready", () => {
  it("says the period's own weights are its own, which is what the Settings tab says", async () => {
    const step = await weightsStep("period");
    expect(
      step.getByText("Set for this period. Change them on the Settings tab."),
    ).toBeInTheDocument();
    expect(step.queryByText(/The company's weights/)).toBeNull();
  });

  it("says the company's weights are the company's when the period has none of its own", async () => {
    const step = await weightsStep("company");
    expect(
      step.getByText(
        "Same as your company's weights. Change them on the Settings tab.",
      ),
    ).toBeInTheDocument();
  });

  it("makes no claim about whose weights they are where the server does not say", async () => {
    const step = await weightsStep(undefined);
    expect(
      step.getByText("Change how the score is made up on the Settings tab."),
    ).toBeInTheDocument();
    expect(step.queryByText(/company/i)).toBeNull();
    expect(step.queryByText(/Set for this period/)).toBeNull();
  });
});
