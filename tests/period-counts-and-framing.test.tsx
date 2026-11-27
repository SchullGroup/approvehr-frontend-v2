import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodCounts } from "@/app/(app)/performance/period-counts";
import { PeriodFraming } from "@/app/(app)/performance/review-parts";

/**
 * Two things said to the wrong reader (F23, F26).
 *
 * "10 questions, 18 forms" under the open period are the whole company's counts,
 * and were shown to an employee whose own flow said six. The period's "message to
 * staff" was drawn above every form, so a manager writing about somebody and a
 * colleague giving feedback were asked to complete a self-review.
 */

const counts = { questionCount: 10, reviewCount: 18, dueDate: "2027-01-14" };

describe("the counts under the open period", () => {
  it("gives an employee only the date: no company-wide counts", () => {
    const { container } = render(
      <PeriodCounts period={counts} canSeeCompany={false} />,
    );
    expect(container.textContent).toBe("Answers due 14 Jan 2027");
    expect(container.textContent).not.toMatch(/question|form/);
  });

  it("gives somebody who sees the company the counts, said as the company's", () => {
    render(<PeriodCounts period={counts} canSeeCompany />);
    expect(screen.getByText("10 questions in all")).toBeInTheDocument();
    expect(screen.getByText("18 forms across the company")).toBeInTheDocument();
    expect(screen.getByText("Answers due 14 Jan 2027")).toBeInTheDocument();
  });

  it("uses the singular", () => {
    render(
      <PeriodCounts
        period={{ questionCount: 1, reviewCount: 1, dueDate: null }}
        canSeeCompany
      />,
    );
    expect(screen.getByText("1 question in all")).toBeInTheDocument();
    expect(screen.getByText("1 form across the company")).toBeInTheDocument();
  });

  it("draws nothing for an employee when there is no date either", () => {
    const { container } = render(
      <PeriodCounts
        period={{ ...counts, dueDate: null }}
        canSeeCompany={false}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("the message to staff", () => {
  const MESSAGE = "Please complete your self-review honestly.";
  const frame = (kind?: "SELF" | "MANAGER" | "PEER") => (
    <PeriodFraming
      periodStart="2026-07-01"
      periodEnd="2026-12-31"
      instructions={MESSAGE}
      guideUrl="https://example.com/guide"
      {...(kind ? { kind } : {})}
    />
  );

  it("is above a self-review", () => {
    render(frame("SELF"));
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  it("is not above a manager's form or a colleague's feedback", () => {
    for (const kind of ["MANAGER", "PEER"] as const) {
      const { unmount } = render(frame(kind));
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("is not drawn when the caller does not say what the form is", () => {
    render(frame());
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it("still gives every form the period and the guide", () => {
    render(frame("MANAGER"));
    expect(screen.getByText(/For the period/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /company's guide/ }),
    ).toHaveAttribute("href", "https://example.com/guide");
  });

  it("draws nothing at all when only the message exists and the form is not a self-review", () => {
    const { container } = render(
      <PeriodFraming
        periodStart={null}
        periodEnd={null}
        instructions={MESSAGE}
        kind="MANAGER"
      />,
    );
    expect(container.textContent).toBe("");
  });
});
