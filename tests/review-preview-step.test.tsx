import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as steps from "@/app/(focus)/performance/reviews/[id]/answer/focus-steps";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * The last page of answering a review, and what it no longer asks.
 *
 * The page used to be called "Look it over". A live test reported that it should
 * read "Preview", and that the page before it, "Is there an overall mark?",
 * should not be asked of everybody: a review is its answers. The mark is now the
 * company's choice (Appraisal scoring), so the preview has a row for it only when
 * the company asks. `tsc` cannot see a heading or a row, so this reads the page.
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

const review = {
  questions: [],
  subjectName: "Chidi Nwosu",
  kind: "MANAGER",
} as unknown as ApiReviewDetail;

const mount = (
  onEdit = vi.fn(),
  mark: { withMark: boolean; mark: string } = { withMark: false, mark: "" },
) => {
  render(
    <steps.CheckStep
      review={review}
      scale={scale}
      withMark={mark.withMark}
      mark={mark.mark}
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

  it("shows no overall mark where the company does not ask for one", () => {
    mount();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
  });

  it("shows the mark in the company's own words where it asks", () => {
    mount(vi.fn(), { withMark: true, mark: "4" });
    expect(screen.getByText("Overall mark")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
  });

  it("says there is none rather than showing a nought, where it asks and nobody gave one", () => {
    mount(vi.fn(), { withMark: true, mark: "" });
    expect(screen.getByText("No overall mark")).toBeInTheDocument();
    expect(screen.queryByText("Unsatisfactory")).toBeNull();
  });

  it("sends the person to the mark page to change it", async () => {
    const { onEdit } = mount(vi.fn(), { withMark: true, mark: "4" });
    await userEvent.click(screen.getByRole("button", { name: /Overall mark/ }));
    expect(onEdit).toHaveBeenCalledWith("mark");
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
