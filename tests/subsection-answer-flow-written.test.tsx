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
 * A subsection answered in the person's own words, on the page-by-page review form.
 *
 * A period can put a written subsection on the form. What a person meets: a box to
 * write in and not a scale, the words sent as `textValue` and never as a pick, a
 * required question that will not go on for a blank box or a box of spaces, the
 * words read back in full with their paragraphs, a manager seeing what the person
 * wrote of themselves and nothing at all where they wrote nothing, and the
 * language check reading a manager's words exactly as it reads their closing note.
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
  /* A manager's closing page offers to suggest development areas, which asks. */
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

/** The question a period has when it asks a written subsection on the form. */
const written = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion =>
  ordinary({
    id: "q-comm",
    competencyId: "c-comm",
    prompt: "Communication",
    kind: "TEXT",
    required: true,
    answersSubsection: true,
    subsection: {
      name: "Communication",
      answerKind: "TEXT",
      scaleMax: 5,
      choices: [],
    } satisfies ApiSubsectionOnForm,
    ...over,
  });

const own = (over: Partial<ApiSelfAnswer> = {}): ApiSelfAnswer => ({
  ratingValue: null,
  boolValue: null,
  choiceOptionId: null,
  choiceValue: null,
  textValue: null,
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

const asManager = (question: ApiFormQuestion) =>
  mount({
    kind: "MANAGER",
    kindLabel: "Manager review",
    questions: [question],
  });

const next = (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

const toTheQuestion = () => next("Start");

const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;

const savedBodies = () =>
  save.mock.calls.flatMap((call) => (call as unknown as [string, object[]])[1]);

/** The paragraph that holds some words, found by what it says whole. */
const paragraph = (words: string) =>
  screen.getByText((_, element) => element?.textContent === words, {
    selector: "p",
  });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("answering a written subsection", () => {
  it("is a box to write in, labelled by the subsection's name, with no scale and nothing to pick", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();

    expect(
      screen.getByRole("textbox", { name: "Communication" }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText("Exceptional")).not.toBeInTheDocument();
  });

  it("starts empty, and is not asking for a level or a yes or no in the helper line", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    expect(box().value).toBe("");
    expect(screen.getByText(/Needed\./)).toBeInTheDocument();
    expect(screen.queryByText(/Pick one, or press its key/)).toBeNull();
  });

  it("sends the words, trimmed, in `textValue` and in nothing else", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "  Clear and early, and kind with it.  ");
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-comm", textValue: "Clear and early, and kind with it." },
    ]);
    const body = savedBodies()[0] as object;
    for (const wrong of [
      "ratingValue",
      "boolValue",
      "choiceOptionId",
      "choiceValue",
    ]) {
      expect(body).not.toHaveProperty(wrong);
    }
  });

  it("keeps the paragraphs it was given", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "First point.{Enter}{Enter}Second point.");
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-comm", textValue: "First point.\n\nSecond point." },
    ]);
  });

  it("stops a paste at the server's 4,000 characters, as every written box on this form does", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    expect(box().maxLength).toBe(4000);
  });

  it("will not go on without words: it is required like any other required question", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await next("Next");

    expect(
      await screen.findByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("is not answered by a box of spaces either", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "     ");
    await next("Next");

    expect(
      await screen.findByText("This one needs an answer before you can go on."),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the words already saved in the box when the form is opened again, and opens past them", async () => {
    mount({
      questions: [
        written({ answer: answer({ textValue: "Saved on Monday." }) }),
      ],
    });
    /* Every required question has its answer, so the form opens after the
       questions and not on the introduction. */
    expect(
      screen.getByRole("heading", { name: "Anything to add?" }),
    ).toBeInTheDocument();
    await next("Back");
    expect(box().value).toBe("Saved on Monday.");
  });

  it("says the saved words stand when the box is emptied, because a saved answer cannot be taken back", async () => {
    mount({
      questions: [
        written({ answer: answer({ textValue: "Saved on Monday." }) }),
      ],
    });
    await next("Back");
    await userEvent.clear(box());
    expect(
      screen.getByText(/The answer you saved stays unless you write a new one/),
    ).toBeInTheDocument();
  });
});

describe("the preview of a written subsection", () => {
  it("lists the words under the subsection's name, in full, with their paragraphs", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "First point.{Enter}{Enter}Second point.");
    await next("Next");
    await next("Skip");

    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Communication")).toBeInTheDocument();
    const words = paragraph("First point.\n\nSecond point.");
    expect(words).toHaveClass("whitespace-pre-line");
    expect(words).toHaveClass("break-words");
  });

  it("does not cut a long answer short: all four thousand characters are there", async () => {
    const long = `${"a".repeat(1990)} ${"b".repeat(2009)}`;
    expect(long).toHaveLength(4000);
    mount({
      questions: [written({ answer: answer({ textValue: long }) })],
    });
    /* Opens past the questions, and the preview is one page on. */
    await next("Skip");

    const words = paragraph(long);
    expect(words.textContent).toHaveLength(4000);
    expect(words.className).not.toMatch(/line-clamp|truncate/);
  });

  it("says Not answered, and that it needs an answer, for one nobody wrote, and never a nought", async () => {
    /* A browser that remembers it was on the last page: the only way to the
       preview with a required question left blank, since Next will not go on. */
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "", summary: "", step: 99 }),
    );
    mount({ questions: [written()] });

    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Communication")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getByText("Needs an answer")).toBeInTheDocument();
    expect(
      screen.getByText("1 question still needs an answer before this can go."),
    ).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says Not answered for a box of spaces too", async () => {
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({ mark: "", summary: "", step: 99 }),
    );
    mount({
      questions: [written({ answer: answer({ textValue: "   " }) })],
    });
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getByText("Needs an answer")).toBeInTheDocument();
  });

  it("sends the review once the written question has its words", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "Clear and early.");
    await next("Next");
    await next("Skip");
    await next("Send it");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith("r1", {}, []);
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-comm", textValue: "Clear and early." },
    ]);
  });
});

describe("on a manager's form: what the person wrote of themselves", () => {
  it("shows their words, in full, beside the manager's own box", async () => {
    asManager(
      written({
        selfAnswer: own({ textValue: "I shipped the Lagos rollout early." }),
      }),
    );
    await toTheQuestion();
    expect(
      screen.getByText("Their own answer: I shipped the Lagos rollout early."),
    ).toBeInTheDocument();
  });

  it("keeps their paragraphs, and lets a long unbroken string wrap instead of running out of the page", async () => {
    asManager(
      written({
        selfAnswer: own({ textValue: "First point.\n\nSecond point." }),
      }),
    );
    await toTheQuestion();
    const line = screen.getByText(/Their own answer:/);
    expect(line).toHaveClass("whitespace-pre-line");
    expect(line).toHaveClass("break-words");
    expect(line.textContent).toBe(
      "Their own answer: First point.\n\nSecond point.",
    );
  });

  it("shows all of a long answer, with nothing to open", async () => {
    const long = "w".repeat(4000);
    asManager(written({ selfAnswer: own({ textValue: long }) }));
    await toTheQuestion();
    const line = screen.getByText(/Their own answer:/);
    expect(line.textContent).toBe(`Their own answer: ${long}`);
    expect(line.className).not.toMatch(/line-clamp|truncate/);
    expect(
      screen.queryByRole("button", { name: /read all|show more/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["null: they have not sent theirs", { selfAnswer: null }],
    ["absent: a server that predates it", {}],
    ["an answer with no value in it", { selfAnswer: own() }],
    ["empty words", { selfAnswer: own({ textValue: "" }) }],
    ["spaces only", { selfAnswer: own({ textValue: "   \n " }) }],
    ["words that are null", { selfAnswer: own({ textValue: null }) }],
  ] as const)(
    "shows nothing at all for %s: not No answer, and not 0",
    async (_name, extra) => {
      asManager(written(extra as Partial<ApiFormQuestion>));
      await toTheQuestion();
      expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
      expect(screen.queryByText(/No answer/i)).not.toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    },
  );

  it("is not on the person's own form, which carries no such field", async () => {
    mount({ questions: [written()] });
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });

  it("does not write for the manager: their box starts empty whatever the person wrote", async () => {
    asManager(
      written({ selfAnswer: own({ textValue: "Their words, not mine." }) }),
    );
    await toTheQuestion();
    expect(box().value).toBe("");
  });

  it("does not choose a person's words for the manager when they move on without writing", async () => {
    asManager(
      written({
        required: false,
        selfAnswer: own({ textValue: "Their words, not mine." }),
      }),
    );
    await toTheQuestion();
    await next("Skip");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("the language check on a manager's written answer", () => {
  const PHRASE = "Chidi is quite disorganised";
  const headline = "One phrase here is worth a second look";

  /** Write `words` in the written subsection, then go to the preview. */
  const writeAndPreview = async (words: string) => {
    await toTheQuestion();
    await userEvent.type(box(), words);
    await next("Next");
    await next("Skip");
  };

  it("reads it, and quotes the exact words, like any other written part of a manager's review", async () => {
    asManager(written());
    await writeAndPreview(`${PHRASE}.`);

    expect(screen.getByText(headline)).toBeInTheDocument();
    expect(screen.getByText(PHRASE)).toBeInTheDocument();
  });

  it("reads it the way it reads the closing note: the same words give the same finding", async () => {
    /* The written subsection answered with something harmless, and the same words
       put in the closing note instead. */
    asManager(written());
    await toTheQuestion();
    await userEvent.type(box(), "Delivered on time.");
    await next("Next");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your recommendations" }),
      `${PHRASE}.`,
    );
    await next("Next");
    expect(screen.getByText(headline)).toBeInTheDocument();
    expect(screen.getByText(PHRASE)).toBeInTheDocument();
  });

  it("counts the written answer and the closing note together", async () => {
    asManager(written());
    await toTheQuestion();
    await userEvent.type(box(), `${PHRASE}.`);
    await next("Next");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your recommendations" }),
      "Chidi is rather lazy.",
    );
    await next("Next");
    expect(
      screen.getByText("2 phrases here are worth a second look"),
    ).toBeInTheDocument();
  });

  it("does not stop the review: the first press shows it and the second sends it anyway", async () => {
    asManager(written());
    await writeAndPreview(`${PHRASE}.`);

    await next("Send it");
    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Send anyway" }),
    ).toBeInTheDocument();

    await next("Send anyway");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it("finds nothing to say about words that describe the work", async () => {
    asManager(written());
    await writeAndPreview("Moved three deadlines in October without notice.");
    expect(screen.queryByText(headline)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/phrases here are worth a second look/),
    ).not.toBeInTheDocument();
  });

  it("leaves a person's own review alone: a person's account of themselves is not a judgement of somebody else", async () => {
    /* Words that the check does flag on a manager's form (maternity leave is a
       protected characteristic, and needs no subject to be caught), so that a
       self-review that is not flagged is the exemption working and not words that
       happened to match nothing. */
    mount({ questions: [written()] });
    await toTheQuestion();
    await userEvent.type(box(), "I took maternity leave in March.");
    await next("Next");
    await next("Skip");

    expect(screen.queryByText(headline)).not.toBeInTheDocument();
    expect(
      screen.queryByText("maternity", { selector: "q" }),
    ).not.toBeInTheDocument();
    await next("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it("flags the very same words on a manager's form, so the exemption above is a rule and not a gap", async () => {
    asManager(written());
    await writeAndPreview("Took maternity leave in March.");
    expect(screen.getByText(headline)).toBeInTheDocument();
    expect(
      screen.getByText("maternity", { selector: "q" }),
    ).toBeInTheDocument();
  });

  it("reads the words that will be sent, so an emptied box does not leave a saved answer unchecked", async () => {
    /* The saved words stand when the box is emptied, so they are what goes, and
       they are what is read. */
    asManager(
      written({
        answer: answer({ textValue: `${PHRASE}.` }),
      }),
    );
    await next("Back");
    await userEvent.clear(box());
    await next("Next");
    await next("Skip");
    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PHRASE, { selector: "q" })).toBeInTheDocument();
  });
});

describe("a server that sends none of the new fields", () => {
  it("draws an ordinary written question as a box to write in, and sends `textValue`", async () => {
    mount({
      questions: [
        ordinary({ id: "q-t", prompt: "What went well?", required: true }),
      ],
    });
    await toTheQuestion();
    await userEvent.type(box(), "The migration.");
    await next("Next");

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith("r1", [
      { questionId: "q-t", textValue: "The migration." },
    ]);
  });

  it("draws a question flagged without a subsection behind it as the ordinary written question it would have been", async () => {
    mount({
      questions: [
        ordinary({
          id: "q-flag",
          prompt: "Communication",
          kind: "TEXT",
          required: true,
          answersSubsection: true,
        }),
      ],
    });
    await toTheQuestion();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("shows no line about the person's own answer on a manager's form without the field", async () => {
    asManager(written());
    await toTheQuestion();
    expect(screen.queryByText(/Their own answer/)).not.toBeInTheDocument();
  });
});
