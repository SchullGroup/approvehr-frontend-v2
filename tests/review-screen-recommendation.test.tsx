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
 * their place, on the Answers tab.
 *
 * HR's recommendation is text under the rating, with no card and no heading of its
 * own, because the person reads it with their rating. What the score is made of is
 * one list, and every sentence about it is one tooltip.
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
/* The panels read the person's flags through their own hook. Flags are not what this file is
   about, so the server never says they are on; tests/work-flags-panels.test.tsx covers them. */
vi.mock("@/lib/store/work-flags", () => ({
  useWorkFlags: () => ({
    on: false,
    flags: null,
    flag: vi.fn(),
    unflag: vi.fn(),
  }),
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
    /* What a server that keeps a recommendation sends when there is none. */
    hrRecommendation: null,
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

/** The Answers tab, where the two reviews sit side by side. */
const openAnswers = async () =>
  userEvent.click(screen.getByRole("tab", { name: "Answers" }));

describe("the two reviews on the page", () => {
  it("are one card on the Answers tab, with no heading, and the old two headings are gone", async () => {
    mount();
    await openAnswers();
    expect(
      screen.queryByRole("heading", { name: "Self review and manager review" }),
    ).toBeNull();
    expect(
      screen.queryByText("What was asked, and what was answered"),
    ).toBeNull();
    expect(
      screen.queryByText("What they said about their own period"),
    ).toBeNull();
    expect(screen.queryByText(/Their answers, as they sent them/)).toBeNull();
    /* Both answers are there, side by side. */
    expect(screen.getByText("A good one.")).toBeInTheDocument();
    expect(screen.getByText("Steady.")).toBeInTheDocument();
  });

  it("carries the manager's recommendations beside the person's closing words", async () => {
    mount();
    await openAnswers();
    const row = within(screen.getByText("Note").closest("li")!);
    expect(row.getByText("Recommend the team lead role.")).toBeInTheDocument();
    expect(row.getByText("Nothing added")).toBeInTheDocument();
  });

  it("does not say the closing note on the Rating tab", () => {
    mount();
    expect(screen.queryByText("In summary")).toBeNull();
    expect(screen.queryByText("Recommend the team lead role.")).toBeNull();
  });
});

describe("HR's recommendation on the record", () => {
  it("is text under the rating, with no card, no heading and no date of its own", () => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-10-20T09:00:00.000Z",
      hrRecommendation: "Negotiation training first.\nThen the lead role.",
    });
    mount();
    const region = screen.getByRole("region", { name: "HR's recommendation" });
    expect(region).toHaveTextContent("Negotiation training first.");
    expect(region).toHaveTextContent("Then the lead role.");
    expect(
      screen.queryByRole("heading", { name: "HR's recommendation" }),
    ).toBeNull();
    expect(
      screen.queryByText(/Added when the rating was made final/),
    ).toBeNull();
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
    expect(
      screen.queryByRole("region", { name: "HR's recommendation" }),
    ).toBeNull();
  });

  it("is not drawn on a self review, which is nobody's rating of record", () => {
    state.review = selfReview({ hrRecommendation: "Should never be here." });
    state.self = null;
    mount();
    expect(screen.queryByText("Should never be here.")).toBeNull();
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

  it("does not offer it where the server does not send the field at all, because it would ignore the words", async () => {
    /* An older server ignores the body of the finalise. The box offered there
       would be followed by "saved" for a recommendation nobody kept, on a rating
       that is now final. The key's absence is how the screen knows. */
    state.review = review({ hrRecommendation: undefined });
    mount();
    const dialog = await open();
    expect(within(dialog).queryByLabelText(/Your recommendation/)).toBeNull();
    /* The rating can still be made final, as before. */
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(state.finalise).toHaveBeenCalledTimes(1));
    expect(state.finalise).toHaveBeenCalledWith("r-1", undefined);
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

describe("where HR's recommendation sits", () => {
  it("is directly under the rating, ahead of the parts of the score", () => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-10-20T09:00:00.000Z",
      hrRecommendation: "Negotiation training first.",
      outcome: { bandLabel: "Meets Expectations", scoreOutOf5: 3.4 },
    });
    withParts([
      part("CORE_COMPETENCY", "Core competencies", 5000, 5000, 7500, 2),
    ]);
    mount();
    const rating = screen.getByText("Meets Expectations · 3.4");
    const reco = screen.getByRole("region", { name: "HR's recommendation" });
    const parts = screen.getByText("Core competencies");
    const before = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(rating, reco)).toBe(true);
    expect(before(reco, parts)).toBe(true);
  });
});

describe("what the score is made of, when parts were left out", () => {
  /** Everything the one tooltip says, opened. */
  const tooltip = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "About this score" }),
    );
    return screen.getByText(/left out, so the other parts|by the company\./)
      .textContent as string;
  };

  it("says why once, naming the part, in one tooltip, and draws only the parts that have a score", async () => {
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
    /* On the page: four rows. The part that gave up its weight has none. */
    const list = screen.getByText("Core competencies").closest("ul")!;
    expect(within(list).getAllByRole("progressbar")).toHaveLength(5);
    expect(within(list).queryByText("Delivery against objectives")).toBeNull();
    /* And none of the sentences. */
    expect(screen.queryByText(/left out, so the other parts/)).toBeNull();
    expect(screen.queryByText(/by the company\./)).toBeNull();
    expect(screen.queryByText("Based on 8 ratings")).toBeNull();

    const said = await tooltip();
    expect(
      said.match(
        /Delivery against objectives was left out, so the other parts/g,
      ),
    ).toHaveLength(1);
    expect(said).toContain("Core competencies: Set at 40% by the company.");
    expect(said).toContain(
      "Behavioural competencies: Set at 40% by the company.",
    );
    expect(said).toContain("Leadership: Set at 5% by the company.");
    expect(said).toContain("Self-assessment: Set at 10% by the company.");
  });

  it("names two parts together, with were and their, and keeps the API's own words for a part left out", async () => {
    withParts([
      part("OBJECTIVES", "Delivery against objectives", 500, 0, null, 0),
      part("LEADERSHIP", "Leadership", 500, 0, 7500, 1, {
        excludedBecause: "NOT_A_MANAGER",
        excludedNote: "THE API'S WORDS FOR A RATED LEADERSHIP",
      }),
      part("CORE_COMPETENCY", "Core competencies", 4000, 4444, 7500, 2),
    ]);
    mount();
    const said = await tooltip();
    expect(said).toContain(
      "Delivery against objectives and Leadership were left out, so the other parts share their weight and count for more than the company set.",
    );
    expect(said).toContain(
      "Leadership: THE API'S WORDS FOR A RATED LEADERSHIP",
    );
  });

  it("says nothing about weights, and draws no tooltip, when every part counts for what was set", () => {
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
    /* The period's weights were frozen and said nothing about the score. */
    expect(
      screen.queryByRole("button", { name: "About this score" }),
    ).toBeNull();
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
    expect(
      screen.queryByRole("button", { name: "About this score" }),
    ).toBeNull();
  });
});
