import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEmployeeScore, ApiReviewDetail } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * The record page hands the right rating to the two dialogs it opens (F42).
 *
 * A manager's overall rating is one appraiser's mark; the rating a person is told is
 * the period's score of record. The confirmation HR reads before making it final
 * quoted the appraiser's mark ("Exceeds Expectations") while the record it sat on
 * said "Meets Expectations · 3.1". The dialog's own words are pinned in
 * rating-one-answer-surfaces and finalise-dialog-score-of-record; what is pinned
 * here is that the page passes it the score. The person's receipt for acknowledging
 * is gone (the screen says "Acknowledged" and quotes nothing), so there is no longer
 * a second place that could name the wrong mark.
 *
 * (Set-up taken from review-outcome-one-answer.test.tsx.)
 */

const state = vi.hoisted(() => ({
  actingId: "emp-viewer",
  review: null as unknown,
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
  useSubjectSelfReview: () => ({ selfReview: null, loading: false }),
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
    acknowledge: vi.fn(async () => ({
      acknowledgedAt: "2026-11-25T10:00:00.000Z",
    })),
    finalise: vi.fn(async () => ({
      subjectNotified: true,
      workEvidence: null,
    })),
  }),
}));

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r-1",
    cycleId: "c-1",
    cycleName: "Q4 2026 performance appraisal",
    cycleStage: "CALIBRATION",
    dueDate: null,
    periodStart: null,
    periodEnd: null,
    kind: "MANAGER",
    kindLabel: "Manager review",
    anonymous: false,
    subjectId: "emp-subject",
    subjectName: "Chidi Nwosu",
    authorId: "emp-author",
    authorName: "Adaeze Okonkwo",
    /* The appraiser's mark: 4 of 5, "Exceeds Expectations". */
    rating: 4,
    summary: null,
    submitted: true,
    submittedAt: "2026-11-25T08:00:00.000Z",
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
    overallMark: true,
    ...over,
  }) as ApiReviewDetail;

/** The period's score for the person as the register reads it. */
const score = (): ApiEmployeeScore =>
  ({
    scoreBp: 5200,
    scoreOutOf5: 3.1,
    bandLabel: "Meets Expectations",
    weightsFrom: "snapshot",
    appraiserMark: { ratingBp: 7500, appraisers: 1, submittedWeightBp: 10000 },
    objectives: { agreed: 2, measured: 1, awaitingApproval: 0 },
    components: [],
    unmappedRatings: 0,
    exceptions: [],
  }) as unknown as ApiEmployeeScore;

beforeEach(() => {
  state.actingId = "emp-viewer";
  state.review = review();
  state.score = score();
});
afterEach(cleanup);

describe("whoever makes the rating final", () => {
  it("is told the rating the person will read is the period's score, as it stands now", async () => {
    const user = userEvent.setup();
    render(<ReviewScreen reviewId="r-1" />);

    await user.click(screen.getByRole("button", { name: "Make it final" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.getByText(
        /Chidi will be told their rating, "Meets Expectations · 3\.1", as it stands now\./,
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        /Adaeze Okonkwo's own overall rating, "Exceeds Expectations", stays with the review\./,
      ),
    ).toBeInTheDocument();
  });

  it("is told no figure where the score cannot be read here", async () => {
    const user = userEvent.setup();
    state.score = null;
    render(<ReviewScreen reviewId="r-1" />);

    await user.click(screen.getByRole("button", { name: "Make it final" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.getByText(/Chidi will read the score for the period\./),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/as it stands now/)).toBeNull();
    expect(dialog.queryByText(/3\.1/)).toBeNull();
  });
});
