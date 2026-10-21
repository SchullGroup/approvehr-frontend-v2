import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { QueueItem } from "@/lib/workflows/queue";

/**
 * Archiving and filtering in the approvals inbox.
 *
 * QA's complaint: a day when everybody is asked to update their account fills
 * the inbox with approvals the approver is not ready to decide, and the chips
 * "Moves money" and "Needs attention" claimed a priority nobody ever set.
 */

const row: QueueItem = {
  id: "ap1",
  kind: "record_change",
  kindLabel: "Record change",
  title: "Bank details. Femi Balogun",
  summary: "Bank: Access Bank → GTBank",
  requestedAt: "13 Oct",
  waitingDays: 2,
  href: "/people/e1",
  ref: { store: "approval", id: "ap1" },
};

let setArchived: Mock<(...args: unknown[]) => Promise<void>>;

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items: [row],
    counts: { pending: 1, withDeadline: 0, ageing: 0, atStake: 0 },
    decided: [],
    loading: false,
    error: null,
    connected: true,
    decide: vi.fn(),
    reopen: vi.fn(),
    approveRoutine: vi.fn(),
    setArchived: (...args: unknown[]) => setArchived(...args),
    routineCount: 0,
    reload: vi.fn(),
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
  setArchived = vi.fn().mockResolvedValue(undefined);
});

describe("the inbox filters", () => {
  it("filters by module, not by a priority nobody set", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    for (const label of ["All", "Payroll", "Leave", "Hiring", "Core HR"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Moves money")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("offers a date range", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Raised from")).toBeInTheDocument();
    expect(screen.getByLabelText("Raised to")).toBeInTheDocument();
  });
});

describe("archiving", () => {
  it("puts the approval away without deciding it", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Archive Bank details. Femi Balogun",
      }),
    );
    expect(setArchived).toHaveBeenCalledWith(row, true);
  });

  it("has a My archive view", () => {
    show();
    expect(
      screen.getByRole("radio", { name: "My archive" }),
    ).toBeInTheDocument();
  });
});
