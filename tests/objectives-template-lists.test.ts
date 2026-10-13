import { describe, expect, it } from "vitest";
import { OBJECTIVES } from "@/lib/imports/objectives";
import { objectiveTemplateLists } from "@/lib/imports/objectives-lists";
import {
  buildTemplateFiles,
  columnsFromDictionary,
  withLists,
} from "@/lib/imports/template-file";
import { readXlsx } from "@/lib/xlsx";

/**
 * The objectives template carries the company's own departments and open
 * appraisal periods as real Excel dropdowns.
 *
 * Three things are being pinned, and each is the one that goes wrong quietly:
 *
 * 1. **Which values are offered.** A dropdown that offers what the check then
 *    refuses is worse than none — a published period, a department somebody
 *    does not head.
 * 2. **That they reach the file.** A list that is built and never written looks
 *    identical to one that works until somebody opens the workbook.
 * 3. **That nothing else moved.** The compiled-in dropdown is still there, and
 *    a column with no list is still plain text.
 */

const dept = (name: string, headId: string | null = null) => ({ name, headId });
const period = (name: string, stage = "SELF") => ({ name, stage });

describe("which values the template offers", () => {
  const departments = [
    dept("Operations", "ngozi"),
    dept("Engineering", "dara"),
    dept("Marketing", "tunde"),
  ];

  it("offers every department to somebody who may file under any of them, in order", () => {
    const lists = objectiveTemplateLists({
      departments,
      periods: [],
      canSetCompanyWide: true,
      employeeId: "amara",
    });
    expect(lists["department"]).toEqual([
      "Engineering",
      "Marketing",
      "Operations",
    ]);
  });

  it("offers a department head only the one they head", () => {
    const lists = objectiveTemplateLists({
      departments,
      periods: [],
      canSetCompanyWide: false,
      employeeId: "dara",
    });
    expect(lists["department"]).toEqual(["Engineering"]);
  });

  it("offers nothing to somebody who heads nothing, rather than every department", () => {
    for (const employeeId of ["pat", null]) {
      const lists = objectiveTemplateLists({
        departments,
        periods: [],
        canSetCompanyWide: false,
        employeeId,
      });
      expect(lists["department"]).toEqual([]);
    }
  });

  it("leaves a published period out, because the API will refuse it", () => {
    const lists = objectiveTemplateLists({
      departments: [],
      periods: [
        period("H2 2026", "SELF"),
        period("H1 2026", "PUBLISHED"),
        period("H3 2026", "DRAFT"),
      ],
      canSetCompanyWide: true,
      employeeId: null,
    });
    expect(lists["period"]).toEqual(["H2 2026", "H3 2026"]);
  });

  it("fills real fields of the dictionary, so a rename cannot orphan a list", () => {
    const lists = objectiveTemplateLists({
      departments: [],
      periods: [],
      canSetCompanyWide: true,
      employeeId: null,
    });
    const fields = new Set<string>(
      OBJECTIVES.columns.map((spec) => spec.field),
    );
    for (const key of Object.keys(lists)) expect(fields.has(key)).toBe(true);
  });
});

describe("turning a list into a column's dropdown", () => {
  const base = columnsFromDictionary(OBJECTIVES);
  const headingOf = (field: string) =>
    OBJECTIVES.columns.find((spec) => spec.field === field)?.column ?? "";
  const dropdownOf = (
    columns: ReturnType<typeof withLists>,
    field: string,
  ): readonly string[] | undefined =>
    columns.find((column) => column.column === headingOf(field))?.dropdown;

  it("puts each list on the column it fills and on no other", () => {
    const columns = withLists(base, OBJECTIVES, {
      department: ["Engineering", "Marketing"],
      period: ["H2 2026"],
    });
    expect(dropdownOf(columns, "department")).toEqual([
      "Engineering",
      "Marketing",
    ]);
    expect(dropdownOf(columns, "period")).toEqual(["H2 2026"]);
    expect(dropdownOf(columns, "title")).toBeUndefined();
    expect(dropdownOf(columns, "quarter")).toBeUndefined();
    expect(dropdownOf(columns, "ownerEmail")).toBeUndefined();
  });

  it("keeps the compiled-in Yes/No dropdown", () => {
    const columns = withLists(base, OBJECTIVES, {
      department: ["Engineering"],
    });
    expect(dropdownOf(columns, "lowerIsBetter")).toEqual(["Yes", "No"]);
  });

  it("gives an empty list no dropdown at all, because Excel would refuse everything", () => {
    const columns = withLists(base, OBJECTIVES, { department: [], period: [] });
    expect(dropdownOf(columns, "department")).toBeUndefined();
    expect(dropdownOf(columns, "period")).toBeUndefined();
  });

  it("drops duplicates and blanks and keeps the order it was given", () => {
    const columns = withLists(base, OBJECTIVES, {
      department: ["Sales", "", "Engineering", "Sales", "  "],
    });
    expect(dropdownOf(columns, "department")).toEqual(["Sales", "Engineering"]);
  });

  it("does not change the columns it was handed", () => {
    withLists(base, OBJECTIVES, { department: ["Engineering"] });
    expect(
      base.find((column) => column.column === headingOf("department"))
        ?.dropdown,
    ).toBeUndefined();
  });
});

describe("the workbook that comes out", () => {
  /** `'Lists'!$B$1:$B$3` to the column index and the row count. */
  const rangeOf = (source: string) => {
    const match = /\$([A-Z]+)\$1:\$[A-Z]+\$(\d+)$/.exec(source);
    if (!match) throw new Error(`not a range: ${source}`);
    const letters = match[1] as string;
    const column = [...letters].reduce(
      (n, letter) => n * 26 + (letter.charCodeAt(0) - 64),
      0,
    );
    return { column: column - 1, count: Number(match[2]) };
  };

  it("has a real dropdown on Department and Appraisal period, listing exactly the company's values", async () => {
    const files = buildTemplateFiles(
      withLists(columnsFromDictionary(OBJECTIVES), OBJECTIVES, {
        department: ["Engineering", "Marketing"],
        period: ["H2 2026", "H3 2026"],
      }),
      {
        basename: OBJECTIVES.templateFile.basename,
        sheetName: OBJECTIVES.templateFile.sheetName,
      },
    );
    const workbook = await readXlsx(files.xlsx);
    const sheet = workbook.sheets.find(
      (candidate) => candidate.name === OBJECTIVES.templateFile.sheetName,
    );
    const lists = workbook.sheets.find(
      (candidate) => candidate.name === "Lists",
    );
    expect(sheet).toBeDefined();
    expect(lists?.hidden).toBe(true);

    const headers = sheet?.grid[0] ?? [];
    const optionsFor = (heading: string): string[] => {
      const column = headers.findIndex(
        (header) => header.replace(/ \*$/, "") === heading,
      );
      const validation = sheet?.dataValidations.find(
        (v) => v.column === column,
      );
      if (!validation) return [];
      const { column: at, count } = rangeOf(validation.source);
      return (lists?.grid ?? []).slice(0, count).map((row) => row[at] ?? "");
    };

    expect(optionsFor("Department")).toEqual(["Engineering", "Marketing"]);
    expect(optionsFor("Appraisal period")).toEqual(["H2 2026", "H3 2026"]);
    expect(optionsFor("Lower is better")).toEqual(["Yes", "No"]);
    expect(optionsFor("Owner email")).toEqual([]);
  });

  it("has no dropdown on those columns when the company has none, and still opens", async () => {
    const files = buildTemplateFiles(
      withLists(columnsFromDictionary(OBJECTIVES), OBJECTIVES, {
        department: [],
        period: [],
      }),
      {
        basename: OBJECTIVES.templateFile.basename,
        sheetName: OBJECTIVES.templateFile.sheetName,
      },
    );
    const workbook = await readXlsx(files.xlsx);
    const sheet = workbook.sheets.find(
      (candidate) => candidate.name === OBJECTIVES.templateFile.sheetName,
    );
    const headers = sheet?.grid[0] ?? [];
    const departmentAt = headers.findIndex(
      (header) => header.replace(/ \*$/, "") === "Department",
    );
    expect(departmentAt).toBeGreaterThan(-1);
    expect(sheet?.dataValidations.some((v) => v.column === departmentAt)).toBe(
      false,
    );
  });

  it("puts the Appraisal period column after Department, among the optional ones", () => {
    const headings = columnsFromDictionary(OBJECTIVES).map(
      (column) => column.column,
    );
    expect(headings.slice(0, 2)).toEqual(["Title", "Quarter"]);
    expect(headings.indexOf("Appraisal period")).toBe(
      headings.indexOf("Department") + 1,
    );
  });
});
