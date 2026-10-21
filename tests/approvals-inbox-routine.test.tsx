import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { SERVER_BEHIND } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";
import type { QueueItem } from "@/lib/workflows/queue";

/**
 * "Approve routine" in the approvals inbox.
 *
 * The button said how many it would approve and then approved something else:
 * the press went to a route that decided the whole routine queue on the server,
 * including rows in the person's archive and rows they were never shown. Now the
 * button asks first, naming what it will approve, and sends exactly those rows.
 */

const item = (id: string, title: string): QueueItem => ({
  id,
  kind: "record_change",
  kindLabel: "Record change",
  title,
  summary: "",
  requestedAt: "13 Oct",
  waitingDays: 2,
  href: "/people/e1",
  ref: { store: "approval", id },
});

const first = item("ap1", "Bank details — Femi Balogun");
const second = item("ap2", "Bank details — Ada Eze");
const third = item("ap3", "Bank details — Tunde Bakare");

let routine: QueueItem[];
let approveRoutine: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items: routine,
    counts: { pending: routine.length, withDeadline: 0, ageing: 0, atStake: 0 },
    decided: [],
    loading: false,
    error: null,
    connected: true,
    decide: vi.fn(),
    reopen: vi.fn(),
    approveRoutine: (...args: unknown[]) => approveRoutine(...args),
    setArchived: vi.fn(),
    routine,
    routineCount: routine.length,
    reload: vi.fn(),
  }),
  useSentApprovals: () => ({
    rows: [],
    loading: false,
    error: null,
    connected: true,
    reload: vi.fn(),
  }),
  useDecidedApprovals: () => ({
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

const ui = () => (
  <ToastProvider>
    <ApprovalInbox />
  </ToastProvider>
);

const press = () =>
  userEvent.click(
    screen.getByRole("button", { name: /^approve 2 routine items$/i }),
  );

beforeEach(() => {
  routine = [first, second];
  approveRoutine = vi.fn().mockResolvedValue({ decided: 2, skipped: [] });
});

describe("approve routine", () => {
  it("asks first, and names what it is about to approve", async () => {
    render(ui());
    await press();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/approve 2 routine items\?/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(first.title)).toBeInTheDocument();
    expect(within(dialog).getByText(second.title)).toBeInTheDocument();
    expect(approveRoutine).not.toHaveBeenCalled();
  });

  it("approves exactly the rows it listed, once confirmed", async () => {
    render(ui());
    await press();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^approve 2$/i }),
    );

    await waitFor(() => expect(approveRoutine).toHaveBeenCalledTimes(1));
    expect(approveRoutine).toHaveBeenCalledWith([first, second]);
    expect(await screen.findByText(/2 requests approved/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("approves nothing when cancelled", async () => {
    render(ui());
    await press();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /cancel/i }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(approveRoutine).not.toHaveBeenCalled();
  });

  it("sends what it showed, even if the queue changes behind the dialog", async () => {
    const { rerender } = render(ui());
    await press();
    await screen.findByRole("dialog");

    /* Somebody else's decision, or a refresh, replaces the list underneath. */
    routine = [third];
    rerender(ui());

    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^approve 2$/i,
      }),
    );
    await waitFor(() => expect(approveRoutine).toHaveBeenCalledTimes(1));
    expect(approveRoutine).toHaveBeenCalledWith([first, second]);
  });

  it("says a server that is a version behind cannot do this, and approves nothing", async () => {
    approveRoutine.mockRejectedValue(
      new ApiError(404, "server_behind", SERVER_BEHIND),
    );
    render(ui());
    await press();
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /^approve 2$/i,
      }),
    );

    expect(await screen.findByText(/a version behind/i)).toBeInTheDocument();
    expect(screen.queryByText(/requests approved/i)).toBeNull();
  });

  it("shows the server's own sentence when it refuses", async () => {
    approveRoutine.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot approve these."),
    );
    render(ui());
    await press();
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /^approve 2$/i,
      }),
    );

    expect(
      await screen.findByText("You cannot approve these."),
    ).toBeInTheDocument();
  });
});
