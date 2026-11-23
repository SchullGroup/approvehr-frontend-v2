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
 * A manager asks colleagues for feedback from their own review (UAT 23 Nov,
 * U101 / PERF-21). Ask colleagues used to be one button per row of HR's Marks
 * table, which a line manager cannot open. It is offered on the review the
 * manager is writing, while the period runs, and to nobody else.
 *
 * (Harness copied from review-screen-recommendation.test.tsx.)
 *
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

const askButton = () =>
  screen.queryByRole("button", { name: "Ask colleagues" });

describe("Ask colleagues on a manager's own review", () => {
  it("is offered to the manager writing it while the period runs", () => {
    state.permissions = new Set();
    state.review = review({
      mine: true,
      cycleStage: "IN_REVIEW",
      submitted: false,
    });
    mount();
    expect(askButton()).toBeInTheDocument();
  });

  it("is not offered on somebody else's review, a self-review, a draft or a published period", () => {
    state.review = review({ mine: false, cycleStage: "IN_REVIEW" });
    mount();
    expect(askButton()).toBeNull();
    cleanup();
    state.review = review({
      mine: true,
      kind: "SELF",
      kindLabel: "Self-review",
    });
    mount();
    expect(askButton()).toBeNull();
    cleanup();
    state.review = review({ mine: true, cycleStage: "DRAFT" });
    mount();
    expect(askButton()).toBeNull();
    cleanup();
    state.review = review({ mine: true, cycleStage: "PUBLISHED" });
    mount();
    expect(askButton()).toBeNull();
  });
});
