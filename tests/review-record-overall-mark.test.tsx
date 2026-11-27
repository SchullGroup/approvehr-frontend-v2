import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEmployeeScore, ApiReviewDetail } from "@/lib/api/performance";
import { showsOverallMark } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * The record of an appraisal follows the company's overall-mark setting.
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
 *
 * On the record the mark is the headline of the Rating tab, and where there is
 * none to say nothing is drawn in its place: no "None given", no sentence about
 * the answers standing on their own. Beside a self review, the two marks are one
 * row of the Answers tab, where "none given" is "Not recorded".
 */

const state = vi.hoisted(() => ({
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
  useSession: () => ({ actingId: "emp-viewer", isConnected: false }),
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

beforeEach(() => {
  state.review = review();
  state.self = null;
  state.score = score(null);
});
afterEach(cleanup);

describe("showsOverallMark", () => {
  it("shows none given only where the company asks for a score", () => {
    expect(showsOverallMark({ rating: null, overallMark: true })).toBe(true);
    expect(showsOverallMark({ rating: null, overallMark: false })).toBe(false);
  });

  it("treats an absent setting as off, because that is what the form does", () => {
    expect(showsOverallMark({ rating: null })).toBe(false);
  });

  it("shows a score that was given, whatever the setting says now", () => {
    expect(showsOverallMark({ rating: 4, overallMark: false })).toBe(true);
    expect(showsOverallMark({ rating: 4 })).toBe(true);
    expect(showsOverallMark({ rating: 4, overallMark: true })).toBe(true);
  });

  it("does not take a score of nought for an absence", () => {
    /* Not a value the scale produces, but the check is `!== null`, never
       falsiness: absent is absent and zero is a number. */
    expect(showsOverallMark({ rating: 0, overallMark: false })).toBe(true);
  });
});

/** The Answers tab, where the two overall ratings sit side by side. */
const openAnswers = async () =>
  userEvent.click(screen.getByRole("tab", { name: "Answers" }));

describe("a manager's record where the company does not ask for an overall rating", () => {
  beforeEach(() => {
    state.review = review({ overallMark: false });
    state.score = score(null);
  });

  it("says nothing about an overall rating nobody could give", () => {
    mount();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("None given")).toBeNull();
    expect(screen.queryByText(/No overall rating/)).toBeNull();
    expect(screen.queryByText("Appraisers' overall rating")).toBeNull();
  });

  it("keeps who wrote it, and when, in one line under the title", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "Emeka Anyanwu's manager review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Adaeze Okonkwo · sent 29 Oct 2026$/),
    ).toBeVisible();
    /* The three stat tiles and the headings over them are gone. */
    for (const gone of [
      "The rating",
      "Written by",
      "Overall score",
      "Objectives agreed",
      "What the score is made of",
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it("still shows a score that was given before the setting was switched off", () => {
    state.review = review({ overallMark: false, rating: 4 });
    state.score = score(7500);
    mount();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("Appraisers' overall rating")).toBeNull();
  });
});

describe("a manager's record where the company asks for an overall rating", () => {
  beforeEach(() => {
    state.review = review({ overallMark: true });
    state.score = score(null);
  });

  it("says nothing in the place of a rating nobody gave, and no sentence about it", () => {
    mount();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("None given")).toBeNull();
    expect(
      screen.queryByText("No overall rating. The answers stand on their own."),
    ).toBeNull();
    expect(screen.queryByText("Appraisers' overall rating")).toBeNull();
  });

  it("shows the score in the company's own words when there is one", () => {
    state.review = review({ overallMark: true, rating: 3 });
    mount();
    expect(screen.queryByText("None given")).toBeNull();
    expect(screen.getByText("Meets Expectations")).toBeInTheDocument();
  });
});

describe("a record from a server that does not send the setting", () => {
  it("is treated as off, so it does not show an empty row either", () => {
    state.review = review();
    mount();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("None given")).toBeNull();
  });
});

describe("a self-review's record", () => {
  beforeEach(() => {
    state.review = review({
      kind: "SELF",
      kindLabel: "Self-review",
      authorName: "Emeka Anyanwu",
      authorId: "emp-subject",
    });
    state.score = null;
  });

  it("is titled for whose it is in one spelling, with no card about a self-rating nobody can give", () => {
    state.review = { ...(state.review as object), overallMark: false };
    mount();
    expect(
      screen.getByRole("heading", { name: "Emeka Anyanwu's self review" }),
    ).toBeInTheDocument();
    for (const gone of [
      "The self-rating",
      "The self-review",
      "Shown beside the manager's review.",
      "Overall rating",
      "Written by",
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(
      screen.queryByText(/does not count towards the final score/),
    ).toBeNull();
  });

  it("says nothing about what the rating counts for where the company asks", () => {
    state.review = { ...(state.review as object), overallMark: true };
    mount();
    expect(screen.queryByText("The self-rating")).toBeNull();
    expect(
      screen.queryByText(/does not count towards the final score/),
    ).toBeNull();
    expect(screen.queryByText("None given")).toBeNull();
  });

  it("shows a score that was given, whatever the setting says now", () => {
    state.review = {
      ...(state.review as object),
      overallMark: false,
      rating: 2,
    };
    mount();
    expect(screen.getByText("Below Expectations")).toBeInTheDocument();
  });
});

describe("the overall ratings beside each other, on a manager's record with the self review in", () => {
  const selfReview = (over: Partial<ApiReviewDetail> = {}) =>
    review({
      id: "r-self",
      kind: "SELF",
      kindLabel: "Self-review",
      authorName: "Emeka Anyanwu",
      authorId: "emp-subject",
      ...over,
    });

  it("has no row for either overall rating where the company does not ask and nobody gave one", async () => {
    state.review = review({ overallMark: false, summary: "Good half." });
    state.self = selfReview({ overallMark: false });
    mount();
    await openAnswers();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.queryByText("Their overall rating")).toBeNull();
  });

  it("is one row, with the manager's and the person's, and not recorded where the company asks and they gave none", async () => {
    state.review = review({ overallMark: true, rating: 4 });
    state.self = selfReview({ overallMark: true });
    mount();
    /* One row, not the manager's in the Rating tab's headline and both again
       here: with the self review in, the marks are said once, side by side. */
    expect(screen.queryByText("Exceeds Expectations")).toBeNull();
    await openAnswers();
    expect(screen.getAllByText("Overall rating")).toHaveLength(1);
    const row = within(screen.getByText("Overall rating").closest("li")!);
    expect(row.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(row.getByText("Not recorded")).toBeInTheDocument();
  });

  it("shows the score they gave, whatever the setting says now", async () => {
    state.review = review({ overallMark: false });
    state.self = selfReview({ overallMark: false, rating: 5 });
    mount();
    await openAnswers();
    const row = within(screen.getByText("Overall rating").closest("li")!);
    expect(row.getByText("Exceptional")).toBeInTheDocument();
  });

  it("keeps the manager's own score as the headline when there is no self review to put beside it", () => {
    state.review = review({ overallMark: true, rating: 4 });
    state.self = null;
    mount();
    expect(screen.queryByText("Overall rating")).toBeNull();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
  });
});

describe("making a rating final", () => {
  const detail = (over: Partial<ApiReviewDetail> = {}) =>
    review({ rating: null, ...over });

  const renderDialog = (over: Partial<ApiReviewDetail>) =>
    render(
      <FinaliseDialog
        open
        review={detail(over)}
        onClose={() => {}}
        onConfirm={async () => ({ subjectNotified: true })}
      />,
    );

  it("says the answers are what they will read where there is no overall rating, whatever the company asks", () => {
    for (const overallMark of [false, true]) {
      renderDialog({ overallMark });
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText(/Emeka will read the answers\./),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/no overall rating/i)).toBeNull();
      cleanup();
    }
  });

  it("names the rating where there is one", () => {
    renderDialog({ overallMark: false, rating: 4 });
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Emeka will be told their rating, "Exceeds Expectations"\./,
      ),
    ).toBeInTheDocument();
  });

  it("says it once, in one sentence, that it cannot be changed", () => {
    renderDialog({ overallMark: false, rating: 4 });
    expect(
      within(screen.getByRole("dialog")).getAllByText(/cannot be changed/),
    ).toHaveLength(1);
  });
});
