import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/types";

const person = (id: string, last: string, over: Partial<Employee> = {}) =>
  ({
    id,
    firstName: "A",
    lastName: last,
    jobTitle: "Role",
    employeeNo: id,
    ...over,
  }) as unknown as Employee;

let employees: Employee[] = [];
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees,
    loading: false,
    connected: true,
    error: null,
    reload: () => {},
  }),
}));
vi.mock("@/lib/types", async (orig) => ({
  ...(await orig<typeof import("@/lib/types")>()),
  payrollFieldsForDisplay: (e: Employee) => e,
  payrollGapsFor: (e: { id: string }) =>
    e.id === "p1"
      ? [
          {
            field: "bankAccount",
            label: "Bank account",
            blocking: true,
            consequence: "x",
          },
        ]
      : e.id === "p2"
        ? [
            {
              field: "tin",
              label: "TIN",
              blocking: false,
              consequence: "y",
            },
          ]
        : [],
}));

import { IncompleteRecordsScreen } from "@/app/(app)/people/incomplete/incomplete-records-screen";

describe("incomplete records, guided", () => {
  it("shows progress, counts and one Fix next button", () => {
    employees = [person("p1", "Zed"), person("p2", "Yu"), person("p3", "Xi")];
    render(<IncompleteRecordsScreen />);
    expect(screen.getByText("1 of 3 records complete")).toBeInTheDocument();
    expect(
      screen.getByText("1 person needs bank details before they can be paid"),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 missing Bank account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fix next" })).toHaveAttribute(
      "href",
      "/people/p1?tab=pay&field=bankAccount",
    );
  });
});
