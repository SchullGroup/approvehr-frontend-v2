/**
 * U55 (NC-15), web part: adding one person never asked gender, so everybody
 * added that way was offered both maternity and paternity leave. The form has
 * an optional Gender on its first step, the draft keeps it, and the create
 * mapping sends it. Left blank, nothing is sent.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BLANK_DRAFT } from "@/lib/store/employee-draft";

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
  create.mockResolvedValue({ id: "e1" });
});

describe("gender when adding one person", () => {
  it("starts blank in the draft", () => {
    expect(BLANK_DRAFT.gender).toBe("");
  });

  it("is asked on the first step, as optional", () => {
    const form = readFileSync(
      path.resolve(import.meta.dirname, "../src/app/(app)/people/new/form.tsx"),
      "utf8",
    );
    expect(form).toMatch(/label="Gender"\s+optional/);
    expect(form).toMatch(/draft\.gender \? \{ gender: draft\.gender \}/);
  });

  it("is sent when chosen and left out when not", async () => {
    const { result } = renderHook(() => useEmployeeMutations());
    await act(async () => {
      await result.current.create({
        firstName: "Tobi",
        lastName: "Ade",
        gender: "male",
      });
      await result.current.create({ firstName: "Bisi", lastName: "Ade" });
    });
    expect(create.mock.calls[0]![0]).toMatchObject({ gender: "male" });
    expect(create.mock.calls[1]![0]).not.toHaveProperty("gender");
  });
});
