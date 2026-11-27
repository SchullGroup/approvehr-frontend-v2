import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fairness check opens on the thing to do (owner, 27 Nov 2026): the people
 * to review when anybody is flagged, with no row of statistic tiles, and only the
 * groupings where a gap was found, each as one chart with no switch.
 */

let flagged = 0;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/c1/fairness",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/performance", () => ({
  FAIRNESS_OFFLINE: "Offline.",
  useReviewFlags: () => ({
    flags:
      flagged > 0
        ? { counts: { below: flagged, above: 0 }, people: [] }
        : { counts: { below: 0, above: 0 }, people: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCycleFairness: () => ({
    available: true,
    loading: false,
    error: null,
    reload: vi.fn(),
    cycle: {
      id: "c1",
      name: "H2 2026",
      stage: "CALIBRATION",
      stageLabel: "Calibration",
    },
    fairness: {
      compared: 12,
      inPeriod: 12,
      averageBp: 6500,
      periods: [],
      skipped: [{ name: "Ada", reason: "No score" }],
      rules: { minGroup: 5, minGapBp: 500, likelyRange: "" },
      managers: {
        managers: [],
        hidden: { managers: 0, people: 0 },
        noManager: 0,
        rules: { minRated: 3, apartBp: 800, flatBelowSpreadBp: null },
      },
      calibration: { moved: 0, up: 0, down: 0, byGroup: [], latest: [] },
      dimensions: [
        {
          key: "gender",
          label: "Gender",
          groups: [
            {
              label: "Female",
              people: 6,
              meanBp: 6000,
              lowBp: null,
              highBp: null,
            },
          ],
          hidden: [],
          notRecorded: 0,
          flags: [{ label: "Female", against: null, gapBp: -700 }],
        },
        {
          key: "age",
          label: "Age band",
          groups: [
            {
              label: "20 to 29",
              people: 6,
              meanBp: 6500,
              lowBp: null,
              highBp: null,
            },
          ],
          hidden: [],
          notRecorded: 0,
          flags: [],
        },
      ],
    },
  }),
}));
vi.mock("@/app/(app)/performance/periods/[id]/fairness/charts", () => ({
  RangeChart: ({ caption }: { caption: string }) => <div>{caption}</div>,
  pct: (bp: number) => `${String(bp / 100)}%`,
  points: (bp: number) => `${String(bp / 100)} pts`,
}));
vi.mock(
  "@/app/(app)/performance/periods/[id]/fairness/people-to-review",
  () => ({
    PeopleToReview: () => <div>the review queue</div>,
    flaggedCount: (f: { counts: { below: number; above: number } } | null) =>
      f ? f.counts.below + f.counts.above : 0,
  }),
);

const { FairnessScreen } =
  await import("@/app/(app)/performance/periods/[id]/fairness/fairness-screen");

beforeEach(() => {
  flagged = 0;
});

describe("the fairness check", () => {
  it("opens on the people to review when anybody is flagged, with no statistic tiles", () => {
    flagged = 2;
    render(<FairnessScreen cycleId="c1" />);
    expect(screen.getByText("the review queue")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /People to review/ }),
    ).toHaveAttribute("aria-selected", "true");
    for (const tile of [
      "Scores compared",
      "Gaps flagged",
      "Groups hidden",
      "Company average",
    ]) {
      expect(screen.queryByText(tile)).toBeNull();
    }
    expect(screen.queryByText("How flags work")).toBeNull();
  });

  it("opens on the groups when nobody is flagged, and shows only the flagged grouping", () => {
    render(<FairnessScreen cycleId="c1" />);
    expect(screen.getByRole("tab", { name: /Groups/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.queryByText("Age band")).toBeNull();
    expect(screen.queryByText("No clear gap")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Table" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Table" })).toBeNull();
  });

  it("keeps how flags work behind one info icon on the title", () => {
    render(<FairnessScreen cycleId="c1" />);
    expect(
      screen.getByRole("button", { name: "How flags work" }),
    ).toBeInTheDocument();
  });
});
