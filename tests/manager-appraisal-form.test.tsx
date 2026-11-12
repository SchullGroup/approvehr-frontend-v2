import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * A manager's form in a period that weights the Manager appraisal part.
 *
 * The part is scored from the appraisers' overall mark, so a form that let it go
 * blank would leave that appraiser's share of the mark out silently, and two
 * people in one period could be scored on different mixes because one manager
 * skipped a question. The server says so with `overallMarkRequired`, and then the
 * page is there whatever the company's own switch says, it does not ask whether
 * there is one, and the review does not go until one is given. It is handled like
 * a required question: going on without it is nudged, and Send walks the person
 * to it instead of sending.
 *
 * Where the server says nothing, none of that is true: absent is not required.
 */

const send = vi.fn(async () => undefined);
const save = vi.fn(async () => undefined);
const push = vi.fn();

const scale: ApiRatingScale = {
  source: "default",
  max: 5,
  levels: [
    { level: 5, label: "Exceptional", meaning: "" },
    { level: 4, label: "Exceeds Expectations", meaning: "" },
    { level: 3, label: "Meets Expectations", meaning: "" },
    { level: 2, label: "Below Expectations", meaning: "" },
    { level: 1, label: "Unsatisfactory", meaning: "" },
  ],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/store/ai", () => ({
  useDevelopmentSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
  /* A manager's closing page offers development areas where an assistant is
     wired. None is, here, so the button is absent. */
  useAssistantAvailable: () => ({ available: false, loading: false }),
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale, editable: true }),
  useReviewMutations: () => ({ save, send }),
  useAppraisals: () => ({ loading: false, mine: { toComplete: [] } }),
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));
vi.mock("@/components/performance/work-this-cycle", () => ({
  WorkThisCycle: () => null,
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";

const appraiser = (over: Record<string, unknown> = {}) => ({
  role: "LINE_MANAGER",
  roleLabel: "Line manager",
  weightBp: 10000,
  note: null,
  appraiserCount: 1,
  ...over,
});

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "MANAGER",
    kindLabel: "Manager review",
    cycleId: "c1",
    cycleName: "H2 2026",
    subjectId: "e1",
    subjectName: "Chidi Nwosu",
    periodStart: null,
    periodEnd: null,
    dueDate: null,
    instructions: null,
    guideUrl: null,
    anonymous: false,
    mine: true,
    submitted: false,
    questions: [],
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

const heading = (name: string | RegExp) =>
  screen.queryByRole("heading", { name });

const next = async (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("where the period needs the manager's overall mark", () => {
  it("has the page whatever the company's own setting says, and it does not ask whether there is one", async () => {
    mount({ overallMark: false, overallMarkRequired: true });
    await next("Start");
    expect(heading("Your overall mark")).toBeInTheDocument();
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(screen.getByText(/^Needed\./)).toBeInTheDocument();
  });

  it("says what it counts for when the API sent the part's share, and that this period counts it when it did not", async () => {
    const first = mount({
      overallMarkRequired: true,
      appraiser: appraiser({ markShareBp: 3000 }) as never,
    });
    await next("Start");
    expect(
      screen.getByText("Needed. It counts for 30% of the mark in this period."),
    ).toBeInTheDocument();
    first.unmount();
    window.localStorage.clear();

    mount({ overallMarkRequired: true });
    await next("Start");
    expect(
      screen.getByText("Needed. This period counts it towards the score."),
    ).toBeInTheDocument();
  });

  it("offers no way to leave it blank, and the button is Next, never Skip", async () => {
    mount({ overallMarkRequired: true });
    await next("Start");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("radio", { name: /Exceeds Expectations/ }),
    );
    expect(screen.queryByText("Leave it blank instead")).toBeNull();
  });

  it("will not go on without one, and says so on the page", async () => {
    mount({ overallMarkRequired: true });
    await next("Start");
    await next("Next");
    expect(heading("Your overall mark")).toBeInTheDocument();
    expect(heading("Your recommendations")).toBeNull();
    expect(
      screen.getByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
  });

  it("goes on once one is picked, and sends it as its number", async () => {
    mount({ overallMarkRequired: true });
    await next("Start");
    await userEvent.click(
      screen.getByRole("radio", { name: /Exceeds Expectations/ }),
    );
    await next("Next");
    expect(heading("Your recommendations")).toBeInTheDocument();
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(screen.queryByText("Needs an answer")).toBeNull();
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith("r1", { rating: 4 }, []);
  });

  it("says on the preview that the mark is still needed, and Send walks to it instead of sending", async () => {
    /* A person can reach the preview with no mark by coming back to a draft that
       was left there. */
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "", summary: "A note.", step: 3 }),
    );
    mount({ overallMarkRequired: true });
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.getByText("Not given yet")).toBeInTheDocument();
    expect(screen.getByText("Needs an answer")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The overall mark still needs an answer before this can go.",
      ),
    ).toBeInTheDocument();

    await next("Send it");
    expect(send).not.toHaveBeenCalled();
    expect(heading("Your overall mark")).toBeInTheDocument();
    expect(
      screen.getByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
  });

  it("is read once: the page does not appear if the server's answer moves under somebody", async () => {
    const view = mount({ overallMarkRequired: false });
    view.rerender(
      <FocusForm
        review={review({ overallMarkRequired: true })}
        onSent={vi.fn()}
        onSending={vi.fn()}
      />,
    );
    await next("Start");
    expect(heading("Your overall mark")).toBeNull();
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(heading("Your recommendations")).toBeInTheDocument();
  });

  it("is read once: nor does it turn optional halfway through", async () => {
    const view = mount({ overallMarkRequired: true });
    view.rerender(
      <FocusForm
        review={review({ overallMarkRequired: false })}
        onSent={vi.fn()}
        onSending={vi.fn()}
      />,
    );
    await next("Start");
    expect(heading("Your overall mark")).toBeInTheDocument();
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await next("Next");
    expect(heading("Your overall mark")).toBeInTheDocument();
  });
});

describe("where the period does not need it", () => {
  it("is still optional on a manager's form where the company asks for a mark", async () => {
    mount({ overallMark: true, overallMarkRequired: false });
    await next("Start");
    expect(heading("Is there an overall mark?")).toBeInTheDocument();
    expect(
      screen.getByText("Optional. Leave it if the answers say enough."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("treats a server that does not say as not needed, and has no page when the company does not ask", async () => {
    mount();
    await next("Start");
    expect(heading("Your overall mark")).toBeNull();
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(heading("Your recommendations")).toBeInTheDocument();
  });

  it("does not hold a self-review to it", async () => {
    mount({ kind: "SELF", kindLabel: "Self-review", overallMark: false });
    await next("Start");
    expect(heading("Your overall mark")).toBeNull();
    expect(heading("Anything to add?")).toBeInTheDocument();
  });
});

describe("the strip above the form says what the overall mark is worth, from the period's share", () => {
  it("says it counts, and for how much", async () => {
    mount({
      overallMark: true,
      overallMarkRequired: true,
      appraiser: appraiser({ markShareBp: 3000 }) as never,
    });
    expect(
      screen.getByText("Your overall mark counts for 30% of the mark."),
    ).toBeInTheDocument();
  });

  it("says it does not count where the period does not weight the part and the form asks for one", async () => {
    mount({
      overallMark: true,
      appraiser: appraiser({ markShareBp: 0 }) as never,
    });
    expect(
      screen.getByText("Your overall mark does not count towards the score."),
    ).toBeInTheDocument();
  });

  it("makes no claim from a server that does not say, and never says the review counts for the mark", async () => {
    mount({ overallMark: true, appraiser: appraiser() as never });
    expect(screen.getByText("Line manager")).toBeInTheDocument();
    expect(screen.queryByText(/counts for/)).toBeNull();
    expect(screen.queryByText(/does not count/)).toBeNull();
    expect(screen.queryByText(/of the mark/)).toBeNull();
  });
});
