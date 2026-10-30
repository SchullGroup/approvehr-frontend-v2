import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiEmployeeScore,
  ApiFormQuestion,
  ApiReviewDetail,
} from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * HR's recommendation on the record of a rating, and the box that writes it.
 *
 * The screen offers the box to HR alone, hands what was typed to the finalise call
 * and nothing else, and shows what was written beside the two reviews it was
 * written against. A card saying HR recommended nothing would be a claim about a
 * choice nobody made, so with no recommendation there is no card.
 *
 * The comparison is exercised here too, on the screen it lives on: the old two
 * cards ("What was asked, and what was answered" and "What they said about their
 * own period") are gone, and the words Self review and Manager review stand in
 * their place.
 */

const state = vi.hoisted(() => ({
  review: null as unknown,
  self: null as unknown,
  score: null as unknown,
  permissions: new Set<string>(),
  finalise: vi.fn<
    (
      id: string,
      recommendation?: string,
    ) => Promise<{ subjectNotified: boolean }>
  >(async () => ({ subjectNotified: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  useCan: (permission: string) => state.permissions.has(permission),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: "emp-viewer", isConnected: true }),
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
    finalise: state.finalise,
  }),
}));

const text = (
  id: string,
  prompt: string,
  value: string,
  order = 0,
): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order,
  answer: {
    ratingValue: null,
    textValue: value,
    choiceValue: null,
    boolValue: null,
    attachment: null,
    answeredAt: "2026-10-12T09:00:00.000Z",
  },
});

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r-1",
    cycleId: "c-1",
    cycleName: "H2 2026 Appraisal",
    cycleStage: "CALIBRATION",
    dueDate: null,
    periodStart: null,
    periodEnd: null,
    kind: "MANAGER",
    kindLabel: "Manager review",
    anonymous: false,
    subjectId: "emp-subject",
    subjectName: "Femi Balogun",
    authorId: "emp-author",
    authorName: "Chidinma Ipoola",
    rating: null,
    summary: "Recommend the team lead role.",
    submitted: true,
    submittedAt: "2026-10-14T08:00:00.000Z",
    answerCount: 1,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
    mine: false,
    questions: [text("q1", "How did the period go?", "Steady.", 1)],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

const selfReview = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  review({
    id: "r-self",
    kind: "SELF",
    kindLabel: "Self-review",
    authorId: "emp-subject",
    authorName: "Femi Balogun",
    summary: null,
    questions: [text("q1", "How did the period go?", "A good one.", 1)],
    ...over,
  });

const score = {
  scoreBp: 5938,
  weightsFrom: "snapshot",
  appraiserMark: { ratingBp: null, appraisers: 1, submittedWeightBp: 10000 },
  objectives: { agreed: 0, measured: 0, awaitingApproval: 0 },
  components: [],
  unmappedRatings: 0,
  exceptions: [],
} as unknown as ApiEmployeeScore;

const mount = () => render(<ReviewScreen reviewId="r-1" />);

beforeEach(() => {
  vi.clearAllMocks();
  state.review = review();
  state.self = selfReview();
  state.score = score;
  state.permissions = new Set(["EDIT_RECORDS"]);
});
afterEach(cleanup);

describe("the two reviews on the page", () => {
  it("are one card, and the old two headings are gone", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "Self review and manager review" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What was asked, and what was answered"),
    ).toBeNull();
    expect(
      screen.queryByText("What they said about their own period"),
    ).toBeNull();
    expect(screen.queryByText(/Their answers, as they sent them/)).toBeNull();
  });

  it("carries the manager's recommendations beside the person's closing words", () => {
    mount();
    const row = within(
      screen.getByText("Closing note and recommendations").closest("li")!,
    );
    expect(row.getByText("Recommend the team lead role.")).toBeInTheDocument();
    expect(row.getByText("Nothing added")).toBeInTheDocument();
  });

  it("does not say the closing note a second time in the top card", () => {
    mount();
    expect(screen.queryByText("In summary")).toBeNull();
    expect(screen.getAllByText("Recommend the team lead role.")).toHaveLength(
      1,
    );
  });
});

describe("HR's recommendation on the record", () => {
  it("is a card of its own, dated by when the rating was made final", () => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-10-20T09:00:00.000Z",
      hrRecommendation: "Negotiation training first.\nThen the lead role.",
    });
    mount();
    const heading = screen.getByRole("heading", {
      name: "HR's recommendation",
    });
    expect(heading).toBeInTheDocument();
    expect(
      screen.getByText(/Added when the rating was made final on/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Negotiation training first\./),
    ).toBeInTheDocument();
  });

  it.each([
    ["none", null],
    ["not sent by this server", undefined],
  ] as const)("is not drawn when there is %s", (_name, value) => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-10-20T09:00:00.000Z",
      ...(value === undefined ? {} : { hrRecommendation: value }),
    });
    mount();
    expect(screen.queryByText("HR's recommendation")).toBeNull();
  });

  it("is not drawn on a self review, which is nobody's rating of record", () => {
    state.review = selfReview({ hrRecommendation: "Should never be here." });
    state.self = null;
    mount();
    expect(screen.queryByText("HR's recommendation")).toBeNull();
  });
});

describe("making the rating final", () => {
  const open = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    return screen.getByRole("dialog");
  };

  it("offers HR the recommendation box", async () => {
    mount();
    const dialog = await open();
    expect(
      within(dialog).getByLabelText(/Your recommendation/),
    ).toBeInTheDocument();
  });

  it("does not offer it to the manager who wrote the review, who cannot add one", async () => {
    state.permissions = new Set();
    state.review = review({ mine: true });
    mount();
    const dialog = await open();
    expect(within(dialog).queryByLabelText(/Your recommendation/)).toBeNull();
  });

  it("hands what HR typed to the finalise call, with the review's id", async () => {
    mount();
    const dialog = await open();
    await userEvent.type(
      within(dialog).getByLabelText(/Your recommendation/),
      "Ready for the lead role.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(state.finalise).toHaveBeenCalledTimes(1));
    expect(state.finalise).toHaveBeenCalledWith(
      "r-1",
      "Ready for the lead role.",
    );
  });

  it("hands over no recommendation when none was typed", async () => {
    mount();
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(state.finalise).toHaveBeenCalledTimes(1));
    expect(state.finalise).toHaveBeenCalledWith("r-1", undefined);
  });
});

describe("where HR's recommendation sits", () => {
  it("is directly under the rating, ahead of the score and the reviews", () => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-10-20T09:00:00.000Z",
      hrRecommendation: "Negotiation training first.",
    });
    mount();
    const rating = screen.getByRole("heading", { name: "The rating" });
    const reco = screen.getByRole("heading", { name: "HR's recommendation" });
    const mark = screen.getByRole("heading", {
      name: "What the mark is made of",
    });
    const reviews = screen.getByRole("heading", {
      name: "Self review and manager review",
    });
    const before = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(rating, reco)).toBe(true);
    expect(before(reco, mark)).toBe(true);
    expect(before(reco, reviews)).toBe(true);
  });
});

describe("what the mark is made of, when parts were left out", () => {
  const part = (
    component: string,
    label: string,
    weightBp: number,
    effectiveWeightBp: number,
    scoreBp: number | null,
    evidenceCount: number,
    over: Record<string, unknown> = {},
  ) => ({
    component,
    label,
    scoreBp,
    weightBp,
    effectiveWeightBp,
    included: effectiveWeightBp > 0,
    excludedBecause: effectiveWeightBp > 0 ? null : "NO_DATA",
    excludedNote:
      effectiveWeightBp > 0
        ? null
        : "Nothing was recorded against this, so it is left out rather than scored 0.",
    evidenceCount,
    ...over,
  });

  const withParts = (components: ReturnType<typeof part>[]) => {
    state.score = { ...score, components } as unknown as ApiEmployeeScore;
  };

  it("says why once, naming the part, and gives each part only what was set", () => {
    withParts([
      part("OBJECTIVES", "Delivery against objectives", 500, 0, null, 0),
      part("CORE_COMPETENCY", "Core competencies", 4000, 4211, 7500, 2),
      part(
        "BEHAVIOURAL_COMPETENCY",
        "Behavioural competencies",
        4000,
        4210,
        6250,
        4,
      ),
      part("LEADERSHIP", "Leadership", 500, 526, 6250, 2),
      part("SELF_ASSESSMENT", "Self-assessment", 1000, 1053, 8438, 8),
    ]);
    mount();
    expect(
      screen.getAllByText(
        "Delivery against objectives was left out, so the other parts share its weight and count for more than the company set.",
      ),
    ).toHaveLength(1);
    /* The reason is not said again on any part. */
    expect(
      screen.queryByText(/because Delivery against objectives/),
    ).toBeNull();
    expect(screen.getAllByText("Set at 40% by the company.")).toHaveLength(2);
    expect(screen.getByText("Set at 5% by the company.")).toBeInTheDocument();
    expect(screen.getByText("Set at 10% by the company.")).toBeInTheDocument();
    expect(screen.getByText("Based on 8 ratings")).toBeInTheDocument();
  });

  it("names two parts together, with were and their", () => {
    withParts([
      part("OBJECTIVES", "Delivery against objectives", 500, 0, null, 0),
      part("LEADERSHIP", "Leadership", 500, 0, 7500, 1, {
        excludedBecause: "NOT_A_MANAGER",
        excludedNote: "THE API'S WORDS FOR A RATED LEADERSHIP",
      }),
      part("CORE_COMPETENCY", "Core competencies", 4000, 4444, 7500, 2),
    ]);
    mount();
    expect(
      screen.getByText(
        "Delivery against objectives and Leadership were left out, so the other parts share their weight and count for more than the company set.",
      ),
    ).toBeInTheDocument();
    /* A part that is left out keeps the API's own words for it. */
    expect(
      screen.getByText("THE API'S WORDS FOR A RATED LEADERSHIP"),
    ).toBeInTheDocument();
  });

  it("says nothing about weights when every part counts for what was set", () => {
    withParts([
      part("CORE_COMPETENCY", "Core competencies", 5000, 5000, 7500, 2),
      part(
        "BEHAVIOURAL_COMPETENCY",
        "Behavioural competencies",
        5000,
        5000,
        6250,
        4,
      ),
    ]);
    mount();
    expect(screen.queryByText(/left out, so the other parts/)).toBeNull();
    expect(screen.queryByText(/by the company\./)).toBeNull();
  });

  it("does not count a part weighted at nothing as one that gave up a weight", () => {
    withParts([
      part("TASKS", "Weekly tasks", 0, 0, null, 0, {
        excludedBecause: "NOT_WEIGHTED",
        excludedNote: "Weighted at 0%, so it is shown but not counted.",
      }),
      part("CORE_COMPETENCY", "Core competencies", 10000, 10000, 7500, 2),
    ]);
    mount();
    expect(screen.queryByText(/left out, so the other parts/)).toBeNull();
  });
});
