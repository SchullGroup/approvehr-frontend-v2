import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ApiScoringWeights, WeightSet } from "@/lib/api/performance";
import {
  PeriodWeights,
  periodWeightsProblem,
  weightsFromText,
  weightsToText,
  type WeightText,
} from "@/components/performance/period-weights";

/**
 * The per-period weights editor with the seventh part, Manager appraisal.
 *
 * A server that predates the part sends no weight for it, and then there must be
 * no row: a weight the server drops is a control that looks saved and moves no
 * mark, and a 0 sent for it would write over one set on a newer screen. These
 * cases hold both halves, and the six-key set is the one the older tests use.
 */

const SIX: WeightSet = {
  OBJECTIVES: 4000,
  TASKS: 0,
  CORE_COMPETENCY: 2500,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  SELF_ASSESSMENT: 0,
};
const SEVEN: WeightSet = { ...SIX, MANAGER_APPRAISAL: 0 };

const defaults = (managerRow: boolean, label = "Manager appraisal") =>
  ({
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
      ...(managerRow
        ? [{ component: "MANAGER_APPRAISAL", label, weightBp: 0 }]
        : []),
      { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: 0 },
    ],
    totalBp: 10000,
    selfAssessmentNote: "",
  }) as ApiScoringWeights;

function Harness({
  start,
  company,
  readOnly,
}: {
  start: WeightText;
  company: ApiScoringWeights;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState<WeightText>(start);
  return (
    <PeriodWeights
      value={value}
      onChange={setValue}
      companyDefaults={company}
      {...(readOnly ? { readOnly: true } : {})}
    />
  );
}

const rowLabels = () =>
  Array.from(document.querySelectorAll("[data-weight-row]")).map(
    (row) => row.querySelector("p")?.textContent ?? "",
  );

describe("the text a period's weights are typed as", () => {
  it("carries the seventh part when the server did, and round-trips it in basis points", () => {
    const text = weightsToText({ ...SEVEN, MANAGER_APPRAISAL: 3000 });
    expect(text.MANAGER_APPRAISAL).toBe("30");
    expect(weightsFromText(text)).toEqual({
      ...SEVEN,
      MANAGER_APPRAISAL: 3000,
    });
  });

  it("holds no key for it from a server that predates it, and sends none", () => {
    const text = weightsToText(SIX);
    expect("MANAGER_APPRAISAL" in text).toBe(false);
    const back = weightsFromText(text);
    expect("MANAGER_APPRAISAL" in back).toBe(false);
    expect(back).toEqual(SIX);
  });

  it("refuses a decimal in the new row, as in the others", () => {
    const text = { ...weightsToText(SEVEN), MANAGER_APPRAISAL: "12.5" };
    expect(periodWeightsProblem(text)).toBe(
      "Each weight is a whole number from 0 to 100.",
    );
  });

  it("is happy with the new part as the only weight above zero", () => {
    const text = weightsToText({
      OBJECTIVES: 0,
      TASKS: 0,
      CORE_COMPETENCY: 0,
      BEHAVIOURAL_COMPETENCY: 0,
      LEADERSHIP: 0,
      MANAGER_APPRAISAL: 100,
      SELF_ASSESSMENT: 0,
    });
    expect(periodWeightsProblem(text)).toBeNull();
  });

  it("still refuses every part at zero, with or without the new one", () => {
    const zero = (managerRow: boolean) =>
      weightsToText({
        OBJECTIVES: 0,
        TASKS: 0,
        CORE_COMPETENCY: 0,
        BEHAVIOURAL_COMPETENCY: 0,
        LEADERSHIP: 0,
        ...(managerRow ? { MANAGER_APPRAISAL: 0 } : {}),
        SELF_ASSESSMENT: 0,
      });
    expect(periodWeightsProblem(zero(true))).toBe(
      "Give at least one part a weight above 0%.",
    );
    expect(periodWeightsProblem(zero(false))).toBe(
      "Give at least one part a weight above 0%.",
    );
  });

  it("does not hold a missing later part against a set that is otherwise whole", () => {
    expect(periodWeightsProblem(weightsToText(SIX))).toBeNull();
  });
});

describe("the editor", () => {
  it("draws a row for the new part, before Self-assessment, when the server has it", () => {
    render(<Harness start={weightsToText(SEVEN)} company={defaults(true)} />);
    expect(rowLabels()).toEqual([
      "Delivery against objectives",
      "Weekly tasks",
      "Core competencies",
      "Behavioural competencies",
      "Leadership",
      "Manager appraisal",
      "Self-assessment",
    ]);
  });

  it("draws six rows and says nothing about the part for a server that predates it", () => {
    render(<Harness start={weightsToText(SIX)} company={defaults(false)} />);
    expect(rowLabels()).toHaveLength(6);
    expect(screen.queryByText(/Manager appraisal/)).toBeNull();
    expect(screen.queryByText(/overall mark/i)).toBeNull();
  });

  it("counts the new row in the total as it is typed", async () => {
    render(<Harness start={weightsToText(SEVEN)} company={defaults(true)} />);
    expect(
      within(screen.getByTestId("weights-total")).getByText("100%"),
    ).toBeInTheDocument();
    const field = screen.getByRole("spinbutton", { name: "Manager appraisal" });
    await userEvent.clear(field);
    await userEvent.type(field, "30");
    expect(
      within(screen.getByTestId("weights-total")).getByText("130%"),
    ).toBeInTheDocument();
  });

  it("says what happens to the share where no appraiser has sent a mark, in the company's own name for the part", () => {
    render(
      <Harness
        start={weightsToText(SEVEN)}
        company={defaults(true, "Line view")}
      />,
    );
    expect(
      screen.getByText(
        "If no appraiser has sent an overall mark for someone, the Line view share is spread over the other parts.",
      ),
    ).toBeInTheDocument();
    expect(rowLabels()).toContain("Line view");
  });

  it("goes back to the company's set when asked, new row included", async () => {
    render(<Harness start={weightsToText(SEVEN)} company={defaults(true)} />);
    const field = screen.getByRole("spinbutton", { name: "Manager appraisal" });
    await userEvent.clear(field);
    await userEvent.type(field, "40");
    expect(field).toHaveValue(40);
    await userEvent.click(
      screen.getByRole("button", { name: "Use the company defaults" }),
    );
    expect(
      screen.getByRole("spinbutton", { name: "Manager appraisal" }),
    ).toHaveValue(0);
  });

  it("does not bring the row back on a reset against a server that has no part", async () => {
    render(<Harness start={weightsToText(SIX)} company={defaults(false)} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Use the company defaults" }),
    );
    expect(rowLabels()).toHaveLength(6);
  });

  it("reads the new part off a started period, with no field", () => {
    render(
      <Harness
        readOnly
        start={weightsToText({ ...SEVEN, MANAGER_APPRAISAL: 3000 })}
        company={defaults(true)}
      />,
    );
    const row = screen
      .getByText("Manager appraisal")
      .closest("[data-weight-row]");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("30%")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
