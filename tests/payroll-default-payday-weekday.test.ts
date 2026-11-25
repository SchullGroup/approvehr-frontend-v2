/**
 * L1 (PAY-32, NC-31): a new payroll's pay date defaulted to the 28th whatever
 * day that was, so November 2026 paid on Saturday 28 November, a day banks do
 * not settle. The default now falls back to the working day before.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultPayDate,
  payDateForMonth,
} from "@/app/(app)/payroll/runs/new/pay-date";

describe("the default pay date", () => {
  it("is the 28th on a weekday", () => {
    expect(defaultPayDate("2026-10")).toBe("2026-10-28"); // Wednesday
  });

  it("moves a Saturday back to the Friday", () => {
    expect(defaultPayDate("2026-11")).toBe("2026-11-27");
  });

  it("moves a Sunday back to the Friday", () => {
    expect(defaultPayDate("2027-02")).toBe("2027-02-26"); // 28 Feb 2027 is a Sunday
  });

  it("is what the wizard starts with", () => {
    const wizard = readFileSync(
      "src/app/(app)/payroll/runs/new/wizard.tsx",
      "utf8",
    );
    expect(wizard).not.toContain("`${period}-28`");
    expect(wizard).toContain("defaultPayDate(period)");
  });
});

describe("moving to another month", () => {
  it("gives the new month its own default when the date was left alone", () => {
    expect(payDateForMonth("2026-11-27", "2026-11", "2026-12")).toBe(
      "2026-12-28",
    );
  });

  it("keeps a day somebody chose, clamped to the month", () => {
    expect(payDateForMonth("2026-08-31", "2026-08", "2026-09")).toBe(
      "2026-09-30",
    );
    expect(payDateForMonth("2026-10-25", "2026-10", "2026-11")).toBe(
      "2026-11-25",
    );
  });
});
