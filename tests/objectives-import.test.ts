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

/** What the template calls each column. Looked up, never typed: the headings are
 *  plain words and somebody will reword them again. */
const H = OBJECTIVES.heading;

/** A row keyed the way `mapRow` leaves it: by the template's own headings. */
const row = (over: Record<string, string>): Record<string, string> => ({
  [H.title]: "Grow qualified pipeline",
  [H.quarter]: "2026-Q4",
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

  it("still reads the headings the template used to print", () => {
    const was = {
      Title: "title",
      Quarter: "quarter",
      "Owner email": "ownerEmail",
      Department: "department",
      "Appraisal period": "period",
      "Parent objective": "parent",
      Description: "description",
      Measure: "measure",
      Start: "start",
      Target: "target",
      Unit: "unit",
      "Lower is better": "lowerIsBetter",
    };
    expect(guessMapping(OBJECTIVES, Object.keys(was))).toEqual(was);
  });

  it("calls the owner column what people say: who it is assigned to", () => {
    expect(H.ownerEmail).toBe("Assigned to (work email)");
    expect(
      guessMapping(OBJECTIVES, ["Assigned to", "Assigned to (work email)"]),
    ).toMatchObject({ "Assigned to (work email)": "ownerEmail" });
  });

  it("sends template headings, and leaves empty cells out", () => {
    const mapped = mapRow(
      OBJECTIVES,
      { Objective: "Ship it", Period: "Q4 2026", Owner: "", Notes: "" },
      { Objective: "title", Period: "quarter", Owner: "ownerEmail", Notes: "" },
    );
    expect(mapped).toEqual({ [H.title]: "Ship it", [H.quarter]: "Q4 2026" });
  });

  it("puts the two required columns first", () => {
    expect(OBJECTIVES.columns.slice(0, 2).map((spec) => spec.column)).toEqual([
      H.title,
      H.quarter,
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
        [H.title]: "Cut build time",
        [H.ownerEmail]: "ada@company.test",
        [H.measure]: "Median build time",
        [H.start]: "1,800",
        [H.target]: "900",
        [H.lowerIsBetter]: "Yes",
      }),
    ]);
    expect(report.toSkip).toBe(0);
    expect(report.notes.join(" ")).toContain("1 row has nobody in Assigned to");
    expect(report.notes.join(" ")).toContain(
      "1 objective is added with a measure",
    );
    expect(report.notes.join(" ")).toContain("drafts");
  });

  it("refuses a missing title, a vague quarter and a name in the owner column", () => {
    const report = check([
      row({ [H.title]: "" }),
      row({ [H.quarter]: "next quarter" }),
      row({ [H.ownerEmail]: "Ada Okafor" }),
      row({ [H.title]: "Ab" }),
    ]);
    const columns = report.rows.map((r) => r.errors[0]?.column);
    expect(columns).toEqual([H.title, H.quarter, H.ownerEmail, H.title]);
    expect(report.rows[2]?.errors[0]?.problem).toContain("not a work email");
  });

  it("takes a measure whole or not at all", () => {
    const report = check([
      row({ [H.target]: "10" }),
      row({ [H.measure]: "Tickets closed" }),
      row({
        [H.measure]: "Churn",
        [H.start]: "5",
        [H.target]: "9",
        [H.lowerIsBetter]: "Yes",
      }),
      row({ [H.measure]: "Revenue", [H.start]: "10", [H.target]: "5" }),
      row({ [H.measure]: "Tickets", [H.target]: "lots" }),
      row({
        [H.measure]: "Tickets",
        [H.target]: "10",
        [H.lowerIsBetter]: "maybe",
      }),
      row({ [H.measure]: "Tickets", [H.start]: "4", [H.target]: "4" }),
    ]);
    expect(report.rows.map((r) => r.errors[0]?.column)).toEqual([
      H.measure,
      H.target,
      H.target,
      H.target,
      H.target,
      H.lowerIsBetter,
      H.target,
    ]);
    expect(report.rows[2]?.errors[0]?.problem).toContain("counts down");
    expect(report.rows[3]?.errors[0]?.problem).toContain("Lower is better");
  });

  it("flags a row that repeats an earlier one, and only when owner and parent agree", () => {
    const report = check([
      row({
        [H.title]: "Document the runbooks",
        [H.ownerEmail]: "ada@company.test",
      }),
      row({
        [H.title]: "document the  runbooks",
        [H.ownerEmail]: "ADA@company.test",
      }),
      row({
        [H.title]: "Document the runbooks",
        [H.ownerEmail]: "chidi@company.test",
      }),
      row({
        [H.title]: "Document the runbooks",
        [H.ownerEmail]: "ada@company.test",
        [H.parent]: "Ship",
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
    const report = check([row({ [H.ownerEmail]: "ada@company.test" })]);
    expect(report.rows[0]?.name).toBe("Grow qualified pipeline");
    expect(report.rows[0]?.employeeNo).toBe("ada@company.test");
  });
});
