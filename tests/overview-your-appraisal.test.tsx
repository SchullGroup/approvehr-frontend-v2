import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCycle } from "@/lib/api/performance";

/**
 * The Overview's "This period" card and "Your appraisal" (F22, F23).
 *
 * "Your appraisal" is for everybody who is appraised, HR included: the period
 * cards are about running the period and it is about being in it. And the counts
 * under the open period are the whole company's, so an employee is not shown
 * them as if they were their own.
 */

const state = vi.hoisted(() => ({
  cycles: [] as unknown[],
  can: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => state.can }));
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
  YourAppraisal: () => <p>Your appraisal card</p>,
}));

const { WhatNeedsYouTab } = await import("@/app/(app)/performance/now");

const open = {
  id: "c1",
  name: "Q4 2026 appraisal",
  stage: "SELF",
  stageLabel: "self-review",
  questionCount: 10,
  reviewCount: 18,
  dueDate: "2027-01-14",
  departmentIds: [],
  managersCanAddQuestions: false,
} as unknown as ApiCycle;

beforeEach(() => {
  state.cycles = [open];
  state.can = false;
});

describe("Your appraisal on the Overview", () => {
  it("is there for an employee", () => {
    render(<WhatNeedsYouTab canSeeCompany={false} isManager={false} />);
    expect(screen.getByText("Your appraisal card")).toBeInTheDocument();
  });

  it("is there for HR too, who used to have only the period cards", () => {
    state.can = true;
    render(<WhatNeedsYouTab canSeeCompany isManager={false} />);
    expect(screen.getByText("Your appraisal card")).toBeInTheDocument();
  });
});
