import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * The period screen hands the Questions dialog where the period is and the two
 * writes that put a subsection on its review form.
 *
 * `tsc` cannot see the wiring that matters: `cycleId` and `competencyId` are both
 * strings, so the two swapped would compile, and a dialog told the wrong stage
 * would offer a control the API then refuses or hide one it would take.
 */

type DialogProps = React.ComponentProps<
  typeof import("@/app/(app)/performance/period-dialogs").QuestionsDialog
>;

let captured: DialogProps | null = null;
let stage: ReviewCycleStage = "DRAFT";
let askSubsection: Mock<(...args: unknown[]) => Promise<unknown>>;
let stopAskingSubsection: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/performance", () => ({
  outstandingIn: () => [],
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
      name: "H2 2026 Appraisal",
      stage,
      stageLabel: "Draft",
      scoringFrozen: false,
      departmentIds: [],
      periodStart: null,
      periodEnd: null,
      managersCanAddQuestions: false,
      appraiseOwner: false,
      appraiseHrManager: false,
      questionCount: 3,
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
    reload: vi.fn(),
  }),
  useCycleMutations: () => ({
    askSubsection: (...args: unknown[]) => askSubsection(...args),
    stopAskingSubsection: (...args: unknown[]) => stopAskingSubsection(...args),
  }),
}));
vi.mock("@/app/(app)/performance/period-dialogs", () => ({
  QuestionsDialog: (props: DialogProps) => {
    captured = props;
    return null;
  },
}));
vi.mock("@/app/(app)/performance/sections-dialog", () => ({
  SectionsDialog: () => null,
}));
vi.mock("@/app/(app)/performance/periods/[id]/ask-peers", () => ({
  AskPeersButton: () => null,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/calibration-audit",
  () => ({
    CalibrationAudit: () => null,
  }),
);
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/fairness-status",
  () => ({
    FairnessStatus: () => null,
    publishLock: () => null,
  }),
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

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

beforeEach(() => {
  captured = null;
  stage = "DRAFT";
  askSubsection = vi.fn().mockResolvedValue({});
  stopAskingSubsection = vi.fn().mockResolvedValue({ id: "q", removed: true });
});

describe("what the Questions dialog is told", () => {
  it("is given where the period is, so a draft may change the form and a started one may not", () => {
    mount();
    expect(captured?.stage).toBe("DRAFT");
  });

  it.each(["SELF", "MANAGER", "CALIBRATION", "PUBLISHED"] as const)(
    "is told the period is at %s when it is",
    (at) => {
      stage = at;
      mount();
      expect(captured?.stage).toBe(at);
    },
  );

  it("asks a subsection on this period's form, with the period first and then the subsection", async () => {
    mount();
    await captured?.onAskSubsection?.("comp-9", ["SELF", "MANAGER"]);
    expect(askSubsection).toHaveBeenCalledTimes(1);
    expect(askSubsection).toHaveBeenCalledWith("cycle-1", "comp-9", [
      "SELF",
      "MANAGER",
    ]);
  });

  it("stops asking it with the same pair, the period first", async () => {
    mount();
    await captured?.onStopAskingSubsection?.("comp-9");
    expect(stopAskingSubsection).toHaveBeenCalledTimes(1);
    expect(stopAskingSubsection).toHaveBeenCalledWith("cycle-1", "comp-9");
  });

  it("lets a refusal from the API reach the dialog, which says it in the server's words", async () => {
    const refusal = new Error("H2 2026 Appraisal has started.");
    askSubsection.mockRejectedValue(refusal);
    mount();
    await expect(captured?.onAskSubsection?.("comp-9", ["SELF"])).rejects.toBe(
      refusal,
    );
  });
});
