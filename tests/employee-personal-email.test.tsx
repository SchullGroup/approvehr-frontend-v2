/**
 * U16 (HR-19): a hire from recruitment arrives with no work email and their
 * own address in `personalEmail`, so HR can reach them while a work address is
 * set up. The record carries it both ways.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const update = vi.fn();
vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    employees: {
      ...actual.employees,
      update: (...a: unknown[]) => update(...a),
    },
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));

import { toEmployee, type ApiEmployee } from "@/lib/api/endpoints";
import { useEmployeeMutations } from "@/lib/store/employees-api";

beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue({
    id: "e1",
    firstName: "Tobi",
    lastName: "Adeyemi",
    status: "ONBOARDING",
    employmentType: "FULL_TIME",
  });
});

describe("a personal email address", () => {
  it("comes through from the API, and is absent from one that does not send it", () => {
    const base = {
      id: "e1",
      firstName: "Tobi",
      lastName: "Adeyemi",
      status: "ONBOARDING",
      employmentType: "FULL_TIME",
    } as unknown as ApiEmployee;
    expect(
      toEmployee({ ...base, personalEmail: "tobi@gmail.com" } as ApiEmployee)
        .personalEmail,
    ).toBe("tobi@gmail.com");
    expect(toEmployee(base)).not.toHaveProperty("personalEmail");
  });

  it("is saved, and an emptied box removes it", async () => {
    const { result } = renderHook(() => useEmployeeMutations());
    await act(async () => {
      await result.current.update("e1", { personalEmail: "tobi@gmail.com" });
    });
    expect(update.mock.calls[0]![1]).toMatchObject({
      personalEmail: "tobi@gmail.com",
    });
    await act(async () => {
      await result.current.update("e1", { personalEmail: "" });
    });
    expect(update.mock.calls[1]![1]).toMatchObject({ personalEmail: null });
  });
});
