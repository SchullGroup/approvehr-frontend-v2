import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import { SignOffDialog } from "@/app/(app)/performance/reviews/[id]/sign-off-dialog";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * Acknowledging a rating and making one final: the two evidential completions of
 * an appraisal.
 *
 * What `tsc` cannot see, and what each test pins: acknowledging is the optional
 * comment and one button, and closes once it is recorded (the screen says
 * "Acknowledged" in a toast); making final stays open and says what was recorded;
 * a failure leaves either on its question; and "could not be told" is said only
 * when the API said so.
 */

describe("acknowledging a rating", () => {
  it("asks for nothing but the optional comment, and closes when it is recorded", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => true);
    render(<SignOffDialog onClose={onClose} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Acknowledge this rating" }),
    ).toBeInTheDocument();
    /* One field and two buttons: no paragraph of rules above the form. */
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
    expect(within(dialog).queryByText(/does not mean you agree/i)).toBeNull();
    expect(within(dialog).queryByText(/once/i)).toBeNull();

    await user.type(
      within(dialog).getByRole("textbox"),
      "Thanks, I will pick this up.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "I have seen this" }),
    );

    expect(onConfirm).toHaveBeenCalledWith("Thanks, I will pick this up.");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sends no comment when none was written", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => true);
    render(<SignOffDialog onClose={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "I have seen this" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("stays on the form when the write failed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SignOffDialog onClose={onClose} onConfirm={async () => false} />);
    await user.click(screen.getByRole("button", { name: "I have seen this" }));

    expect(
      await screen.findByRole("button", { name: "I have seen this" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

const detail = {
  id: "review-1",
  subjectName: "Chidi Nwosu",
  cycleName: "H1 2026",
  rating: 3,
} as unknown as ApiReviewDetail;

describe("making a rating final", () => {
  it("says what was recorded, and nothing more, when the API told them", async () => {
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
        name: "Make Chidi Nwosu's rating final?",
      }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Make it final" }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        name: "Chidi Nwosu's rating is final",
      }),
    ).toBeInTheDocument();
    /* The title says it. Nothing is repeated after the act. */
    expect(within(dialog).queryByText(/has been told/)).toBeNull();
    expect(within(dialog).queryByText(/cannot be changed/)).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Make it final" }),
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
    await user.click(screen.getByRole("button", { name: "Make it final" }));

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
    await user.click(screen.getByRole("button", { name: "Make it final" }));

    expect(
      await screen.findByRole("button", { name: "Make it final" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
