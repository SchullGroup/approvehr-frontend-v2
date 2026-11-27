import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodFraming } from "@/app/(app)/performance/review-parts";

/**
 * The message to staff is said only to the people it is for (F26).
 *
 * The period's "message to staff" was drawn above every form, so a manager writing
 * about somebody and a colleague giving feedback were asked to complete a
 * self-review. (The company-wide counts under the open period, F23, are gone: the
 * period card says where it stands as a bar, and says no count to an employee.)
 */

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
