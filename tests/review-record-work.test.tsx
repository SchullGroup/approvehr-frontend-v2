import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * "Work this cycle" on the record of a review.
 *
 * What is proved: the self review and the manager review carry the panel, about
 * the person the review is about and the cycle it belongs to; peer feedback does
 * not ask for it at all; and the panel is told whether the review is the
 * reader's own, so it speaks to "you" only there.
 */

const state = vi.hoisted(() => ({ review: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  useCan: () => false,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: "emp-subject", isConnected: false }),
}));
vi.mock("@/components/performance/work-evidence", () => ({
  WorkEvidence: () => null,
}));
vi.mock("@/components/performance/work-this-cycle", () => ({
  WorkThisCycle: (props: Record<string, unknown>) => (
    <div
      data-testid="work-this-cycle"
      data-subject={String(props["subjectId"])}
      data-cycle={String(props["cycleId"])}
      data-own={String(props["own"])}
      data-enabled={String(props["enabled"])}
    />
  ),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useReview: () => ({
    review: state.review,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useSubjectSelfReview: () => ({ selfReview: null, loading: false }),
  useEmployeeScore: () => ({
    score: null,
    loading: false,
    available: true,
    error: null,
    refusal: "",
    reload: () => {},
  }),
  useReviewFlag: () => ({ flag: null, claims: [] }),
  useSignOff: () => ({
    canFinalise: true,
    finaliseRefusal: "",
    acknowledge: vi.fn(),
    finalise: vi.fn(),
  }),
}));

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r-1",
    cycleId: "c-1",
    cycleName: "Year-end review 2026",
    cycleStage: "CALIBRATION",
    dueDate: null,
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
    kind: "MANAGER",
    kindLabel: "Manager review",
    anonymous: false,
    subjectId: "emp-subject",
    subjectName: "Emeka Anyanwu",
    authorId: "emp-author",
    authorName: "Adaeze Okonkwo",
    rating: null,
    summary: null,
    submitted: true,
    submittedAt: "2026-10-29T08:00:00.000Z",
    answerCount: 0,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
    mine: false,
    questions: [],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

beforeEach(() => {
  state.review = review();
});
afterEach(cleanup);

describe("the record of a review", () => {
  it("carries the panel on a manager review, about the person and the cycle", () => {
    render(<ReviewScreen reviewId="r-1" />);
    const panel = screen.getByTestId("work-this-cycle");
    expect(panel).toHaveAttribute("data-subject", "emp-subject");
    expect(panel).toHaveAttribute("data-cycle", "c-1");
    expect(panel).toHaveAttribute("data-enabled", "true");
  });

  it("speaks to the person as 'you' only in their own review", () => {
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-own",
      "true",
    );
    cleanup();
    state.review = review({ subjectId: "somebody-else" });
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-own",
      "false",
    );
  });

  it("carries it on a self review too", () => {
    state.review = review({
      kind: "SELF",
      kindLabel: "Self-review",
      mine: true,
    });
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("does not ask for it on peer feedback", () => {
    state.review = review({ kind: "PEER", kindLabel: "Peer feedback" });
    render(<ReviewScreen reviewId="r-1" />);
    expect(screen.getByTestId("work-this-cycle")).toHaveAttribute(
      "data-enabled",
      "false",
    );
  });
});
