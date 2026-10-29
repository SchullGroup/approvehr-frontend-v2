import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiAnswer,
  ApiFormQuestion,
  ApiRatingScale,
  ApiReviewDetail,
  ApiSelfAnswer,
  ApiSubsectionOnForm,
} from "@/lib/api/performance";

/**
 * A directly rated subsection, in the popup form and on the record of a review.
 *
 * `ReviewFormModal` is how a review is still opened from a few places, and
 * `ReadAnswer` is how the record of one, and the preview, reads an answer back.
 * Both have to draw a subsection's question from the subsection (its own scale and
 * its own choices) and send a pick as the choice's id. A server that sends none of
 * the new fields must reach none of it.
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
import { ReadAnswer, draftFrom } from "@/app/(app)/performance/review-parts";

const CHOICES = [
  { id: "o1", label: "Delighted" },
  { id: "o2", label: "Satisfied" },
  { id: "o3", label: "Disappointed" },
];

const ordinary = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: "q-plain",
  competencyId: null,
  prompt: "What went well?",
  kind: "TEXT",
  required: false,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

const answer = (over: Partial<ApiAnswer> = {}): ApiAnswer => ({
  ratingValue: null,
  textValue: null,
  choiceValue: null,
  boolValue: null,
  attachment: null,
  answeredAt: "2026-10-20T10:00:00Z",
  ...over,
});

const direct = (
  inner: Partial<ApiSubsectionOnForm> = {},
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion =>
  ordinary({
    id: "q-adapt",
    competencyId: "c-adapt",
    prompt: "Adaptability",
    kind: inner.answerKind ?? "RATING",
    required: true,
    answersSubsection: true,
    subsection: {
      name: "Adaptability",
      answerKind: "RATING",
      scaleMax: 5,
      choices: [],
      ...inner,
    },
    ...over,
  });

const own = (over: Partial<ApiSelfAnswer> = {}): ApiSelfAnswer => ({
  ratingValue: null,
  boolValue: null,
  choiceOptionId: null,
  choiceValue: null,
  answeredAt: "2026-10-20T10:00:00Z",
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
    summary: null,
    rating: null,
    questions: [],
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) => {
  current = review(over);
  render(
    <ReviewFormModal reviewId="r1" open onClose={vi.fn()} onDone={vi.fn()} />,
  );
};

const sendIt = () =>
  userEvent.click(screen.getByRole("button", { name: "Send it" }));

beforeEach(() => vi.clearAllMocks());

describe("a level, in the popup form", () => {
  it("offers exactly the subsection's own levels, and not the company's five", () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("radio", { name: "1 of 7" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7 of 7" })).toBeInTheDocument();
    expect(screen.queryByText(/Exceptional/)).not.toBeInTheDocument();
  });

  it("uses the company's words, with the number, where its scale is this subsection's", () => {
    mount({ questions: [direct({ scaleMax: 5 })] });
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(
      screen.getByRole("radio", { name: "4: Exceeds Expectations" }),
    ).toBeInTheDocument();
  });

  it("sends the level that was picked in `ratingValue`, and then sends the review", async () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    await userEvent.click(screen.getByRole("radio", { name: "5 of 7" }));
    await sendIt();

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", ratingValue: 5 },
    ]);
    expect(send).toHaveBeenCalledWith("r1", {}, []);
  });

  it("is named by the subsection's name and marked required", () => {
    mount({ questions: [direct()] });
    const group = screen.getByRole("group", { name: /Adaptability/ });
    expect(group).toHaveTextContent("required");
  });
});

describe("a yes or no, in the popup form", () => {
  it("sends the answer in `boolValue`", async () => {
    mount({ questions: [direct({ answerKind: "BOOLEAN" })] });
    await userEvent.selectOptions(screen.getByLabelText(/Adaptability/), "Yes");
    await sendIt();

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", boolValue: true },
    ]);
  });
});

describe("a pick, in the popup form", () => {
  const pickList = (over: Partial<ApiFormQuestion> = {}) =>
    direct({ answerKind: "CHOICE", choices: CHOICES }, over);

  it("offers the subsection's choices by their labels, and no scores", () => {
    mount({ questions: [pickList()] });
    const select = screen.getByLabelText(/Adaptability/);
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Pick one", "Delighted", "Satisfied", "Disappointed"]);
  });

  it("sends the id of the choice in `choiceOptionId`, and not its label", async () => {
    mount({ questions: [pickList()] });
    await userEvent.selectOptions(
      screen.getByLabelText(/Adaptability/),
      "Satisfied",
    );
    await sendIt();

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = (save.mock.calls[0] as unknown as [string, object[]])[1][0];
    expect(body).toEqual({ questionId: "q-adapt", choiceOptionId: "o2" });
    expect(body).not.toHaveProperty("choiceValue");
  });

  it("shows the saved pick already chosen, found by its id", () => {
    mount({
      questions: [
        pickList({
          answer: answer({ choiceOptionId: "o3", choiceValue: "Disappointed" }),
        }),
      ],
    });
    expect(
      (screen.getByLabelText(/Adaptability/) as HTMLSelectElement).value,
    ).toBe("o3");
  });

  it("does not claim a pick taken off the list since is chosen, and counts the question as unanswered", async () => {
    mount({
      questions: [
        pickList({
          answer: answer({ choiceOptionId: "o9", choiceValue: "Furious" }),
        }),
      ],
    });
    expect(
      (screen.getByLabelText(/Adaptability/) as HTMLSelectElement).value,
    ).toBe("");
    expect(
      screen.getByText("1 question still to answer before you can send it."),
    ).toBeInTheDocument();

    await sendIt();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    /* The outstanding list the store checks: the question is named. */
    expect(send).toHaveBeenCalledWith("r1", {}, ["Adaptability"]);
  });
});

describe("on a manager's form, in the popup", () => {
  const manager = (question: ApiFormQuestion) =>
    mount({
      kind: "MANAGER",
      kindLabel: "Manager review",
      questions: [question],
    });

  it("shows what the person said of themselves, for each way a subsection is answered", () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: own({ ratingValue: 4 }) }));
    expect(
      screen.getByText("Their own answer: Exceeds Expectations"),
    ).toBeInTheDocument();
  });

  it("shows their yes or no", () => {
    manager(
      direct(
        { answerKind: "BOOLEAN" },
        { selfAnswer: own({ boolValue: true }) },
      ),
    );
    expect(screen.getByText("Their own answer: Yes")).toBeInTheDocument();
  });

  it("shows their pick by its label", () => {
    manager(
      direct(
        { answerKind: "CHOICE", choices: CHOICES },
        { selfAnswer: own({ choiceOptionId: "o1", choiceValue: "Delighted" }) },
      ),
    );
    expect(screen.getByText("Their own answer: Delighted")).toBeInTheDocument();
  });

  it("shows nothing when they have not sent theirs, and nothing is chosen for the manager", () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: null }));
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No answer/i)).not.toBeInTheDocument();
    for (const one of screen.getAllByRole("radio")) {
      expect(one).not.toBeChecked();
    }
  });
});

describe("read back, on the record and in the preview", () => {
  const readBack = (question: ApiFormQuestion) =>
    render(<ReadAnswer question={question} held={draftFrom(question)} />);

  it("reads a level in the company's words where its scale is this one", () => {
    readBack(direct({ scaleMax: 5 }, { answer: answer({ ratingValue: 4 }) }));
    expect(screen.getByText("Adaptability")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
  });

  it("reads a level against the subsection's own ceiling where it is not", () => {
    readBack(direct({ scaleMax: 10 }, { answer: answer({ ratingValue: 4 }) }));
    expect(screen.getByText("4 of 10")).toBeInTheDocument();
  });

  it("reads a yes and a no", () => {
    readBack(
      direct(
        { answerKind: "BOOLEAN" },
        { answer: answer({ boolValue: false }) },
      ),
    );
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("reads a pick by its label, from the id that was saved", () => {
    readBack(
      direct(
        { answerKind: "CHOICE", choices: CHOICES },
        { answer: answer({ choiceOptionId: "o2", choiceValue: "Satisfied" }) },
      ),
    );
    expect(screen.getByText("Satisfied")).toBeInTheDocument();
  });

  it("reads a pick that was taken off the list since by the label saved with it", () => {
    readBack(
      direct(
        { answerKind: "CHOICE", choices: CHOICES },
        { answer: answer({ choiceOptionId: "o9", choiceValue: "Furious" }) },
      ),
    );
    expect(screen.getByText("Furious")).toBeInTheDocument();
  });

  it("says Not answered for a subsection nobody answered, and never a figure", () => {
    readBack(direct({ scaleMax: 5 }));
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 of/)).not.toBeInTheDocument();
  });

  it("does not show what the person said of themselves in a read-back: the record has their own form for that", () => {
    readBack(
      direct(
        { scaleMax: 5 },
        {
          answer: answer({ ratingValue: 3 }),
          selfAnswer: own({ ratingValue: 4 }),
        },
      ),
    );
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });
});

describe("a server that sends none of the new fields", () => {
  it("draws an ordinary rating question as it always did, on the company's scale", async () => {
    mount({
      questions: [
        ordinary({
          id: "q-r",
          prompt: "Overall, how did it go?",
          kind: "RATING",
          required: true,
        }),
      ],
    });
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    await userEvent.click(
      screen.getByRole("radio", { name: "4: Exceeds Expectations" }),
    );
    await sendIt();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-r", ratingValue: 4 },
    ]);
  });

  it("sends an ordinary pick-from-a-list question's text in `choiceValue`", async () => {
    mount({
      questions: [
        ordinary({
          id: "q-c",
          prompt: "Pick a colour",
          kind: "CHOICE",
          options: ["Red", "Blue"],
          required: true,
        }),
      ],
    });
    await userEvent.selectOptions(
      screen.getByLabelText(/Pick a colour/),
      "Blue",
    );
    await sendIt();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = (save.mock.calls[0] as unknown as [string, object[]])[1][0];
    expect(body).toEqual({ questionId: "q-c", choiceValue: "Blue" });
  });

  it("reads an ordinary rating back in the company's words, and an ordinary pick as typed", () => {
    const rating = ordinary({
      id: "q-r",
      prompt: "Overall",
      kind: "RATING",
      answer: answer({ ratingValue: 3 }),
    });
    const { unmount } = render(
      <ReadAnswer question={rating} held={draftFrom(rating)} />,
    );
    expect(screen.getByText("Meets Expectations")).toBeInTheDocument();
    unmount();

    const pick = ordinary({
      id: "q-c",
      prompt: "Colour",
      kind: "CHOICE",
      options: ["Red"],
      answer: answer({ choiceValue: "Red" }),
    });
    render(<ReadAnswer question={pick} held={draftFrom(pick)} />);
    expect(screen.getByText("Red")).toBeInTheDocument();
  });
});
