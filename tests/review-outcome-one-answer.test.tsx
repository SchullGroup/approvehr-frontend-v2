import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEmployeeScore, ApiReviewDetail } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * One answer for the person (UAT 23 Nov, U36 / PERF-2).
 *
 * Halima was told "Your rating is final" and then read "Exceeds Expectations",
 * "Overall score 41.94%" and, on her history, "Meets expectations". Once a
 * manager's review is final or the period published, the API sends `outcome`:
 * the score of record as the company's band word and out of 5. The person it
 * is about reads that as "Your rating" and no other figure; whoever decides
 * still sees the breakdown.
 *
 * (Set-up taken from review-record-overall-mark.test.tsx.)
 *
 * Found by opening a manager's record on a company that does not ask for an
 * overall mark: the page still carried "Overall mark: None given", a heading
 * over a dash for "Appraisers' overall rating", and, on a self-review, a card
 * titled "The self-rating" whose only content was "None given". The answering
 * form already follows the setting (nothing about an overall mark where the
 * company does not ask, "No overall mark" where it does and nobody gave one);
 * the page that reads the result did not.
 *
 * The rule, one function: a review that carries a mark shows it whatever the
 * setting says now, and one that carries none speaks of an overall mark only
 * where the company asks for one. Absent means off.
 */

const state = vi.hoisted(() => ({
  actingId: "emp-viewer",
  review: null as unknown,
  self: null as unknown,
  score: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  useCan: (permission: string) => permission === "EDIT_RECORDS",
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: state.actingId, isConnected: false }),
}));
vi.mock("@/components/performance/work-evidence", () => ({
  WorkEvidence: () => null,
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useReview: () => ({
    review: state.review,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useSubjectSelfReview: () => ({ selfReview: state.self, loading: false }),
  useEmployeeScore: () => ({
    score: state.score,
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
    periodStart: null,
    periodEnd: null,
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

const score = (ratingBp: number | null): ApiEmployeeScore =>
  ({
    scoreBp: 2800,
    weightsFrom: "snapshot",
    appraiserMark: { ratingBp, appraisers: 1, submittedWeightBp: 10000 },
    objectives: { agreed: 2, measured: 1, awaitingApproval: 0 },
    components: [],
    unmappedRatings: 0,
    exceptions: [],
  }) as unknown as ApiEmployeeScore;

const mount = () => render(<ReviewScreen reviewId="r-1" />);

const OUTCOME = { bandLabel: "Exceeds Expectations", scoreOutOf5: 4.1 };

beforeEach(() => {
  state.actingId = "emp-viewer";
  state.review = review({
    finalised: true,
    finalisedAt: "2026-11-02T08:00:00.000Z",
    rating: 4,
    overallMark: true,
    outcome: OUTCOME,
  });
  state.self = null;
  state.score = score(7500);
});
afterEach(cleanup);

describe("the person the review is about", () => {
  it("reads their rating as the band word and the figure out of 5", () => {
    state.actingId = "emp-subject";
    mount();
    expect(screen.getByText("Your rating")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations · 4.1")).toBeInTheDocument();
  });

  it("is given no other figure: no overall score, no percentage, no second rating", () => {
    state.actingId = "emp-subject";
    mount();
    expect(screen.queryByText("Overall score")).toBeNull();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("What the score is made of")).toBeNull();
    expect(screen.queryByText(/\d%/)).toBeNull();
  });

  it("sees what they always saw before there is an outcome", () => {
    state.actingId = "emp-subject";
    state.review = review({ outcome: null });
    mount();
    expect(screen.queryByText("Your rating")).toBeNull();
    expect(screen.getByText("What the score is made of")).toBeInTheDocument();
  });

  it("is not told a rating where the API sent nothing in it", () => {
    state.actingId = "emp-subject";
    state.review = review({
      finalised: true,
      outcome: { bandLabel: null, scoreOutOf5: null },
    });
    mount();
    expect(screen.queryByText("Your rating")).toBeNull();
  });
});

describe("whoever decides", () => {
  it("reads the same rating, and still has the breakdown", () => {
    mount();
    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations · 4.1")).toBeInTheDocument();
    expect(screen.getByText("What the score is made of")).toBeInTheDocument();
  });

  it("reads the overall score out of 5, not as a percentage", () => {
    mount();
    expect(screen.queryByText("28%")).toBeNull();
    expect(screen.getByText("2.1")).toBeInTheDocument();
  });
});
