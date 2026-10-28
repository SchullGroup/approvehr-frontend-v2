import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as steps from "@/app/(focus)/performance/reviews/[id]/answer/focus-steps";
import type { ApiReviewDetail } from "@/lib/api/performance";

/**
 * The last page of answering a review, and what it no longer asks.
 *
 * The page used to be called "Look it over" and was preceded by a page headed
 * "Is there an overall mark?". Both were reported from a live test: the first
 * should read "Preview", and the second should not be asked at all, because a
 * review is its answers and the mark comes from the scores. `tsc` cannot see a
 * heading, and nothing else would notice the step coming back, so this reads the
 * page.
 */

const review = {
  questions: [],
  subjectName: "Chidi Nwosu",
  kind: "MANAGER",
} as unknown as ApiReviewDetail;

const mount = (onEdit = vi.fn()) => {
  render(
    <steps.CheckStep
      review={review}
      onRecord={() => ({})}
      summary="Steady quarter."
      outstanding={[]}
      coaching={false}
      languageTexts={[]}
      languageSeen={false}
      onEdit={onEdit}
    />,
  );
  return { onEdit };
};

describe("the page before a review is sent", () => {
  it("is called Preview", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/look it over/i)).toBeNull();
  });

  it("shows no overall mark, and has nothing to change one with", () => {
    mount();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
    /* The step itself is gone, not hidden: nothing can render it by accident. */
    expect(steps).not.toHaveProperty("MarkStep");
  });

  it("still shows the closing note and sends the person to it to change it", async () => {
    const { onEdit } = mount();
    expect(screen.getByText("Steady quarter.")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Anything to add/ }),
    );
    expect(onEdit).toHaveBeenCalledWith("summary");
  });
});
