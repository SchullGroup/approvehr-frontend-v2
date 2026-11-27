import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiEmployeeScore,
  ApiFormQuestion,
  ApiReviewDetail,
} from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";

/**
 * Where the manager's overall mark sits in a score, and what is said beside it.
 *
 * It was reference only, always, and the sentence beside the figure said so. It is
 * scored where a period weights the Manager appraisal part, and then "does not
 * count towards the score" beside a part that says "counts for 30%" would be two
 * mutually exclusive claims on one screen.
 *
 * It is a row of the list of parts where the part carries a weight and a score,
 * and nowhere else on the page: the stat tile that said "for reference" or "it is
 * what Manager appraisal is scored from" is gone, and with it a claim that could
 * disagree with the list. What the appraiser's share is worth is one tooltip
 * beside who wrote it.
 */

const state = vi.hoisted(() => ({
  review: null as unknown,
  score: null as unknown,
  history: null as unknown,
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
  useSession: () => ({ actingId: "emp-viewer", isConnected: true }),
}));
vi.mock("@/components/performance/work-evidence", () => ({
  WorkEvidence: () => null,
}));
/* The review card reads the person's flags through their own hook. Flags are not what this file is
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
    acknowledge: vi.fn(),
    finalise: vi.fn(),
  }),
  useScoreHistory: () => ({
    history: state.history,
    loading: false,
    error: null,
    available: true,
    refusal: "",
    reload: () => {},
  }),
}));

const question: ApiFormQuestion = {
  id: "q1",
  competencyId: null,
  prompt: "How did the period go?",
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
  answer: {
    ratingValue: null,
    textValue: "Steady.",
    choiceValue: null,
    boolValue: null,
    attachment: null,
    answeredAt: "2026-10-12T09:00:00.000Z",
  },
};

const review = (): ApiReviewDetail =>
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
    rating: 4,
    summary: null,
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
    hrRecommendation: null,
    mine: false,
    /* The company asks for a mark, so the stat is drawn. */
    overallMark: true,
    questions: [question],
    outstanding: [],
    instructions: null,
    guideUrl: null,
  }) as unknown as ApiReviewDetail;

type PartOver = Record<string, unknown>;
const part = (
  component: string,
  label: string,
  weightBp: number,
  over: PartOver = {},
) => ({
  component,
  label,
  scoreBp: 7500,
  weightBp,
  effectiveWeightBp: weightBp,
  included: weightBp > 0,
  excludedBecause: weightBp > 0 ? null : "NOT_WEIGHTED",
  excludedNote: weightBp > 0 ? null : "Not weighted.",
  evidenceCount: 1,
  ...over,
});

const objectives = part("OBJECTIVES", "Delivery against objectives", 7000);
const managerPart = (weightBp: number, over: PartOver = {}) =>
  part("MANAGER_APPRAISAL", "Manager appraisal", weightBp, over);

const mark = (appraisers: number, submittedWeightBp = 10000) => ({
  ratingBp: 7500,
  appraisers,
  submittedWeightBp,
  totalWeightBp: 10000,
});

const scoreWith = (
  components: unknown[],
  appraiserMark = mark(1),
): ApiEmployeeScore =>
  ({
    scoreBp: 7500,
    weightsFrom: "snapshot",
    appraiserMark,
    objectives: { agreed: 1, measured: 0, awaitingApproval: 0 },
    components,
    unmappedRatings: 0,
    exceptions: [],
  }) as unknown as ApiEmployeeScore;

beforeEach(() => {
  state.review = review();
});
afterEach(cleanup);

describe("the record page's appraisers' overall rating", () => {
  const mount = (components: unknown[], appraiserMark = mark(1)) => {
    state.score = scoreWith(components, appraiserMark);
    render(<ReviewScreen reviewId="r-1" />);
  };

  it("is not a stat tile any more, and says nothing is for reference", () => {
    mount([objectives, managerPart(0)]);
    expect(screen.queryByText("Appraisers' overall rating")).toBeNull();
    expect(screen.queryByText(/for reference/i)).toBeNull();
    expect(screen.queryByText(/does not count/i)).toBeNull();
    expect(screen.queryByText(/is scored from/i)).toBeNull();
  });

  it("says the same from a server that sends no such part", () => {
    mount([objectives]);
    expect(screen.queryByText(/for reference/i)).toBeNull();
    expect(screen.queryByText(/is scored from/i)).toBeNull();
  });

  it("is listed among what the score is made of only where it carries a weight", () => {
    mount([objectives, managerPart(0)]);
    expect(screen.queryByText("Manager appraisal")).toBeNull();
    cleanup();
    mount([objectives, managerPart(3000)]);
    const list = screen.getByText("Delivery against objectives").closest("ul");
    expect(list).not.toBeNull();
    const row = within(list as HTMLElement)
      .getByText("Manager appraisal")
      .closest("li") as HTMLElement;
    expect(row).toHaveTextContent("4.0 out of 5");
    expect(row).toHaveTextContent("30% weight");
    /* The evidence line under it is not drawn. */
    expect(screen.queryByText("Based on 1 overall rating")).toBeNull();
  });

  it("follows the company's own name for the part", () => {
    mount([objectives, part("MANAGER_APPRAISAL", "Line view", 3000)]);
    expect(screen.getByText("Line view")).toBeInTheDocument();
    expect(screen.queryByText("Manager appraisal")).toBeNull();
  });

  it("says in the API's words why a weighted part counted for nobody yet, in the tooltip, never as a nought", async () => {
    mount([
      objectives,
      managerPart(3000, {
        scoreBp: null,
        included: false,
        effectiveWeightBp: 0,
        excludedBecause: "NO_APPRAISER_MARK",
        excludedNote: "No appraiser has sent an overall rating yet.",
        evidenceCount: 0,
      }),
    ]);
    /* Not on the page, and not as a row: nothing was recorded. */
    expect(screen.queryByText("Nothing recorded")).toBeNull();
    expect(
      screen.queryByText("No appraiser has sent an overall rating yet."),
    ).toBeNull();
    expect(screen.queryByText("Manager appraisal")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "About this score" }),
    );
    const said = screen.getByText(/Manager appraisal was left out/)
      .textContent as string;
    expect(said).toContain(
      "Manager appraisal was left out, so the other parts share its weight and count for more than the company set.",
    );
    expect(said).toContain(
      "Manager appraisal: No appraiser has sent an overall rating yet.",
    );
  });
});

describe("the line above the record, about the appraiser", () => {
  const appraiser = (markShareBp?: number, over: object = {}) => ({
    role: "LINE_MANAGER",
    roleLabel: "Line manager",
    weightBp: 10000,
    note: null,
    appraiserCount: 1,
    ...(markShareBp === undefined ? {} : { markShareBp }),
    ...over,
  });
  const mount = (over: Record<string, unknown>) => {
    state.review = { ...(review() as object), ...over };
    state.score = scoreWith([objectives, managerPart(0)]);
    render(<ReviewScreen reviewId="r-1" />);
  };
  const said = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "About this appraiser" }),
    );
    return document.body.textContent as string;
  };

  it("says what the overall rating is worth, from the period's share, in one tooltip", async () => {
    mount({ appraiser: appraiser(3000) });
    expect(
      screen.queryByText("This overall rating counts for 30% of the score."),
    ).toBeNull();
    expect(await said()).toContain(
      "This overall rating counts for 30% of the score.",
    );
  });

  it("says it does not count where the form asks for a score and the period does not weight the part", async () => {
    mount({ overallMark: true, appraiser: appraiser(0) });
    expect(await said()).toContain(
      "This overall rating does not count towards the score.",
    );
  });

  it("says nothing about the score where the form does not ask for one, and draws no tooltip", () => {
    mount({ overallMark: false, appraiser: appraiser(0) });
    expect(
      screen.queryByRole("button", { name: "About this appraiser" }),
    ).toBeNull();
    expect(
      screen.queryByText(
        "This overall rating does not count towards the score.",
      ),
    ).toBeNull();
  });

  it("makes no claim from a server that does not say, and never says the review counts", () => {
    mount({ appraiser: appraiser() });
    expect(screen.queryByText(/This overall rating/)).toBeNull();
    expect(screen.queryByText(/review counts/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "About this appraiser" }),
    ).toBeNull();
  });

  it("names the appraiser's role beside their name only when there are several", () => {
    mount({ appraiser: appraiser(undefined, { appraiserCount: 2 }) });
    expect(
      screen.getByText(/Chidinma Ipoola \(Line manager\)/),
    ).toBeInTheDocument();
    cleanup();
    mount({ appraiser: appraiser(undefined, { appraiserCount: 1 }) });
    expect(screen.queryByText(/Line manager/)).toBeNull();
  });
});
