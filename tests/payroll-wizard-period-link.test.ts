/**
 * U28 (PAY-3, NC-8), web part: the "payroll is ready for approval" email and
 * notification link to `?period=2026-11-01`, and the wizard only read
 * `2026-11`, so it opened an empty Approve step ("paying 2026-11-01-28").
 * Both forms open the month.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { periodFromParam } from "@/app/(app)/payroll/runs/new/period-param";

describe("a period in a link", () => {
  it("reads a month", () => {
    expect(periodFromParam("2026-11")).toBe("2026-11");
  });
  it("reads a full date as its month", () => {
    expect(periodFromParam("2026-11-01")).toBe("2026-11");
    expect(periodFromParam("2026-11-01T00:00:00.000Z")).toBe("2026-11");
  });
  it("ignores anything else", () => {
    expect(periodFromParam(null)).toBeNull();
    expect(periodFromParam("november")).toBeNull();
    expect(periodFromParam("2026-13")).toBeNull();
  });
  it("is what the wizard reads", () => {
    const wizard = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../src/app/(app)/payroll/runs/new/wizard.tsx",
      ),
      "utf8",
    );
    expect(wizard).toContain('periodFromParam(params.get("period"))');
  });
});
