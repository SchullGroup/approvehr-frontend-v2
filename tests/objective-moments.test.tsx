import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiGoal, ApiObjectiveSubmitted } from "@/lib/api/performance";
import { SendForAgreementDialog } from "@/app/(app)/performance/send-for-agreement";
import { AgreedMoment } from "@/app/(app)/performance/approvals/agreed-moment";

/**
 * Sending an objective to be agreed, and agreeing one: two completions that used
 * to be a toast and are now a statement of what was recorded.
 *
 * What `tsc` cannot see, and what each test pins: the dialog stays after the
 * write and shows the moment in place of the form; a failure leaves it on the
 * question; and the one outcome that is not a success — an objective nobody else
 * was asked to agree — is a warning rather than a check.
 */

const goal = {
  id: "goal-1",
  title: "Ship the billing flow",
  ownerId: "emp-chidi",
  ownerName: "Chidi Nwosu",
  level: "personal",
  departmentName: "Engineering",
  reviewCycleId: "cycle-1",
  reviewCycleName: "H1 2026",
  dueQuarter: "2026-Q2",
  approval: "DRAFT",
  parentTitle: null,
  keyResults: [{ id: "kr-1" }],
} as unknown as ApiGoal;

/* jsdom has no layout, so no `scrollIntoView`. The moment calls it so that an
   agreement made from a card far down a long queue is brought into view. */
Element.prototype.scrollIntoView = vi.fn();

const wrapped = (node: React.ReactNode) => (
  <ToastProvider>{node}</ToastProvider>
);

describe("sending an objective to be agreed", () => {
  it("turns the question into a statement of what was sent", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const send = vi.fn(async () => ({
      value: { sentTo: ["emp-adaeze"] } as unknown as ApiObjectiveSubmitted,
    }));
    render(
      wrapped(
        <SendForAgreementDialog
          goal={goal}
          viewerId="emp-chidi"
          send={send}
          onClose={onClose}
        />,
      ),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: 'Send "Ship the billing flow" to be agreed?',
      }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Send it" }));

    expect(
      await within(dialog).findByRole("heading", {
        name: '"Ship the billing flow" is waiting to be agreed',
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Sent to 1 person who can agree it."),
    ).toBeInTheDocument();
    /* The question and its buttons are gone, and only "Done" is left. */
    expect(
      within(dialog).queryByRole("button", { name: "Send it" }),
    ).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says nothing about who it went to in demo mode, where there is no answer", async () => {
    const user = userEvent.setup();
    render(
      wrapped(
        <SendForAgreementDialog
          goal={goal}
          viewerId="emp-chidi"
          send={async () => ({ value: undefined })}
          onClose={vi.fn()}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Send it" }));
    expect(
      await screen.findByText(/Once it is agreed the target is fixed/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Sent to \d/)).toBeNull();
  });

  it("is a warning and a closed dialog, not a check, when nobody else was asked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrapped(
        <SendForAgreementDialog
          goal={goal}
          viewerId="emp-chidi"
          send={async () => ({
            value: { sentTo: [] } as unknown as ApiObjectiveSubmitted,
          })}
          onClose={onClose}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Send it" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Nobody else was asked to agree it/),
    ).toBeInTheDocument();
    /* No moment was drawn. */
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
  });

  it("stays on the question when the write failed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrapped(
        <SendForAgreementDialog
          goal={goal}
          viewerId="emp-chidi"
          send={async () => null}
          onClose={onClose}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Send it" }));

    expect(
      await screen.findByRole("button", { name: "Send it" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("an agreement", () => {
  it("says what was agreed and that the target is fixed, with a way to close it", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<AgreedMoment agreement={{ goal, n: 1 }} onDismiss={onDismiss} />);

    expect(
      screen.getByRole("heading", {
        name: '"Ship the billing flow" is agreed',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chidi Nwosu's objective for H1 2026, with 1 measure."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The target is fixed. Progress still moves."),
    ).toBeInTheDocument();
    /* No Undo: the only way back through a frozen target is a recorded revision. */
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
