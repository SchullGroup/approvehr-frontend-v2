import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * "Add several objectives" is one table with pickers (UAT 23 Nov, U105 /
 * PERF-26). It offered three layouts of thirteen fields, asked for a typed work
 * email, and for "the exact title" of a parent objective.
 */
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    isConnected: true,
    user: { email: "amara.nwachukwu@schull.io" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployeeDirectory: () => ({
    employees: [
      {
        id: "e-1",
        firstName: "Halima",
        lastName: "Sani",
        email: "halima.sani@schull.io",
      },
    ],
    archivedIds: new Set(),
  }),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => ({
    cycles: [
      { id: "c-1", name: "H1 2026 appraisal", stage: "PUBLISHED" },
      { id: "c-2", name: "H2 2026 appraisal", stage: "CALIBRATION" },
    ],
  }),
}));
vi.mock("@/app/(app)/performance/kpis/import/lists", () => ({
  useObjectiveTemplateLists: () => ({
    lists: { department: ["Operations"], period: ["H2 2026 appraisal"] },
  }),
}));

const { AddMultipleObjectives } =
  await import("@/app/(app)/performance/add-multiple-objectives");

const goals = [
  {
    id: "g-1",
    title: "Cut supplier queries by half",
    level: "department",
    departmentName: "Operations",
  },
] as unknown as ApiGoal[];

const mount = () =>
  render(
    <ToastProvider>
      <AddMultipleObjectives
        open
        onClose={() => undefined}
        goals={goals}
        onChanged={() => undefined}
      />
    </ToastProvider>,
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

describe("Add several objectives", () => {
  it("is one table, with no layout to choose", () => {
    mount();
    expect(screen.queryByRole("radio", { name: "Stacked" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Page by page" })).toBeNull();
    expect(screen.getByRole("dialog").querySelector("table")).not.toBeNull();
  });

  it("picks who it is assigned to from the staff list, by name", () => {
    mount();
    const assigned = screen.getAllByLabelText(
      /Assigned to/,
    )[0] as HTMLSelectElement;
    expect(assigned.tagName).toBe("SELECT");
    expect(
      within(assigned).getByRole("option", {
        name: "Halima Sani, halima.sani@schull.io",
      }),
    ).toHaveValue("halima.sani@schull.io");
  });

  it("picks the objective it sits under, from the ones that can be a parent", () => {
    mount();
    const parent = screen.getAllByLabelText(
      /Sits under|Parent/,
    )[0] as HTMLSelectElement;
    expect(parent.tagName).toBe("SELECT");
    expect(
      within(parent).getByRole("option", {
        name: "Cut supplier queries by half, Operations",
      }),
    ).toBeInTheDocument();
  });

  it("starts each row in the open appraisal period", () => {
    mount();
    const period = screen.getAllByLabelText(
      /Appraisal period/,
    )[0] as HTMLSelectElement;
    expect(period.value).toBe("H2 2026 appraisal");
  });
});
