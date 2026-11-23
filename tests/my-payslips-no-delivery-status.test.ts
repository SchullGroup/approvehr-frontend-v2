/**
 * U9 (PAY-36), web part: an employee's own payslip list showed "Not sent",
 * "Sent" and "Opened", which is whether payroll emailed it: the payroll team's
 * concern, not theirs, and "Not sent" beside a payslip they are reading looks
 * like a fault. The list shows the month, gross and net. (The back link that
 * led to a refused page goes Home since U57.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const index = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../src/app/(app)/payroll/payslips/my-payslip-index.tsx",
  ),
  "utf8",
);

describe("my payslips", () => {
  it("does not show whether payroll emailed it", () => {
    expect(index).not.toContain("DELIVERY_LABEL");
    expect(index).not.toContain('"Not sent"');
    expect(index).not.toMatch(/<TH>Status<\/TH>/);
  });
});
