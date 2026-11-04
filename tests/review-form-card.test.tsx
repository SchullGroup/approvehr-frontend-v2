import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import { ReviewFormCard } from "@/app/(app)/performance/reviews/[id]/review-form-card";

/**
 * A person's self review and their manager's review, in one card.
 *
 * It used to be two cards, one above the other, and the comparison was left to the
 * reader to make by scrolling. What these cases hold is what a reader needs from
 * it at a glance: which column is which, who wrote it and when, the same question
 * answered on each side, and the difference between a question that was not put to
 * somebody and one they left empty.
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
  it("is one card, named for the two reviews, and not two", () => {
    mount({ review: manager(), selfReview: self() });
    expect(
      screen.getByRole("heading", { name: "Self review and manager review" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What was asked, and what was answered"),
    ).toBeNull();
    expect(
      screen.queryByText("What they said about their own period"),
    ).toBeNull();
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

  it("puts the closing note and the recommendations in a row of their own, and says when there is none", () => {
    mount({
      review: manager({ summary: "Recommend the team lead role next half." }),
      selfReview: self({ summary: null }),
    });
    const row = within(
      screen
        .getByText("Closing note and recommendations")
        .closest("li") as HTMLElement,
    );
    expect(
      row.getByText("Recommend the team lead role next half."),
    ).toBeInTheDocument();
    expect(row.getByText("Nothing added")).toBeInTheDocument();
  });

  it("has no overall mark row where the company does not ask for one and nobody gave one", () => {
    mount({ review: manager(), selfReview: self() });
    expect(screen.queryByText("Overall mark")).toBeNull();
  });

  it("shows the overall marks side by side in the company's words, and none given as none given", () => {
    mount({
      review: manager({ rating: 4, overallMark: true }),
      selfReview: self({ rating: null, overallMark: true }),
    });
    const row = within(
      screen.getByText("Overall mark").closest("li") as HTMLElement,
    );
    expect(row.getByText("Four")).toBeInTheDocument();
    expect(row.getByText("None given")).toBeInTheDocument();
  });

  it("offers the way into the form to the person who has not sent theirs, and counts what is left", () => {
    mount({
      review: manager({
        mine: true,
        submitted: false,
        submittedAt: null,
        outstanding: ["How did the period go?"],
      }),
      selfReview: self(),
    });
    expect(screen.getByRole("link", { name: "Fill it in" })).toHaveAttribute(
      "href",
      "/performance/reviews/r-1/answer",
    );
    expect(
      screen.getByText("1 required question still to answer."),
    ).toBeInTheDocument();
  });
});

describe("without the self review", () => {
  it("is the manager review alone, and says nothing about why the other is not there", () => {
    mount({ review: manager({ summary: "Recommend a pay review." }) });
    expect(
      screen.getByRole("heading", { name: "Manager review" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Self review/)).toBeNull();
    expect(screen.queryByText(/not sent/)).toBeNull();
    expect(
      screen.getByText("Steady, and ahead on delivery."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Closing note and recommendations"),
    ).toBeInTheDocument();
    expect(screen.getByText("Recommend a pay review.")).toBeInTheDocument();
  });

  it("says it is loading while the self review is on its way, and does not leave a column empty", () => {
    mount({ review: manager(), selfLoading: true });
    expect(screen.getByText("Loading their self review")).toBeInTheDocument();
    expect(screen.queryByText("Not asked")).toBeNull();
  });

  it("is named for what it is on a self review and on peer feedback", () => {
    mount({ review: self() });
    expect(
      screen.getByRole("heading", { name: "Self review" }),
    ).toBeInTheDocument();
    cleanup();
    mount({ review: review({ kind: "PEER", kindLabel: "Peer feedback" }) });
    expect(
      screen.getByRole("heading", { name: "Peer feedback" }),
    ).toBeInTheDocument();
  });

  it("has no closing note row when there is no closing note", () => {
    mount({ review: manager() });
    expect(screen.queryByText("Closing note and recommendations")).toBeNull();
  });

  it("says plainly that the form has no questions", () => {
    mount({ review: manager({ questions: [] }) });
    expect(screen.getByText("No questions on this form")).toBeInTheDocument();
  });
});
