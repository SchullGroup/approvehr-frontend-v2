import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseTypes } from "@/app/(app)/payroll/expenses/expense-types";
import type { ExpenseType } from "@/lib/store/reimbursements";

/**
 * The type dialog opens holding the type's own values.
 *
 * `TypeDialog` stays mounted so `Modal` can play its exit animation, which
 * means its draft is seeded once, at mount, when nothing is being edited yet.
 * Edit on "Fuel" then opened an empty form, and Save after typing only a name
 * wrote a blank cap and a switched-on receipt rule over the real ones.
 */

const fuel: ExpenseType = {
  id: "t-fuel",
  name: "Fuel",
  description: "Diesel for the generator and petrol for the pool car",
  requiresReceipt: false,
  cap: 15000,
  active: true,
  archived: false,
  claimCount: 3,
  claimable: true,
};

const transport: ExpenseType = {
  id: "t-transport",
  name: "Transport",
  description: "Buses, keke and ride-hailing for work trips",
  requiresReceipt: true,
  cap: 25000.5,
  active: true,
  archived: false,
  claimCount: 0,
  claimable: true,
};

function renderTypes() {
  const onCreate = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  render(
    <ExpenseTypes
      types={[fuel, transport]}
      loading={false}
      canManage
      includeArchived={false}
      onIncludeArchivedChange={vi.fn()}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onArchive={vi.fn().mockResolvedValue(true)}
    />,
  );
  return { onCreate, onUpdate };
}

/** The Edit button in the table row, not the duplicate in the phone list. */
function edit(name: string) {
  fireEvent.click(
    within(screen.getByRole("row", { name: new RegExp(name) })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
}

function form() {
  const dialog = screen.getByRole("dialog");
  return {
    dialog,
    name: within(dialog).getByLabelText(/^name/i),
    description: within(dialog).getByLabelText(/what it covers/i),
    cap: within(dialog).getByLabelText(/cap a claim, in naira/i),
    receipt: within(dialog).getByRole("switch", {
      name: /a receipt is needed/i,
    }),
  };
}

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("editing an expense type", () => {
  it("opens with every field filled in and saves them unchanged", async () => {
    const { onUpdate } = renderTypes();

    edit("Fuel");
    const fields = form();
    expect(screen.getByRole("dialog", { name: "Edit Fuel" })).toBe(
      fields.dialog,
    );
    expect(fields.name).toHaveValue("Fuel");
    expect(fields.description).toHaveValue(fuel.description);
    expect(fields.cap).toHaveValue("15000.00");
    expect(fields.receipt).not.toBeChecked();

    fireEvent.click(
      within(fields.dialog).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith("t-fuel", {
      name: "Fuel",
      description: fuel.description,
      requiresReceipt: false,
      cap: 15000,
    });
  });

  it("keeps the cap, the description and the receipt rule when only the name changes", async () => {
    const { onUpdate } = renderTypes();

    edit("Fuel");
    const fields = form();
    fireEvent.change(fields.name, { target: { value: "Fuel and diesel" } });
    fireEvent.click(
      within(fields.dialog).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith("t-fuel", {
      name: "Fuel and diesel",
      description: fuel.description,
      requiresReceipt: false,
      cap: 15000,
    });
  });

  it("shows the second type's values when it is opened after the first", async () => {
    const { onUpdate } = renderTypes();

    edit("Fuel");
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );
    await gone();

    edit("Transport");
    const fields = form();
    expect(screen.getByRole("dialog", { name: "Edit Transport" })).toBe(
      fields.dialog,
    );
    expect(fields.name).toHaveValue("Transport");
    expect(fields.description).toHaveValue(transport.description);
    expect(fields.cap).toHaveValue("25000.50");
    expect(fields.receipt).toBeChecked();

    fireEvent.click(
      within(fields.dialog).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith("t-transport", {
      name: "Transport",
      description: transport.description,
      requiresReceipt: true,
      cap: 25000.5,
    });
  });

  it("does not carry a half-finished edit over to the next opening", async () => {
    renderTypes();

    edit("Fuel");
    fireEvent.change(form().name, { target: { value: "Something else" } });
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );
    await gone();

    edit("Fuel");
    expect(form().name).toHaveValue("Fuel");
  });

  it("opens the second type even while the first is still leaving", () => {
    renderTypes();

    edit("Fuel");
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );
    edit("Transport");

    const fields = form();
    expect(fields.name).toHaveValue("Transport");
    expect(fields.cap).toHaveValue("25000.50");
  });

  it("keeps its title and button while it leaves, rather than turning into Add", () => {
    renderTypes();

    edit("Fuel");
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );

    const leaving = screen.getByRole("dialog");
    expect(
      within(leaving).getByRole("heading", { name: "Edit Fuel" }),
    ).toBeInTheDocument();
    expect(
      within(leaving).getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
  });
});

describe("adding an expense type", () => {
  it("opens blank, with the receipt rule on, even after an edit", async () => {
    renderTypes();

    edit("Fuel");
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );
    await gone();

    fireEvent.click(screen.getByRole("button", { name: "Add a type" }));
    const fields = form();
    expect(screen.getByRole("dialog", { name: "Add an expense type" })).toBe(
      fields.dialog,
    );
    expect(fields.name).toHaveValue("");
    expect(fields.description).toHaveValue("");
    expect(fields.cap).toHaveValue("");
    expect(fields.receipt).toBeChecked();
  });

  it("opens blank again after something was typed and cancelled", async () => {
    renderTypes();

    fireEvent.click(screen.getByRole("button", { name: "Add a type" }));
    fireEvent.change(form().name, { target: { value: "Taxi" } });
    fireEvent.click(
      within(form().dialog).getByRole("button", { name: "Cancel" }),
    );
    await gone();

    fireEvent.click(screen.getByRole("button", { name: "Add a type" }));
    expect(form().name).toHaveValue("");
  });
});
