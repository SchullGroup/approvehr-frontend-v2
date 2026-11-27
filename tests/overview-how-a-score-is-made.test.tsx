import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycle } from "@/lib/api/performance";

/**
 * The Overview hands the period in play to its "How a score is made" tab.
 *
 * The body is tested on its own in `scoring-body-period-weights`; this is the one
 * line that connects it to the screen, which is what F44 was: the reference was
 * there and was shown the company's current weights, not the period's.
 */

const state = vi.hoisted(() => ({ cycles: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => false }));
vi.mock("@/lib/store/departments", () => ({
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ appraisals: true, loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, actingId: "p1", employeeId: "e1" }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: state.cycles,
    mine: { toComplete: [], aboutMe: [], peerFeedback: [], peerToGive: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useObjectiveApprovals: () => ({ queue: [], loading: false, error: null }),
  useKpis: () => ({ goals: [], loading: false, error: null }),
  useMyAppraisers: () => ({ row: null, loading: false }),
  useReviewsIWrote: () => ({ reviews: [], loading: false }),
  useRatingScale: () => ({
    scale: { levels: [{ level: 1, label: "Poor" }] },
    loading: false,
  }),
  useScoringWeights: () => ({
    loading: false,
    weights: {
      source: "saved",
      rows: [
        ["OBJECTIVES", "Delivery against objectives", 2000],
        ["CORE_COMPETENCY", "Core competencies", 2000],
        ["SELF_ASSESSMENT", "Their own rating", 6000],
      ].map(([component, label, weightBp]) => ({
        component,
        label,
        weightBp,
        isPart: true,
      })),
    },
  }),
}));
vi.mock("@/app/(app)/performance/period-status", () => ({
  PeriodStatus: () => null,
  PeriodExceptionNotice: () => null,
}));
vi.mock("@/app/(app)/performance/start-period", () => ({
  StartPeriodButton: () => null,
}));
vi.mock("@/app/(app)/performance/manager-question", () => ({
  ManagerQuestionButton: () => null,
}));
vi.mock("@/app/(app)/performance/appraiser-map", () => ({
  AppraisersDialog: () => null,
}));
vi.mock("@/components/performance/your-appraisal", () => ({
  YourAppraisal: () => null,
}));

const { WhatNeedsYouTab } = await import("@/app/(app)/performance/now");

const period = (over: Partial<ApiCycle>) =>
  ({
    id: "c1",
    name: "Q4 2026 appraisal",
    stage: "SELF",
    ...over,
  }) as ApiCycle;

const FROZEN: NonNullable<ApiCycle["weights"]> = {
  basis: "frozen",
  values: {
    OBJECTIVES: 5000,
    TASKS: 0,
    CORE_COMPETENCY: 5000,
    BEHAVIOURAL_COMPETENCY: 0,
    LEADERSHIP: 0,
    MANAGER_APPRAISAL: 0,
    SELF_ASSESSMENT: 0,
  },
  parts: ["OBJECTIVES", "CORE_COMPETENCY"],
};

async function openCard() {
  const user = userEvent.setup();
  render(<WhatNeedsYouTab canSeeCompany={false} isManager={false} />);
  await user.click(screen.getByRole("tab", { name: "How a score is made" }));
}

const rowsOf = () =>
  [...document.querySelectorAll("dt")].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);

beforeEach(() => {
  state.cycles = [];
});

describe("The How a score is made tab, on the Overview", () => {
  it("is the weights of the period in play, not the company's as they are now", async () => {
    state.cycles = [period({ weights: FROZEN })];
    await openCard();
    expect(rowsOf()).toEqual([
      ["Delivery against objectives", "50%"],
      ["Core competencies", "50%"],
    ]);
    expect(
      screen.getByText("Q4 2026 appraisal. Locked when this period started."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Their own rating/)).toBeNull();
  });

  it("is the company's as they are today, and says so, when there is no period", async () => {
    await openCard();
    expect(rowsOf().map(([name]) => name)).toEqual([
      "Delivery against objectives",
      "Core competencies",
      "Their own rating",
    ]);
    expect(
      screen.getByText("Your company's weights as they are today."),
    ).toBeInTheDocument();
  });
});
