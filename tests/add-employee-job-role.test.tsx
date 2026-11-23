/**
 * U47 (HR-22, NC-24): the Job roles catalogue was used by no form, so setting
 * one up changed nothing about the people you added. The add-employee form
 * offers the catalogue as "Job role": choosing one fills the job title (which
 * stays free text) and links the person to the role. Without a choice nothing
 * is linked: a typed title is never matched to a role by guesswork.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BLANK_DRAFT } from "@/lib/store/employee-draft";
import { titleForRole } from "@/app/(app)/people/new/job-role";

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

describe("choosing a job role", () => {
  it("starts with none", () => {
    expect(BLANK_DRAFT.jobRoleId).toBe("");
  });

  it("fills an empty title, or one that was the last role's", () => {
    expect(titleForRole("", "", "Accountant")).toBe("Accountant");
    expect(titleForRole("Analyst", "Analyst", "Accountant")).toBe("Accountant");
  });

  it("keeps a title somebody typed themselves", () => {
    expect(titleForRole("Senior Accountant", "Accountant", "Auditor")).toBe(
      "Senior Accountant",
    );
  });

  it("is offered on the form and sent with the person", async () => {
    const form = readFileSync(
      path.resolve(import.meta.dirname, "../src/app/(app)/people/new/form.tsx"),
      "utf8",
    );
    expect(form).toMatch(/label="Job role"/);
    expect(form).toMatch(
      /draft\.jobRoleId \? \{ jobRoleId: draft\.jobRoleId \}/,
    );

    const { result } = renderHook(() => useEmployeeMutations());
    await act(async () => {
      await result.current.create({
        firstName: "Tobi",
        lastName: "Ade",
        jobRoleId: "role-1",
      });
      await result.current.create({ firstName: "Bisi", lastName: "Ade" });
    });
    expect(create.mock.calls[0]![0]).toMatchObject({ jobRoleId: "role-1" });
    expect(create.mock.calls[1]![0]).not.toHaveProperty("jobRoleId");
  });
});
