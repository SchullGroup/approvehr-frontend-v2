import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiReviewDetail,
} from "@/lib/api/performance";

/**
 * The answer form's footer and first screen, after the simplification.
 *
 * Nothing in the footer can only refuse: Back is not on the first page, Next is
 * not drawn while the page cannot be left (Skip where it can be passed), Send is
 * not drawn while sending is closed, and with answers still to give the way to the
 * first of them stands in Send's place. The first screen is a title, one small
 * line and the start. Read through the real form, because the rules live in the
 * form and the words on the pages.
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

const question = (
  id: string,
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt: `Question ${id}`,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

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
    askPotential: false,
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

const heading = (name: string | RegExp) =>
  screen.queryByRole("heading", { name });
const button = (name: string | RegExp) =>
  screen.queryByRole("button", { name });
const press = (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("the first screen", () => {
  it("is the title, one small line and Start, with no Back", () => {
    mount({
      questions: [question("a"), question("b"), question("c")],
      dueDate: "2026-12-05",
    });
    expect(heading("Your self-review")).toBeInTheDocument();
    expect(screen.getByText("3 questions · due 5 Dec")).toBeInTheDocument();
    expect(button("Start")).toBeInTheDocument();
    expect(button("Back")).toBeNull();
  });

  it("says one question in the singular, and has no due date to say when there is none", () => {
    mount({ questions: [question("a")] });
    expect(screen.getByText("1 question")).toBeInTheDocument();
  });

  it("carries no lead, eyebrow, saves-as-you-go line or period box", () => {
    mount({
      questions: [question("a")],
      periodStart: "2026-07-01",
      periodEnd: "2026-12-31",
    });
    expect(screen.queryByText(/save as you go/i)).toBeNull();
    expect(screen.queryByText(/Your own words about your own work/)).toBeNull();
    expect(screen.queryByText(/For the period/)).toBeNull();
    expect(screen.queryByText(/one press away/)).toBeNull();
  });

  it("is Continue, with no line about what was saved, once the form is opened again", async () => {
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "", summary: "", step: 0 }),
    );
    mount({
      questions: [
        question("a", {
          answer: {
            textValue: "Done.",
            ratingValue: null,
            choiceValue: null,
            boolValue: null,
            attachment: null,
          } as unknown as ApiFormQuestion["answer"],
        }),
        question("b"),
      ],
    });
    /* A saved answer opens the form past the introduction; go back to it. */
    await press("Back");
    await press("Back");
    expect(button("Continue")).toBeInTheDocument();
    expect(screen.queryByText(/answered 1 of 2/)).toBeNull();
    expect(screen.queryByText(/pick up where you left off/)).toBeNull();
  });

  it("has no instructions link when there are none", () => {
    mount({ questions: [question("a")] });
    expect(button("Read the instructions")).toBeNull();
  });

  it("puts the instructions, the period and the guide behind one link", async () => {
    mount({
      questions: [question("a")],
      periodStart: "2026-07-01",
      periodEnd: "2026-12-31",
      instructions: "Answer for the whole half.",
      guideUrl: "https://example.com/guide",
    });
    expect(screen.queryByText("Answer for the whole half.")).toBeNull();
    expect(screen.queryByText("Read the company's guide")).toBeNull();

    await press("Read the instructions");
    expect(screen.getByText("Answer for the whole half.")).toBeInTheDocument();
    expect(screen.getByText(/For the period/)).toBeInTheDocument();
    expect(screen.getByText("Read the company's guide")).toBeInTheDocument();

    await press("Hide the instructions");
    expect(screen.queryByText("Answer for the whole half.")).toBeNull();
  });

  it("keeps the period's message to staff off a form about somebody else", async () => {
    /* "Please complete your self-review" is addressed to the people being
       appraised. A manager writing about somebody is not asked to do that. */
    mount({
      kind: "MANAGER",
      kindLabel: "Manager review",
      questions: [question("a")],
      periodStart: "2026-07-01",
      periodEnd: "2026-12-31",
      instructions: "Please complete your self-review.",
      guideUrl: "https://example.com/guide",
    });
    await press("Read the instructions");
    expect(screen.queryByText("Please complete your self-review.")).toBeNull();
    expect(screen.getByText(/For the period/)).toBeInTheDocument();
    expect(screen.getByText("Read the company's guide")).toBeInTheDocument();
  });

  it("has no instructions link on a form about somebody else when the message is all there is", () => {
    mount({
      kind: "MANAGER",
      kindLabel: "Manager review",
      questions: [question("a")],
      instructions: "Please complete your self-review.",
    });
    expect(button("Read the instructions")).toBeNull();
  });

  it("says that sending is not open once, in the API's own sentence, and only when it is true", () => {
    const view = mount({
      questions: [question("a")],
      sendBlockedBy: "Chidi has not sent theirs yet.",
    });
    expect(screen.getAllByText(/Sending is not open yet/)).toHaveLength(1);
    expect(
      screen.getByText(/Chidi has not sent theirs yet/),
    ).toBeInTheDocument();
    view.unmount();
    window.localStorage.clear();

    mount({ questions: [question("a")], sendBlockedBy: null });
    expect(screen.queryByText(/Sending is not open yet/)).toBeNull();
  });

  it("says a form is anonymous only when it is", () => {
    const view = mount({ questions: [question("a")], anonymous: true });
    expect(
      screen.getByText("This is anonymous. Nobody is told who wrote it."),
    ).toBeInTheDocument();
    view.unmount();
    window.localStorage.clear();
    mount({ questions: [question("a")] });
    expect(screen.queryByText(/anonymous/)).toBeNull();
  });
});

describe("a question page", () => {
  it("has Back from the second page, and says nothing under the answer about keys or being needed", async () => {
    mount({ questions: [question("a")] });
    await press("Start");
    expect(button("Back")).toBeInTheDocument();
    expect(screen.queryByText(/Press .* to go on/)).toBeNull();
    expect(screen.queryByText(/Pick one, or press its key/)).toBeNull();
    expect(screen.queryByText(/^Optional\./)).toBeNull();
    expect(screen.queryByText(/^Needed\./)).toBeNull();
  });

  it("tags a required question Needed, and an optional one nothing", async () => {
    mount({
      questions: [question("a"), question("b", { required: false })],
    });
    await press("Start");
    expect(screen.getByText("Needed")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Done.");
    await press("Next");
    expect(screen.queryByText("Needed")).toBeNull();
  });

  it("has no Next while a required answer is missing, and no red line either", async () => {
    mount({ questions: [question("a")] });
    await press("Start");
    expect(button("Next")).toBeNull();
    expect(button("Skip")).toBeNull();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(heading("Question a")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/needs an answer/i)).toBeNull();
  });

  it("offers Next the moment there is an answer", async () => {
    mount({ questions: [question("a")] });
    await press("Start");
    await userEvent.type(screen.getByRole("textbox"), "Done.");
    expect(button("Next")).toBeInTheDocument();
  });

  it("offers Skip on an optional question with nothing in it, and Next once it has something", async () => {
    mount({ questions: [question("a", { required: false })] });
    await press("Start");
    expect(button("Skip")).toBeInTheDocument();
    expect(button("Next")).toBeNull();
    await userEvent.type(screen.getByRole("textbox"), "Done.");
    expect(button("Next")).toBeInTheDocument();
    expect(button("Skip")).toBeNull();
  });

  it("explains the keys once, behind an icon in the footer, and says it for the kind of page", async () => {
    mount({ questions: [question("a")] });
    await press("Start");
    await userEvent.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    expect(
      screen.getByText(/goes on\. Esc saves and closes\./),
    ).toBeInTheDocument();
  });

  it("has no keyboard icon on the first screen or the preview, where no key does anything", async () => {
    mount({ questions: [question("a")] });
    expect(button("Keyboard shortcuts")).toBeNull();
    await press("Start");
    expect(button("Keyboard shortcuts")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Done.");
    await press("Next");
    await press("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(button("Keyboard shortcuts")).toBeNull();
  });

  it("names the key beside an answer on a page that is picked from", async () => {
    mount({ questions: [question("a", { kind: "BOOLEAN" })] });
    await press("Start");
    await userEvent.click(
      screen.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    expect(
      screen.getByText(/Press an answer's key to pick it/),
    ).toBeInTheDocument();
  });
});

describe("how far could they go", () => {
  const asManager = () =>
    mount({
      kind: "MANAGER",
      kindLabel: "Manager review",
      askPotential: true,
      questions: [],
    });

  it("offers Skip until one is picked, and Next for an answer that needs nothing more", async () => {
    asManager();
    await press("Start");
    expect(heading("How far could Chidi go?")).toBeInTheDocument();
    expect(button("Skip")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Could grow in this role/));
    expect(button("Next")).toBeInTheDocument();
  });

  it("asks for the reason when it is needed, instead of leaving a greyed Next", async () => {
    asManager();
    await press("Start");
    await userEvent.click(screen.getByLabelText(/Ready for a bigger role/));
    expect(screen.getByPlaceholderText(/What you have seen/)).toBeVisible();
    /* Not disabled: not there. */
    expect(button("Next")).toBeNull();
    expect(button("Skip")).toBeNull();

    await userEvent.type(
      screen.getByPlaceholderText(/What you have seen/),
      "Led the migration alone.",
    );
    expect(button("Next")).toBeInTheDocument();
  });

  it("does not count a reason that is too short", async () => {
    asManager();
    await press("Start");
    await userEvent.click(screen.getByLabelText(/Ready for a bigger role/));
    await userEvent.type(
      screen.getByPlaceholderText(/What you have seen/),
      "Good",
    );
    expect(button("Next")).toBeNull();
  });
});

describe("the preview", () => {
  const toThePreview = async (over: Partial<ApiReviewDetail> = {}) => {
    mount({ questions: [question("a")], ...over });
    await press("Start");
    await userEvent.type(screen.getByRole("textbox"), "Done.");
    await press("Next");
    await press("Skip");
  };

  it("sends on the first press of Send it", async () => {
    await toThePreview();
    expect(heading("Preview")).toBeInTheDocument();
    expect(button("Back")).toBeInTheDocument();
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it("has no lead sentence and no red line", async () => {
    await toThePreview();
    expect(screen.queryByText(/Press anything to change it/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes Send away while sending is closed and says why once, with nothing else in its place", async () => {
    await toThePreview({ sendBlockedBy: "Chidi has not sent theirs yet." });
    expect(button("Send it")).toBeNull();
    expect(button("Send anyway")).toBeNull();
    expect(screen.getAllByText(/Sending is not open yet/)).toHaveLength(1);
    expect(
      screen.getByText(/Chidi has not sent theirs yet/),
    ).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not say it on the preview when sending is open", async () => {
    await toThePreview({ sendBlockedBy: null });
    expect(screen.queryByText(/Sending is not open yet/)).toBeNull();
    expect(button("Send it")).toBeInTheDocument();
  });

  describe("with answers still to give", () => {
    /* A browser that remembers it was on the last page: the only way to the
       preview with a required question blank, since Next will not go on. */
    const toThePreviewWithTwoBlank = () => {
      window.localStorage.setItem(
        "ahr:review-draft:r1",
        JSON.stringify({ mark: "", summary: "", step: 99 }),
      );
      mount({ questions: [question("a"), question("b")] });
    };

    it("offers one neutral link with the count, in Send's place", () => {
      toThePreviewWithTwoBlank();
      expect(heading("Preview")).toBeInTheDocument();
      expect(button("2 to answer")).toBeInTheDocument();
      expect(button("Send it")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(/still need an answer/)).toBeNull();
    });

    it("marks each unanswered row Needed, not in danger words", () => {
      toThePreviewWithTwoBlank();
      expect(screen.getAllByText("Needed")).toHaveLength(2);
      expect(screen.queryByText("Needs an answer")).toBeNull();
    });

    it("jumps to the first of them", async () => {
      toThePreviewWithTwoBlank();
      await press("2 to answer");
      expect(heading("Question a")).toBeInTheDocument();
    });

    it("never sends, whichever key is pressed", async () => {
      toThePreviewWithTwoBlank();
      await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
      expect(send).not.toHaveBeenCalled();
      expect(heading("Preview")).toBeInTheDocument();
    });

    it("keeps the link when sending is closed too, and still says why once", () => {
      window.localStorage.setItem(
        "ahr:review-draft:r1",
        JSON.stringify({ mark: "", summary: "", step: 99 }),
      );
      mount({
        questions: [question("a")],
        sendBlockedBy: "Chidi has not sent theirs yet.",
      });
      expect(button("1 to answer")).toBeInTheDocument();
      expect(screen.getAllByText(/Sending is not open yet/)).toHaveLength(1);
    });
  });
});
