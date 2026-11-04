import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KindTag, LockMark } from "@/app/(app)/performance/subsection-title";

/**
 * The two small things that sit around a subsection's name: the word in front that
 * says how it is answered, and the lock after it when that is fixed.
 *
 * Both are one-line components, and both are where a wrong claim would be made
 * quietly: a tag for the wrong kind says a yes or no is rated, and a lock drawn for
 * a subsection with no ratings says it cannot be changed when it can.
 */

describe("the word in front of the name", () => {
  it("says how each kind is answered", () => {
    const { rerender } = render(<KindTag kind="RATING" />);
    expect(screen.getByText("Rated")).toBeInTheDocument();
    rerender(<KindTag kind="BOOLEAN" />);
    expect(screen.getByText("Yes or no")).toBeInTheDocument();
    rerender(<KindTag kind="CHOICE" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("has one width for all three, so the names after them start in one column", () => {
    for (const kind of ["RATING", "BOOLEAN", "CHOICE"] as const) {
      const { container, unmount } = render(<KindTag kind={kind} />);
      expect(container.firstElementChild).toHaveClass("min-w-[4.5rem]");
      unmount();
    }
  });
});

describe("the lock after the name", () => {
  it("draws nothing for a subsection with no ratings, because nothing is fixed", () => {
    const { container, rerender } = render(<LockMark ratingCount={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LockMark ratingCount={-1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives the reason as its hover and as the words a screen reader hears", () => {
    const { container } = render(<LockMark ratingCount={12} />);
    const reason = "Fixed: 12 ratings are recorded, in any period.";
    expect(screen.getByText(reason)).toHaveClass("sr-only");
    expect(container.firstElementChild).toHaveAttribute("title", reason);
  });

  it("is not a button, because it sits inside the row's own button", () => {
    render(<LockMark ratingCount={3} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the picture itself from assistive technology, so the reason is read once", () => {
    const { container } = render(<LockMark ratingCount={3} />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
