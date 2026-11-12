import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import type { ApiPin } from "@/lib/api/work-pins";
import { ReviewFormCard } from "@/app/(app)/performance/reviews/[id]/review-form-card";

/**
 * The work a person pinned to their answers, read beside the answers.
 *
 * What is proved: in the two-column card the pins sit under the person's own answer and nowhere else, so
 * a manager's column never carries pins, and a question with none says nothing; the line says whose choice
 * it was ("you" to the person themselves, their name to anybody else); the key opens the task and no
 * title is drawn however one arrived; on a self-review read on its own the pins are there for its own
 * author and for a reader, and on a manager's review read on its own there are none; and a server that
 * sends no `pins` leaves every card exactly as it was.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/reviews/r-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: "emp-viewer", isConnected: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const words = (level: number | null | undefined) =>
  level === null || level === undefined ? null : String(level);

const pin = (over: Partial<ApiPin> = {}): ApiPin => ({
  id: "pin1",
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-11-04T10:00:00.000Z",
  finishedOn: "2026-11-04",
  dueDate: null,
  timing: "ON_TIME",
  linked: false,
  setBy: { id: "pat", name: "Pat Projects" },
  note: "Led it end to end",
  pinnedAt: "2026-11-05T09:00:00.000Z",
  canOpen: true,
  ...over,
});

const text = (
  id: string,
  prompt: string,
  value: string | null,
  pins?: unknown[],
) =>
  ({
    id,
    competencyId: null,
    prompt,
    kind: "TEXT",
    required: true,
    options: [],
    allowCustom: false,
    order: 1,
    answer:
      value === null
        ? null
        : {
            ratingValue: null,
            textValue: value,
            choiceValue: null,
            boolValue: null,
            attachment: null,
            answeredAt: "2026-10-12T09:00:00.000Z",
          },
    ...(pins ? { pins } : {}),
  }) as ApiFormQuestion;

const review = (over: Partial<ApiReviewDetail>): ApiReviewDetail =>
  ({
    id: "r-1",
    cycleId: "c-1",
    cycleName: "H2 2026 Appraisal",
    cycleStage: "CALIBRATION",
    dueDate: null,
    periodStart: null,
    periodEnd: null,
    kind: "MANAGER",
    kindLabel: "Manager review",
    anonymous: false,
    subjectId: "emp-subject",
    subjectName: "Femi Balogun",
    authorId: "emp-author",
    authorName: "Chidinma Ipoola",
    rating: null,
    summary: null,
    submitted: true,
    submittedAt: "2026-10-14T08:00:00.000Z",
    answerCount: 0,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
    mine: false,
    questions: [],
    outstanding: [],
    instructions: null,
    guideUrl: null,
    ...over,
  }) as ApiReviewDetail;

const manager = (over: Partial<ApiReviewDetail> = {}) =>
  review({
    questions: [
      text("q1", "How did the period go?", "Steady."),
      text("q2", "Where do they need support?", "Planning."),
    ],
    ...over,
  });

const self = (over: Partial<ApiReviewDetail> = {}) =>
  review({
    id: "r-self",
    kind: "SELF",
    kindLabel: "Self-review",
    authorId: "emp-subject",
    authorName: "Femi Balogun",
    questions: [
      text("q1", "How did the period go?", "A good one.", [pin()]),
      text("q2", "Where do they need support?", "Nothing really."),
    ],
    ...over,
  });

const mount = (
  props: Partial<Parameters<typeof ReviewFormCard>[0]> & {
    review: ApiReviewDetail;
  },
) =>
  render(
    <ReviewFormCard
      selfReview={null}
      selfLoading={false}
      ratingWords={words}
      {...props}
    />,
  );

afterEach(cleanup);

const rowOf = (prompt: string) =>
  within(screen.getByText(prompt).closest("li") as HTMLElement);

describe("in the two-column card", () => {
  it("puts the pins under the person's own answer, with the task as a link, the facts and the note", () => {
    mount({ review: manager(), selfReview: self() });
    const row = rowOf("How did the period go?");
    expect(row.getByText("A good one.")).toBeInTheDocument();
    expect(row.getByText("Work pinned to this answer")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "PLT-12" })).toHaveAttribute(
      "href",
      "/projects/tasks/i1",
    );
    expect(row.getByText("Finished 4 Nov 2026")).toBeInTheDocument();
    expect(row.getByText("Set by Pat Projects")).toBeInTheDocument();
    expect(row.getByText("Led it end to end")).toBeInTheDocument();
  });

  it("puts them in the person's column, not the manager's", () => {
    mount({ review: manager(), selfReview: self() });
    const row = screen.getByText("How did the period go?").closest("li");
    const grid = (row as HTMLElement).querySelector(
      ".sm\\:grid-cols-2",
    ) as HTMLElement;
    const [selfColumn, managerColumn] = Array.from(
      grid.children,
    ) as HTMLElement[];
    expect(selfColumn).toBeDefined();
    expect(managerColumn).toBeDefined();
    expect(
      within(selfColumn as HTMLElement).getByText("PLT-12"),
    ).toBeInTheDocument();
    expect(
      within(managerColumn as HTMLElement).queryByText("PLT-12"),
    ).not.toBeInTheDocument();
    expect(
      within(managerColumn as HTMLElement).getByText("Steady."),
    ).toBeInTheDocument();
  });

  it("never draws pins in the manager's column, even if a server sent some on it", () => {
    mount({
      review: manager({
        questions: [
          text("q1", "How did the period go?", "Steady.", [
            pin({ id: "wrong", issueId: "w1", key: "WRONG-1" }),
          ]),
          text("q2", "Where do they need support?", "Planning."),
        ],
      }),
      selfReview: self(),
    });
    expect(screen.queryByText("WRONG-1")).not.toBeInTheDocument();
    expect(screen.getByText("PLT-12")).toBeInTheDocument();
  });

  it("says nothing for a question the person pinned nothing to", () => {
    mount({ review: manager(), selfReview: self() });
    const row = rowOf("Where do they need support?");
    expect(row.queryByText(/pinned to this answer/)).not.toBeInTheDocument();
  });

  it("says whose choice it was, by name, to anybody else", () => {
    mount({ review: manager(), selfReview: self({ mine: false }) });
    expect(
      screen.getByText("Pinned by Femi Balogun on 5 Nov 2026"),
    ).toBeInTheDocument();
  });

  it("says it was the reader's own, to the person themselves", () => {
    mount({
      review: manager({ mine: false }),
      selfReview: self({ mine: true }),
    });
    expect(screen.getByText("Pinned by you on 5 Nov 2026")).toBeInTheDocument();
  });

  it("never draws a title, however one arrived", () => {
    mount({
      review: manager(),
      selfReview: self({
        questions: [
          text("q1", "How did the period go?", "A good one.", [
            { ...pin(), title: "Chemo schedule for Ada" },
          ]),
        ],
      }),
    });
    expect(screen.queryByText(/Chemo/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PLT-12" })).toBeInTheDocument();
  });

  it("leaves the card as it was for a server that sends no pins", () => {
    mount({
      review: manager(),
      selfReview: self({
        questions: [
          text("q1", "How did the period go?", "A good one."),
          text("q2", "Where do they need support?", "Nothing really."),
        ],
      }),
    });
    expect(screen.queryByText(/pinned to this answer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Pinned/)).not.toBeInTheDocument();
  });

  it("draws pins on the person's answer to a question the manager was not asked", () => {
    mount({
      review: manager({ questions: [text("q9", "Another", "Fine.")] }),
      selfReview: self(),
    });
    const row = rowOf("How did the period go?");
    expect(row.getByText("Not asked")).toBeInTheDocument();
    expect(row.getByText("PLT-12")).toBeInTheDocument();
  });
});

describe("a review read on its own", () => {
  it("shows a self-review's pins to its own author, as theirs", () => {
    mount({ review: self({ mine: true, submitted: true }) });
    expect(screen.getByText("A good one.")).toBeInTheDocument();
    expect(screen.getByText("PLT-12")).toBeInTheDocument();
    expect(screen.getByText("Pinned by you on 5 Nov 2026")).toBeInTheDocument();
  });

  it("shows them to a reader, by the person's name", () => {
    mount({ review: self({ mine: false }) });
    expect(
      screen.getByText("Pinned by Femi Balogun on 5 Nov 2026"),
    ).toBeInTheDocument();
  });

  it("shows none on a manager's review read on its own, even if a server sent some", () => {
    mount({
      review: manager({
        questions: [text("q1", "How did the period go?", "Steady.", [pin()])],
      }),
    });
    expect(screen.queryByText(/pinned to this answer/)).not.toBeInTheDocument();
    expect(screen.queryByText("PLT-12")).not.toBeInTheDocument();
  });
});
