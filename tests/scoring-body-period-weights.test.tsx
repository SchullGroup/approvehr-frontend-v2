import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCycle,
  ApiScoringWeights,
  ScoreComponent,
} from "@/lib/api/performance";

/**
 * "How a score is made", on the Overview, for the person being scored.
 *
 * It listed the company's current weights over a mark made from the period's, and
 * listed Weekly tasks at 0% over a company that has no such part (F44). It lists
 * the parts the period's mark was made from, says whose weights they are, and
 * never lists a part that does not count.
 */

const store = vi.hoisted(() => ({
  weights: null as unknown,
  loading: false,
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringWeights: () => ({
    weights: store.weights,
    loading: store.loading,
  }),
  useRatingScale: () => ({
    scale: {
      levels: [
        { level: 1, label: "Poor" },
        { level: 5, label: "Excellent" },
      ],
    },
    loading: false,
  }),
}));

const { ScoringSettingsBody } = await import("@/app/(app)/performance/now");

const company = (
  weightsBp: Partial<Record<ScoreComponent, number>>,
): ApiScoringWeights => ({
  source: "saved",
  rows: (
    [
      ["OBJECTIVES", "Delivery against objectives"],
      ["TASKS", "Weekly tasks"],
      ["CORE_COMPETENCY", "Core competencies"],
      ["BEHAVIOURAL_COMPETENCY", "Behavioural competencies"],
      ["LEADERSHIP", "Leadership"],
      ["MANAGER_APPRAISAL", "Manager appraisal"],
      ["SELF_ASSESSMENT", "Their own rating"],
    ] as const
  ).map(([component, label]) => ({
    component,
    label,
    weightBp: weightsBp[component] ?? 0,
    isPart: component in weightsBp,
  })),
  totalBp: 10000,
  selfAssessmentNote: "",
});

const cycle = (weights?: ApiCycle["weights"]): ApiCycle =>
  ({
    id: "cycle-1",
    name: "Q4 2026 appraisal",
    stage: "SELF",
    weights,
  }) as ApiCycle;

const FROZEN: NonNullable<ApiCycle["weights"]> = {
  basis: "frozen",
  values: {
    OBJECTIVES: 4000,
    TASKS: 0,
    CORE_COMPETENCY: 2500,
    BEHAVIOURAL_COMPETENCY: 2000,
    LEADERSHIP: 1500,
    MANAGER_APPRAISAL: 0,
    SELF_ASSESSMENT: 0,
  },
  parts: [
    "OBJECTIVES",
    "CORE_COMPETENCY",
    "BEHAVIOURAL_COMPETENCY",
    "LEADERSHIP",
  ],
};

const NOW = company({
  OBJECTIVES: 2000,
  CORE_COMPETENCY: 2000,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  MANAGER_APPRAISAL: 1000,
  SELF_ASSESSMENT: 1500,
});

beforeEach(() => {
  store.weights = NOW;
  store.loading = false;
});

const rowsOf = () =>
  [...document.querySelectorAll("dt")].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);

describe("the Overview's How a score is made", () => {
  it("lists what the period's mark was made from, not the company's set as it is now", () => {
    render(<ScoringSettingsBody canManage={false} period={cycle(FROZEN)} />);
    expect(rowsOf()).toEqual([
      ["Delivery against objectives", "40%"],
      ["Core competencies", "25%"],
      ["Behavioural competencies", "20%"],
      ["Leadership", "15%"],
    ]);
    expect(
      screen.getByText("Q4 2026 appraisal. Locked when this period started."),
    ).toBeInTheDocument();
  });

  it("never lists a part at 0%, or one the period was not made of", () => {
    render(<ScoringSettingsBody canManage={false} period={cycle(FROZEN)} />);
    expect(screen.queryByText(/Weekly tasks/)).toBeNull();
    expect(screen.queryByText(/Their own rating/)).toBeNull();
    expect(screen.queryByText(/Manager appraisal/)).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("says a period that set its own weights set them", () => {
    render(
      <ScoringSettingsBody
        canManage
        period={cycle({
          basis: "period",
          values: { ...FROZEN.values, LEADERSHIP: 1000, SELF_ASSESSMENT: 2000 },
          parts: [...(FROZEN.parts ?? []), "SELF_ASSESSMENT"],
        })}
      />,
    );
    expect(
      screen.getByText(/Q4 2026 appraisal\. Set for this period\./),
    ).toBeInTheDocument();
    expect(rowsOf()).toContainEqual(["Their own rating", "17.39%"]);
  });

  it("falls back to the company's weights as they are today, and says so, with no period", () => {
    render(<ScoringSettingsBody canManage={false} period={undefined} />);
    expect(rowsOf().map(([name]) => name)).toEqual([
      "Delivery against objectives",
      "Core competencies",
      "Behavioural competencies",
      "Leadership",
      "Manager appraisal",
      "Their own rating",
    ]);
    expect(
      screen.getByText("Your company's weights as they are today."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Weekly tasks/)).toBeNull();
  });

  it("falls back the same way where the server sent the period no weights, and claims nothing about them", () => {
    render(<ScoringSettingsBody canManage={false} period={cycle(undefined)} />);
    expect(rowsOf()).toHaveLength(6);
    expect(
      screen.getByText("Your company's weights as they are today."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).toBeNull();
  });

  it("waits for the weights, and lists nothing while it does", () => {
    store.weights = null;
    store.loading = true;
    render(<ScoringSettingsBody canManage={false} period={cycle(FROZEN)} />);
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    expect(rowsOf()).toEqual([]);
  });
});
