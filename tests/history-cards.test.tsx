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
 * tabs or "no score" lines. The detail is the one list of parts the record of an
 * appraisal uses, with the stage in the one word it has everywhere.
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
        components: [
          part({
            scoreBp: null,
            included: false,
            effectiveWeightBp: 0,
            evidenceCount: 0,
            excludedBecause: "NO_EVIDENCE",
            excludedNote: "Nothing is recorded for this.",
          }),
        ],
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
    const cards = screen.getAllByRole("listitem");
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

  it("says the stage in its one word, never the raw token", () => {
    open();
    expect(screen.getByText("Due 15 Jul 2026 · Acknowledged")).toBeVisible();
    expect(screen.getByText("Due 15 Jul 2026 · Self")).toBeVisible();
    expect(screen.queryByText(/· (published|self|manager)\b/)).toBeNull();
  });

  it("opens only a period that has a part with something recorded", () => {
    open();
    expect(
      screen.getByRole("button", { name: /H1 2026 Appraisal/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /H2 2026 Appraisal/ }),
    ).toBeNull();
  });

  it("says nothing is there yet, in a plain line with no card or icon, for a person no period has covered", () => {
    state.history = history({
      points: [],
      counts: { cycles: 0, scored: 0, unscored: 0 },
    });
    open();
    const line = screen.getByText("No appraisal period has covered them yet");
    expect(line).toBeVisible();
    expect(line.tagName).toBe("P");
    expect(screen.queryByText(/show up here/)).toBeNull();
  });

  it("does not say how many periods are shown", () => {
    state.history = history({ truncated: true, limit: 8 });
    open();
    expect(screen.queryByText(/most recent periods/)).toBeNull();
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
  const openH1 = async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: /H1 2026 Appraisal/ }),
    );
    return screen.getByRole("dialog");
  };

  it("is one list of the parts that have a score, in out-of-5 words with the weight small", async () => {
    const drawer = await openH1();
    const list = within(drawer).getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Objectives");
    expect(rows[0]?.textContent).toContain("3.8 out of 5");
    expect(rows[0]?.textContent).toContain("40% weight");
    expect(rows[1]?.textContent).toContain("Core competencies");
    expect(rows[1]?.textContent).toContain("3.0 out of 5");
    /* One unit on the screen: never a percentage score. */
    expect(within(drawer).queryByText(/^\d+(\.\d+)?%$/)).toBeNull();
  });

  it("has no charts, no captions and no second tile list", async () => {
    const drawer = await openH1();
    for (const gone of [
      "What the score is made of",
      "How each part scored",
      "Share of the score by part",
      "Score by part, out of 100%",
      "Their view and their manager's",
    ]) {
      expect(within(drawer).queryByText(gone)).toBeNull();
    }
    expect(within(drawer).queryByText(/of the score$/)).toBeNull();
  });

  it("does not draw the big score again, since the card it was opened from has it", async () => {
    const drawer = await openH1();
    expect(within(drawer).queryByText(/Meets expectations/)).toBeNull();
  });

  it("leaves a part with nothing recorded out, and never as a zero", async () => {
    const drawer = await openH1();
    expect(within(drawer).queryByText("Leadership")).toBeNull();
    expect(
      within(drawer).queryByText(/Not scored|Nothing recorded/),
    ).toBeNull();
    expect(within(drawer).queryByText(/(^|\s)0%/)).toBeNull();
  });

  it("keeps what it has to say in one tooltip: frozen weights and why a part was left out", async () => {
    const drawer = await openH1();
    const button = within(drawer).getByRole("button", {
      name: "About this score",
    });
    await userEvent.click(button);
    const tip = screen.getByText(/Leadership was left out/);
    expect(tip).toHaveTextContent("scored with the weights it started with");
    expect(tip).toHaveTextContent("Leadership: They manage nobody.");
    expect(tip).toHaveTextContent("Leadership was left out");
  });

  it("closes back to the cards", async () => {
    await openH1();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
