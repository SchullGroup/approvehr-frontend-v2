import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import { ReviewScreen } from "@/app/(app)/performance/reviews/[id]/review-screen";
import {
  recordLine,
  recordStatus,
  recordTitle,
} from "@/app/(app)/performance/reviews/[id]/record-words";

/**
 * The record of one appraisal is a page with one status and one thing to do, and
 * then tabs: Rating, Answers, Work, and HR only for the people who can read it.
 *
 * What is proved here, and in the files beside it: whose it is is in the title and
 * the period under it; nothing says which reading it is; the header says one
 * status; the next step is one control and is absent where it could only refuse;
 * a tab with nothing in it is not drawn; and the HR tab is the same gate as before
 * around the same component.
 */

const state = vi.hoisted(() => ({
  actingId: "emp-viewer",
  review: null as unknown,
  self: null as unknown,
  flag: null as unknown,
  permissions: new Set<string>(),
  canFinalise: true,
  acknowledge: vi.fn(),
  finalise: vi.fn(),
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
  useSession: () => ({ actingId: state.actingId, isConnected: false }),
}));
vi.mock("@/components/performance/work-evidence", () => ({
  WorkEvidence: () => null,
}));
vi.mock("@/components/performance/kept-work", () => ({
  WorkBehindTheMark: () => <div data-testid="work-behind" />,
}));
vi.mock("@/components/performance/record-check", () => ({
  RecordCheck: () => <div data-testid="record-check" />,
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="evidence-badge">{status}</span>
  ),
}));
vi.mock("@/lib/store/project-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/project-session")>()),
  useProjectsGate: () => ({ enabled: false, loading: false }),
}));
vi.mock("@/lib/store/work-trackers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/work-trackers")>()),
  useWorkEvidence: () => ({
    evidence: null,
    loading: false,
    error: null,
    reload: () => {},
    connected: false,
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
    score: null,
    loading: false,
    available: false,
    error: null,
    refusal: "",
    reload: () => {},
  }),
  useReviewFlag: () => ({ flag: state.flag, claims: [] }),
  useSignOff: () => ({
    canFinalise: state.canFinalise,
    finaliseRefusal: "Making a rating final needs the live service.",
    acknowledge: state.acknowledge,
    finalise: state.finalise,
  }),
}));

const text = (id: string, prompt: string, value: string): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
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
    summary: null,
    submitted: true,
    submittedAt: "2026-09-03T08:00:00.000Z",
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
    questions: [text("q1", "How did the period go?", "Steady.")],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

const mount = () =>
  render(
    <ToastProvider>
      <ReviewScreen reviewId="r-1" />
    </ToastProvider>,
  );

const tabNames = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  state.actingId = "emp-viewer";
  state.review = review();
  state.self = null;
  state.flag = null;
  state.permissions = new Set();
  state.canFinalise = true;
  state.acknowledge = vi.fn(async () => ({
    acknowledgedAt: "2026-09-06T10:00:00.000Z",
  }));
  state.finalise = vi.fn(async () => ({ subjectNotified: true }));
});
afterEach(cleanup);

describe("the title", () => {
  it("names whose it is, with the period small beneath it, and does not say which reading it is", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "Femi Balogun's manager review" }),
    ).toBeInTheDocument();
    expect(screen.getByText("H2 2026 Appraisal")).toBeInTheDocument();
    expect(screen.queryByText(/You are reading this/)).toBeNull();
  });

  it("is 'Your' for the person it is about", () => {
    state.actingId = "emp-subject";
    mount();
    expect(
      screen.getByRole("heading", { name: "Your manager review" }),
    ).toBeInTheDocument();
  });

  it("has no card heading that repeats it", () => {
    mount();
    expect(
      screen.queryByRole("heading", { name: "Manager review" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "The rating" })).toBeNull();
  });

  it("is spelled one way for each kind", () => {
    expect(
      recordTitle(
        { kind: "SELF", kindLabel: "Self-review", subjectName: "Ada Obi" },
        false,
      ),
    ).toBe("Ada Obi's self review");
    expect(
      recordTitle(
        { kind: "SELF", kindLabel: "Self-review", subjectName: "Ada Obi" },
        true,
      ),
    ).toBe("Your self review");
    expect(
      recordTitle(
        { kind: "PEER", kindLabel: "Peer feedback", subjectName: "Ada Obi" },
        false,
      ),
    ).toBe("Ada Obi's peer feedback");
  });
});

describe("the one status", () => {
  const badges = () =>
    screen.queryAllByText(/^(Not sent yet|Sent|Final|Acknowledged|Disputed)$/);

  it("is the furthest the record has got, and only one of them", () => {
    state.review = review({
      finalised: true,
      finalisedAt: "2026-09-05T09:00:00.000Z",
      acknowledged: true,
      acknowledgedAt: "2026-09-06T10:00:00.000Z",
    });
    mount();
    const said = badges().filter((node) => node.tagName === "SPAN");
    expect(said.map((node) => node.textContent)).toEqual(["Acknowledged"]);
  });

  it("is named for each stage", () => {
    const base = {
      submitted: false,
      finalised: false,
      acknowledged: false,
      disputed: false,
    };
    expect(recordStatus(base).label).toBe("Not sent yet");
    expect(recordStatus({ ...base, submitted: true }).label).toBe("Sent");
    expect(
      recordStatus({ ...base, submitted: true, finalised: true }).label,
    ).toBe("Final");
    expect(
      recordStatus({
        ...base,
        submitted: true,
        finalised: true,
        acknowledged: true,
      }).label,
    ).toBe("Acknowledged");
    expect(recordStatus({ ...base, disputed: true }).label).toBe("Disputed");
  });
});

describe("the line under the rating", () => {
  const sent = {
    anonymous: false,
    authorName: "Chidinma Ipoola",
    submitted: true,
    submittedAt: "2026-09-03T08:00:00.000Z",
    dueDate: null,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
  } as Parameters<typeof recordLine>[0];

  it("says who, then each thing in the order it happened, once", () => {
    expect(recordLine(sent)).toBe("Chidinma Ipoola · sent 3 Sep 2026");
    expect(
      recordLine({ ...sent, finalisedAt: "2026-09-05T09:00:00.000Z" }),
    ).toBe("Chidinma Ipoola · sent 3 Sep 2026 · final 5 Sep 2026");
    expect(
      recordLine({
        ...sent,
        finalisedAt: "2026-09-05T09:00:00.000Z",
        acknowledged: true,
        acknowledgedAt: "2026-09-06T10:00:00.000Z",
      }),
    ).toBe(
      "Chidinma Ipoola · sent 3 Sep 2026 · final 5 Sep 2026 · acknowledged 6 Sep 2026",
    );
  });

  it("leaves out an author the API withholds, and capitalises what is left", () => {
    expect(recordLine({ ...sent, anonymous: true, authorName: null })).toBe(
      "Sent 3 Sep 2026",
    );
  });

  it("says when it is due, not that it is not sent, for a form that is not", () => {
    expect(
      recordLine({
        ...sent,
        submitted: false,
        submittedAt: null,
        dueDate: "2026-12-05",
      }),
    ).toBe("Chidinma Ipoola · due 5 Dec 2026");
  });
});

describe("the tabs", () => {
  it("are Rating and Answers where there is something to read, and no more", () => {
    mount();
    expect(tabNames()).toEqual(["Rating", "Answers"]);
  });

  it("are not drawn at all where there is only the rating", () => {
    state.review = review({ questions: [] });
    mount();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText(/Chidinma Ipoola · sent 3 Sep 2026/)).toBeVisible();
  });

  it("open on the rating once it is sent, and on the answers while it is being written", () => {
    mount();
    expect(screen.getByRole("tab", { name: "Rating" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    cleanup();
    state.review = review({
      mine: true,
      submitted: false,
      submittedAt: null,
    });
    mount();
    expect(screen.getByRole("tab", { name: "Answers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("show the answers when they are chosen", async () => {
    mount();
    expect(screen.queryByText("How did the period go?")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Answers" }));
    expect(screen.getByText("How did the period go?")).toBeInTheDocument();
    expect(screen.getByText("Steady.")).toBeInTheDocument();
  });
});

describe("the HR tab", () => {
  const flag = { status: "below", employeeId: "emp-subject" };

  it("is there for the people who can read the score against the evidence, and holds only that", async () => {
    state.permissions = new Set(["VIEW_FAIRNESS"]);
    state.flag = flag;
    mount();
    expect(tabNames()).toEqual(["Rating", "Answers", "HR"]);
    /* The header carries the one badge of it. */
    expect(screen.getByTestId("evidence-badge")).toHaveTextContent("below");
    expect(screen.queryByTestId("record-check")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "HR" }));
    expect(screen.getByTestId("record-check")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Score against the evidence" }),
    ).toBeNull();
  });

  it("is not there when there is nothing to read, which is every other reader", () => {
    state.flag = null;
    mount();
    expect(screen.queryByRole("tab", { name: "HR" })).toBeNull();
    expect(screen.queryByTestId("evidence-badge")).toBeNull();
  });
});

describe("the one thing to do", () => {
  it("is to fill the form in, for the author whose form is not sent, and the header does not say it too", () => {
    state.review = review({ mine: true, submitted: false, submittedAt: null });
    mount();
    expect(screen.getByRole("link", { name: "Fill it in" })).toHaveAttribute(
      "href",
      "/performance/reviews/r-1/answer",
    );
    expect(screen.getAllByText("Not sent yet")).toHaveLength(1);
  });

  it("is to make it final, for HR and the author of a sent review, as one button", async () => {
    state.permissions = new Set(["EDIT_RECORDS"]);
    mount();
    expect(screen.queryByText(/Making it final tells/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is not drawn where making it final could only refuse, and says nothing about why", () => {
    state.permissions = new Set(["EDIT_RECORDS"]);
    state.canFinalise = false;
    mount();
    expect(screen.queryByRole("button", { name: "Make it final" })).toBeNull();
    expect(
      screen.queryByText("Making a rating final needs the live service."),
    ).toBeNull();
  });

  it("is not there for a reader who may not make it final", () => {
    mount();
    expect(screen.queryByRole("button", { name: "Make it final" })).toBeNull();
  });
});

describe("acknowledging", () => {
  const final = () => {
    state.actingId = "emp-subject";
    state.review = review({
      finalised: true,
      finalisedAt: "2026-09-05T09:00:00.000Z",
      outcome: { bandLabel: "Meets Expectations", scoreOutOf5: 3 },
    });
  };

  it("is a banner with one button, and what it means is one tooltip", async () => {
    final();
    mount();
    expect(screen.getByText("Your rating is final")).toBeInTheDocument();
    expect(
      screen.queryByText(/needs your response|Acknowledging is not agreeing/),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "What acknowledging means" }),
    );
    expect(
      screen.getAllByText("This records that you saw it, not that you agree.")
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "I have seen this" }),
    ).toHaveLength(1);
  });

  it("opens a dialog of the optional comment and one button, records it, says so in a toast, and leaves no card behind", async () => {
    final();
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "I have seen this" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Noted.");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "I have seen this" }),
    );
    await waitFor(() =>
      expect(state.acknowledge).toHaveBeenCalledWith(
        expect.objectContaining({ id: "r-1" }),
        "Noted.",
      ),
    );
    expect(await screen.findByText("Acknowledged")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Your acknowledgement is recorded")).toBeNull();
  });

  it("is not asked of anybody but the person it is about, and only once", () => {
    state.review = review({ finalised: true });
    mount();
    expect(screen.queryByText("Your rating is final")).toBeNull();
    cleanup();
    final();
    state.review = review({
      finalised: true,
      acknowledged: true,
      acknowledgedAt: "2026-09-06T10:00:00.000Z",
    });
    mount();
    expect(screen.queryByText("Your rating is final")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "I have seen this" }),
    ).toBeNull();
  });
});
