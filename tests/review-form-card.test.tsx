import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import {
  ReviewFormCard,
  hasAnswers,
} from "@/app/(app)/performance/reviews/[id]/review-form-card";

/**
 * A person's self review and their manager's review, in one card: the Answers tab
 * of the record.
 *
 * It used to be two cards, one above the other, and the comparison was left to the
 * reader to make by scrolling. What these cases hold is what a reader needs from
 * it at a glance: which column is which, who wrote it and when, the same question
 * answered on each side, and the difference between a question that was not put to
 * somebody and one they left empty.
 *
 * And what it no longer says: the tab is called Answers, so the card has no
 * heading and no description, no status about what is left to answer, no period
 * box with the company's instructions, and no empty state for a form with no
 * questions (there is no card, `hasAnswers`).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: "emp-viewer", isConnected: false }),
}));

const words = (level: number | null | undefined) =>
  level === null || level === undefined
    ? null
    : (["", "One", "Two", "Three", "Four", "Five"][level] ?? null);

const text = (id: string, prompt: string, value: string | null, order = 0) =>
  ({
    id,
    competencyId: null,
    prompt,
    kind: "TEXT",
    required: true,
    options: [],
    allowCustom: false,
    order,
    answer:
      value === null
        ? null
        : {
            ratingValue: null,
            textValue: value,
            choiceValue: null,
            boolValue: null,
            attachment: null,
            answeredAt: "2026-10-12T09:00:00.000Z",
          },
  }) as ApiFormQuestion;

const review = (over: Partial<ApiReviewDetail>): ApiReviewDetail =>
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
    submittedAt: "2026-10-14T08:00:00.000Z",
    answerCount: 0,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
    mine: false,
    questions: [],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

const manager = (over: Partial<ApiReviewDetail> = {}) =>
  review({
    questions: [
      text("q1", "How did the period go?", "Steady, and ahead on delivery.", 1),
      text("q2", "Where do they need support?", "Planning.", 2),
    ],
    ...over,
  });

const self = (over: Partial<ApiReviewDetail> = {}) =>
  review({
    id: "r-self",
    kind: "SELF",
    kindLabel: "Self-review",
    authorId: "emp-subject",
    authorName: "Femi Balogun",
    submittedAt: "2026-10-12T08:00:00.000Z",
    questions: [
      text("q1", "How did the period go?", "A good one.", 1),
      text("q2", "Where do they need support?", "Nothing really.", 2),
    ],
    ...over,
  });

const mount = (
  props: Partial<Parameters<typeof ReviewFormCard>[0]> & {
    review: ApiReviewDetail;
  },
) =>
  render(
    <ReviewFormCard
      selfReview={null}
      selfLoading={false}
      ratingWords={words}
      {...props}
    />,
  );

afterEach(cleanup);

describe("with the self review in", () => {
  it("is one card with no heading and no description, and not two", () => {
    mount({ review: manager(), selfReview: self() });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(
      screen.queryByText("What was asked, and what was answered"),
    ).toBeNull();
    expect(
      screen.queryByText("What they said about their own period"),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Each question, with their answer beside their manager's.",
      ),
    ).toBeNull();
    expect(screen.queryByText("Neither form had any questions.")).toBeNull();
  });

  it("says which column is which, who wrote it, and when it was sent", () => {
    mount({ review: manager(), selfReview: self() });
    /* The heading row is for the eye, so it is hidden from assistive technology. */
    const head = document.querySelector('[aria-hidden="true"].hidden');
    expect(head).not.toBeNull();
    const heading = within(head as HTMLElement);
    expect(heading.getByText("Self review")).toBeInTheDocument();
    expect(heading.getByText(/Femi Balogun, sent/)).toBeInTheDocument();
    expect(heading.getByText("Manager review")).toBeInTheDocument();
    expect(heading.getByText(/Chidinma Ipoola, sent/)).toBeInTheDocument();
  });

  it("shows both answers to each question in one row", () => {
    mount({ review: manager(), selfReview: self() });
    const row = screen.getByText("How did the period go?").closest("li");
    expect(row).not.toBeNull();
    const inRow = within(row as HTMLElement);
    expect(inRow.getByText("A good one.")).toBeInTheDocument();
    expect(
      inRow.getByText("Steady, and ahead on delivery."),
    ).toBeInTheDocument();
  });

  it("labels each answer for a screen reader and for a phone, where the heading row is not drawn", () => {
    mount({ review: manager(), selfReview: self() });
    const row = screen.getByText("Where do they need support?").closest("li");
    const labels = within(row as HTMLElement).getAllByText(
      /^(Self review|Manager review)$/,
    );
    expect(labels.map((label) => label.textContent)).toEqual([
      "Self review",
      "Manager review",
    ]);
    /* Visible on a phone, read out always, hidden only where the heading shows. */
    for (const label of labels) expect(label.className).toContain("sm:sr-only");
  });

  it("says a question was not asked of somebody, apart from one they left empty", () => {
    mount({
      review: manager({
        questions: [
          text("q1", "Asked of both", "Yes.", 1),
          text("q3", "Only the manager was asked", "Noted.", 3),
        ],
      }),
      selfReview: self({
        questions: [
          text("q1", "Asked of both", null, 1),
          text("q2", "Only the person was asked", "Fine.", 2),
        ],
      }),
    });
    const both = within(
      screen.getByText("Asked of both").closest("li") as HTMLElement,
    );
    expect(both.getByText("Not answered")).toBeInTheDocument();
    expect(both.queryByText("Not asked")).toBeNull();

    const managerOnly = within(
      screen
        .getByText("Only the manager was asked")
        .closest("li") as HTMLElement,
    );
    expect(managerOnly.getByText("Not asked")).toBeInTheDocument();

    const selfOnly = within(
      screen
        .getByText("Only the person was asked")
        .closest("li") as HTMLElement,
    );
    expect(selfOnly.getByText("Not asked")).toBeInTheDocument();
  });

  it("puts the closing note in a row of one word, and says when one side added none", () => {
    mount({
      review: manager({ summary: "Recommend the team lead role next half." }),
      selfReview: self({ summary: null }),
    });
    const row = within(screen.getByText("Note").closest("li") as HTMLElement);
    expect(
      row.getByText("Recommend the team lead role next half."),
    ).toBeInTheDocument();
    expect(row.getByText("Nothing added")).toBeInTheDocument();
  });

  it("has no overall rating row where the company does not ask for one and nobody gave one", () => {
    mount({ review: manager(), selfReview: self() });
    expect(screen.queryByText("Overall rating")).toBeNull();
  });

  it("has no closing note row where neither side wrote one", () => {
    mount({ review: manager(), selfReview: self() });
    expect(screen.queryByText("Note")).toBeNull();
  });

  it("shows the overall ratings side by side in the company's words, and none given as not recorded", () => {
    mount({
      review: manager({ rating: 4, overallMark: true }),
      selfReview: self({ rating: null, overallMark: true }),
    });
    const row = within(
      screen.getByText("Overall rating").closest("li") as HTMLElement,
    );
    expect(row.getByText("Four")).toBeInTheDocument();
    expect(row.getByText("Not recorded")).toBeInTheDocument();
  });

  it("does not offer the form, or count what is left to answer: that is the form's business", () => {
    mount({
      review: manager({
        mine: true,
        submitted: false,
        submittedAt: null,
        outstanding: ["How did the period go?"],
      }),
      selfReview: self(),
    });
    expect(screen.queryByRole("link", { name: "Fill it in" })).toBeNull();
    expect(screen.queryByText(/still to answer/)).toBeNull();
    expect(screen.queryByText(/is answered/)).toBeNull();
  });

  it("does not repeat the period or the company's instructions above the answers", () => {
    mount({
      review: manager({
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        instructions: "Answer for the whole half.",
        guideUrl: "https://example.com/guide",
      }),
      selfReview: self(),
    });
    expect(screen.queryByText(/For the period/)).toBeNull();
    expect(screen.queryByText("Answer for the whole half.")).toBeNull();
    expect(screen.queryByText("Read the company's guide")).toBeNull();
  });
});

describe("without the self review", () => {
  it("is the manager review alone, and says nothing about why the other is not there", () => {
    mount({ review: manager({ summary: "Recommend a pay review." }) });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText(/Self review/)).toBeNull();
    expect(screen.queryByText(/not sent/)).toBeNull();
    expect(
      screen.getByText("Steady, and ahead on delivery."),
    ).toBeInTheDocument();
    /* A manager's closing note is their recommendations. */
    expect(screen.getByText("Recommendations")).toBeInTheDocument();
    expect(screen.getByText("Recommend a pay review.")).toBeInTheDocument();
  });

  it("says it is loading while the self review is on its way, and does not leave a column empty", () => {
    mount({ review: manager(), selfLoading: true });
    expect(screen.getByText("Loading their self review")).toBeInTheDocument();
    expect(screen.queryByText("Not asked")).toBeNull();
  });

  it("has no heading on a self review or on peer feedback either, and calls the note a note", () => {
    mount({ review: self({ summary: "Thanks." }) });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByText("Recommendations")).toBeNull();
    cleanup();
    mount({
      review: review({
        kind: "PEER",
        kindLabel: "Peer feedback",
        summary: "Good to work with.",
        questions: [text("q1", "How did the period go?", "Well.", 1)],
      }),
    });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Note")).toBeInTheDocument();
  });

  it("has no closing note row when there is no closing note", () => {
    mount({ review: manager() });
    expect(screen.queryByText("Recommendations")).toBeNull();
    expect(screen.queryByText("Note")).toBeNull();
  });
});

describe("whether there is anything to read (the tab is there only then)", () => {
  it("has questions to read", () => {
    expect(hasAnswers(manager(), null)).toBe(true);
  });

  it("has nothing: no questions and no closing note, so no card and no empty state", () => {
    expect(hasAnswers(manager({ questions: [] }), null)).toBe(false);
    expect(hasAnswers(self({ questions: [] }), null)).toBe(false);
  });

  it("has a closing note alone, which used to be hidden behind the empty state", () => {
    expect(
      hasAnswers(manager({ questions: [], summary: "Promote." }), null),
    ).toBe(true);
  });

  it("beside a self review, has something when either wrote a note or the company asks for an overall rating", () => {
    const bare = { questions: [] as ApiFormQuestion[] };
    expect(hasAnswers(manager(bare), self(bare))).toBe(false);
    expect(hasAnswers(manager({ ...bare, summary: "x" }), self(bare))).toBe(
      true,
    );
    expect(hasAnswers(manager(bare), self({ ...bare, summary: "x" }))).toBe(
      true,
    );
    expect(
      hasAnswers(manager({ ...bare, overallMark: true }), self(bare)),
    ).toBe(true);
  });
});
