import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { permissionLabel } from "@/lib/store/permissions";
import { codeLabel } from "@/lib/api/reports";

/**
 * UAT 23 Nov, L15 (PERF-35): the report builder said "Needs EDIT_RECORDS" and
 * its status filter listed "ACTIVE, ON_LEAVE…".
 */

describe("a permission named on a screen", () => {
  it("is its label, not its key", () => {
    expect(permissionLabel("EDIT_RECORDS")).toBe("Edit people");
    expect(permissionLabel("NOT_A_REAL_ONE")).toBe("NOT_A_REAL_ONE");
  });
});

describe("a filter option the API sends as a code", () => {
  it("reads as words", () => {
    expect(codeLabel("ON_LEAVE")).toBe("On leave");
    expect(codeLabel("ACTIVE")).toBe("Active");
    expect(codeLabel("NYSC")).toBe("NYSC");
    expect(codeLabel("Lagos HQ")).toBe("Lagos HQ");
  });
});

describe("the report builder", () => {
  it("names permissions and options in words", () => {
    const source = readFileSync(
      join(
        __dirname,
        "..",
        "src",
        "app/(app)/reports/builder/builder-screen.tsx",
      ),
      "utf8",
    );
    expect(source).not.toContain('Needs {dataset.needs.join(", ")}');
    expect(source).toContain("codeLabel(option)");
  });
});
