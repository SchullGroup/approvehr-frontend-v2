import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extraRunLabel } from "@/lib/api/payroll";

/**
 * UAT 23 Nov, L16 (PAY-31): the payroll home read "August 2026 (August 2026)",
 * rows "September 2026 / September 2026", "It is still a draft" beside the
 * status In review, and loans "carried from a short month" for months that
 * were simply not paid.
 */

describe("a payroll's label", () => {
  it("is shown only when it says more than the month", () => {
    expect(extraRunLabel({ period: "2026-08-01", label: "August 2026" })).toBe(
      null,
    );
    expect(
      extraRunLabel({ period: "2026-08-01", label: "August bonus run" }),
    ).toBe("August bonus run");
    expect(extraRunLabel({ period: "2026-08-01", label: null })).toBe(null);
  });
});

describe("payroll wording", () => {
  const read = (path: string) =>
    readFileSync(join(__dirname, "..", "src", path), "utf8");

  it("does not call a payroll in review a draft", () => {
    expect(read("app/(app)/payroll/runs/new/wizard.tsx")).not.toContain(
      "It is still a draft",
    );
  });

  it("does not call an unpaid month a short month", () => {
    expect(read("app/(app)/payroll/loans/loans-screen.tsx")).not.toContain(
      "short month",
    );
  });

  it("does not print the label beside the month it repeats", () => {
    const home = read("app/(app)/payroll/payroll-screen.tsx");
    expect(home).not.toContain("run.label ? ` (${run.label})`");
    expect(home).not.toContain("subtitle={run.label ?? undefined}");
  });
});
