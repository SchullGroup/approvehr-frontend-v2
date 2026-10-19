import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { DecidedCard } from "@/components/payroll/decided-card";
import { ClaimForm } from "@/app/(app)/payroll/expenses/claim-form";
import type { ExpenseType } from "@/lib/store/reimbursements";

/**
 * Where the words from `expense-moments-copy` land on screen.
 *
 * The sentences themselves are tested beside their functions. What is tested
 * here is the behaviour around them: that sending a claim turns the dialog into
 * the statement rather than closing it behind a toast, that the dialog is not
 * closed until somebody says so, that "Add another" gives back a clean form, and
 * that a decision card can be closed.
 */

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const types: ExpenseType[] = [
  {
    id: "t-fuel",
    name: "Fuel",
    description: null,
    requiresReceipt: false,
    cap: null,
    active: true,
    archived: false,
    claimCount: 0,
    claimable: true,
  },
];

const colleagues = [
  { id: "me", name: "Chidi Nwosu" },
  { id: "amara", name: "Amara Nwachukwu" },
];

function fill() {
  fireEvent.change(screen.getByLabelText(/what was it for/i), {
    target: { value: "t-fuel" },
  });
  fireEvent.change(
    screen.getByPlaceholderText(
      "Diesel for the office generator during the outage",
    ),
    { target: { value: "Diesel for the generator" } },
  );
  fireEvent.change(screen.getByPlaceholderText("0.00"), {
    target: { value: "12000" },
  });
}

function renderForm(
  over: Partial<React.ComponentProps<typeof ClaimForm>> = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <ToastProvider>
      <ClaimForm
        open
        onClose={onClose}
        types={types}
        myEmployeeId="me"
        onSubmit={onSubmit}
        {...over}
      />
    </ToastProvider>,
  );
  return { onClose, onSubmit };
}

describe("sending an expense claim", () => {
  it("turns the dialog into what was sent, and does not close it", async () => {
    const { onClose, onSubmit } = renderForm();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    expect(
      await screen.findByRole("heading", {
        name: "Your claim is sent for approval",
      }),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/₦12,000\.00 under Fuel, spent /),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is owed to you until somebody approves it."),
    ).toBeInTheDocument();
    /* The form and its footer are gone, and nothing has closed the dialog. */
    expect(
      screen.queryByRole("button", { name: "Send for approval" }),
    ).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says one thing once: no toast alongside the statement", async () => {
    renderForm();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await screen.findByRole("heading", { name: /sent for approval/ });

    expect(screen.queryByText("Sent for approval")).toBeNull();
  });

  it("moves focus to the statement, because the button that was pressed has gone", async () => {
    renderForm();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    const heading = await screen.findByRole("heading", {
      name: "Your claim is sent for approval",
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("closes on Done, and only then", async () => {
    const { onClose } = renderForm();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await screen.findByRole("button", { name: "Done" });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives back a clean form on Add another, for the same person", async () => {
    renderForm({ colleagues });
    fireEvent.change(screen.getByLabelText(/who is claiming/i), {
      target: { value: "amara" },
    });
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(
      await screen.findByRole("heading", {
        name: "Amara Nwachukwu's claim is sent for approval",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add another" }));

    expect(screen.getByPlaceholderText("0.00")).toHaveValue("");
    expect(
      screen.getByPlaceholderText(
        "Diesel for the office generator during the outage",
      ),
    ).toHaveValue("");
    expect(screen.getByLabelText(/who is claiming/i)).toHaveValue("amara");
    expect(
      screen.getByRole("button", { name: "Send for approval" }),
    ).toBeDisabled();
  });

  it("keeps the form, and says why, when the API refuses", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Something went wrong. Try again."));
    renderForm({ onSubmit });
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /sent for approval/ }),
    ).toBeNull();
    expect(screen.getByPlaceholderText("0.00")).toHaveValue("12000");
  });
});

describe("a decision card", () => {
  it("can be closed", () => {
    const onDismiss = vi.fn();
    render(<DecidedCard title="Approved" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
