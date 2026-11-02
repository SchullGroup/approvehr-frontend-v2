import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * The overall mark in the page-by-page form, as the company's choice.
 *
 * It is one switch in Appraisal scoring, sent with every review as
 * `overallMark`. These cases are about the places it could quietly be wrong:
 * a page nobody asked for, a mark sent by a form that did not offer one, a mark
 * left in a browser draft from before the switch moved, and a form that
 * reshuffles itself because somebody changed the setting halfway through.
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
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale, editable: true }),
  useReviewMutations: () => ({ save, send }),
  useAppraisals: () => ({ loading: false, mine: { toComplete: [] } }),
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";
import { SentScreen } from "@/app/(focus)/performance/reviews/[id]/answer/focus-sent";

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "SELF",
    kindLabel: "Self-review",
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

const mount = (over: Partial<ApiReviewDetail> = {}) => {
  const onSent = vi.fn();
  const view = render(
    <FocusForm review={review(over)} onSent={onSent} onSending={vi.fn()} />,
  );
  return { onSent, ...view };
};

const heading = (name: string | RegExp) =>
  screen.queryByRole("heading", { name });

/** Press the one button in the footer that goes on. */
const next = async (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("where the company does not ask for an overall mark", () => {
  it("goes from the introduction to the note, with no page for a mark", async () => {
    mount({ overallMark: false });
    await next("Start");
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(heading("Anything to add?")).toBeInTheDocument();
  });

  it("treats a server that does not say as not asking", async () => {
    /* An API one deploy behind sends no key. Absent is not yes. */
    mount();
    await next("Start");
    expect(heading("Is there an overall mark?")).toBeNull();
  });

  it("has no overall mark on the preview, and sends none", async () => {
    mount({ overallMark: false });
    await next("Start");
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith("r1", {}, []);
  });

  it("ignores a mark left in the browser from before the setting moved", async () => {
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "4", summary: "", step: 0 }),
    );
    mount({ overallMark: false });
    await next("Start");
    await next("Skip");
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = (send.mock.calls[0] as unknown[])[1] as { rating?: number };
    expect(body).not.toHaveProperty("rating");
  });

  it("does not add a page if the setting moves under somebody halfway through", async () => {
    const view = mount({ overallMark: false });
    view.rerender(
      <FocusForm
        review={review({ overallMark: true })}
        onSent={vi.fn()}
        onSending={vi.fn()}
      />,
    );
    await next("Start");
    expect(heading("Is there an overall mark?")).toBeNull();
    expect(heading("Anything to add?")).toBeInTheDocument();
  });
});

describe("where the company asks for an overall mark", () => {
  it("puts the page between the questions and the note, optional", async () => {
    mount({ overallMark: true });
    await next("Start");
    expect(heading("Is there an overall mark?")).toBeInTheDocument();
    expect(
      screen.getByText("Optional. Leave it if the answers say enough."),
    ).toBeInTheDocument();
    /* Nothing picked, so the button says it can be passed over. */
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("can be left blank, and then none is sent", async () => {
    mount({ overallMark: true });
    await next("Start");
    await next("Skip");
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.getByText("No overall mark")).toBeInTheDocument();
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = (send.mock.calls[0] as unknown[])[1] as { rating?: number };
    expect(body).not.toHaveProperty("rating");
  });

  it("sends the mark that was picked, as its number, and says so on the preview", async () => {
    const { onSent } = mount({ overallMark: true });
    await next("Start");
    await userEvent.click(
      screen.getByRole("radio", { name: /Exceeds Expectations/ }),
    );
    await next("Next");
    await next("Skip");
    expect(screen.getByText("Overall mark")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith("r1", { rating: 4 }, []);
    expect(onSent).toHaveBeenCalledWith({ answered: 0, mark: "4" });
  });

  it("opens on a mark remembered in this browser, and keeps it", async () => {
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "4", summary: "", step: 0 }),
    );
    mount({ overallMark: true });
    expect(heading("Is there an overall mark?")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Exceeds Expectations/ }),
    ).toBeChecked();
  });

  it("can pick a mark with its number, and goes on by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount({ overallMark: true });
      await next("Start");
      await userEvent.keyboard("3");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(heading("Anything to add?")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the person back to the mark page from the preview", async () => {
    mount({ overallMark: true });
    await next("Start");
    await next("Skip");
    await next("Skip");
    await userEvent.click(screen.getByRole("button", { name: /Overall mark/ }));
    expect(heading("Is there an overall mark?")).toBeInTheDocument();
  });
});

describe("the confirmation after sending", () => {
  const sent = (mark: string | null) =>
    render(<SentScreen review={review()} answered={3} mark={mark} />);

  it("names the mark in the company's words when one went", () => {
    sent("4");
    expect(
      screen.getByText(
        "3 answers and an overall mark of Exceeds Expectations, for H2 2026.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing of a mark when none went", () => {
    sent(null);
    expect(screen.getByText("3 answers, for H2 2026.")).toBeInTheDocument();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
  });
});
