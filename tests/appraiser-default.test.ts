import { describe, expect, it } from "vitest";
import type { ApiAppraiserMapRow } from "@/lib/api/performance";
import {
  defaultWords,
  draftDefaultOf,
  standingRows,
  withoutLine,
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
    expect(rows.get("chidi")?.appraiser.source).toBe("none");
    /* A record that names somebody as their own manager is no manager. */
    expect(rows.get("self")?.appraiser.source).toBe("none");
  });

  it("is nobody with neither, and says so", () => {
    expect(defaultWords(rows.get("musa")!.appraiser)).toBe("No appraiser");
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

describe("who has no appraiser, in one line", () => {
  it("names them, up to eight, and counts the rest", () => {
    expect(withoutLine([])).toBeNull();
    expect(withoutLine(["Musa Bello"])).toBe(
      "1 person has no appraiser: Musa Bello.",
    );
    expect(withoutLine(["A", "B"])).toBe(
      "2 people have no appraiser: A and B.",
    );
    expect(
      withoutLine(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]),
    ).toBe("10 people have no appraiser: A, B, C, D, E, F, G, H and 2 others.");
  });
});
