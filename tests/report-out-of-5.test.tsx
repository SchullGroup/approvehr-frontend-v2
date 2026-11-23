import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DepartmentPerformance,
  Headline,
  TopPerformers,
} from "@/app/(app)/performance/periods/[id]/report/report-screen";
import type {
  ApiCycleReport,
  ApiScoreRegister,
  ApiScoreRow,
} from "@/lib/api/performance";

/**
 * The period report reads scores out of 5 beside the band word (UAT 23 Nov,
 * U88 / PERF-17): "Average mark 59.96%" made a straight 3 look like a bare
 * pass. No percentage is left for a person's score or an average.
 */

const row = (
  name: string,
  department: string,
  scoreBp: number | null,
  scoreOutOf5: number | null,
  bandLabel: string | null,
): ApiScoreRow =>
  ({
    employeeId: name,
    employeeName: name,
    jobTitle: "Analyst",
    departmentId: department,
    departmentName: department,
    scoreBp,
    scoreOutOf5,
    bandLabel,
  }) as unknown as ApiScoreRow;

const register = {
  rows: [
    row("Ada", "Finance", 7750, 4.1, "Exceeds Expectations"),
    row("Chidi", "Finance", 5000, 3, "Meets Expectations"),
    row("Halima", "Sales", null, null, null),
  ],
} as unknown as ApiScoreRegister;

const report = {
  marks: { people: 3 },
  distribution: {
    bands: [],
    scored: 2,
    unscored: 1,
    meanBp: 6375,
    meanOutOf5: 3.6,
  },
  weightsFrom: "frozen",
} as unknown as ApiCycleReport;

describe("the period report, out of 5", () => {
  it("gives the average as the API's figure out of 5, not a percentage", () => {
    render(<Headline report={report} />);
    const stat = screen
      .getByText("Average score")
      .closest("div")!.parentElement!;
    expect(within(stat).getByText("3.6")).toBeInTheDocument();
    expect(within(stat).queryByText(/%/)).toBeNull();
  });

  it("names each of the highest scores by its band word and figure", () => {
    render(<TopPerformers register={register} />);
    expect(
      screen.getAllByText("Exceeds Expectations · 4.1").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Meets Expectations · 3.0").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/77\.5%|50%/)).toBeNull();
  });

  it("gives a department's average out of 5, and none for a department nobody scored", () => {
    render(<DepartmentPerformance register={register} />);
    /* Finance: (7750 + 5000) / 2 = 6375, which is 3.6 out of 5. */
    expect(screen.getAllByText("3.6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No scores yet").length).toBeGreaterThan(0);
    expect(screen.queryByText(/63\.75%/)).toBeNull();
  });
});

/* U96 / PERF-16: a published period is a record. */
describe("the report of a published period", () => {
  it("does not say its people are everyone currently employed", () => {
    render(
      <Headline report={{ ...report, published: true } as ApiCycleReport} />,
    );
    expect(screen.getByText("People it covered")).toBeInTheDocument();
    expect(screen.queryByText("Everyone currently employed")).toBeNull();
  });

  it("a running one still says so", () => {
    render(
      <Headline report={{ ...report, published: false } as ApiCycleReport} />,
    );
    expect(screen.getByText("Everyone currently employed")).toBeInTheDocument();
  });

  it("does not call its highest scores the ones so far", () => {
    render(<TopPerformers register={register} published />);
    expect(
      screen.getByText("The highest scores in this period."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/so far/)).toBeNull();
  });
});
