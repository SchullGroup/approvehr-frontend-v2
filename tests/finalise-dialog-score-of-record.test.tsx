import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * The question asked before a rating is made final says what the person will
 * read, and that is the period's score, not this review's own mark (F42).
 *
 * A manager's overall rating is one appraiser's mark. The person reads the
 * period's score of record, and their record opens on it. The dialog used to say
 * "will be told their rating, <the appraiser's mark>", so the appraiser agreed to
 * something the record then contradicted. The calm wording of the redesign kept
 * the sentence short and read `review.rating`; it reads the score now, and says
 * plainly when the appraiser's own mark is a different thing.
 *
 * The same dialog is covered for what it says after the act in
 * `review-sign-off-moments.test.tsx`.
 */

const review = (over: Record<string, unknown> = {}) =>
  ({
    id: "review-1",
    subjectName: "Chidi Nwosu",
    authorName: "Adaeze Okonkwo",
    cycleName: "H1 2026",
    /* 4 is "Exceeds Expectations" on the default scale. */
    rating: 4,
    ...over,
  }) as unknown as ApiReviewDetail;

const paragraph = () => {
  const dialog = screen.getByRole("dialog");
  const found = Array.from(dialog.querySelectorAll("p")).find((node) =>
    /cannot be changed/.test(node.textContent ?? ""),
  );
  if (!found) throw new Error("the question has no paragraph");
  return found.textContent ?? "";
};

const open = (props: { review: ApiReviewDetail; scoreNow?: string | null }) =>
  render(
    <FinaliseDialog
      open
      review={props.review}
      {...(props.scoreNow !== undefined ? { scoreNow: props.scoreNow } : {})}
      onClose={vi.fn()}
      onConfirm={async () => ({ subjectNotified: true })}
    />,
  );

describe("what the person is told they will read", () => {
  it("is the period's score, as it stands now, when the page can read it", () => {
    open({ review: review(), scoreNow: "Meets Expectations · 3.1" });
    expect(paragraph()).toMatch(
      /^Chidi will be told their rating, "Meets Expectations · 3\.1", as it stands now\./,
    );
  });

  it("never calls the appraiser's own mark their rating", () => {
    open({ review: review(), scoreNow: "Meets Expectations · 3.1" });
    expect(paragraph()).not.toMatch(/their rating, "Exceeds Expectations"/);
  });

  it("says the appraiser's mark is theirs, and stays with the review", () => {
    open({ review: review(), scoreNow: "Meets Expectations · 3.1" });
    expect(paragraph()).toContain(
      `Adaeze Okonkwo's own overall rating, "Exceeds Expectations", stays with the review.`,
    );
  });

  it("names no figure where the score cannot be read, rather than the wrong one", () => {
    open({ review: review(), scoreNow: null });
    const text = paragraph();
    expect(text).toMatch(/^Chidi will read the score for the period\./);
    expect(text).not.toMatch(/will be told their rating/);
    /* The mark is still said, and still as the appraiser's. */
    expect(text).toContain("own overall rating");
  });

  it("does not talk of a mark that was not given", () => {
    open({ review: review({ rating: null }), scoreNow: null });
    const text = paragraph();
    expect(text).toMatch(/^Chidi will read the answers\./);
    expect(text).not.toMatch(/own overall rating/);
  });

  it("says it cannot be changed, once", () => {
    open({ review: review(), scoreNow: "Meets Expectations · 3.1" });
    expect(paragraph().match(/cannot be changed/g)).toHaveLength(1);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Make it final",
      }),
    ).toBeInTheDocument();
  });
});
