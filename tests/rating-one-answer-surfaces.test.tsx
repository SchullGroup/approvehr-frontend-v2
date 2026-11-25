import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiReview, ApiReviewDetail } from "@/lib/api/performance";

/**
 * One rating, on every screen that announces one (F42).
 *
 * A manager's overall rating is one appraiser's mark. The rating a person is told is
 * the period's score of record, and their record opens on it: "Meets Expectations ·
 * 3.1". Chidi's Overview said "Your rating is final: Exceeds Expectations", the
 * dialog that made it final said "Their rating becomes Exceeds Expectations", and the
 * receipt he keeps said the same, all of them the appraiser's mark. Two screens gave
 * two different ratings for the same period.
 *
 * What is pinned, surface by surface: the line the person reads is the score; the
 * appraiser's mark is said as theirs where it is shown at all; and a server that does
 * not send the score, or sends none for this person, never has a figure invented.
 */

vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useRatingScale: () => ({
    scale: { levels: null, source: "default", max: 5 },
    loading: false,
    error: null,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { FinalRatingRow, WrittenReviewRow, ReviewRow } =
  await import("@/app/(app)/performance/now");
const { FinaliseDialog } =
  await import("@/app/(app)/performance/reviews/[id]/finalise-dialog");

afterEach(cleanup);

const SCORE = { bandLabel: "Meets Expectations", scoreOutOf5: 3.1 };

const review = (over: Partial<ApiReview> = {}): ApiReview => ({
  id: "r1",
  cycleId: "cy1",
  cycleName: "Q4 2026 performance appraisal",
  cycleStage: "CALIBRATION",
  dueDate: null,
  periodStart: null,
  periodEnd: null,
  kind: "MANAGER",
  kindLabel: "Manager review",
  anonymous: false,
  subjectId: "e-chidi",
  subjectName: "Chidi Nwosu",
  authorId: "e-adaeze",
  authorName: "Adaeze Okonkwo",
  /* Mara's, not the period's: 4 of 5 is "Exceeds Expectations". */
  rating: 4,
  summary: null,
  submitted: true,
  submittedAt: "2026-11-25T09:00:00.000Z",
  answerCount: 0,
  finalised: true,
  finalisedAt: "2026-11-25T10:00:00.000Z",
  acknowledged: false,
  acknowledgedAt: null,
  disputed: false,
  disputedAt: null,
  employeeComment: null,
  ...over,
});

describe("the card that says a rating is final, on the person's Overview", () => {
  it("reads the score of record, the line their record opens on", () => {
    render(<FinalRatingRow review={review({ outcome: SCORE })} />);
    expect(
      screen.getByText(
        "Q4 2026 performance appraisal · Meets Expectations · 3.1",
      ),
    ).toBeInTheDocument();
  });

  it("does not announce the appraiser's mark as their rating", () => {
    render(<FinalRatingRow review={review({ outcome: SCORE })} />);
    expect(screen.queryByText(/Exceeds Expectations/)).toBeNull();
  });

  it("still says whose review it is from, and when it was made final", () => {
    render(<FinalRatingRow review={review({ outcome: SCORE })} />);
    expect(
      screen.getByText(/Final on .* · from Adaeze Okonkwo/),
    ).toBeInTheDocument();
  });

  it("opens the review", () => {
    render(<FinalRatingRow review={review({ outcome: SCORE })} />);
    expect(
      screen.getByRole("link", { name: "Read it and answer" }),
    ).toHaveAttribute("href", "/performance/reviews/r1");
  });

  it("falls back to what it always said where the server sends no score on its list rows", () => {
    render(<FinalRatingRow review={review()} />);
    expect(
      screen.getByText("Q4 2026 performance appraisal · Exceeds Expectations"),
    ).toBeInTheDocument();
  });

  it("says there is no overall rating where there is neither a score nor a mark, and never a zero", () => {
    render(
      <FinalRatingRow
        review={review({
          rating: null,
          outcome: { bandLabel: null, scoreOutOf5: null },
        })}
      />,
    );
    expect(
      screen.getByText("Q4 2026 performance appraisal · no overall rating"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\b0\b/)).toBeNull();
  });
});

describe("the reviews a manager has written, on their Overview", () => {
  it("says the mark is theirs", () => {
    render(<WrittenReviewRow review={review()} />);
    expect(
      screen.getByText("Chidi Nwosu · you rated Exceeds Expectations"),
    ).toBeInTheDocument();
  });

  it("is not turned into the person's rating by a score arriving on the row", () => {
    render(<WrittenReviewRow review={review({ outcome: SCORE })} />);
    expect(
      screen.getByText("Chidi Nwosu · you rated Exceeds Expectations"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/3\.1/)).toBeNull();
  });

  it("says there is no overall rating where the manager gave none", () => {
    render(<WrittenReviewRow review={review({ rating: null })} />);
    expect(
      screen.getByText("Chidi Nwosu · no overall rating"),
    ).toBeInTheDocument();
  });

  it("keeps its four states and its door", () => {
    render(<WrittenReviewRow review={review()} />);
    expect(screen.getByText("Final, not answered yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read it" })).toHaveAttribute(
      "href",
      "/performance/reviews/r1",
    );
  });
});

describe("a row in the record of what was said about the person", () => {
  const row = (r: ApiReview, context: "owed" | "record") =>
    render(
      context === "record" ? (
        <ReviewRow review={r} context="record" />
      ) : (
        <ReviewRow
          review={r}
          context="owed"
          actionLabel="Fill it in"
          onOpen={vi.fn()}
        />
      ),
    );

  it("reads the score of record", () => {
    row(review({ outcome: SCORE }), "record");
    expect(screen.getByText("Meets Expectations · 3.1")).toBeInTheDocument();
    expect(screen.queryByText("Exceeds Expectations")).toBeNull();
  });

  it("reads the review's own mark from an API that sends no score on its rows", () => {
    row(review(), "record");
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
  });

  it("is the author's own mark on a form still to be written, which has no score", () => {
    row(review({ submitted: false, finalised: false, outcome: SCORE }), "owed");
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(screen.queryByText(/3\.1/)).toBeNull();
  });
});

describe("the dialog that makes a rating final", () => {
  const detail = (over: Partial<ApiReviewDetail> = {}) =>
    ({
      id: "r1",
      subjectName: "Chidi Nwosu",
      cycleName: "Q4 2026",
      authorName: "Adaeze Okonkwo",
      rating: 4,
      overallMark: true,
      ...over,
    }) as unknown as ApiReviewDetail;

  const open = (
    over: Partial<ApiReviewDetail> = {},
    scoreNow?: string | null,
  ) =>
    render(
      <FinaliseDialog
        open
        review={detail(over)}
        {...(scoreNow === undefined ? {} : { scoreNow })}
        onClose={() => {}}
        onConfirm={async () => ({ subjectNotified: true })}
      />,
    );

  it("says the rating they will read is the period's score, as it stands now", () => {
    open({}, "Meets Expectations · 3.1");
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(
        /The rating they will read is the score for the period, "Meets Expectations · 3\.1" as it stands now\./,
      ),
    ).toBeInTheDocument();
  });

  it("says the appraiser's own mark is theirs, and not what the person reads", () => {
    open({}, "Meets Expectations · 3.1");
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(
        /Adaeze Okonkwo's own overall rating, "Exceeds Expectations", stays with the review\./,
      ),
    ).toBeInTheDocument();
    /* The sentence it replaced made that mark the person's rating. */
    expect(dialog.queryByText(/Their rating becomes/)).toBeNull();
  });

  it("names no figure for the score where the page could not read it, and still names the mark as theirs", () => {
    open({}, null);
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(
        /The rating they will read is the score for the period\./,
      ),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/as it stands now/)).toBeNull();
    expect(dialog.queryByText(/3\.1/)).toBeNull();
    expect(
      dialog.getByText(
        /Adaeze Okonkwo's own overall rating, "Exceeds Expectations"/,
      ),
    ).toBeInTheDocument();
  });

  it("is told nothing about a score by a caller that does not pass one", () => {
    open({});
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByText(/as it stands now/)).toBeNull();
  });

  it("keeps saying a form has no overall rating where the company asks for one and none was given", () => {
    open({ rating: null }, "Meets Expectations · 3.1");
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(
        /This form has no overall rating, so they will read the answers\./,
      ),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/own overall rating/)).toBeNull();
  });

  it("gives an account of what was recorded that leads with the score and says whose mark is whose", async () => {
    const user = userEvent.setup();
    open({}, "Meets Expectations · 3.1");
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Make it final" }));

    expect(
      await dialog.findByText(
        'The rating for Q4 2026 is "Meets Expectations · 3.1".',
      ),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        `Adaeze Okonkwo's own overall rating, "Exceeds Expectations", stays with the review.`,
      ),
    ).toBeInTheDocument();
  });
});
