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
    components: [
      {
        component: "OBJECTIVES",
        label: "Objectives",
        scoreBp: 5000,
        weightBp: 10000,
        effectiveWeightBp: 10000,
        included: true,
        excludedBecause: null,
        excludedNote: null,
        evidenceCount: 2,
      },
    ],
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
  it("reads their rating as the band word and the figure out of 5, under a title that is theirs", () => {
    state.actingId = "emp-subject";
    mount();
    expect(
      screen.getByRole("heading", { name: "Your manager review" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations · 4.1")).toBeInTheDocument();
    /* The words over the figure are gone: the title says whose it is. */
    expect(screen.queryByText("Your rating")).toBeNull();
  });

  it("is given no other figure: no overall score, no percentage, no second rating, no breakdown", () => {
    state.actingId = "emp-subject";
    mount();
    expect(screen.queryByText("Overall score")).toBeNull();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("Objectives")).toBeNull();
    expect(screen.queryByText(/out of 5/)).toBeNull();
    expect(screen.queryByText(/\d%/)).toBeNull();
    /* The author's own overall rating (4) is not said to them either. */
    expect(screen.queryByText(/rated/)).toBeNull();
  });

  it("sees what they always saw before there is an outcome: the score and what it is made of", () => {
    state.actingId = "emp-subject";
    state.review = review({ outcome: null });
    mount();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("2.1 out of 5")).toBeInTheDocument();
    expect(screen.getByText("Objectives")).toBeInTheDocument();
  });

  it("is not told a rating where the API sent nothing in it", () => {
    state.actingId = "emp-subject";
    state.review = review({
      finalised: true,
      outcome: { bandLabel: null, scoreOutOf5: null },
    });
    mount();
    expect(
      screen.queryByText(/Exceeds Expectations|Meets Expectations/),
    ).toBeNull();
  });
});

describe("what the person reads about their own sign-off", () => {
  const acknowledged = {
    finalised: true,
    finalisedAt: "2026-11-02T08:00:00.000Z",
    outcome: OUTCOME,
    acknowledged: true,
    acknowledgedAt: "2026-11-23T10:00:00.000Z",
  };

  it("is one small line under the rating, with its date, and no card about it", () => {
    state.actingId = "emp-subject";
    state.review = review(acknowledged);
    mount();
    expect(
      screen.getByText(
        "Adaeze Okonkwo · sent 29 Oct 2026 · final 2 Nov 2026 · acknowledged 23 Nov 2026",
      ),
    ).toBeInTheDocument();
    for (const gone of [
      "Acknowledged",
      "This shows you have seen your rating. It does not mean you agree with it.",
      "You did not add a comment.",
      "They did not add a comment.",
    ]) {
      /* The header badge is the one status; nothing else says the word alone. */
      expect(
        screen.queryAllByText(gone).filter((node) => node.tagName !== "SPAN"),
      ).toHaveLength(0);
    }
    expect(screen.queryByText(/You acknowledged this on/)).toBeNull();
  });

  it("adds what they wrote, if they wrote anything, and nothing if they did not", () => {
    state.actingId = "emp-subject";
    state.review = review({
      ...acknowledged,
      employeeComment: "Noted, thanks.",
    });
    mount();
    expect(
      screen.getByRole("region", { name: "Your comment" }),
    ).toHaveTextContent("Noted, thanks.");
  });

  it("says the same to anybody else, with their comment as theirs", () => {
    state.review = review({
      ...acknowledged,
      employeeComment: "Noted, thanks.",
    });
    mount();
    expect(screen.getByText(/acknowledged 23 Nov 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Their comment" }),
    ).toHaveTextContent("Noted, thanks.");
    expect(screen.queryByText(/Emeka Anyanwu acknowledged this/)).toBeNull();
  });

  it("says a rating that was disputed before disputing went, and keeps its comment", () => {
    state.review = review({
      finalised: true,
      outcome: OUTCOME,
      disputed: true,
      disputedAt: "2026-11-20T10:00:00.000Z",
      employeeComment: "I do not accept this.",
    });
    mount();
    expect(screen.getByText(/disputed 20 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText("I do not accept this.")).toBeInTheDocument();
    expect(screen.getByText("Disputed")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The rating stays as it is and the dispute is recorded beside it.",
      ),
    ).toBeNull();
  });
});

describe("whoever decides", () => {
  it("reads the same rating, and still has the breakdown, with the author's own rating beside their name", () => {
    mount();
    expect(screen.getByText("Exceeds Expectations · 4.1")).toBeInTheDocument();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.getByText("Objectives")).toBeInTheDocument();
    expect(
      screen.getByText(/Adaeze Okonkwo · rated Exceeds Expectations/),
    ).toBeInTheDocument();
  });

  it("reads the score out of 5, not as a percentage, before there is a rating of record", () => {
    state.review = review({ outcome: null });
    mount();
    expect(screen.queryByText("28%")).toBeNull();
    expect(screen.getByText("2.1 out of 5")).toBeInTheDocument();
    expect(screen.getByText("3.0 out of 5")).toBeInTheDocument();
  });

  it("does not say the score a second time once the headline is the score of record", () => {
    mount();
    expect(screen.queryByText("Score")).toBeNull();
    expect(screen.queryByText("2.1 out of 5")).toBeNull();
  });
});
