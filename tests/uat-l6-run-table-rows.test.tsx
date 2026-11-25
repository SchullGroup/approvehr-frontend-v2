import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Payslip, PayrollRunDetail } from "@/lib/api/payroll";

/**
 * UAT 23 Nov, L6 (PAY-27): once anybody had unpaid days, the run table grew an
 * "Unpaid days" column, names wrapped to three lines ("Adaeze / Okonkwo /
 * AHR-0001"), and at 1440px either Employee or Adjust was clipped. Unpaid days
 * are a second line under Gross now, and a name stays on one line.
 */

vi.mock("@/lib/store/overtime", () => ({
  useOvertimePolicy: () => ({ policy: { enabled: false } }),
}));
vi.mock("@/lib/payroll/use-settings", () => ({
  usePayrollSettings: () => ({ settings: { bonus: { enabled: false } } }),
}));
vi.mock("@/lib/store/payroll", () => ({
  usePayrollActions: () => ({
    lineSummary: () => Promise.resolve({ deductions: null }),
  }),
}));
vi.mock("@/app/(app)/payroll/runs/new/adjust-drawer", () => ({
  AdjustDrawer: () => null,
}));
vi.mock("@/app/(app)/payroll/runs/new/scheduled-note", () => ({
  ScheduledNote: () => null,
}));

const { ReviewStep } = await import("@/app/(app)/payroll/runs/new/review-step");
const { DEFAULT_REVIEW_VIEW } =
  await import("@/app/(app)/payroll/runs/new/review-model");

function slip(over: Partial<Payslip>): Payslip {
  return {
    id: "ps-1",
    employeeId: "emp-1",
    employeeNo: "AHR-0001",
    name: "Adaeze Okonkwo",
    grossKobo: 50_000_000,
    netKobo: 40_000_000,
    payeKobo: 5_000_000,
    unpaidDays: 0,
    lines: [],
    ...over,
  } as unknown as Payslip;
}

function renderStep(payslips: Payslip[]) {
  const run = {
    id: "run-1",
    preparedAt: "2026-11-20T10:00:00Z",
    payslips,
    exceptions: [],
    excludedCount: 0,
  } as unknown as PayrollRunDetail;
  return render(
    <ReviewStep
      run={run}
      periodLabel="November 2026"
      employees={[]}
      editable
      readOnlyReason={null}
      refreshing={false}
      view={DEFAULT_REVIEW_VIEW}
      onViewChange={() => {}}
      onSaved={() => {}}
      onAdjusted={() => {}}
    />,
  );
}

describe("the run table on a desktop", () => {
  const people = [
    slip({ unpaidDays: 3 }),
    slip({
      id: "ps-2",
      employeeId: "emp-2",
      employeeNo: "AHR-0002",
      name: "Emeka Anyanwu",
    }),
  ];

  it("has no Unpaid days column: the days are a second line under Gross", () => {
    renderStep(people);
    const table = screen.getByRole("table");
    expect(
      within(table).queryByRole("columnheader", { name: /Unpaid days/ }),
    ).toBeNull();
    const row = within(table)
      .getByRole("rowheader", { name: /Adaeze Okonkwo/ })
      .closest("tr")!;
    expect(row).toHaveTextContent("3 unpaid days");
    const other = within(table)
      .getByRole("rowheader", { name: /Emeka Anyanwu/ })
      .closest("tr")!;
    expect(other).not.toHaveTextContent(/unpaid/);
  });

  it("keeps a name on one line", () => {
    renderStep(people);
    const name = within(screen.getByRole("table")).getByRole("rowheader", {
      name: /Adaeze Okonkwo/,
    });
    expect(name.className).toContain("whitespace-nowrap");
  });
});
