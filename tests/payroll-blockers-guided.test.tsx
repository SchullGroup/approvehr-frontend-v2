import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExceptionList } from "@/components/payroll/run-panels";
import type { RunException } from "@/lib/api/payroll";

/**
 * Owner direction, 24 Nov 2026: no warning walls. People who cannot be paid are
 * one progress line, a count per kind, and ONE button. Names are inside the
 * dialog, never on the page.
 */

const blocker = (
  id: string,
  employeeId: string,
  message: string,
): RunException => ({
  id,
  employeeId,
  severity: "BLOCKER",
  code: "missing_bank_account",
  message,
});

const rows = [
  blocker("1", "e1", "Ada Eze has no account number on file."),
  blocker("2", "e2", "Bola Obi has no account number on file."),
  blocker("3", "e3", "Chidi Nwosu has no account number on file."),
];

describe("payroll blockers", () => {
  it("shows a progress line, a count and one button, and no names", () => {
    render(<ExceptionList exceptions={rows} total={10} />);
    expect(screen.getByText("7 of 10 ready")).toBeInTheDocument();
    expect(
      screen.getByText(/3 people have no usable bank account/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fix them" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ada Eze/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Review and fix" })).toBeNull();
  });

  it("puts the people in the dialog", async () => {
    render(<ExceptionList exceptions={rows} total={10} />);
    await userEvent.click(screen.getByRole("button", { name: "Fix them" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Ada Eze/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Chidi Nwosu/)).toBeInTheDocument();
  });

  it("says nothing about progress when the run's size is not known", () => {
    render(<ExceptionList exceptions={rows} />);
    expect(screen.queryByText(/ready/)).toBeNull();
  });
});
