import { describe, expect, it } from "vitest";
import { checkMappedRows } from "@/lib/imports/check";
import { guessMapping, mapRow } from "@/lib/imports/mapping";
import { OBJECTIVES, parseQuarter, parseYesNo } from "@/lib/imports/objectives";

/**
 * The objectives dictionary on this side: how a file's headings are read, and
 * what the browser can say about a row before the API says the rest.
 *
 * What is *not* here is who may raise which objective for whom. That is the
 * API's question, asked per row with the uploader's own authority, and a browser
 * guessing at it would only be a second, wrong copy. `scripts/verify-template.ts`
 * is what keeps these columns the same as the API's.
 */

const present = new Set(OBJECTIVES.columns.map((spec) => spec.field));

/** A row keyed the way `mapRow` leaves it: by the template's own headings. */
const row = (over: Record<string, string>): Record<string, string> => ({
  Title: "Grow qualified pipeline",
  Quarter: "2026-Q4",
  ...over,
});

const check = (rows: Record<string, string>[]) =>
  checkMappedRows(OBJECTIVES, rows, {
    presentFields: present,
    timeZone: "Africa/Lagos",
  });

describe("reading a file's headings", () => {
  it("matches the names people actually use", () => {
    const mapping = guessMapping(OBJECTIVES, [
      "Objective",
      "Period",
      "Owner",
      "Dept",
      "Under",
      "Key result",
      "Baseline",
      "Target value",
      "Units",
      "Counts down",
      "Something else",
    ]);
    expect(mapping).toEqual({
      Objective: "title",
      Period: "quarter",
      Owner: "ownerEmail",
      Dept: "department",
      Under: "parent",
      "Key result": "measure",
      Baseline: "start",
      "Target value": "target",
      Units: "unit",
      "Counts down": "lowerIsBetter",
      "Something else": "",
    });
  });

  it("sends template headings, and leaves empty cells out", () => {
    const mapped = mapRow(
      OBJECTIVES,
      { Objective: "Ship it", Period: "Q4 2026", Owner: "", Notes: "" },
      { Objective: "title", Period: "quarter", Owner: "ownerEmail", Notes: "" },
    );
    expect(mapped).toEqual({ Title: "Ship it", Quarter: "Q4 2026" });
  });

  it("puts the two required columns first", () => {
    expect(OBJECTIVES.columns.slice(0, 2).map((spec) => spec.column)).toEqual([
      "Title",
      "Quarter",
    ]);
    expect(OBJECTIVES.requiredFields).toEqual(["title", "quarter"]);
  });
});

describe("quarters and yes/no", () => {
  it("reads a quarter however it was typed", () => {
    expect(parseQuarter("2026-Q4")).toBe("2026-Q4");
    expect(parseQuarter("Q4 2026")).toBe("2026-Q4");
    expect(parseQuarter("2026 q1")).toBe("2026-Q1");
    expect(parseQuarter("2026Q2")).toBe("2026-Q2");
    expect(parseQuarter("Q5 2026")).toBeNull();
    expect(parseQuarter("next quarter")).toBeNull();
  });

  it("reads Yes and No, and nothing else", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo(" n ")).toBe(false);
    expect(parseYesNo("sometimes")).toBeNull();
  });
});

describe("what the file alone can settle", () => {
  it("lets a clean row through, and a measure with it", () => {
    const report = check([
      row({}),
      row({
        Title: "Cut build time",
        "Owner email": "ada@company.test",
        Measure: "Median build time",
        Start: "1,800",
        Target: "900",
        "Lower is better": "Yes",
      }),
    ]);
    expect(report.toSkip).toBe(0);
    expect(report.notes.join(" ")).toContain("1 row has no owner");
    expect(report.notes.join(" ")).toContain(
      "1 objective is added with a measure",
    );
    expect(report.notes.join(" ")).toContain("drafts");
  });

  it("refuses a missing title, a vague quarter and a name in the owner column", () => {
    const report = check([
      row({ Title: "" }),
      row({ Quarter: "next quarter" }),
      row({ "Owner email": "Ada Okafor" }),
      row({ Title: "Ab" }),
    ]);
    const columns = report.rows.map((r) => r.errors[0]?.column);
    expect(columns).toEqual(["Title", "Quarter", "Owner email", "Title"]);
    expect(report.rows[2]?.errors[0]?.problem).toContain("not a work email");
  });

  it("takes a measure whole or not at all", () => {
    const report = check([
      row({ Target: "10" }),
      row({ Measure: "Tickets closed" }),
      row({
        Measure: "Churn",
        Start: "5",
        Target: "9",
        "Lower is better": "Yes",
      }),
      row({ Measure: "Revenue", Start: "10", Target: "5" }),
      row({ Measure: "Tickets", Target: "lots" }),
      row({ Measure: "Tickets", Target: "10", "Lower is better": "maybe" }),
      row({ Measure: "Tickets", Start: "4", Target: "4" }),
    ]);
    expect(report.rows.map((r) => r.errors[0]?.column)).toEqual([
      "Measure",
      "Target",
      "Target",
      "Target",
      "Target",
      "Lower is better",
      "Target",
    ]);
    expect(report.rows[2]?.errors[0]?.problem).toContain("counts down");
    expect(report.rows[3]?.errors[0]?.problem).toContain("Lower is better");
  });

  it("flags a row that repeats an earlier one, and only when owner and parent agree", () => {
    const report = check([
      row({
        Title: "Document the runbooks",
        "Owner email": "ada@company.test",
      }),
      row({
        Title: "document the  runbooks",
        "Owner email": "ADA@company.test",
      }),
      row({
        Title: "Document the runbooks",
        "Owner email": "chidi@company.test",
      }),
      row({
        Title: "Document the runbooks",
        "Owner email": "ada@company.test",
        "Parent objective": "Ship",
      }),
    ]);
    expect(report.rows.map((r) => r.action)).toEqual([
      "create",
      "skip",
      "create",
      "create",
    ]);
    expect(report.rows[1]?.errors[0]?.problem).toContain("already on row 1");
  });

  it("names who a row is about, for the report", () => {
    const report = check([row({ "Owner email": "ada@company.test" })]);
    expect(report.rows[0]?.name).toBe("Grow qualified pipeline");
    expect(report.rows[0]?.employeeNo).toBe("ada@company.test");
  });
});
