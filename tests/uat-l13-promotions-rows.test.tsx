import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiEmploymentChangeRow } from "@/lib/api/endpoints";

/**
 * UAT 23 Nov, L13 (HR-27): the Promotions table wrapped names over three lines,
 * broke "2026-11-01" as "2026-11-" / "01", said "new grade" without naming it,
 * and told HR that "the worker is not running".
 */

const state = vi.hoisted(() => ({ rows: [] as ApiEmploymentChangeRow[] }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/store/employment-changes", () => ({
  DEMO_CHANGE_HEADING: "",
  DEMO_CHANGE_REASON: "",
  useEmploymentChanges: () => ({
    rows: state.rows,
    loading: false,
    error: null,
    unavailable: false,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/grades", () => ({
  useGrades: () => ({
    rows: [{ id: "g-5", code: "G5", name: "Grade 5" }],
    loading: false,
    error: null,
  }),
}));
vi.mock("@/app/(app)/people/changes/decide-dialog", () => ({
  DecideChangeDialog: () => null,
}));
vi.mock("@/app/(app)/people/changes/propose-dialog", () => ({
  ProposeChangeDialog: () => null,
}));

const { ChangesScreen } =
  await import("@/app/(app)/people/changes/changes-screen");

function change(over: Partial<ApiEmploymentChangeRow>): ApiEmploymentChangeRow {
  return {
    id: "ch-1",
    employeeId: "e1",
    employeeNo: "AHR-0004",
    name: "Chidi Nwosu",
    jobTitle: "Analyst",
    kind: "GRADE_CHANGE",
    kindLabel: "Grade change",
    status: "PENDING_APPROVAL",
    effectiveOn: "2026-11-01",
    daysUntilEffective: 5,
    requestedById: null,
    requestedAt: "2026-11-20",
    note: "Promoted after review",
    fromValue: null,
    toValue: { salaryGradeId: "g-5" },
    ...over,
  } as ApiEmploymentChangeRow;
}

describe("the Promotions table", () => {
  it("writes the date as 1 Nov 2026, on one line", () => {
    state.rows = [change({})];
    render(<ChangesScreen />);
    const cell = screen.getByText("1 Nov 2026");
    expect(cell.closest("td")?.className).toContain("whitespace-nowrap");
    expect(screen.queryByText("2026-11-01")).toBeNull();
  });

  it("names the grade instead of saying new grade", () => {
    state.rows = [change({})];
    render(<ChangesScreen />);
    expect(screen.getByText(/to Grade 5/)).toBeInTheDocument();
    expect(screen.queryByText(/new grade/)).toBeNull();
  });

  it("keeps a name on one line", () => {
    state.rows = [change({})];
    render(<ChangesScreen />);
    const name = within(screen.getByRole("table")).getByRole("rowheader", {
      name: /Chidi Nwosu/,
    });
    expect(name.className).toContain("whitespace-nowrap");
  });

  it("says a late change in plain words, with no talk of a worker", () => {
    state.rows = [change({ status: "SCHEDULED", daysUntilEffective: -3 })];
    render(<ChangesScreen />);
    expect(document.body.textContent).not.toMatch(/worker/i);
    expect(screen.getAllByText(/1 Nov 2026/).length).toBeGreaterThan(0);
  });
});
