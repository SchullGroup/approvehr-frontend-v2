import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Renaming an appraisal period from its page.
 *
 * The name was only ever set in the start-a-period dialog, so a typo there could
 * not be corrected. `PATCH /cycles/:id` takes `name`; these pin that the page
 * sends it, trimmed, to the right period, and says why the API refused one.
 */

let canManage = true;
let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;
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
      stage: "DRAFT",
      stageLabel: "not started",
      scoringFrozen: false,
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

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

const nameBox = () => screen.getByRole("textbox", { name: /Period name/ });

async function openRename() {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Rename" }));
  return user;
}

beforeEach(() => {
  canManage = true;
  updateCycle = vi.fn().mockResolvedValue({});
  reload.mockClear();
});

describe("renaming a period", () => {
  it("offers Rename to somebody who manages settings", () => {
    mount();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
  });

  it("does not offer it without the permission", () => {
    canManage = false;
    mount();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
  });

  it("starts from the current name, and will not save it unchanged", async () => {
    await openRename();
    expect(nameBox()).toHaveValue("Q1-Q3 Appraisal");
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  });

  it("sends the new name, trimmed, for this period, then reloads it", async () => {
    const user = await openRename();
    await user.clear(nameBox());
    await user.type(nameBox(), "  Q1–Q3 2026 Appraisal  ");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(updateCycle).toHaveBeenCalledWith("cycle-1", {
      name: "Q1–Q3 2026 Appraisal",
    });
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("refuses a name too short to mean anything, without asking the API", async () => {
    const user = await openRename();
    await user.clear(nameBox());
    await user.type(nameBox(), "Q1");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(updateCycle).not.toHaveBeenCalled();
    expect(
      screen.getByText("Name it: people will see this in their inbox."),
    ).toBeInTheDocument();
  });

  it("says why the API refused it, e.g. another period already has the name", async () => {
    updateCycle = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "CONFLICT", '"H1 Appraisal" already exists.'),
      );
    const user = await openRename();
    await user.clear(nameBox());
    await user.type(nameBox(), "H1 Appraisal");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(
      await screen.findByText('"H1 Appraisal" already exists.'),
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
