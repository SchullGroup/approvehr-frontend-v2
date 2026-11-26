/**
 * Resending every payslip, behind two questions.
 *
 * October's payslips went out as the old email, a link to sign in, with no PDF.
 * The send button leaves alone anybody who already has theirs, which is right
 * for a double press and wrong for this, so there is a second button that sends
 * everybody again. It reaches people who already have a payslip, so it asks twice:
 * a warning, then a word to type. Nothing is sent until the second answer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendPayslips = vi.fn();
vi.mock("@/lib/store/payroll", () => ({
  usePayrollActions: () => ({ sendPayslips }),
}));

import { SendPayslips } from "@/app/(app)/payroll/payslips/send-panel";

const outcome = { sent: 62, noEmail: [], failed: [], alreadySent: 0 };

beforeEach(() => {
  sendPayslips.mockReset();
  sendPayslips.mockResolvedValue(outcome);
});

describe("resend all payslips", () => {
  it("is not offered for a payroll that has not been approved", () => {
    render(
      <SendPayslips
        runId="r1"
        approved={false}
        notSent={0}
        total={62}
        onSent={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Resend all payslips" }),
    ).toBeNull();
  });

  it("asks twice, and sends nothing until the word is typed", async () => {
    const onSent = vi.fn();
    render(
      <SendPayslips
        runId="r1"
        approved
        notSent={0}
        total={62}
        onSent={onSent}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Resend all payslips" }),
    );
    /* Step one says what it does, and who it reaches. */
    expect(screen.getByText("Resend all 62 payslips?")).toBeTruthy();
    expect(
      screen.getByText(/including the people who already have one/),
    ).toBeTruthy();
    expect(sendPayslips).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    /* Step two cannot be passed by a click. */
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Resend all 62" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(sendPayslips).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Type RESEND to confirm/ }),
      "resend",
    );
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirm);

    expect(sendPayslips).toHaveBeenCalledTimes(1);
    expect(sendPayslips).toHaveBeenCalledWith("r1", { resend: true });
    await screen.findByText(/payslips sent/);
    expect(onSent).toHaveBeenCalled();
  });

  it("can be backed out of at either step", async () => {
    render(
      <SendPayslips
        runId="r1"
        approved
        notSent={0}
        total={62}
        onSent={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Resend all payslips" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    /* The dialog fades out, so it is gone a moment later, not at once. */
    await waitFor(() =>
      expect(screen.queryByText("Resend all 62 payslips?")).toBeNull(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Resend all payslips" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    /* The first dialog is still fading while the second opens: the newest is last. */
    await screen.findByText("Are you sure?");
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    await userEvent.click(cancels[cancels.length - 1]!);
    await waitFor(() => expect(screen.queryByText("Are you sure?")).toBeNull());
    expect(sendPayslips).not.toHaveBeenCalled();
  });

  it("leaves the ordinary send alone: it still skips the people who have theirs", async () => {
    render(
      <SendPayslips
        runId="r1"
        approved
        notSent={5}
        total={62}
        onSent={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send 5 payslips" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send them" }));
    expect(sendPayslips).toHaveBeenCalledWith("r1");
  });
});
