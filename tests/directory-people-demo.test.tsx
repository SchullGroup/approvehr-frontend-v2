import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { leadsWorkOf } from "@/app/(app)/performance/goal-facts";

/**
 * Demo mode has no API and no lookup rows: the local store holds the full
 * records, so `employees` is the whole directory as before and `people` is the
 * part of it everybody may see. A department there is a **name** with no id,
 * which is why the "people I lead" rule falls back to the name when a person
 * has no `departmentId`.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { useEmployeeDirectory } = await import("@/lib/store/employees-api");

describe("useEmployeeDirectory in demo mode", () => {
  it("keeps `employees` as the store's full records", () => {
    const { result } = renderHook(() =>
      useEmployeeDirectory({ pageSize: 200 }),
    );
    expect(result.current.connected).toBe(false);
    expect(result.current.lookupOnly).toBe(false);
    expect(result.current.employees.length).toBeGreaterThan(0);
    expect(result.current.employees[0]).toHaveProperty("status");
  });

  it("gives `people` for the same people, named as the store names them", () => {
    const { result } = renderHook(() =>
      useEmployeeDirectory({ pageSize: 200 }),
    );
    const { employees, people } = result.current;
    expect(people.map((p) => p.id)).toEqual(employees.map((e) => e.id));
    expect(people[0]?.fullName).toBe(
      `${employees[0]?.firstName} ${employees[0]?.lastName}`,
    );
    expect(people.map((p) => p.jobTitle)).toEqual(
      employees.map((e) => e.jobTitle),
    );
  });

  it("says nothing about ids it does not hold, so the rule falls back to names", () => {
    const { result } = renderHook(() =>
      useEmployeeDirectory({ pageSize: 200 }),
    );
    const withDepartment = result.current.people.find(
      (p) => p.department !== null,
    );
    expect(withDepartment).toBeDefined();
    expect(withDepartment).not.toHaveProperty("departmentId");

    const head = {
      employeeId: "somebody-else",
      leadsEveryone: false,
      headedDepartmentIds: new Set<string>(),
      headedDepartmentNames: new Set([withDepartment!.department!]),
    };
    expect(leadsWorkOf(withDepartment!, head)).toBe(true);
  });
});
