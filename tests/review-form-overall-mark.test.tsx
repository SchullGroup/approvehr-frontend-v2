import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * The older popup form, and the same company choice.
 *
 * `ReviewFormModal` is still how a review is opened from a few places, so it
 * follows the setting the page-by-page form follows: an "Overall mark" field
 * only where the company asks for one, and a `rating` in the request only then.
 */

const send = vi.fn(async () => undefined);
const save = vi.fn(async () => undefined);

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

let current: ApiReviewDetail;
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useReview: () => ({ review: current, loading: false, error: null }),
  useReviewMutations: () => ({ save, send }),
  useRatingScale: () => ({ scale, editable: true }),
}));
vi.mock("@/lib/store/ai", () => ({
  useDevelopmentSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
  /* No assistant wired: the suggestion button renders nothing. */
  useAssistantAvailable: () => ({
    available: false,
    loading: false,
    reason: null,
  }),
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));

import { ReviewFormModal } from "@/app/(app)/performance/review-form";

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
    summary: null,
    rating: null,
    questions: [
      {
        id: "q1",
        competencyId: null,
        prompt: "How did the quarter go?",
        kind: "TEXT",
        required: false,
        options: [],
        allowCustom: false,
        order: 0,
        answer: null,
      },
    ],
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) => {
  current = review(over);
  render(
    <ReviewFormModal reviewId="r1" open onClose={vi.fn()} onDone={vi.fn()} />,
  );
};

const sentBody = () => (send.mock.calls[0] as unknown[])[1] as object;

beforeEach(() => vi.clearAllMocks());

describe("the popup form", () => {
  it("has no overall mark where the company does not ask for one", async () => {
    mount({ overallMark: false });
    expect(screen.queryByLabelText(/Overall mark/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Send it" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentBody()).not.toHaveProperty("rating");
  });

  it("has none from a server that does not say, which is not a yes", () => {
    mount();
    expect(screen.queryByLabelText(/Overall mark/)).toBeNull();
  });

  it("offers it in the company's words where it asks, and sends the number picked", async () => {
    mount({ overallMark: true });
    const field = screen.getByLabelText(/Overall mark/);
    expect(
      screen.getByRole("option", { name: "4: Exceeds Expectations" }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(field, "4");
    await userEvent.click(screen.getByRole("button", { name: "Send it" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ rating: 4 });
  });

  it("sends none when it asks and nobody picked one", async () => {
    mount({ overallMark: true });
    await userEvent.click(screen.getByRole("button", { name: "Send it" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentBody()).not.toHaveProperty("rating");
  });

  it("still reads a mark back when one was already given and the switch is off", () => {
    mount({ overallMark: false, submitted: true, rating: 3 });
    expect(
      screen.getByText("Overall mark: Meets Expectations"),
    ).toBeInTheDocument();
  });
});
