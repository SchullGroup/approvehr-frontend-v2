import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiReview, ApiReviewDetail } from "@/lib/api/performance";
import { SignOffDialog } from "@/app/(app)/performance/reviews/[id]/sign-off-dialog";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * Acknowledging a rating and making one final: the two evidential completions of
 * an appraisal, which used to be a toast and are now a statement of what was
 * recorded.
 *
 * What `tsc` cannot see, and what each test pins: the dialog stays after the
 * write and shows the moment in place of the form; a failure leaves it on the
 * question; and "has been told" is said only when the API said it told them.
 */

const review = {
  id: "review-1",
  cycleName: "H1 2026",
  rating: 3,
} as unknown as ApiReview;

describe("acknowledging a rating", () => {
  it("turns the form into a statement of what was recorded", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => ({
      at: "2026-10-09T09:15:00.000Z",
    }));
    render(
      <SignOffDialog
        review={review}
        ratingLabel="Meets Expectations"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox"),
      "Thanks, I will pick this up.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "I have seen this" }),
    );

    expect(onConfirm).toHaveBeenCalledWith("Thanks, I will pick this up.");
    expect(
      await within(dialog).findByRole("heading", {
        name: "Your acknowledgement is recorded",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Your rating for H1 2026 was "Meets Expectations", and you saw it on 9 Oct 2026.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "It records that you saw your rating, not that you agree with it.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Your comment is saved with it."),
    ).toBeInTheDocument();
    /* The form has gone, so it cannot be sent twice. */
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "I have seen this" }),
    ).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not mention a comment that was not written", async () => {
    const user = userEvent.setup();
    render(
      <SignOffDialog
        review={review}
        ratingLabel={null}
        onClose={vi.fn()}
        onConfirm={async () => ({ at: null })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "I have seen this" }));
    expect(
      await screen.findByText(/You saw your appraisal for H1 2026 on/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/comment is saved/i)).toBeNull();
  });

  it("stays on the form when the write failed", async () => {
    const user = userEvent.setup();
    render(
      <SignOffDialog
        review={review}
        ratingLabel="Meets Expectations"
        onClose={vi.fn()}
        onConfirm={async () => null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "I have seen this" }));

    expect(
      await screen.findByRole("button", { name: "I have seen this" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});

const detail = {
  id: "review-1",
  subjectName: "Chidi Nwosu",
  cycleName: "H1 2026",
  rating: 3,
} as unknown as ApiReviewDetail;

describe("making a rating final", () => {
  it("says they have been told when the API says it told them", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FinaliseDialog
        open
        review={detail}
        onClose={onClose}
        onConfirm={async () => ({ subjectNotified: true })}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Make this Chidi Nwosu's rating?",
      }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Make this the rating" }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        name: "Chidi Nwosu's rating is final",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'The mark of record for H1 2026 is "Meets Expectations".',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Chidi has been told, and is asked to acknowledge it.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Make this the rating" }),
    ).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not say they have been told when the API says it could not", async () => {
    const user = userEvent.setup();
    render(
      <FinaliseDialog
        open
        review={detail}
        onClose={vi.fn()}
        onConfirm={async () => ({ subjectNotified: false })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Make this the rating" }),
    );

    expect(
      await screen.findByText(
        "Chidi could not be told in the app. Tell them yourself.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/has been told/)).toBeNull();
  });

  it("stays on the question when the write failed", async () => {
    const user = userEvent.setup();
    render(
      <FinaliseDialog
        open
        review={detail}
        onClose={vi.fn()}
        onConfirm={async () => null}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Make this the rating" }),
    );

    expect(
      await screen.findByRole("button", { name: "Make this the rating" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
