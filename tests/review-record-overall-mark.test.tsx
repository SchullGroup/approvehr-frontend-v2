import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEmployeeScore, ApiReviewDetail } from "@/lib/api/performance";
import { showsOverallMark } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";
import { finalisedCopy } from "@/app/(app)/performance/reviews/[id]/sign-off-copy";

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
  it("shows none given only where the company asks for a mark", () => {
    expect(showsOverallMark({ rating: null, overallMark: true })).toBe(true);
    expect(showsOverallMark({ rating: null, overallMark: false })).toBe(false);
  });

  it("treats an absent setting as off, because that is what the form does", () => {
    expect(showsOverallMark({ rating: null })).toBe(false);
  });

  it("shows a mark that was given, whatever the setting says now", () => {
    expect(showsOverallMark({ rating: 4, overallMark: false })).toBe(true);
    expect(showsOverallMark({ rating: 4 })).toBe(true);
    expect(showsOverallMark({ rating: 4, overallMark: true })).toBe(true);
  });

  it("does not take a mark of nought for an absence", () => {
    /* Not a value the scale produces, but the check is `!== null`, never
       falsiness: absent is absent and zero is a number. */
    expect(showsOverallMark({ rating: 0, overallMark: false })).toBe(true);
  });
});

describe("a manager's record where the company does not ask for an overall mark", () => {
  beforeEach(() => {
    state.review = review({ overallMark: false });
    state.score = score(null);
  });

  it("says nothing about an overall mark nobody could give", () => {
    mount();
    expect(screen.queryByText("Overall mark")).toBeNull();
    expect(screen.queryByText("None given")).toBeNull();
    expect(screen.queryByText(/No overall mark/)).toBeNull();
    expect(screen.queryByText("Appraisers' overall rating")).toBeNull();
  });

  it("keeps the rest of the card: who wrote it, and when", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "The rating" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Written by")).toBeInTheDocument();
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    /* And the score panel is untouched: the figure the person is told. */
    expect(screen.getByText("Overall score")).toBeInTheDocument();
    expect(screen.getByText("Objectives agreed")).toBeInTheDocument();
  });

  it("still shows a mark that was given before the setting was switched off", () => {
    state.review = review({ overallMark: false, rating: 4 });
    state.score = score(7500);
    mount();
    expect(screen.getByText("Overall mark")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(screen.getByText("Appraisers' overall rating")).toBeInTheDocument();
  });
});

describe("a manager's record where the company asks for an overall mark", () => {
  beforeEach(() => {
    state.review = review({ overallMark: true });
    state.score = score(null);
  });

  it("says none was given, rather than leaving the row out", () => {
    mount();
    expect(screen.getByText("Overall mark")).toBeInTheDocument();
    expect(screen.getByText("None given")).toBeInTheDocument();
    expect(
      screen.getByText("No overall mark. The answers stand on their own."),
    ).toBeInTheDocument();
    expect(screen.getByText("Appraisers' overall rating")).toBeInTheDocument();
  });

  it("shows the mark in the company's own words when there is one", () => {
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
    expect(screen.queryByText("Overall mark")).toBeNull();
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

  it("is a card about the self-review, not a self-rating nobody can give, where the company does not ask", () => {
    state.review = { ...(state.review as object), overallMark: false };
    mount();
    expect(
      screen.getByRole("heading", { name: "The self-review" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("The self-rating")).toBeNull();
    expect(
      screen.getByText("Shown beside the manager's review."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/does not count towards the final mark/),
    ).toBeNull();
    expect(screen.queryByText("Overall mark")).toBeNull();
    expect(screen.getByText("Written by")).toBeInTheDocument();
  });

  it("is the self-rating, and says what it counts for, where the company asks", () => {
    state.review = { ...(state.review as object), overallMark: true };
    mount();
    expect(
      screen.getByRole("heading", { name: "The self-rating" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not count towards the final mark unless/),
    ).toBeInTheDocument();
    expect(screen.getByText("None given")).toBeInTheDocument();
  });

  it("stays the self-rating when a mark was given, whatever the setting says now", () => {
    state.review = {
      ...(state.review as object),
      overallMark: false,
      rating: 2,
    };
    mount();
    expect(
      screen.getByRole("heading", { name: "The self-rating" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Below Expectations")).toBeInTheDocument();
  });
});

describe("what they said about their own period, beside a manager's record", () => {
  const selfReview = (over: Partial<ApiReviewDetail> = {}) =>
    review({
      id: "r-self",
      kind: "SELF",
      kindLabel: "Self-review",
      authorName: "Emeka Anyanwu",
      authorId: "emp-subject",
      ...over,
    });

  it("has no row for their own overall mark where the company does not ask", () => {
    state.review = review({ overallMark: false });
    state.self = selfReview({ overallMark: false });
    mount();
    expect(
      screen.getByRole("heading", {
        name: "What they said about their own period",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Their overall mark")).toBeNull();
  });

  it("says none was given where the company asks and they gave none", () => {
    state.review = review({ overallMark: true });
    state.self = selfReview({ overallMark: true });
    mount();
    /* The Stat's own box, so this is their row and not the manager's. */
    const stat = screen
      .getByText("Their overall mark")
      .closest<HTMLElement>(".rounded-lg")!;
    expect(within(stat).getByText("None given")).toBeInTheDocument();
  });

  it("shows the mark they gave, whatever the setting says now", () => {
    state.review = review({ overallMark: false });
    state.self = selfReview({ overallMark: false, rating: 5 });
    mount();
    expect(screen.getByText("Their overall mark")).toBeInTheDocument();
    expect(screen.getByText("Exceptional")).toBeInTheDocument();
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

  it("does not tell the manager there is no overall mark where the company does not ask for one", () => {
    renderDialog({ overallMark: false });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/They will read the answers\./),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/no overall mark/i)).toBeNull();
  });

  it("still says so where the company asks and none was given", () => {
    renderDialog({ overallMark: true });
    expect(
      within(screen.getByRole("dialog")).getByText(
        /This form has no overall mark, so they will read the answers\./,
      ),
    ).toBeInTheDocument();
  });

  it("names the rating where there is one", () => {
    renderDialog({ overallMark: false, rating: 4 });
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Their rating becomes "Exceeds Expectations"\./,
      ),
    ).toBeInTheDocument();
  });

  it("says the same in the account of what it recorded, where the company does not ask for a mark", async () => {
    const user = userEvent.setup();
    renderDialog({ overallMark: false });
    await user.click(screen.getByRole("button", { name: "Make it final" }));
    expect(
      await screen.findByText("Emeka will read the answers."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no overall mark/i)).toBeNull();
  });

  it("keeps saying there is no overall mark in that account where the company asks for one", async () => {
    const user = userEvent.setup();
    renderDialog({ overallMark: true });
    await user.click(screen.getByRole("button", { name: "Make it final" }));
    expect(
      await screen.findByText(
        "Year-end review 2026 has no overall mark, so Emeka will read the answers.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the statement that a rating is final", () => {
  const base = {
    subjectName: "Emeka Anyanwu",
    cycleName: "Year-end review 2026",
    ratingLabel: null,
    subjectNotified: true,
  };

  it("leaves out a mark that does not exist where the company does not ask", () => {
    expect(finalisedCopy({ ...base, markShown: false }).lead).toBe(
      "Emeka will read the answers.",
    );
  });

  it("keeps the old wording where the company asks, and where nobody says", () => {
    const old =
      "Year-end review 2026 has no overall mark, so Emeka will read the answers.";
    expect(finalisedCopy({ ...base, markShown: true }).lead).toBe(old);
    expect(finalisedCopy(base).lead).toBe(old);
  });

  it("quotes the rating whenever there is one", () => {
    expect(
      finalisedCopy({
        ...base,
        ratingLabel: "Meets Expectations",
        markShown: false,
      }).lead,
    ).toBe('The rating for Year-end review 2026 is "Meets Expectations".');
  });
});
