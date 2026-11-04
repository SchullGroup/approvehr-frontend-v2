import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * A manager's closing page is where they write what they recommend.
 *
 * It is the same field as everybody's closing note, so what it is sent as has not
 * moved. What has is what a manager is asked and what the record reads it as: the
 * page, the preview row and the line above the progress bar all say
 * recommendations on a manager's form, and still say anything to add on the
 * person's own. Read through the real flow, because the three names live in three
 * files and a type cannot say they agree.
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/ai", () => ({
  useDevelopmentSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
  /* A manager's closing page offers development areas where an assistant is
     wired. None is here, so the button is absent and the page is the box. */
  useAssistantAvailable: () => ({
    available: false,
    loading: false,
    assistant: null,
    reason: null,
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

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "MANAGER",
    kindLabel: "Manager review",
    cycleId: "c1",
    cycleName: "H2 2026",
    subjectId: "e1",
    subjectName: "Femi Balogun",
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
const press = async (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("a manager's form", () => {
  it("asks for recommendations, optional, in place of anything to add", async () => {
    mount();
    await press("Start");
    expect(heading("Your recommendations")).toBeInTheDocument();
    expect(heading("Anything to add?")).toBeNull();
    expect(
      screen.getByText(/Optional\. What you recommend for them/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Your recommendations" }),
    ).toHaveAttribute("placeholder", expect.stringMatching(/recommendation/));
  });

  it("names the page in the line above the progress bar", async () => {
    mount();
    await press("Start");
    expect(screen.getAllByText("Recommendations").length).toBeGreaterThan(0);
    expect(screen.queryByText("Anything to add")).toBeNull();
  });

  it("reads what was written back on the preview as recommendations, and sends it as the closing note", async () => {
    mount();
    await press("Start");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your recommendations" }),
      "Recommend the team lead role.",
    );
    await press("Next");
    expect(heading("Preview")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /Recommendations/ });
    expect(row).toHaveTextContent("Recommend the team lead role.");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      "r1",
      { summary: "Recommend the team lead role." },
      [],
    );
  });

  it("says nothing was added, rather than leaving the row empty, when it is left blank", async () => {
    mount();
    await press("Start");
    await press("Skip");
    expect(
      screen.getByRole("button", { name: /Recommendations/ }),
    ).toHaveTextContent("Nothing added");
  });
});

describe("the person's own form", () => {
  it("still asks for anything to add", async () => {
    mount({ kind: "SELF", kindLabel: "Self-review" });
    await press("Start");
    expect(heading("Anything to add?")).toBeInTheDocument();
    expect(heading("Your recommendations")).toBeNull();
  });
});
