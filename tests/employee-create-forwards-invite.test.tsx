/**
 * U15 (HR-1, NC-2): "Add employee" set `invite`, `accessRoleId` and
 * `middleName`, and the create mapping in `useEmployeeMutations` dropped all
 * three. So no invitation went out, the chosen access was ignored, and the
 * middle name was lost. Because the record was then `canLogin: true`, the bulk
 * "Invite staff" list hid the person too.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const create = vi.fn();

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    employees: {
      ...actual.employees,
      create: (...a: unknown[]) => create(...a),
    },
    toEmployee: (row: { id: string }) => ({ id: row.id }),
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));

import { useEmployeeMutations } from "@/lib/store/employees-api";

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "e1", invited: { sent: 1 } });
});

describe("creating an employee", () => {
  it("sends the invite, the access role and the middle name", async () => {
    const { result } = renderHook(() => useEmployeeMutations());
    await act(async () => {
      await result.current.create({
        firstName: "Adaeze",
        lastName: "Okafor",
        middleName: "Ngozi",
        email: "adaeze.okafor@schull.io",
        canLogin: true,
        invite: true,
        accessRoleId: "role-hr",
      });
    });
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.invite).toBe(true);
    expect(body.accessRoleId).toBe("role-hr");
    expect(body.middleName).toBe("Ngozi");
  });

  it("sends none of the three when they were not given", async () => {
    const { result } = renderHook(() => useEmployeeMutations());
    await act(async () => {
      await result.current.create({ firstName: "Bisi", lastName: "Ade" });
    });
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("invite");
    expect(body).not.toHaveProperty("accessRoleId");
    expect(body).not.toHaveProperty("middleName");
  });
});
