import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiEmployeeScore,
  ApiFormQuestion,
  ApiHistoryPoint,
  ApiReviewDetail,
  ApiScoreHistory,
} from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";
import { ScoreHistoryScreen } from "@/app/(app)/performance/history/[employeeId]/history-screen";

/**
 * Where the manager's overall mark sits in a score, and what is said beside it.
 *
 * It was reference only, always, and the sentence beside the figure said so. It is
 * scored where a period weights the Manager appraisal part, and then "does not
 * count towards the score" beside a part that says "counts for 30%" would be two
 * mutually exclusive claims on one screen. So the sentence is read off the part,
 * on the record page and on the history page alike, and a server that sends no
 * such part keeps the words it always had, which were true of it.
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
vi.mock("@/components/performance/work-record", () => ({
  WorkRecordPanel: () => null,
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

  it("says it is for reference where the part is at 0%, as it always did", () => {
    mount([objectives, managerPart(0)]);
    expect(
      screen.getByText("For reference. It does not count towards the score."),
    ).toBeInTheDocument();
  });

  it("says it is for reference, in those same words, from a server that sends no such part", () => {
    mount([objectives]);
    expect(
      screen.getByText("For reference. It does not count towards the score."),
    ).toBeInTheDocument();
  });

  it("points at the part where it is scored, and never says it is for reference", () => {
    mount([objectives, managerPart(3000)]);
    expect(
      screen.getByText("It is what Manager appraisal is scored from."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/for reference/i)).toBeNull();
    expect(screen.queryByText(/does not count/i)).toBeNull();
  });

  it("says how much of the weight is in across several appraisers, and still points at the part", () => {
    mount([objectives, managerPart(3000)], mark(3, 6667));
    expect(
      screen.getByText(
        "66.67% of the weight is in, across 3 appraisers. It is what Manager appraisal is scored from.",
      ),
    ).toBeInTheDocument();
  });

  it("follows the company's own name for the part", () => {
    mount([objectives, part("MANAGER_APPRAISAL", "Line view", 3000)]);
    expect(
      screen.getByText("It is what Line view is scored from."),
    ).toBeInTheDocument();
  });

  it("lists the part among what the mark is made of only where it carries a weight", () => {
    mount([objectives, managerPart(0)]);
    expect(
      screen.queryByText("Manager appraisal", { selector: "span" }),
    ).toBeNull();
    cleanup();
    mount([objectives, managerPart(3000)]);
    const list = screen.getByText("Delivery against objectives").closest("ul");
    expect(list).not.toBeNull();
    expect(
      within(list as HTMLElement).getByText("Manager appraisal"),
    ).toBeInTheDocument();
    expect(
      within(list as HTMLElement).getByText("Based on 1 overall mark"),
    ).toBeInTheDocument();
  });

  it("says in the API's words why a weighted part counted for nobody yet, never as a nought", () => {
    mount([
      objectives,
      managerPart(3000, {
        scoreBp: null,
        included: false,
        effectiveWeightBp: 0,
        excludedBecause: "NO_APPRAISER_MARK",
        excludedNote: "No appraiser has sent an overall mark yet.",
        evidenceCount: 0,
      }),
    ]);
    expect(
      screen.getByText("No appraiser has sent an overall mark yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing recorded")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manager appraisal was left out, so the other parts share its weight and count for more than the company set.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the strip above the record", () => {
  const appraiser = (markShareBp?: number) => ({
    role: "LINE_MANAGER",
    roleLabel: "Line manager",
    weightBp: 10000,
    note: null,
    appraiserCount: 1,
    ...(markShareBp === undefined ? {} : { markShareBp }),
  });
  const mount = (over: Record<string, unknown>) => {
    state.review = { ...(review() as object), ...over };
    state.score = scoreWith([objectives, managerPart(0)]);
    render(<ReviewScreen reviewId="r-1" />);
  };

  it("says what the overall mark is worth, from the period's share", () => {
    mount({ appraiser: appraiser(3000) });
    expect(
      screen.getByText("This overall mark counts for 30% of the mark."),
    ).toBeInTheDocument();
  });

  it("says it does not count where the form asks for a mark and the period does not weight the part", () => {
    mount({ overallMark: true, appraiser: appraiser(0) });
    expect(
      screen.getByText("This overall mark does not count towards the score."),
    ).toBeInTheDocument();
  });

  it("says nothing about the mark where the form does not ask for one", () => {
    mount({ overallMark: false, appraiser: appraiser(0) });
    expect(screen.getByText("Line manager")).toBeInTheDocument();
    expect(
      screen.queryByText("This overall mark does not count towards the score."),
    ).toBeNull();
  });

  it("makes no claim from a server that does not say, and never says the review counts", () => {
    mount({ appraiser: appraiser() });
    expect(screen.getByText("Line manager")).toBeInTheDocument();
    expect(screen.queryByText(/This overall mark/)).toBeNull();
    expect(screen.queryByText(/review counts/i)).toBeNull();
  });
});

describe("the history page's appraisers' overall mark", () => {
  const point = (components: unknown[]): ApiHistoryPoint =>
    ({
      cycleId: "c-1",
      cycleName: "H2 2026 Appraisal",
      stage: "PUBLISHED",
      dueDate: null,
      weightsFrom: "snapshot",
      scoreBp: 7500,
      scorePercent: 75,
      band: "MEETS",
      bandLabel: "Meets expectations",
      changeBp: null,
      components,
      objectives: {
        agreed: 1,
        awaitingApproval: 0,
        draft: 0,
        needsRevision: 0,
        measured: 0,
      },
      appraiserMark: mark(2, 5000),
      signOff: {
        reviewId: "r-1",
        submitted: true,
        finalised: true,
        finalisedAt: "2026-10-20T09:00:00.000Z",
        acknowledged: false,
        acknowledgedAt: null,
        disputed: false,
        disputedAt: null,
        employeeComment: null,
      },
      exceptions: [],
    }) as unknown as ApiHistoryPoint;

  const mount = (components: unknown[]) => {
    state.history = {
      employeeId: "emp-1",
      employeeName: "Emeka Anyanwu",
      jobTitle: "Engineer",
      departmentId: null,
      departmentName: "Product",
      points: [point(components)],
      counts: { cycles: 1, scored: 1, unscored: 0 },
      unscoredCycles: [],
      trend: null,
      truncated: false,
      limit: 12,
      withheldCycles: 0,
      withheldNote: null,
    } as ApiScoreHistory;
    render(<ScoreHistoryScreen employeeId="emp-1" />);
  };

  it("keeps saying it is not part of the score where the part is at 0%, or where there is no such part", () => {
    for (const components of [[objectives, managerPart(0)], [objectives]]) {
      mount(components);
      expect(
        screen.getByText(
          /\(50% of the weight is in\)\. For reference; it is not part of the score\./,
        ),
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it("says what it is scored from where the part carries a weight", () => {
    mount([objectives, managerPart(3000)]);
    const text = screen.getByText(/of the weight is in\)/).textContent ?? "";
    expect(text).toContain("It is what Manager appraisal is scored from.");
    expect(text).not.toMatch(/reference|not part of the score/);
  });
});
