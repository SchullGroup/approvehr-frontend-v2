import { render, screen, waitFor } from "@testing-library/react";
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
 * A directly rated subsection, answered on the page-by-page review form.
 *
 * The period can put a subsection on the form, and its answer becomes the
 * person's rating of it when the review is sent. These cases are about what a
 * person meets: the right levels (the subsection's own, not the company's five),
 * a pick that is sent as the choice's id, a manager seeing what the person said of
 * themselves and nothing at all where they have said nothing, and a form from an
 * older server that must not notice any of this.
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

/** The question a period has when it asks a subsection on the form. */
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
    questions: [],
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

const next = (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

const radio = (name: string | RegExp) => screen.getByRole("radio", { name });

/** Start, and land on the first question. */
const toTheQuestion = async () => {
  await next("Start");
};

const savedBodies = () =>
  save.mock.calls.flatMap((call) => (call as unknown as [string, object[]])[1]);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("a level on the subsection's own scale", () => {
  it("offers exactly the subsection's levels, however many words the company has", async () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    await toTheQuestion();

    expect(screen.getAllByRole("radio")).toHaveLength(7);
    for (let level = 1; level <= 7; level += 1) {
      expect(radio(`${String(level)} of 7`)).toBeInTheDocument();
    }
    /* The company's five words are not stuck on a seven-level scale. */
    expect(screen.queryByText("Exceptional")).not.toBeInTheDocument();
    expect(screen.queryByText("Meets Expectations")).not.toBeInTheDocument();
  });

  it("uses the company's words where its scale is this subsection's", async () => {
    mount({ questions: [direct({ scaleMax: 5 })] });
    await toTheQuestion();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(radio("Exceeds Expectations")).toBeInTheDocument();
    expect(radio("Exceptional")).toBeInTheDocument();
  });

  it("offers a tenth level, which has no key to press", async () => {
    mount({ questions: [direct({ scaleMax: 10 })] });
    await toTheQuestion();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(radio("10 of 10")).toBeInTheDocument();
  });

  it("does not pick the level with no key when a key like Shift is pressed", async () => {
    mount({ questions: [direct({ scaleMax: 10 })] });
    await toTheQuestion();
    await userEvent.keyboard("{Shift}");
    expect(radio("10 of 10")).not.toBeChecked();
    for (const one of screen.getAllByRole("radio")) {
      expect(one).not.toBeChecked();
    }
  });

  it("sends the level that was picked, as a number, in `ratingValue`", async () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    await toTheQuestion();
    await userEvent.click(radio("4 of 7"));
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", ratingValue: 4 },
    ]);
  });

  it("can be picked with its number", async () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    await toTheQuestion();
    await userEvent.keyboard("6");
    expect(radio("6 of 7")).toBeChecked();
  });

  it("shows the saved level already chosen when the form is opened again, and opens past it", async () => {
    mount({
      questions: [
        direct({ scaleMax: 7 }, { answer: answer({ ratingValue: 4 }) }),
      ],
    });
    /* Every required question has its answer, so the form opens after the
       questions and not on the introduction. */
    expect(
      screen.getByRole("heading", { name: "Anything to add?" }),
    ).toBeInTheDocument();
    await next("Back");
    expect(radio("4 of 7")).toBeChecked();
  });
});

describe("a yes or no", () => {
  it("sends a yes as true and a no as false, in `boolValue`", async () => {
    mount({ questions: [direct({ answerKind: "BOOLEAN" })] });
    await toTheQuestion();
    await userEvent.click(radio("No"));
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", boolValue: false },
    ]);
  });
});

describe("a pick from the subsection's own choices", () => {
  const pickList = () => direct({ answerKind: "CHOICE", choices: CHOICES });

  it("offers the choices by their labels and nothing else, with no score in sight", async () => {
    mount({ questions: [pickList()] });
    await toTheQuestion();

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(radio("Delighted")).toBeInTheDocument();
    expect(radio("Satisfied")).toBeInTheDocument();
    expect(radio("Disappointed")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("sends the id of the choice in `choiceOptionId`, and not its label", async () => {
    mount({ questions: [pickList()] });
    await toTheQuestion();
    await userEvent.click(radio("Satisfied"));
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", choiceOptionId: "o2" },
    ]);
    expect(savedBodies()[0]).not.toHaveProperty("choiceValue");
  });

  it("keeps two choices that share a label as two choices and sends the one that was picked", async () => {
    mount({
      questions: [
        direct({
          answerKind: "CHOICE",
          choices: [
            { id: "a", label: "Meets" },
            { id: "b", label: "Meets" },
          ],
        }),
      ],
    });
    await toTheQuestion();
    const both = screen.getAllByRole("radio", { name: "Meets" });
    expect(both).toHaveLength(2);
    await userEvent.click(both[1] as HTMLElement);
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", choiceOptionId: "b" },
    ]);
  });

  it("can be picked with its letter", async () => {
    mount({ questions: [pickList()] });
    await toTheQuestion();
    await userEvent.keyboard("b");
    expect(radio("Satisfied")).toBeChecked();
  });

  it("shows the saved pick already chosen, found by its id", async () => {
    mount({
      questions: [
        direct(
          { answerKind: "CHOICE", choices: CHOICES },
          {
            answer: answer({
              choiceOptionId: "o3",
              choiceValue: "Disappointed",
            }),
          },
        ),
      ],
    });
    await next("Back");
    expect(radio("Disappointed")).toBeChecked();
  });

  it("treats a saved pick that was taken off the list since as not answered, so it has to be answered again", async () => {
    mount({
      questions: [
        direct(
          { answerKind: "CHOICE", choices: CHOICES },
          { answer: answer({ choiceOptionId: "o9", choiceValue: "Furious" }) },
        ),
      ],
    });
    await toTheQuestion();
    for (const one of screen.getAllByRole("radio")) {
      expect(one).not.toBeChecked();
    }
    await next("Next");
    expect(
      await screen.findByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
  });
});

describe("being required", () => {
  it("is held to like any other required question: it will not go on without an answer", async () => {
    mount({ questions: [direct()] });
    await toTheQuestion();
    await next("Next");

    expect(
      await screen.findByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("says it is needed", async () => {
    mount({ questions: [direct()] });
    await toTheQuestion();
    expect(screen.getByText(/Needed\./)).toBeInTheDocument();
  });
});

describe("the preview", () => {
  it("lists it like any other answer, with the subsection's name and the level in words", async () => {
    mount({ questions: [direct({ scaleMax: 5 })] });
    await toTheQuestion();
    await userEvent.click(radio("Exceeds Expectations"));
    await next("Next");
    await next("Skip");

    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Adaptability")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
  });

  it("says the level against the subsection's own ceiling where the company's words do not fit", async () => {
    mount({ questions: [direct({ scaleMax: 7 })] });
    await toTheQuestion();
    await userEvent.click(radio("6 of 7"));
    await next("Next");
    await next("Skip");
    expect(screen.getByText("6 of 7")).toBeInTheDocument();
  });

  it("reads a pick back by its label, a yes or no as Yes or No", async () => {
    mount({
      questions: [
        direct({ answerKind: "CHOICE", choices: CHOICES }),
        direct(
          { answerKind: "BOOLEAN" },
          { id: "q-team", competencyId: "c-team", prompt: "Teamwork" },
        ),
      ],
    });
    await toTheQuestion();
    await userEvent.click(radio("Satisfied"));
    await next("Next");
    await userEvent.click(radio("Yes"));
    await next("Next");
    await next("Skip");

    expect(screen.getByText("Satisfied")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("says Not answered, and that it needs an answer, for one nobody answered, and never a nought", async () => {
    /* A browser that remembers it was on the last page: the only way to the
       preview with a required question left blank, since Next will not go on. */
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "", summary: "", step: 99 }),
    );
    mount({ questions: [direct({ scaleMax: 5 })] });

    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Adaptability")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getByText("Needs an answer")).toBeInTheDocument();
    expect(
      screen.getByText("1 question still needs an answer before this can go."),
    ).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 of 5/)).not.toBeInTheDocument();
  });

  it("sends the review once every required question has its answer", async () => {
    mount({ questions: [direct({ scaleMax: 5 })] });
    await toTheQuestion();
    await userEvent.click(radio("Meets Expectations"));
    await next("Next");
    await next("Skip");
    await next("Send it");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith("r1", {}, []);
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-adapt", ratingValue: 3 },
    ]);
  });
});

describe("on a manager's form: what the person said of themselves", () => {
  const manager = (question: ApiFormQuestion) =>
    mount({
      kind: "MANAGER",
      kindLabel: "Manager review",
      questions: [question],
    });

  it("shows their level, in the company's words, beside the manager's own control", async () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: own({ ratingValue: 4 }) }));
    await toTheQuestion();
    expect(
      screen.getByText("Their own answer: Exceeds Expectations"),
    ).toBeInTheDocument();
  });

  it("shows their level against the subsection's own ceiling where the words do not fit", async () => {
    manager(direct({ scaleMax: 7 }, { selfAnswer: own({ ratingValue: 6 }) }));
    await toTheQuestion();
    expect(screen.getByText("Their own answer: 6 of 7")).toBeInTheDocument();
  });

  it("shows their yes or no", async () => {
    manager(
      direct(
        { answerKind: "BOOLEAN" },
        { selfAnswer: own({ boolValue: false }) },
      ),
    );
    await toTheQuestion();
    expect(screen.getByText("Their own answer: No")).toBeInTheDocument();
  });

  it("shows their pick by its label", async () => {
    manager(
      direct(
        { answerKind: "CHOICE", choices: CHOICES },
        {
          selfAnswer: own({ choiceOptionId: "o1", choiceValue: "Delighted" }),
        },
      ),
    );
    await toTheQuestion();
    expect(screen.getByText("Their own answer: Delighted")).toBeInTheDocument();
  });

  it("shows nothing at all when they have not sent theirs: not No answer, and not 0", async () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: null }));
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No answer/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows nothing when the field is not there, which is a server that predates it", async () => {
    manager(direct({ scaleMax: 5 }));
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });

  it("shows nothing for an answer with no value in it", async () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: own() }));
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });

  it("is not on the person's own form, which carries no such field", async () => {
    mount({ questions: [direct({ scaleMax: 5 })] });
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });

  it("does not choose for the manager: what the person said is not picked on their behalf", async () => {
    manager(direct({ scaleMax: 5 }, { selfAnswer: own({ ratingValue: 4 }) }));
    await toTheQuestion();
    for (const one of screen.getAllByRole("radio")) {
      expect(one).not.toBeChecked();
    }
  });
});

describe("a server that sends none of the new fields", () => {
  it("draws an ordinary rating question on the company's scale, and sends `ratingValue`", async () => {
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
    await toTheQuestion();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    await userEvent.click(radio("Exceeds Expectations"));
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-r", ratingValue: 4 },
    ]);
  });

  it("sends an ordinary pick-from-a-list question's text in `choiceValue`, never an id", async () => {
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
    await toTheQuestion();
    await userEvent.click(radio("Blue"));
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-c", choiceValue: "Blue" },
    ]);
    expect(savedBodies()[0]).not.toHaveProperty("choiceOptionId");
  });

  it("draws a question flagged without a subsection behind it as the ordinary question it would have been", async () => {
    mount({
      questions: [
        ordinary({
          id: "q-flag",
          prompt: "Adaptability",
          kind: "RATING",
          required: true,
          answersSubsection: true,
        }),
      ],
    });
    await toTheQuestion();
    /* The company's five words, because there is no scale of the subsection's to
       draw and none is invented. */
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(radio("Exceptional")).toBeInTheDocument();
  });
});
