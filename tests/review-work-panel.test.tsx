import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * Where "Work this cycle" sits in the two reviews people write.
 *
 * What is proved: the self review shows what you did and the manager review
 * shows what the person it is about did, each one press away at the top of the
 * form; peer feedback shows neither; and the panel is handed the person the
 * review is about and the cycle it belongs to, so it can never be pointed at
 * somebody else.
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/ai", () => ({
  useDevelopmentSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale, editable: true }),
  useReviewMutations: () => ({ save: vi.fn(), send: vi.fn() }),
  useAppraisals: () => ({ loading: false, mine: { toComplete: [] } }),
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => <div data-testid="self-evidence" />,
}));
vi.mock("@/components/performance/work-this-cycle", () => ({
  WorkThisCycle: (props: Record<string, unknown>) => (
    <div
      data-testid="work-this-cycle"
      data-subject={String(props["subjectId"])}
      data-cycle={String(props["cycleId"])}
      data-own={String(props["own"])}
    />
  ),
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "SELF",
    kindLabel: "Self-review",
    cycleId: "c1",
    cycleName: "H2 2026",
    subjectId: "e1",
    subjectName: "Chidi Nwosu",
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
    dueDate: null,
    instructions: null,
    guideUrl: null,
    anonymous: false,
    mine: true,
    submitted: false,
    questions: [],
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("the self review", () => {
  it("has a button for what you did, and the drawer holds the record and the panel", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "What you did this period" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("self-evidence")).toBeInTheDocument();
    const panel = within(dialog).getByTestId("work-this-cycle");
    expect(panel).toHaveAttribute("data-subject", "e1");
    expect(panel).toHaveAttribute("data-cycle", "c1");
    expect(panel).toHaveAttribute("data-own", "true");
  });
});

describe("the manager's review", () => {
  const manager = {
    kind: "MANAGER" as const,
    kindLabel: "Manager review",
    subjectId: "e9",
    subjectName: "Ngozi Eze",
    mine: true,
  };

  it("has a button for what the person did, and the drawer holds the panel about them", async () => {
    mount(manager);
    await userEvent.click(
      screen.getByRole("button", { name: "What Ngozi did this period" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "What Ngozi did this period",
      }),
    ).toBeInTheDocument();
    const panel = within(dialog).getByTestId("work-this-cycle");
    expect(panel).toHaveAttribute("data-subject", "e9");
    expect(panel).toHaveAttribute("data-own", "false");
  });

  it("never shows the writer's own objectives and tasks under the person's name", async () => {
    mount(manager);
    await userEvent.click(
      screen.getByRole("button", { name: "What Ngozi did this period" }),
    );
    expect(screen.queryByTestId("self-evidence")).toBeNull();
  });

  it("offers it from the introduction too", async () => {
    mount(manager);
    expect(
      screen.getByRole("button", { name: "See what Ngozi did this period" }),
    ).toBeInTheDocument();
  });
});

describe("peer feedback", () => {
  it("has no work button and no panel", () => {
    mount({ kind: "PEER", kindLabel: "Peer feedback", mine: true });
    expect(
      screen.queryByRole("button", { name: /did this period/ }),
    ).toBeNull();
    expect(screen.queryByTestId("work-this-cycle")).toBeNull();
  });
});
