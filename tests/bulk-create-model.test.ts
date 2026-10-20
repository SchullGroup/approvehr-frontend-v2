import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { buildDraftFiles, draftBasename } from "@/lib/bulk-create/draft-file";
import {
  blankDraft,
  draftToRow,
  draftsFromFile,
  isUntouched,
  MAX_ITEMS,
  overLimit,
  pasteCells,
  touchedOnly,
  type Draft,
} from "@/lib/bulk-create/model";
import { errorsOf, reportsByItem } from "@/lib/bulk-create/report";
import { OBJECTIVES } from "@/lib/imports/objectives";
import { readXlsx } from "@/lib/xlsx";

/**
 * The rows behind the "add several" window.
 *
 * What is pinned is what goes wrong quietly: a row that reaches the API under
 * the wrong heading, a file that comes back with fewer rows than went out, a
 * paste that loses what did not fit, and a ceiling that is off by one.
 */

let counter = 0;
const key = () => `k${String((counter += 1))}`;
const draft = (values: Record<string, string>, id = key()): Draft => ({
  ...blankDraft(OBJECTIVES, id),
  values: { ...blankDraft(OBJECTIVES, id).values, ...values },
});

const headingOf = (field: string) =>
  OBJECTIVES.columns.find((spec) => spec.field === field)?.column ?? field;

describe("a draft as the API's row", () => {
  it("is keyed by the template's own headings and carries only what was typed", () => {
    const row = draftToRow(
      OBJECTIVES,
      draft({ title: "  Grow pipeline  ", quarter: "2026-Q4", unit: "" }),
    );
    expect(row).toEqual({
      [headingOf("title")]: "Grow pipeline",
      [headingOf("quarter")]: "2026-Q4",
    });
  });

  it("is untouched when it carries nothing but its starting values", () => {
    const defaults = { quarter: "2026-Q4" };
    expect(isUntouched(draft({ quarter: "2026-Q4" }), defaults)).toBe(true);
    expect(
      isUntouched(draft({ quarter: "2026-Q4", title: "x" }), defaults),
    ).toBe(false);
    expect(isUntouched(draft({ quarter: "2027-Q1" }), defaults)).toBe(false);
  });

  it("is left out of what gets sent when nothing was typed in it", () => {
    const defaults = { quarter: "2026-Q4" };
    const kept = touchedOnly(
      [draft({ quarter: "2026-Q4" }), draft({ title: "Real" })],
      defaults,
    );
    expect(kept).toHaveLength(1);
  });
});

describe("reading a spreadsheet into drafts", () => {
  const read = (text: string) =>
    draftsFromFile(OBJECTIVES, parseCsv(text), key);

  it("matches the template's headings, the old ones and the aliases", () => {
    const loaded = read(
      [
        "Objective title *,Due quarter *,Assigned to (work email),owner_email,Appraisal period",
        "Grow pipeline,2026-Q4,ngozi@co.com,,H2 2026",
      ].join("\n"),
    );
    /* Two headings claim the same field — the earlier alias wins and the other
       is reported rather than quietly overwriting. */
    expect(loaded.drafts).toHaveLength(1);
    expect(loaded.drafts[0]?.values["title"]).toBe("Grow pipeline");
    expect(loaded.drafts[0]?.values["quarter"]).toBe("2026-Q4");
    expect(loaded.drafts[0]?.values["ownerEmail"]).toBe("ngozi@co.com");
    expect(loaded.drafts[0]?.values["period"]).toBe("H2 2026");
    expect(loaded.ignored).toEqual(["owner_email"]);
  });

  it("names the columns it did not recognise instead of dropping them silently", () => {
    const loaded = read(
      "Objective title,Due quarter,Religion\nA goal,2026-Q4,x",
    );
    expect(loaded.ignored).toEqual(["Religion"]);
  });

  it("says which required column the file has no heading for", () => {
    const loaded = read("Objective title\nA goal");
    expect(loaded.missingRequired).toEqual([headingOf("quarter")]);
    /* Nothing is defaulted: an empty quarter stays empty for the check to say so. */
    expect(loaded.drafts[0]?.values["quarter"]).toBe("");
  });

  it("does not carry blank rows", () => {
    const loaded = read("Objective title,Due quarter\nA goal,2026-Q4\n,\n,");
    expect(loaded.drafts).toHaveLength(1);
  });
});

describe("the ceiling", () => {
  it("allows exactly 50 and refuses 51, naming where to go instead", () => {
    expect(MAX_ITEMS).toBe(50);
    expect(overLimit(40, 10, "objectives", "Upload objectives")).toBeNull();
    const refusal = overLimit(40, 11, "objectives", "Upload objectives");
    expect(refusal).toContain("That would make 51");
    expect(refusal).toContain("holds 50");
    expect(refusal).toContain("Upload objectives");
  });
});

describe("pasting cells from Excel", () => {
  const first = { row: 0, column: 0 };

  it("fills rightward and downward from the cell, adding items as it goes", () => {
    const result = pasteCells(
      OBJECTIVES,
      [draft({ title: "kept" })],
      first,
      "One\t2026-Q4\nTwo\t2027-Q1",
      key,
    );
    expect(result.rows).toBe(2);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]?.values["title"]).toBe("One");
    expect(result.drafts[1]?.values["title"]).toBe("Two");
    expect(result.drafts[1]?.values["quarter"]).toBe("2027-Q1");
  });

  it("lands a column's worth of cells in that column when pasted from another one", () => {
    const columnOfQuarter = OBJECTIVES.columns.findIndex(
      (spec) => spec.field === "quarter",
    );
    const result = pasteCells(
      OBJECTIVES,
      [draft({ title: "A" }), draft({ title: "B" })],
      { row: 0, column: columnOfQuarter },
      "2026-Q4\n2027-Q1",
      key,
    );
    expect(result.drafts.map((each) => each.values["quarter"])).toEqual([
      "2026-Q4",
      "2027-Q1",
    ]);
    expect(result.drafts.map((each) => each.values["title"])).toEqual([
      "A",
      "B",
    ]);
  });

  it("skips a first row that is the file's own headings", () => {
    const result = pasteCells(
      OBJECTIVES,
      [draft({})],
      first,
      "Objective title\tDue quarter\nReal one\t2026-Q4",
      key,
    );
    expect(result.rows).toBe(1);
    expect(result.drafts[0]?.values["title"]).toBe("Real one");
  });

  it("counts what did not fit under the ceiling rather than losing it quietly", () => {
    const existing = Array.from({ length: 49 }, (_, index) =>
      draft({ title: `T${String(index)}` }),
    );
    const result = pasteCells(
      OBJECTIVES,
      existing,
      { row: 48, column: 0 },
      "a\nb\nc\nd",
      key,
    );
    expect(result.drafts).toHaveLength(MAX_ITEMS);
    expect(result.rows).toBe(2);
    expect(result.droppedRows).toBe(2);
  });

  it("counts columns that ran past the last column", () => {
    const width = OBJECTIVES.columns.length;
    const result = pasteCells(
      OBJECTIVES,
      [draft({})],
      { row: 0, column: width - 1 },
      "a\tb\tc",
      key,
    );
    expect(result.droppedColumns).toBe(2);
  });
});

describe("the check's answer, put back on the right item", () => {
  const report = (row: number, column: string, problem: string) => ({
    row,
    employeeNo: null,
    name: null,
    action: "skip" as const,
    errors: [{ row, column, value: null, problem }],
    warnings: [],
    duplicate: null,
    missing: [],
    employeeNoGenerated: false,
  });

  it("attributes row n to the n-th item that was sent, by heading", () => {
    const reports = reportsByItem(
      OBJECTIVES,
      ["a", "b", "c"],
      [report(2, headingOf("quarter"), "Not a quarter.")],
    );
    expect(Object.keys(reports)).toEqual(["b"]);
    expect(errorsOf(reports["b"])[0]).toMatchObject({
      field: "quarter",
      problem: "Not a quarter.",
    });
  });

  it("reads an old heading as the field it still means", () => {
    const reports = reportsByItem(
      OBJECTIVES,
      ["a"],
      [report(1, "owner_email", "Nobody has that email.")],
    );
    expect(errorsOf(reports["a"])[0]?.field).toBe("ownerEmail");
  });

  it("ignores a report for a row that was not sent", () => {
    expect(reportsByItem(OBJECTIVES, ["a"], [report(5, "x", "y")])).toEqual({});
  });
});

describe("a draft as a file", () => {
  const drafts = [
    draft({
      title: "Grow pipeline",
      quarter: "2026-Q4",
      ownerEmail: "ngozi@co.com",
      department: "Marketing",
      period: "H2 2026",
      description: "Source and qualify, with a comma, and a\nnew line",
    }),
    draft({
      title: "Cut churn",
      quarter: "2027-Q1",
      measure: "Churn",
      target: "3",
    }),
  ];
  const lists = { department: ["Marketing", "Sales"], period: ["H2 2026"] };
  const files = buildDraftFiles({ dictionary: OBJECTIVES, drafts, lists });

  it("is named for a draft, not a template", () => {
    expect(draftBasename("approvehr-objectives-template")).toBe(
      "approvehr-objectives-draft",
    );
    expect(files.csvFilename).toBe("approvehr-objectives-draft.csv");
    expect(files.xlsxFilename).toBe("approvehr-objectives-draft.xlsx");
  });

  it("goes back into the window exactly as it left, as CSV", () => {
    const back = draftsFromFile(OBJECTIVES, parseCsv(files.csv), key);
    expect(back.ignored).toEqual([]);
    expect(back.missingRequired).toEqual([]);
    expect(back.drafts.map((each) => each.values)).toEqual(
      drafts.map((each) => each.values),
    );
  });

  it("carries the template's headings, required ones marked", () => {
    const header = files.csv.replace("﻿", "").split("\r\n")[0] ?? "";
    expect(header.split(",")).toContain("Objective title *");
    expect(header.split(",")).toContain("Due quarter *");
    expect(header.split(",")).toContain("Department");
  });

  it("goes back as Excel with its dropdowns and its values", async () => {
    const book = await readXlsx(files.xlsx);
    const main = book.sheets[0];
    const lists_ = book.sheets.find((sheet) => sheet.name === "Lists");
    expect(main?.grid[0]).toContain("Objective title *");
    expect(main?.grid).toHaveLength(3);
    /* The hidden sheet is there for the dropdowns to point at. */
    expect(lists_?.hidden).toBe(true);
    const sources = new Set(main?.dataValidations.map((v) => v.source));
    expect(sources.size).toBe(3); // department, period, Lower is better
    const sheet = main?.grid ?? [];
    const departmentColumn = (sheet[0] ?? []).indexOf("Department");
    expect(
      main?.dataValidations.some((v) => v.column === departmentColumn),
    ).toBe(true);
    /* A comma and a line break inside a cell survive the round trip. */
    expect(sheet[1]?.some((cell) => cell.includes("with a comma"))).toBe(true);
  });

  it("reads back from Excel into the same drafts", async () => {
    const book = await readXlsx(files.xlsx);
    const grid = book.sheets[0]?.grid ?? [];
    const csv = parseCsv(
      grid
        .map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
        )
        .join("\r\n"),
    );
    const back = draftsFromFile(OBJECTIVES, csv, key);
    expect(back.drafts.map((each) => each.values)).toEqual(
      drafts.map((each) => each.values),
    );
  });
});
