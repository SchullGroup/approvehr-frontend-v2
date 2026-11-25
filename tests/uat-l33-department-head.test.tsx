import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UAT 23 Nov, L33 (NC-28): a department's own page said "Head: Nobody
 * assigned" with nothing to do about it; the only way to set one was the ⋯
 * menu on the departments list.
 */

const state = vi.hoisted(() => ({
  canManage: true,
  update: vi.fn(() => Promise.resolve({})),
  reload: vi.fn(),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => state.canManage,
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartment: () => ({
    loading: false,
    reload: state.reload,
    detail: {
      id: "d-ops",
      name: "Operations",
      parentId: null,
      ancestors: [],
      costCentre: null,
      archived: false,
      headId: null,
      headName: null,
      directEmployees: 1,
      totalEmployees: 1,
      childCount: 0,
      payrollKobo: null,
      employees: [],
    },
  }),
  useDepartments: () => ({ update: state.update }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [
      {
        id: "e-ada",
        firstName: "Adaeze",
        lastName: "Okonkwo",
        jobTitle: "Ops Lead",
      },
    ],
  }),
}));

const { DepartmentDetailScreen } =
  await import("@/app/(app)/people/departments/[id]/detail-screen");

beforeEach(() => {
  state.update.mockClear();
  state.reload.mockClear();
});

describe("a department's own page", () => {
  it("offers to assign a head where there is none", async () => {
    state.canManage = true;
    render(<DepartmentDetailScreen id="d-ops" />);
    act(() => screen.getByRole("button", { name: "Assign a head" }).click());
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Head of Operations");
  });

  it("saves the head and reads the unit again", async () => {
    state.canManage = true;
    render(<DepartmentDetailScreen id="d-ops" />);
    act(() => screen.getByRole("button", { name: "Assign a head" }).click());
    const select = (await screen.findByRole("dialog")).querySelector("select")!;
    act(() => {
      select.value = "e-ada";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => screen.getByRole("button", { name: "Save" }).click());
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith("d-ops", { headId: "e-ada" }),
    );
    await waitFor(() => expect(state.reload).toHaveBeenCalled());
  });

  it("offers nothing to somebody who cannot change the structure", () => {
    state.canManage = false;
    render(<DepartmentDetailScreen id="d-ops" />);
    expect(screen.queryByRole("button", { name: "Assign a head" })).toBeNull();
    expect(screen.getAllByText("Nobody assigned").length).toBeGreaterThan(0);
  });
});
