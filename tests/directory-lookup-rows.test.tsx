import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEmployee, ApiEmployeeLookup } from "@/lib/api/endpoints";

/**
 * `GET /employees` answers a caller without `EDIT_RECORDS` with lookup rows —
 * name, title, department, manager — and no status. `toEmployee` read the
 * status, threw, and `useEmployeeDirectory` swallowed it into an empty list,
 * so everything built on it was blank for a department head: the "Give a KPI to
 * people" dialog said nobody was in the department.
 *
 * What is pinned here is the hook's side of the fix: it no longer throws on a
 * lookup row, `people` carries everybody, and `employees` is **empty rather than
 * partial** — an `Employee` made up with a default status would be a claim
 * nobody checked. A full row still fills both.
 */

const list = vi.fn();

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    employees: {
      ...actual.employees,
      list: (...args: unknown[]) => list(...args),
    },
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { useEmployeeDirectory } = await import("@/lib/store/employees-api");

const lookupRow = (
  id: string,
  over: Partial<ApiEmployeeLookup> = {},
): ApiEmployeeLookup => ({
  id,
  fullName: `Person ${id}`,
  jobTitle: "Analyst",
  department: "Engineering",
  departmentId: "d-eng",
  managerId: "boss",
  ...over,
});

const fullRow = (id: string): ApiEmployee =>
  ({
    ...lookupRow(id),
    employeeNo: `E-${id}`,
    firstName: "Person",
    lastName: id,
    middleName: null,
    email: `${id}@example.test`,
    phone: null,
    dateOfBirth: null,
    gender: null,
    managerName: null,
    workLocationId: null,
    workLocation: null,
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    startDate: "2025-01-01",
    endDate: null,
    salaryGradeId: null,
    salaryGrade: null,
    payeManualOverride: false,
    canLogin: false,
    grossMonthlyKobo: null,
    bankName: null,
    bankAccount: null,
    addressLine: null,
    nin: null,
    stateOfOrigin: null,
    lgaOfOrigin: null,
    religion: null,
    pensionPin: null,
    pensionProvider: null,
    taxState: "Lagos",
    tin: null,
    nhfNumber: null,
    annualRentKobo: null,
    rentDeclaredAt: null,
    nextOfKin: null,
    avatarUrl: null,
    archived: false,
    missingForPayroll: [],
    payrollReady: true,
    legalEntityId: null,
  }) as unknown as ApiEmployee;

const page = (data: unknown[]) => ({
  data,
  meta: { total: data.length, page: 1, pageSize: 200 },
});

beforeEach(() => list.mockReset());

describe("useEmployeeDirectory with lookup rows", () => {
  it("lists everybody in `people` and says it is lookup-only", async () => {
    list.mockResolvedValue(
      page([lookupRow("a"), lookupRow("b", { managerId: null })]),
    );
    const { result } = renderHook(() =>
      useEmployeeDirectory({ pageSize: 200 }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lookupOnly).toBe(true);
    expect(result.current.people.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.current.people[0]).toMatchObject({
      fullName: "Person a",
      departmentId: "d-eng",
      managerId: "boss",
    });
    expect(result.current.total).toBe(2);
  });

  it("leaves `employees` empty rather than inventing records to put in it", async () => {
    list.mockResolvedValue(page([lookupRow("a")]));
    const { result } = renderHook(() => useEmployeeDirectory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.employees).toEqual([]);
    expect(result.current.archivedIds.size).toBe(0);
  });

  it("does not throw into an empty list any more", async () => {
    list.mockResolvedValue(page([lookupRow("a")]));
    const { result } = renderHook(() => useEmployeeDirectory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.people).toHaveLength(1);
  });
});

describe("useEmployeeDirectory with full rows", () => {
  it("fills `employees` as before, and `people` with the part everybody may see", async () => {
    list.mockResolvedValue(page([fullRow("a"), fullRow("b")]));
    const { result } = renderHook(() => useEmployeeDirectory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lookupOnly).toBe(false);
    expect(result.current.employees.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.current.employees[0]).toMatchObject({
      status: "active",
      email: "a@example.test",
    });
    expect(result.current.people.map((p) => p.fullName)).toEqual([
      "Person a",
      "Person b",
    ]);
  });
});
