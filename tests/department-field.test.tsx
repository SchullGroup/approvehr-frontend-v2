import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartmentField } from "@/components/projects/department-field";

/**
 * The Department field of a new project or program: required, chosen by name, and
 * — for somebody who may manage settings — able to add a department without leaving
 * the dialog.
 */

let canManage = true;
let flat: { id: string; name: string; archived: boolean }[] = [];
const create = vi.fn();

vi.mock("@/lib/permissions", () => ({
  useCan: () => canManage,
}));

vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat, loading: false, create }),
}));

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  return (
    <>
      <DepartmentField value={value} onChange={setValue} error={error} />
      <output data-testid="chosen">{value}</output>
    </>
  );
}

beforeEach(() => {
  canManage = true;
  flat = [
    { id: "d-fin", name: "Finance", archived: false },
    { id: "d-old", name: "Old team", archived: true },
    { id: "d-eng", name: "Engineering", archived: false },
  ];
  create.mockReset();
});

describe("DepartmentField", () => {
  it("offers the live departments by name, and chooses one", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: /Department/ }));
    expect(screen.queryByRole("option", { name: "Old team" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Finance" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent("d-fin");
  });

  it("shows the dialog's error when nothing is chosen", () => {
    render(<Harness error="Choose a department." />);
    expect(screen.getByText("Choose a department.")).toBeInTheDocument();
  });

  it("adds a department inline and chooses it, for somebody who may", async () => {
    create.mockResolvedValue({ id: "d-ops", name: "Operations" });
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: /Department/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Add a department/ }),
    );
    await userEvent.type(
      screen.getByLabelText(/New department/),
      "Operations{Enter}",
    );
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: "Operations" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("chosen")).toHaveTextContent("d-ops"),
    );
    expect(screen.queryByLabelText(/New department/)).toBeNull();
  });

  it("says why when the department cannot be added", async () => {
    create.mockRejectedValue(
      new Error("A department called Finance already exists."),
    );
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: /Department/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Add a department/ }),
    );
    await userEvent.type(screen.getByLabelText(/New department/), "Finance");
    await userEvent.click(
      screen.getByRole("button", { name: "Add and use it" }),
    );
    expect(
      await screen.findByText("A department called Finance already exists."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("chosen")).toHaveTextContent("");
  });

  it("offers no way to add one to somebody who may not manage settings", async () => {
    canManage = false;
    flat = [];
    render(<Harness />);
    expect(screen.getByText(/Ask HR to add one/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a department" }),
    ).toBeNull();
  });

  it("offers to add the first one when there are none", async () => {
    flat = [];
    render(<Harness />);
    expect(screen.getByText(/Add the first one here/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a department" }),
    );
    expect(screen.getByLabelText(/New department/)).toBeInTheDocument();
  });
});
