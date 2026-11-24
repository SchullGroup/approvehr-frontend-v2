/**
 * U84 (NC-26): "Add account number" on a payroll blocker was a link out of the
 * run to the person's Pay tab (ten fields), and back by hand, and "Run again",
 * once per person. It is now a two-field dialog over the run: the bank and the
 * ten digits, saved to the record, and the run calculated again.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/payments/account-verification", () => ({
  AccountVerificationHint: () => null,
}));

import { BankAccountDialog } from "@/components/payroll/bank-account-dialog";

const wizard = readFileSync(
  "src/app/(app)/payroll/runs/new/wizard.tsx",
  "utf8",
);

async function chooseBank(name: string) {
  await userEvent.click(screen.getByRole("combobox", { name: /^Bank/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

describe("adding an account number inside the run", () => {
  it("asks for the bank and ten digits, and saves both", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <BankAccountDialog
        open
        name="Adaeze Okonkwo"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText(/Adaeze Okonkwo/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save and recalculate" });
    expect(save).toBeDisabled();

    await chooseBank("Access Bank");
    fireEvent.change(screen.getByLabelText(/^Account number/), {
      target: { value: "012345678" },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Account number/), {
      target: { value: "0123456789" },
    });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({
      bankName: "Access Bank",
      bankAccount: "0123456789",
    });
  });

  it("keeps what was typed and says why when the save is refused", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error("That account number is not valid."));
    const onClose = vi.fn();
    render(
      <BankAccountDialog
        open
        name="Adaeze Okonkwo"
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await chooseBank("Access Bank");
    fireEvent.change(screen.getByLabelText(/^Account number/), {
      target: { value: "0123456789" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save and recalculate" }),
    );
    expect(
      await screen.findByText("That account number is not valid."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Account number/)).toHaveValue("0123456789");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("starts blank each time it opens", async () => {
    const props = {
      name: "Adaeze Okonkwo",
      onClose: vi.fn(),
      onSave: vi.fn(),
    };
    const { rerender } = render(<BankAccountDialog open {...props} />);
    fireEvent.change(screen.getByLabelText(/^Account number/), {
      target: { value: "0123456789" },
    });
    rerender(<BankAccountDialog open={false} {...props} />);
    rerender(<BankAccountDialog open {...props} />);
    expect(screen.getByLabelText(/^Account number/)).toHaveValue("");
  });

  it("is offered by the run in place of the link", () => {
    expect(wizard).toContain("<BankAccountDialog");
    expect(wizard).toMatch(/replaceFixFor=\{/);
    expect(wizard).toContain('"missing_bank_account"');
  });
});
