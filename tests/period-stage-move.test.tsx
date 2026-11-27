import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ApiCycleParticipants } from "@/lib/api/performance";
import {
  STAGE_MOVE,
  moveWordsFor,
} from "@/app/(app)/performance/periods/[id]/stage-move";

/**
 * Moving a period to its next stage asks first, and says what it does (F27).
 *
 * The button read like a link, moved the period at once with no way back, and
 * the toast claimed "Managers write their reviews now" (they always could) and,
 * at the next stage, "Nothing more is asked of anyone" while reviews were still
 * unsent. None of that is a type error.
 */

let advance: Mock<(...args: unknown[]) => Promise<unknown>>;
let stage: "SELF" | "MANAGER";
/* Nobody owes anything, so the move is the next step on the page. */
const participants = {
  cycleId: "cycle-1",
  cycleName: "H2 2026 Appraisal",
  stage: "SELF",
  rows: [],
  counts: { people: 0, selfDone: 0, managerDone: 0 },
} as unknown as ApiCycleParticipants;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/cycle-1",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ loading: false }),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
  outstandingIn: (p: ApiCycleParticipants | null) =>
    (p?.rows ?? []).flatMap((r) => [
      ...(r.self && !r.self.submitted
        ? [
            {
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              what: `${r.employeeName} self`,
              reviewId: r.self.reviewId,
            },
          ]
        : []),
      ...r.managers
        .filter((m) => !m.submitted)
        .map((m) => ({
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          what: `${r.employeeName} manager`,
          reviewId: m.reviewId,
        })),
    ]),
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
      name: "H2 2026 Appraisal",
      stage,
      stageLabel: stage === "SELF" ? "self-review" : "manager review",
      dueDate: "2026-11-30",
      scoringFrozen: true,
      departmentIds: [],
      periodStart: null,
      periodEnd: null,
      managersCanAddQuestions: false,
      appraiseOwner: false,
      appraiseHrManager: false,
      questionCount: 3,
      reviewCount: 6,
    },
    participants,
    register: null,
    revisionRequests: [],
    revisionsUnavailable: false,
    available: true,
    refusal: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleMutations: () => ({
    remind: () => Promise.resolve(null),
    advance: (...args: unknown[]) => advance(...args),
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

/* The next step on the page, once nobody is late. */
const moveButton = (name: string) => screen.getByRole("button", { name });

const mount = () =>
  render(
    <ToastProvider>
      <PeriodScreen cycleId="cycle-1" />
    </ToastProvider>,
  );

beforeEach(() => {
  advance = vi.fn().mockResolvedValue({});
  stage = "SELF";
});

describe("the words", () => {
  it("name only what a move does: no new objectives, no way back", () => {
    for (const words of Object.values(STAGE_MOVE)) {
      expect(words.body).toMatch(/Nobody can add or agree objectives/);
      expect(words.body).toMatch(/cannot be moved back/);
    }
  });

  it("do not claim what is untrue of a stage move", () => {
    const all = JSON.stringify([
      ...Object.values(STAGE_MOVE).map((words) => [
        words.body,
        words.done("A period"),
      ]),
    ]);
    expect(all).not.toMatch(/Managers write their reviews now/);
    expect(all).not.toMatch(/Nothing more is asked of anyone/);
    expect(all).not.toMatch(/Scores are in/);
  });

  it("have a move out of self-review and out of manager review, and none after", () => {
    expect(moveWordsFor("SELF")).toBe(STAGE_MOVE.MANAGER);
    expect(moveWordsFor("MANAGER")).toBe(STAGE_MOVE.CALIBRATION);
    expect(moveWordsFor("CALIBRATION")).toBeNull();
    expect(moveWordsFor("DRAFT")).toBeNull();
    expect(moveWordsFor("PUBLISHED")).toBeNull();
  });

  it("name the button as an act and not a place", () => {
    expect(STAGE_MOVE.MANAGER.button).toBe("Open manager reviews");
    expect(STAGE_MOVE.CALIBRATION.button).toBe("Move to score review");
  });
});

describe("the button on the period", () => {
  it("moves nothing on the first press, and asks", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(moveButton("Open manager reviews"));
    expect(advance).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Open manager reviews?"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/cannot be moved back/);
  });

  it("moves it only when confirmed, to the next stage", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(moveButton("Open manager reviews"));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Move it",
      }),
    );
    expect(advance).toHaveBeenCalledWith("cycle-1", "MANAGER");
    expect(await screen.findByText(/moved to manager reviews/)).toBeVisible();
  });

  it("does not move it when the question is dismissed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(moveButton("Open manager reviews"));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Cancel/,
      }),
    );
    expect(advance).not.toHaveBeenCalled();
  });

  it("asks the same of the next move", async () => {
    stage = "MANAGER";
    const user = userEvent.setup();
    mount();
    await user.click(moveButton("Move to score review"));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /cannot be moved back/,
    );
  });
});
