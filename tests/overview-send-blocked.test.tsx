import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiReview } from "@/lib/api/performance";

/**
 * The "Fill it in" row says Send is closed before the form is opened.
 *
 * A manager's form cannot be sent until the employee has sent their
 * self-appraisal (a past due date, the records permission, or nobody having been
 * asked all open it). The form says so at its start, but the Overview is where a
 * manager chooses which of their forms to open, and it had no way to say it: they
 * opened one to find out. The API now sends the sentence on each form in the work
 * list, and the row puts it beside the person.
 *
 * What is pinned: the sentence is the API's own and verbatim, it is on the work
 * list and nowhere else, and a server that sends nothing, or `null`, makes no
 * claim. This screen never writes the sentence itself: it names a person and, when
 * the period has a due date, the date that opens it, and only the API knows either.
 */

vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useRatingScale: () => ({
    scale: { levels: [], source: "default", max: 5 },
    loading: false,
    error: null,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { ReviewRow } = await import("@/app/(app)/performance/now");

const SENTENCE =
  "Emeka has not sent their self-appraisal yet, and it should inform yours. Once they send it, you will see it beside this form. If they miss 2026-11-20, you can send yours without it.";

const review = (over: Partial<ApiReview> = {}): ApiReview => ({
  id: "r1",
  cycleId: "cy1",
  cycleName: "H2 2026 appraisal",
  cycleStage: "SELF",
  dueDate: "2026-11-20",
  periodStart: null,
  periodEnd: null,
  kind: "MANAGER",
  kindLabel: "Manager review",
  anonymous: false,
  subjectId: "e-emeka",
  subjectName: "Emeka Anyanwu",
  authorId: "me",
  authorName: "Adaeze Okonkwo",
  rating: null,
  summary: null,
  submitted: false,
  submittedAt: null,
  answerCount: 0,
  finalised: false,
  finalisedAt: null,
  acknowledged: false,
  acknowledgedAt: null,
  disputed: false,
  disputedAt: null,
  employeeComment: null,
  ...over,
});

const row = (r: ApiReview, context: "owed" | "record" = "owed") =>
  render(
    <ReviewRow
      review={r}
      context={context}
      actionLabel="Fill it in"
      onOpen={vi.fn()}
    />,
  );

const mark = () => screen.queryByRole("button", { name: SENTENCE });

describe("a manager's form in the work list", () => {
  it("carries the API's sentence beside the person, verbatim", () => {
    row(review({ sendBlockedBy: SENTENCE }));

    expect(mark()).toBeInTheDocument();
    /* The form can still be opened and answered; it is Send that is closed. */
    expect(screen.getByRole("button", { name: "Fill it in" })).toBeEnabled();
  });

  it("says nothing when the API says Send is open", () => {
    row(review({ sendBlockedBy: null }));

    expect(mark()).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fill it in" }),
    ).toBeInTheDocument();
  });

  it("says nothing for a server that does not send it, which is not the same as open", () => {
    row(review());

    expect(
      screen.queryByRole("button", { name: /self-appraisal/ }),
    ).not.toBeInTheDocument();
  });
});

describe("outside the work list", () => {
  it("is not shown on a row in the record of what was said about you", () => {
    row(review({ sendBlockedBy: SENTENCE, submitted: true }), "record");

    expect(mark()).not.toBeInTheDocument();
  });
});
