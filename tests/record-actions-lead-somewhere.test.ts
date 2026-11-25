/**
 * L23 (HR-29): the record's action panel had buttons that led nowhere.
 * "View latest payslip" linked a person's id where a payslip id belongs, so
 * connected it always opened "No payslip here"; it is offered only in the
 * demo, where the two ids are the same. "Start an appraisal period" (a whole
 * company's period) sat on every record and on My approvals; it belongs to
 * Performance, and is not on either now.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) =>
  readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("the record's actions", () => {
  const record = read("src/app/(app)/people/[id]/record.tsx");
  it("offers the payslip link only where it resolves", () => {
    expect(record).toMatch(
      /\{!connected && \(\s*<ButtonLink\s+href=\{`\/payroll\/payslips\/\$\{employee\.id\}`\}/,
    );
  });
  it("does not start an appraisal period", () => {
    expect(record).not.toContain("<StartPeriodButton");
  });
});

describe("My approvals", () => {
  it("does not start an appraisal period", () => {
    expect(read("src/app/(app)/approvals/page.tsx")).not.toContain(
      "StartPeriodButton",
    );
  });
});
