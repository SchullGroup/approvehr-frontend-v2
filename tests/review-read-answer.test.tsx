import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ApiAnswer,
  ApiFormQuestion,
  ApiRatingScale,
  ApiSelfAnswer,
  ApiSubsectionOnForm,
} from "@/lib/api/performance";

/**
 * An answer read back, on the record of a review and in the preview.
 *
 * `ReadAnswer` is how the record of a review, and the preview step of the
 * page-by-page flow, say what was answered. A directly rated subsection has to be
 * read from the subsection (its own scale, its own choices), a pick by the label
 * saved with it, and a server that sends none of the new fields must reach none
 * of that.
 *
 * These ran as part of `subsection-answer-popup.test.tsx`, beside the popup form
 * that drew the answers. The popup was deleted because nothing could open it;
 * `ReadAnswer` was not, so its tests stayed. Answering is covered by
 * `subsection-answer-flow.test.tsx`.
 */

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

vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useRatingScale: () => ({ scale, editable: true }),
}));

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
