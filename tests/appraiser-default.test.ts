import { describe, expect, it } from "vitest";
import type { ApiAppraiserMapRow } from "@/lib/api/performance";
import {
  defaultWords,
  draftDefaultOf,
  standingRows,
  hrFallbackLine,
} from "@/lib/performance/appraiser-default";

/**
 * The reporting line as the default appraiser (owner request, 24 Nov 2026),
 * worked out the way the API applies it when a period starts: the recorded
 * manager, else the department's head, else nobody.
 */

const person = (
  id: string,
  fullName: string,
  managerId: string | null,
  departmentId: string | null,
) => ({ id, fullName, managerId, departmentId, jobTitle: "Analyst" });

const PEOPLE = [
  person("ada", "Ada Eze", "chidi", "fin"),
  person("chidi", "Chidi Obi", null, "fin"),
  person("fola", "Fola Ade", null, "fin"),
  person("musa", "Musa Bello", null, null),
  person("self", "Sade Ojo", "self", "ops"),
];
const DEPARTMENTS = [
  { id: "fin", headId: "chidi" },
  { id: "ops", headId: null },
];

describe("the standing default", () => {
  const rows = new Map(
    standingRows(PEOPLE, DEPARTMENTS).map((row) => [row.employeeId, row]),
  );

  it("is the recorded manager", () => {
    expect(rows.get("ada")?.appraiser).toEqual({
      source: "manager",
      id: "chidi",
      name: "Chidi Obi",
    });
    expect(defaultWords(rows.get("ada")!.appraiser)).toBe(
      "Chidi Obi, their line manager",
    );
  });

  it("is the department's head when no manager is recorded, and never themselves", () => {
    expect(rows.get("fola")?.appraiser.source).toBe("department-head");
    expect(defaultWords(rows.get("fola")!.appraiser)).toBe(
      "Chidi Obi, head of their department (no manager recorded)",
    );
    /* The head of Finance has no manager and heads their own department. */
    expect(rows.get("chidi")?.appraiser.source).toBe("hr");
    /* A record that names somebody as their own manager is no manager. */
    expect(rows.get("self")?.appraiser.source).toBe("hr");
  });

  it("is HR with neither, never nobody", () => {
    expect(rows.get("musa")?.appraiser.source).toBe("hr");
    expect(defaultWords(rows.get("musa")!.appraiser)).toBe(
      "HR (no manager or department head is recorded)",
    );
    expect(rows.get("chidi")?.appraiser.source).toBe("hr");
    expect(rows.get("self")?.appraiser.source).toBe("hr");
  });

  it("inherits the nearest head up the department tree", () => {
    const tree = [
      { id: "fin", headId: "chidi", parentId: null },
      { id: "fin-ap", headId: null, parentId: "fin" },
    ];
    const ap = standingRows([person("zed", "Zed Ola", null, "fin-ap")], tree);
    expect(ap[0]?.appraiser).toEqual({
      source: "department-head",
      id: "chidi",
      name: null,
    });
  });
});

describe("a period that has not started", () => {
  const row = (over: Partial<ApiAppraiserMapRow>) =>
    ({
      employeeId: "ada",
      appraisers: [],
      lineManagerId: "chidi",
      lineManagerName: "Chidi Obi",
      departmentId: "fin",
      ...over,
    }) as ApiAppraiserMapRow;
  const heads = new Map([["fin", { id: "chidi", name: "Chidi Obi" }]]);

  it("falls to HR, not nobody, when nothing above them is recorded", () => {
    expect(
      draftDefaultOf(
        row({ lineManagerId: null, lineManagerName: null, departmentId: "x" }),
        "DRAFT",
        heads,
      )?.source,
    ).toBe("hr");
  });

  it("shows the manager its start will give somebody nobody is mapped to", () => {
    expect(draftDefaultOf(row({}), "DRAFT", heads)?.name).toBe("Chidi Obi");
  });

  it("shows nothing once it has started, where unmapped really is nobody", () => {
    expect(draftDefaultOf(row({}), "SELF", heads)).toBeNull();
  });

  it("shows nothing for somebody already mapped", () => {
    expect(
      draftDefaultOf(
        row({
          appraisers: [
            { appraiserId: "x" } as ApiAppraiserMapRow["appraisers"][number],
          ],
        }),
        "DRAFT",
        heads,
      ),
    ).toBeNull();
  });
});

describe("the HR fallback, in one calm line", () => {
  it("counts them and names no one", () => {
    expect(hrFallbackLine(0)).toBeNull();
    expect(hrFallbackLine(1)).toBe(
      "1 person has no manager or department head, so HR appraises them.",
    );
    expect(hrFallbackLine(3)).toBe(
      "3 people have no manager or department head, so HR appraises them.",
    );
  });
});
