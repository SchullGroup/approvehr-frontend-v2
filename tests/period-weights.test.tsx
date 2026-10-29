import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ApiScoringWeights, ScoreComponent } from "@/lib/api/performance";
import {
  PeriodWeights,
  periodWeightsProblem,
  weightsFromText,
  weightsToText,
  type WeightText,
} from "@/components/performance/period-weights";

/**
 * The per-period weights editor: six rows, whole percents, total exactly 100.
 *
 * The wrong answer here is silent. A decimal that slips through becomes 99.99%
 * on the wire and a server refusal the person cannot connect to a field; a
 * Weekly tasks row that is missing, or out of order, changes what the mark is
 * made of without anybody having been shown it.
 */

const ORDER: ScoreComponent[] = [
  "OBJECTIVES",
  "TASKS",
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
  "SELF_ASSESSMENT",
];

const defaults: ApiScoringWeights = {
  source: "default",
  rows: [
    {
      component: "OBJECTIVES",
      label: "Delivery against objectives",
      weightBp: 4000,
    },
    { component: "TASKS", label: "Weekly tasks", weightBp: 0 },
    {
      component: "CORE_COMPETENCY",
      label: "Core competencies",
      weightBp: 2500,
    },
    {
      component: "BEHAVIOURAL_COMPETENCY",
      label: "Behavioural competencies",
      weightBp: 2000,
    },
    { component: "LEADERSHIP", label: "Leadership", weightBp: 1500 },
    { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: 0 },
  ],
  totalBp: 10000,
  selfAssessmentNote: "",
};

function Harness({
  start,
  onValue,
  readOnly,
  basis,
}: {
  start?: WeightText;
  onValue?: (value: WeightText) => void;
  readOnly?: boolean;
  basis?: "period" | "company" | "frozen";
}) {
  const [value, setValue] = useState<WeightText>(
    start ??
      weightsToText(
        Object.fromEntries(
          defaults.rows.map((r) => [r.component, r.weightBp]),
        ) as Record<ScoreComponent, number>,
      ),
  );
  return (
    <PeriodWeights
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      companyDefaults={defaults}
      {...(readOnly ? { readOnly: true } : {})}
      {...(basis ? { basis } : {})}
    />
  );
}

describe("the weights helpers", () => {
  it("converts whole percents to basis points and back", () => {
    const text = weightsToText({
      OBJECTIVES: 2500,
      TASKS: 1500,
      CORE_COMPETENCY: 2500,
      BEHAVIOURAL_COMPETENCY: 2000,
      LEADERSHIP: 1500,
      SELF_ASSESSMENT: 0,
    });
    expect(text.TASKS).toBe("15");
    expect(weightsFromText(text)).toEqual({
      OBJECTIVES: 2500,
      TASKS: 1500,
      CORE_COMPETENCY: 2500,
      BEHAVIOURAL_COMPETENCY: 2000,
      LEADERSHIP: 1500,
      SELF_ASSESSMENT: 0,
    });
  });

  it("is happy at exactly 100 and says why otherwise", () => {
    const ok = weightsToText({
      OBJECTIVES: 4000,
      TASKS: 0,
      CORE_COMPETENCY: 2500,
      BEHAVIOURAL_COMPETENCY: 2000,
      LEADERSHIP: 1500,
      SELF_ASSESSMENT: 0,
    });
    expect(periodWeightsProblem(ok)).toBeNull();
    expect(periodWeightsProblem({ ...ok, TASKS: "5" })).toBe(
      "These must add up to 100%.",
    );
  });

  it("refuses decimals, blanks and out-of-range, so 99.99 cannot pass", () => {
    const ok = weightsToText({
      OBJECTIVES: 4000,
      TASKS: 0,
      CORE_COMPETENCY: 2500,
      BEHAVIOURAL_COMPETENCY: 2000,
      LEADERSHIP: 1500,
      SELF_ASSESSMENT: 0,
    });
    expect(
      periodWeightsProblem({ ...ok, OBJECTIVES: "39.99", TASKS: "0.01" }),
    ).not.toBeNull();
    expect(periodWeightsProblem({ ...ok, TASKS: "" })).not.toBeNull();
    expect(periodWeightsProblem({ ...ok, OBJECTIVES: "-1" })).not.toBeNull();
    expect(periodWeightsProblem({ ...ok, OBJECTIVES: "101" })).not.toBeNull();
  });
});

describe("<PeriodWeights />", () => {
  it("renders six rows in component order, with Weekly tasks at 0%", () => {
    render(<Harness />);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(6);
    const labels = ORDER.map(
      (c) => defaults.rows.find((r) => r.component === c)!.label,
    );
    const rendered = inputs.map(
      (i) => (i as HTMLInputElement).labels?.[0]?.textContent,
    );
    expect(rendered).toEqual(labels);
    expect(screen.getByLabelText("Weekly tasks")).toHaveValue(0);
    expect(screen.getByLabelText("Delivery against objectives")).toHaveValue(
      40,
    );
    expect(screen.getByText("How the mark is made up")).toBeInTheDocument();
  });

  it("shows the running total and the rule only when it is not 100", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.queryByText("These must add up to 100%."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("weights-total")).toHaveTextContent("100%");
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "10");
    expect(screen.getByTestId("weights-total")).toHaveTextContent("110%");
    expect(screen.getByText("These must add up to 100%.")).toBeInTheDocument();
  });

  it("flags a decimal on its row", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "2.5");
    expect(screen.getByLabelText("Weekly tasks")).toBeInvalid();
    expect(
      screen.getByText("Whole numbers only, 0 to 100."),
    ).toBeInTheDocument();
  });

  it("says what happens to the Weekly tasks share when nobody has graded tasks", () => {
    render(<Harness />);
    expect(
      screen.getByText(
        "If someone has no graded weekly tasks against this period's objectives, the Weekly tasks share is spread over the other parts.",
      ),
    ).toBeInTheDocument();
  });

  it("'Use the company defaults' resets the rows", async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<Harness onValue={seen} />);
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "20");
    await user.click(
      screen.getByRole("button", { name: "Use the company defaults" }),
    );
    expect(screen.getByLabelText("Weekly tasks")).toHaveValue(0);
    expect(screen.getByLabelText("Delivery against objectives")).toHaveValue(
      40,
    );
  });

  it("is read-only once the period has started", () => {
    render(<Harness readOnly basis="frozen" />);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Use the company defaults" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Fixed when this period started."),
    ).toBeInTheDocument();
    const row = screen
      .getByText("Weekly tasks")
      .closest("[data-weight-row]") as HTMLElement;
    expect(within(row).getByText("0%")).toBeInTheDocument();
    const obj = screen
      .getByText("Delivery against objectives")
      .closest("[data-weight-row]") as HTMLElement;
    expect(within(obj).getByText("40%")).toBeInTheDocument();
  });

  it("does not claim a started period was fixed when it follows the company", () => {
    render(<Harness readOnly basis="company" />);
    expect(
      screen.queryByText("Fixed when this period started."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This period follows the company's weights as they are today.",
      ),
    ).toBeInTheDocument();
  });
});
