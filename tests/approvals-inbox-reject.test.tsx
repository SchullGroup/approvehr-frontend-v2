import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { QueueItem } from "@/lib/workflows/queue";

/**
 * Rejecting from the approvals inbox.
 *
 * Two things were wrong, and both made a row look undecidable:
 *
 * - The button said "Send back" for what is a plain no. A tester asked for
 *   "Reject, with a reason", and the dialog already insisted on the reason.
 * - A failed decision was caught by the screen and shown as a toast the dialog
 *   never heard about, so the dialog closed as though it had worked, took the
 *   reason the person had typed with it, and left the row exactly where it was.
 *   The only explanation was a message that disappeared.
 */

const row: QueueItem = {
  id: "ap1",
  kind: "record_change",
  kindLabel: "Record change",
  title: "Bank details — Femi Balogun",
  summary: "Bank: Access Bank → GTBank",
  requestedAt: "13 Oct",
  waitingDays: 2,
  href: "/people/e1",
  ref: { store: "approval", id: "ap1" },
};

let decide: Mock<(...args: unknown[]) => Promise<unknown>>;
let reload: Mock<() => void>;

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items: [row],
    counts: { pending: 1, withDeadline: 0, ageing: 0, atStake: 0 },
    decided: [],
    loading: false,
    error: null,
    connected: true,
    decide: (...args: unknown[]) => decide(...args),
    reopen: vi.fn(),
    approveRoutine: vi.fn(),
    routineCount: 0,
    reload: () => reload(),
  }),
  useSentApprovals: () => ({
    rows: [],
    loading: false,
    error: null,
    connected: true,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/permissions", () => ({
  hasAnyPermission: () => true,
  useIsManager: () => true,
  usePermissions: () => ({ permissions: [] }),
}));

const { ApprovalInbox } = await import("@/app/(app)/approvals/inbox");

const show = () =>
  render(
    <ToastProvider>
      <ApprovalInbox />
    </ToastProvider>,
  );

beforeEach(() => {
  decide = vi.fn();
  reload = vi.fn();
});

describe("the reject button", () => {
  it("says Reject, not Send back", () => {
    show();
    expect(
      screen.getByRole("button", { name: /^reject$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send back/i })).toBeNull();
  });

  it("asks for a reason and sends it with the decision", async () => {
    decide.mockResolvedValue({ subjectMoved: true });
    show();
    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/they see what you write here/i),
    ).toBeInTheDocument();

    /* No reason, no rejection. */
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^reject$/i }),
    );
    expect(
      await within(dialog).findByText(/write a line so they know why/i),
    ).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();

    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "Not on your bank statement.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^reject$/i }),
    );

    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide).toHaveBeenCalledWith(
      row,
      "declined",
      "Not on your bank statement.",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("when the rejection fails", () => {
  it("keeps the dialog open, keeps what was typed, and says why", async () => {
    decide.mockRejectedValue(
      new ApiError(409, "conflict", "That was already withdrawn."),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "Not on your bank statement.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^reject$/i }),
    );

    expect(
      await within(dialog).findByText("That was already withdrawn."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox")).toHaveValue(
      "Not on your bank statement.",
    );
  });

  it("asks the queue again when the row is stale, so it leaves the list", async () => {
    decide.mockRejectedValue(
      new ApiError(409, "conflict", "That was already withdrawn."),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "x");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^reject$/i }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("does not refresh for a failure that says nothing about the row", async () => {
    decide.mockRejectedValue(new ApiError(500, "internal", "Something broke."));
    show();
    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "x");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^reject$/i }),
    );
    await within(dialog).findByText("Something broke.");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("approving a stale row", () => {
  it("refreshes the queue and says what the server said", async () => {
    decide.mockRejectedValue(
      new ApiError(409, "conflict", "That was already withdrawn."),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(
      await screen.findByText("That was already withdrawn."),
    ).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });
});
