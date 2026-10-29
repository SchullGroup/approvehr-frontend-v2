import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Parts } from "@/app/(app)/performance/periods/[id]/report/report-screen";
import {
  weightedParts,
  type ApiCycleReport,
  type ApiReportComponent,
} from "@/lib/api/performance";

/**
 * The report's "Parts of the mark" is about what the period appraises on.
 *
 * Found on the QA site: a period that weighted Delivery against objectives and
 * Weekly tasks at 0% still listed both, each with "Weighted at 0%, so it is
 * shown but not counted" beside it. A company that sets a part to nothing has
 * chosen not to appraise on it, and a row about it is noise on the screen a
 * company reads to see how its marks came out.
 */

const part = (
  component: ApiReportComponent["component"],
  label: string,
  weightBp: number,
  over: Partial<ApiReportComponent> = {},
): ApiReportComponent => ({
  component,
  label,
  weightBp,
  includedPeople: weightBp > 0 ? 2 : 0,
  meanBp: weightBp > 0 ? 7250 : null,
  excluded:
    weightBp > 0
      ? []
      : [
          {
            reason: "NOT_WEIGHTED",
            note: "Weighted at 0%, so it is shown but not counted.",
            people: 5,
          },
        ],
  ...over,
});

const report = (components: ApiReportComponent[]) =>
  ({ marks: { people: 5 }, components }) as unknown as ApiCycleReport;

const COMPONENTS = [
  part("OBJECTIVES", "Delivery against objectives", 0),
  part("TASKS", "Weekly tasks", 0),
  part("CORE_COMPETENCY", "Core competencies", 4500),
  part("BEHAVIOURAL_COMPETENCY", "Behavioural competencies", 4000),
  part("LEADERSHIP", "Leadership", 500),
  part("SELF_ASSESSMENT", "Self-assessment", 1000),
];

describe("weightedParts", () => {
  it("keeps a part with any weight and drops one weighted at nothing", () => {
    expect(weightedParts(COMPONENTS).map((one) => one.label)).toEqual([
      "Core competencies",
      "Behavioural competencies",
      "Leadership",
      "Self-assessment",
    ]);
  });

  it("keeps the smallest weight there is, because 0.01% is still a part of the mark", () => {
    expect(weightedParts([part("TASKS", "Weekly tasks", 1)])).toHaveLength(1);
  });

  it("keeps a part that is weighted and counted for nobody, which is a different fact from not being weighted", () => {
    /* Counted for 0 of 5 with weight on it means nothing was recorded; the
       company is appraising on it and the report has to say nobody was. */
    const unrecorded = part("LEADERSHIP", "Leadership", 500, {
      includedPeople: 0,
      meanBp: null,
      excluded: [
        {
          reason: "NO_DATA",
          note: "Nothing was recorded against this, so it is left out rather than scored 0.",
          people: 5,
        },
      ],
    });
    expect(weightedParts([unrecorded])).toEqual([unrecorded]);
  });
});

describe("the parts table", () => {
  it("has no row for a part the period weights at 0%", () => {
    render(<Parts report={report(COMPONENTS)} />);
    const table = screen.getByRole("table");
    expect(within(table).queryByText("Delivery against objectives")).toBeNull();
    expect(within(table).queryByText("Weekly tasks")).toBeNull();
    for (const label of [
      "Core competencies",
      "Behavioural competencies",
      "Leadership",
      "Self-assessment",
    ]) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
  });

  it("does not print the sentence that excuses a part nobody is appraised on", () => {
    render(<Parts report={report(COMPONENTS)} />);
    expect(screen.queryByText(/Weighted at 0%/)).toBeNull();
  });

  it("has none on the phone list either, which is drawn from the same parts", () => {
    const { container } = render(<Parts report={report(COMPONENTS)} />);
    const phone = container.querySelector("ul.sm\\:hidden");
    expect(phone).not.toBeNull();
    const items = phone!.querySelectorAll(":scope > li");
    expect(items).toHaveLength(4);
    expect(phone!.textContent).not.toContain("Weekly tasks");
    expect(phone!.textContent).not.toContain("Delivery against objectives");
  });

  it("still lists every part when every part has weight", () => {
    render(
      <Parts
        report={report(
          COMPONENTS.map((one, index) => ({
            ...one,
            weightBp: 1000 + index,
            includedPeople: 2,
            meanBp: 6000,
            excluded: [],
          })),
        )}
      />,
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      7,
    );
  });
});
