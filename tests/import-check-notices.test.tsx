import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckNotices } from "@/components/imports/check-notices";
import { checkMappedRows } from "@/lib/imports/check";
import { OBJECTIVES, countUnfiled } from "@/lib/imports/objectives";
import type { CheckedRowFacts } from "@/lib/imports/spec";

/**
 * The sentence above the check report: an objective filed in no appraisal period
 * counts towards nobody's mark, and a collapsed "Appraisal period" group is not
 * where somebody should have to go to find that out.
 *
 * What `tsc` cannot see, and these pin: that the count is the rows carrying the
 * warning and not a second reading of the file (so the number and the report
 * cannot disagree), that a row the report is skipping is never counted, that the
 * warning is found by its field and not by its words, and that the browser's own
 * check produces rows this count recognises.
 */

vi.mock("@/app/(app)/performance/kpis/import/access", () => ({
  useCanUploadObjectives: () => true,
}));
vi.mock("@/app/(app)/performance/kpis/import/lists", () => ({
  useObjectiveTemplateLists: () => ({ lists: {}, ready: true }),
}));

const { OBJECTIVES_IMPORT_SURFACE } =
  await import("@/app/(app)/performance/kpis/import/surface");

const PERIOD = OBJECTIVES.heading["period"] as string;

const unfiledRow = (over: Partial<CheckedRowFacts> = {}): CheckedRowFacts => ({
  action: "create",
  problems: [{ field: PERIOD, severity: "warning" }],
  ...over,
});

const noticesFor = (rows: readonly CheckedRowFacts[]) =>
  OBJECTIVES_IMPORT_SURFACE.checkNotices?.(rows) ?? [];

describe("counting the objectives that will be filed in no period", () => {
  it("counts the rows that carry the period warning", () => {
    expect(countUnfiled([unfiledRow(), unfiledRow(), unfiledRow()])).toBe(3);
  });

  it("counts nothing for a file where every row has a period", () => {
    const filed: CheckedRowFacts = { action: "create", problems: [] };
    expect(countUnfiled([filed, filed])).toBe(0);
    expect(countUnfiled([])).toBe(0);
  });

  it("does not count a row that is being skipped", () => {
    /* It is not going to be filed in anything. */
    expect(countUnfiled([unfiledRow({ action: "skip" })])).toBe(0);
  });

  it("does not count a warning about some other column", () => {
    const phone: CheckedRowFacts = {
      action: "create",
      problems: [
        {
          field: OBJECTIVES.heading["department"] as string,
          severity: "warning",
        },
      ],
    };
    expect(countUnfiled([phone])).toBe(0);
  });

  it("does not count an error on the period column", () => {
    /* "There is no appraisal period called X" is a refusal, handled on its own. */
    expect(
      countUnfiled([
        { action: "create", problems: [{ field: PERIOD, severity: "error" }] },
      ]),
    ).toBe(0);
  });

  it("counts a row once however many things it has to say", () => {
    const busy: CheckedRowFacts = {
      action: "create",
      problems: [
        { field: PERIOD, severity: "warning" },
        { field: OBJECTIVES.heading["measure"] as string, severity: "warning" },
      ],
    };
    expect(countUnfiled([busy])).toBe(1);
  });

  it("finds the warning by its field, whatever the column was called", () => {
    /* The report names the heading it was sent; `scored_in` is one of the
       period column's own aliases, so it is the same column. A count that
       matched on the warning's words would stop counting the day somebody
       rewords it, and fail silent. */
    expect(
      countUnfiled([
        {
          action: "create",
          problems: [{ field: "scored_in", severity: "warning" }],
        },
      ]),
    ).toBe(1);
    /* "Period" is the Due quarter column's alias, not this one. */
    expect(
      countUnfiled([
        {
          action: "create",
          problems: [{ field: "Period", severity: "warning" }],
        },
      ]),
    ).toBe(0);
  });
});

describe("the notice the objectives screen puts above the report", () => {
  it("says nothing when nothing is filed in no period", () => {
    expect(noticesFor([])).toEqual([]);
    expect(noticesFor([{ action: "create", problems: [] }])).toEqual([]);
  });

  it("says how many, once, as a warning and never a blocker", () => {
    const rows = Array.from({ length: 12 }, () => unfiledRow());
    const [notice, ...rest] = noticesFor(rows);

    expect(rest).toEqual([]);
    expect(notice?.tone).toBe("warning");
    expect(notice?.title).toBe("12 objectives have no appraisal period");
    /* The consequence, and that it does not stop anything. */
    expect(notice?.body).toContain("They still import");
    expect(notice?.body).toContain(
      "counts towards nobody's appraisal mark, even once it is agreed",
    );
  });

  it("names the three ways out, each of which exists", () => {
    const [notice] = noticesFor([unfiledRow()]);
    /* In the file, beside the row in the report, or on the draft afterwards. */
    expect(notice?.body).toContain(
      "name a period that is still open under Appraisal period",
    );
    expect(notice?.body).toContain("type it beside each row below");
    expect(notice?.body).toContain("choose one with Edit");
    /* Edit offers the period only until the target is agreed and frozen. */
    expect(notice?.body).toContain("before it is agreed");
  });

  it("uses the singular for one", () => {
    const [notice] = noticesFor([unfiledRow()]);
    expect(notice?.title).toBe("1 objective has no appraisal period");
    expect(notice?.body).toContain("It still imports");
    expect(notice?.body).toContain("To file it in one");
    expect(notice?.body).toContain("Edit on the objective");
  });

  it("counts the rows the browser's own check produced", () => {
    /* The demo has no API, so the report is this file's. Its rows must be ones
       the count recognises, or the screen would warn in a collapsed group and say
       nothing above it. `field` is the report's column, as the store passes it
       on. */
    const H = OBJECTIVES.heading;
    const base = {
      [H["title"] as string]: "An objective",
      [H["quarter"] as string]: "2026-Q4",
    };
    const result = checkMappedRows(
      OBJECTIVES,
      [
        { ...base },
        {
          ...base,
          [H["title"] as string]: "Under a parent",
          [H["parent"] as string]: "Ours",
        },
        {
          ...base,
          [H["title"] as string]: "Names one",
          [H["period"] as string]: "H2 2026",
        },
        {
          ...base,
          [H["title"] as string]: "Refused",
          [H["quarter"] as string]: "soon",
        },
      ],
      {
        presentFields: new Set(OBJECTIVES.columns.map((spec) => spec.field)),
        timeZone: "Africa/Lagos",
      },
    );
    const rows: CheckedRowFacts[] = result.rows.map((report) => ({
      action: report.action,
      problems: [
        ...report.errors.map((issue) => ({
          field: issue.column,
          severity: "error" as const,
        })),
        ...report.warnings.map((issue) => ({
          field: issue.column,
          severity: "warning" as const,
        })),
      ],
    }));

    expect(countUnfiled(rows)).toBe(1);
    expect(noticesFor(rows)[0]?.title).toBe(
      "1 objective has no appraisal period",
    );
  });
});

describe("rendering the notices", () => {
  it("renders nothing at all when there is nothing to say", () => {
    const { container } = render(<CheckNotices notices={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each as a titled callout", () => {
    render(
      <CheckNotices
        notices={[
          {
            tone: "warning",
            title: "3 objectives have no appraisal period",
            body: "They still import.",
          },
        ]}
      />,
    );
    expect(
      screen.getByText("3 objectives have no appraisal period"),
    ).toBeInTheDocument();
    expect(screen.getByText("They still import.")).toBeInTheDocument();
  });
});
