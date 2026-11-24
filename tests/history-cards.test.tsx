import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiScoreHistory } from "@/lib/api/performance";
import { ScoreHistoryScreen } from "@/app/(app)/performance/history/[employeeId]/history-screen";

/**
 * The appraisal history page, as cards (owner redesign, 24 Nov 2026): the name
 * with job title and department, a card per period newest first showing only
 * the essentials, a detail opened by clicking, and no stat cards, trend chart,
 * tabs or "no score" lines.
 */

const state = vi.hoisted(() => ({
  history: null as unknown,
  error: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/history/emp-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useScoreHistory: () => ({
    history: state.history,
    loading: false,
    error: state.error,
    available: true,
    refusal: "",
    reload: () => {},
  }),
}));

const part = (over: Record<string, unknown>) => ({
  component: "OBJECTIVES",
  label: "Objectives",
  scoreBp: 7000,
  weightBp: 4000,
  effectiveWeightBp: 4000,
  included: true,
  excludedBecause: null,
  excludedNote: null,
  evidenceCount: 3,
  ...over,
});

const point = (over: Record<string, unknown>) => ({
  cycleId: "c-1",
  cycleName: "H1 2026 Appraisal",
  stage: "PUBLISHED",
  dueDate: "2026-07-15",
  weightsFrom: "snapshot",
  scoreBp: 6250,
  scorePercent: 62.5,
  scoreOutOf5: 3.5,
  band: "MEETS",
  bandLabel: "Meets expectations",
  changeBp: null,
  components: [
    part({}),
    part({
      component: "CORE_COMPETENCY",
      label: "Core competencies",
      scoreBp: 5000,
      weightBp: 6000,
      effectiveWeightBp: 6000,
    }),
    part({
      component: "LEADERSHIP",
      label: "Leadership",
      scoreBp: null,
      included: false,
      effectiveWeightBp: 0,
      excludedBecause: "NOT_A_MANAGER",
      excludedNote: "They manage nobody.",
      evidenceCount: 0,
    }),
  ],
  objectives: {
    agreed: 1,
    awaitingApproval: 0,
    draft: 0,
    needsRevision: 0,
    measured: 0,
  },
  appraiserMark: { ratingBp: null, appraisers: 0, submittedWeightBp: 0 },
  signOff: {
    reviewId: null,
    submitted: false,
    finalised: false,
    finalisedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
    disputed: false,
    disputedAt: null,
    employeeComment: null,
  },
  exceptions: [],
  ...over,
});

const history = (over: Partial<ApiScoreHistory> = {}): ApiScoreHistory =>
  ({
    employeeId: "emp-1",
    employeeName: "Musa Onyeka",
    jobTitle: "QA Engineer",
    departmentId: "d",
    departmentName: "Engineering",
    points: [
      point({}),
      point({
        cycleId: "c-2",
        cycleName: "H2 2026 Appraisal",
        scoreBp: null,
        scoreOutOf5: null,
        band: null,
        bandLabel: null,
        stage: "SELF",
      }),
    ],
    counts: { cycles: 2, scored: 1, unscored: 1 },
    unscoredCycles: ["H2 2026 Appraisal"],
    trend: null,
    truncated: false,
    limit: 12,
    withheldCycles: 0,
    withheldNote: null,
    ...over,
  }) as ApiScoreHistory;

beforeEach(() => {
  state.history = history();
  state.error = null;
});
afterEach(cleanup);

const open = () => render(<ScoreHistoryScreen employeeId="emp-1" />);

describe("the page", () => {
  it("has the name, then the job title and department, and none of the old furniture", () => {
    open();
    expect(
      screen.getByRole("heading", { name: "Musa Onyeka" }),
    ).toBeInTheDocument();
    expect(screen.getByText("QA Engineer · Engineering")).toBeVisible();
    for (const gone of [
      /periods?, \d with no score/,
      /^\d+ periods?$/,
      "Latest score",
      "Periods with a score",
      "Across the whole span",
      "The scores, in order",
      /has no score\./,
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("Work record")).not.toBeInTheDocument();
  });

  it("is a card per period, newest first, with only the essentials", () => {
    open();
    const cards = screen.getAllByRole("button", { name: /Appraisal/ });
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("H2 2026 Appraisal"),
      expect.stringContaining("H1 2026 Appraisal"),
    ]);
    expect(
      within(cards[0] as HTMLElement).getByText("No score yet"),
    ).toBeVisible();
    expect(
      within(cards[1] as HTMLElement).getByText(/Meets expectations/),
    ).toBeVisible();
    /* Nothing of the breakdown until it is clicked. */
    expect(screen.queryByText("Core competencies")).not.toBeInTheDocument();
  });

  it("says nothing is there yet, with no score claimed, for a person no period has covered", () => {
    state.history = history({
      points: [],
      counts: { cycles: 0, scored: 0, unscored: 0 },
    });
    open();
    expect(
      screen.getByText("No appraisal period has covered them yet"),
    ).toBeVisible();
  });

  it("explains a period held back from the person themselves", () => {
    state.history = history({
      withheldCycles: 1,
      withheldNote: "One period is not final yet.",
    });
    open();
    expect(screen.getByText("One period is not final yet.")).toBeVisible();
  });

  it("shows the server's own sentence when the read is refused", () => {
    state.history = null;
    state.error = new ApiError(403, "forbidden", "Not yours to read.");
    open();
    expect(screen.getByText("Not yours to read.")).toBeVisible();
  });
});

describe("a period opened", () => {
  it("shows the score by part as cards with charts, and a part with nothing as Not scored", async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: /H1 2026 Appraisal/ }),
    );
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("What the score is made of")).toBeVisible();
    expect(within(drawer).getByText("How each part scored")).toBeVisible();
    expect(
      within(drawer).getAllByText("Core competencies").length,
    ).toBeGreaterThan(0);
    const leadership = within(drawer)
      .getAllByText("Leadership")
      .map((node) => node.closest("li"))
      .find((li) => li?.textContent?.includes("Not scored"));
    expect(leadership).toBeTruthy();
    expect(within(drawer).queryByText(/Nothing recorded/)).toBeNull();
    expect(within(drawer).queryByText(/(^|\s)0%/)).toBeNull();
  });

  it("keeps the frozen-weights note behind an info icon, not in the text", async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: /H1 2026 Appraisal/ }),
    );
    expect(
      screen.getByRole("button", { name: "About frozen weights" }),
    ).toBeInTheDocument();
  });

  it("closes back to the cards", async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: /H1 2026 Appraisal/ }),
    );
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
