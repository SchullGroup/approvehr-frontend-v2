import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * The period page offers Rename, at every stage, to the people who may change
 * the period.
 *
 * Before this the name could be set while creating a period and never again: a
 * typo meant deleting a draft and starting over, and a started period could not be
 * fixed at all. `tsc` cannot see that the button is there, that it is there for a
 * running period as well as a draft, or that it is not there for somebody the API
 * would refuse, so each is asserted on the page.
 */

let stage: ReviewCycleStage = "DRAFT";
let granted = new Set<string>();
let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;
let reload: Mock<() => void>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => granted.has(permission),
}));
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
      name: "Q1-Q3 Appraisal",
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
    reload: () => reload(),
  }),
  useCycleMutations: () => ({
    updateCycle: (...args: unknown[]) => updateCycle(...args),
  }),
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

const renameButton = () => screen.queryByRole("button", { name: "Rename" });

beforeEach(() => {
  stage = "DRAFT";
  granted = new Set(["MANAGE_SETTINGS", "EDIT_RECORDS", "VIEW_SALARIES"]);
  updateCycle = vi.fn().mockResolvedValue({});
  reload = vi.fn();
});

describe("who is offered Rename, and when", () => {
  it.each(["DRAFT", "SELF", "MANAGER", "CALIBRATION", "PUBLISHED"] as const)(
    "offers it to somebody who manages the period when it is at %s",
    (at) => {
      stage = at;
      mount();
      expect(renameButton()).toBeInTheDocument();
    },
  );

  it("does not offer it to somebody who may not change the period, however much else they may do", () => {
    granted.delete("MANAGE_SETTINGS");
    mount();
    expect(renameButton()).toBeNull();
  });
});

describe("renaming from the page", () => {
  it("opens on the period's current name", async () => {
    mount();
    await userEvent.setup().click(renameButton()!);
    expect(
      screen.getByRole("dialog", { name: "Rename this period" }),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/Period name/) as HTMLInputElement).value,
    ).toBe("Q1-Q3 Appraisal");
  });

  it("sends the new name for this period and reads the period again, so the heading changes", async () => {
    stage = "SELF";
    mount();
    const user = userEvent.setup();
    await user.click(renameButton()!);
    const box = screen.getByLabelText(/Period name/);
    await user.clear(box);
    await user.type(box, "Q1-Q3 Appraisal 2026");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateCycle).toHaveBeenCalledTimes(1));
    expect(updateCycle).toHaveBeenCalledWith("cycle-1", {
      name: "Q1-Q3 Appraisal 2026",
    });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(
      screen.queryByRole("dialog", { name: "Rename this period" }),
    ).toBeNull();
  });

  it("starts from the current name every time it is opened, not from the last attempt", async () => {
    mount();
    const user = userEvent.setup();
    await user.click(renameButton()!);
    const first = screen.getByLabelText(/Period name/);
    await user.clear(first);
    await user.type(first, "A half-typed name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Rename this period" }),
    ).toBeNull();

    await user.click(renameButton()!);
    expect(
      (screen.getByLabelText(/Period name/) as HTMLInputElement).value,
    ).toBe("Q1-Q3 Appraisal");
    expect(updateCycle).not.toHaveBeenCalled();
  });
});
