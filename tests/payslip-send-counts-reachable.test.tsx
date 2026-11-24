/**
 * U77 (PAY-21), web part: "Send 62 payslips" started sending at once, and after
 * a send that found 48 people with no email address the button read "Send 48
 * payslips" for ever, though pressing it could never reach them. Sending now
 * asks first, and the button stops counting people it has been told it cannot
 * email.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendPayslips = vi.fn();
vi.mock("@/lib/store/payroll", () => ({
  usePayrollActions: () => ({ sendPayslips }),
}));

import { SendPayslips } from "@/app/(app)/payroll/payslips/send-panel";

const outcome = {
  sent: 14,
  noEmail: Array.from({ length: 48 }, (_, i) => ({
    name: `Person ${String(i)}`,
    employeeNo: `AHR-${String(100 + i)}`,
  })),
  failed: [],
  alreadySent: 0,
};

beforeEach(() => {
  sendPayslips.mockReset();
  sendPayslips.mockResolvedValue(outcome);
});

describe("sending payslips", () => {
  it("asks before sending, because an email cannot be taken back", async () => {
    render(<SendPayslips runId="r1" approved notSent={62} onSent={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send 62 payslips" }),
    );
    expect(sendPayslips).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send them" }));
    expect(sendPayslips).toHaveBeenCalledWith("r1");
  });

  it("does not offer to send to people it was told have no address", async () => {
    const { rerender } = render(
      <SendPayslips runId="r1" approved notSent={62} onSent={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send 62 payslips" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send them" }));
    await screen.findByText(/48 people have no email address/);
    /* The page re-reads its counts: 48 still not sent. */
    rerender(
      <SendPayslips runId="r1" approved notSent={48} onSent={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: "Send 48 payslips" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Nobody left to email" }),
    ).toBeDisabled();
  });
});
