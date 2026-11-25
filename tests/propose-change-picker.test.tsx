/**
 * U18 (HR-4): "Propose a change" listed only the first page of the directory
 * (25 people, A to G) in a plain select, so nobody further down the alphabet
 * could be promoted. It now searches the whole company.
 *
 * U14 (HR-14): the record page opens the same dialog for one person, with the
 * kind of change already chosen, so pay, title and department go through
 * approval instead of being saved straight onto the record.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const propose = vi.fn();
const search = vi.fn();

vi.mock("@/lib/store/employment-changes", () => ({
  useEmploymentChangeActions: () => ({ propose, readOnly: false }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [{ id: "d-ops", name: "Operations" }] }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
/* The optional "Linked query" choice has its own tests (`query-linked-field.test.tsx`); this file
   is about who can be chosen, and the field asks the permissions and the queries register. */
vi.mock("@/components/queries/linked-query", () => ({
  LinkedQueryField: () => null,
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeSearch: () => ({
    search,
    options: [{ value: "e-zainab", label: "Zainab Yusuf", hint: "Accountant" }],
    pending: false,
    failed: false,
    more: false,
    retry: vi.fn(),
  }),
  useEmployee: (id: string) => ({
    employee:
      id === "e-zainab"
        ? { id, jobTitle: "Accountant", grossMonthly: 300000 }
        : null,
  }),
}));

import { ProposeChangeDialog } from "@/app/(app)/people/changes/propose-dialog";

beforeEach(() => {
  propose.mockReset();
  propose.mockResolvedValue(undefined);
  search.mockReset();
});

describe("Propose a change", () => {
  it("searches the whole company for the person", async () => {
    render(<ProposeChangeDialog onClose={vi.fn()} />);
    const box = screen.getByRole("combobox", { name: "Who" });
    await userEvent.type(box, "Zai");
    expect(search).toHaveBeenLastCalledWith("Zai");
    await userEvent.click(screen.getByRole("option", { name: /Zainab Yusuf/ }));
    expect(screen.getByText("Currently Accountant.")).toBeInTheDocument();
  });

  it("opens for one person with the kind already chosen", async () => {
    render(
      <ProposeChangeDialog
        onClose={vi.fn()}
        person={{ id: "e-zainab", name: "Zainab Yusuf" }}
        kind="PAY_CHANGE"
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Who" })).toBeNull();
    expect(screen.getByText("Zainab Yusuf")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("What kind of change") as HTMLSelectElement).value,
    ).toBe("PAY_CHANGE");

    fireEvent.change(screen.getByLabelText(/New monthly pay/), {
      target: { value: "320000" },
    });
    fireEvent.change(screen.getByLabelText(/Why/), {
      target: { value: "Annual review" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Send for approval" }),
    );
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "e-zainab",
        kind: "PAY_CHANGE",
        to: { grossMonthlyKobo: 32000000 },
      }),
    );
  });
});
