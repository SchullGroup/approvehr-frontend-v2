import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CheckStep,
  IntroStep,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-steps";
import type { ApiReviewDetail } from "@/lib/api/performance";

/**
 * A manager is told, at the start, that Send is not open yet.
 *
 * The API holds a manager's review until the employee has sent theirs. It said
 * so only when Send was pressed, after the whole form was filled in, and that was
 * reported as being unable to do the appraisal at all. The review now carries the
 * sentence as `sendBlockedBy`, and the form shows it where somebody starts and
 * where they would press Send. These read both pages.
 *
 * The sentence is the API's own and is shown as it comes: it names the person and
 * the date that would release it, and nothing on this side can write either.
 */

const REASON =
  "Chidi has not sent their self-appraisal yet, and it should inform yours. Once they send it, you will see it beside this form. Ask HR to set a due date on this period if you need a deadline to work to.";

const review = (over: Partial<ApiReviewDetail> = {}) =>
  ({
    kind: "MANAGER",
    kindLabel: "Manager review",
    cycleName: "H2 2026",
    subjectName: "Chidi Nwosu",
    periodStart: null,
    periodEnd: null,
    dueDate: null,
    instructions: null,
    guideUrl: null,
    anonymous: false,
    mine: true,
    questions: [],
    ...over,
  }) as unknown as ApiReviewDetail;

const intro = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <IntroStep
      review={review(over)}
      resumed={false}
      answered={0}
      onShowWork={null}
    />,
  );

const preview = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <CheckStep
      review={review(over)}
      onRecord={() => ({})}
      summary=""
      outstanding={[]}
      coaching={false}
      languageTexts={[]}
      languageSeen={false}
      onEdit={vi.fn()}
    />,
  );

describe("when Send is not open yet", () => {
  it("says so where the form starts, in the API's own sentence", () => {
    intro({ sendBlockedBy: REASON });
    expect(screen.getByText("Sending is not open yet.")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(REASON.slice(0, 60))),
    ).toBeInTheDocument();
    expect(document.body.textContent).toContain(REASON);
  });

  it("says it again on the preview, beside the Send it would block", () => {
    preview({ sendBlockedBy: REASON });
    expect(screen.getByText("Sending is not open yet.")).toBeInTheDocument();
    expect(document.body.textContent).toContain(REASON);
  });

  it("says nothing when the API says nothing is in the way", () => {
    intro({ sendBlockedBy: null });
    expect(screen.queryByText("Sending is not open yet.")).toBeNull();
  });

  it("says nothing when the server does not know the field at all", () => {
    /* An older server sends no `sendBlockedBy`. Absent means there is nothing to
       say, never "Send is open": the API still refuses at Send, and that is shown. */
    preview();
    expect(screen.queryByText("Sending is not open yet.")).toBeNull();
  });
});
