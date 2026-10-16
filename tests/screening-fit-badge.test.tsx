import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AssessmentBadge,
  BelowBadge,
  FitBadge,
  FitBar,
  ScreeningBadges,
} from "@/components/hiring/screening/fit-badge";
import { fit, summary } from "./screening-helpers";

/**
 * A fit score in a list row and on a board card.
 *
 * What these hold: the number is in the text (a bar is decoration and hidden from
 * a screen reader), every way of having no score is said in words and never as a
 * zero, a stale score says it is, and nothing here reads as a verdict.
 */

describe("the badge on a row", () => {
  it("writes the number and says it is out of 100 for a screen reader", () => {
    render(<FitBadge fit={fit({ score: 72 })} />);
    expect(screen.getByText("Fit 72")).toBeInTheDocument();
    expect(screen.getByText("out of 100")).toHaveClass("sr-only");
  });

  it.each([
    ["WAITING_FOR_TEXT", "Waiting for CV text"],
    ["NO_TEXT", "Needs a person to read it"],
    ["NO_CRITERIA", "No criteria yet"],
    ["COULD_NOT_READ", "Could not read the CV"],
  ] as const)("says %s in words, with no number", (status, words) => {
    render(<FitBadge fit={fit({ status, score: null })} />);
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(screen.queryByText(/^Fit \d/)).not.toBeInTheDocument();
  });

  it("says a score was worked out with an older version", () => {
    render(<FitBadge fit={fit({ stale: true })} />);
    expect(screen.getByText("(older version)")).toBeInTheDocument();
  });
});

describe("the bar on a board card", () => {
  it("has the figure in text and the bar hidden from assistive technology", () => {
    render(<FitBar fit={fit({ score: 64 })} />);
    const bar = screen.getByTestId("fit-bar");
    expect(bar).toHaveTextContent("Fit 64");
    expect(bar).toHaveTextContent("out of 100");
    const drawn = bar.querySelector('[aria-hidden="true"]');
    expect(drawn).not.toBeNull();
    expect(drawn?.firstElementChild).toHaveStyle({ width: "64%" });
  });

  it("draws no bar at all for somebody with no score, never an empty one", () => {
    render(<FitBar fit={fit({ status: "NO_TEXT", score: null })} />);
    const bar = screen.getByTestId("fit-bar");
    expect(bar).toHaveTextContent("Needs a person to read it");
    expect(bar.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("says an older version is being replaced", () => {
    render(<FitBar fit={fit({ stale: true })} />);
    expect(screen.getByText(/new score on its way/)).toBeInTheDocument();
  });
});

describe("the other two badges", () => {
  it("shows an assessment score, and nothing at all while there is none", () => {
    const { rerender, container } = render(<AssessmentBadge score={64} />);
    expect(screen.getByText("Assessment 64")).toBeInTheDocument();
    rerender(<AssessmentBadge score={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AssessmentBadge score={0} />);
    expect(screen.getByText("Assessment 0")).toBeInTheDocument();
  });

  it("calls the low end 'below the pass mark' and says a person decides", () => {
    render(<BelowBadge below />);
    const badge = screen.getByText("Below the pass mark");
    expect(badge.closest("span")?.getAttribute("title")).toMatch(
      /A person decides/,
    );
  });

  it("shows nothing for somebody at or above it", () => {
    const { container } = render(<BelowBadge below={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("puts a row's three facts together in order", () => {
    render(
      <ScreeningBadges
        summary={summary({ assessment: 58, belowPassMark: true })}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Fit 72")).toBeLessThan(text.indexOf("Assessment 58"));
    expect(text.indexOf("Assessment 58")).toBeLessThan(
      text.indexOf("Below the pass mark"),
    );
  });

  it("draws nothing for a row from an API that predates screening", () => {
    const { container } = render(<ScreeningBadges summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
