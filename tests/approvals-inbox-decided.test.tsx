import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApprovalRow } from "@/lib/api/approvals";

/**
 * The inbox's Decided view.
 *
 * "Waiting on you" empties as you work, so there was no way to see what had been
 * approved or declined. The API already filters by status, so the view asks it,
 * one outcome at a time.
 */

const decidedRow: ApprovalRow = {
  id: "d1",
  kind: "record_change",
  kindLabel: "Record change",
  subjectType: "employees",
  subjectId: "e1",
  title: "Bank details. Femi Balogun",
  summary: "Bank: Access Bank → GTBank",
  amount: null,
  deadlineAt: null,
  status: "approved",
  requestedAt: "2026-10-20",
  waitingDays: 1,
  decidedAt: "2026-10-21T09:00:00.000Z",
  decisionNote: null,
};

let connected: boolean;
let rows: ApprovalRow[];
let asked: unknown[][];

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items: [],
    counts: { pending: 0, withDeadline: 0, ageing: 0, atStake: 0 },
    decided: [],
    loading: false,
    error: null,
    connected,
    decide: vi.fn(),
    reopen: vi.fn(),
    approveRoutine: vi.fn(),
    setArchived: vi.fn(),
    routine: [],
    routineCount: 0,
    reload: vi.fn(),
  }),
  useSentApprovals: () => ({
    rows: [],
    loading: false,
    error: null,
    connected,
    reload: vi.fn(),
  }),
  useDecidedApprovals: (...args: unknown[]) => {
    asked.push(args);
    return { rows, loading: false, error: null, connected, reload: vi.fn() };
  },
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
  connected = true;
  rows = [decidedRow];
  asked = [];
});

describe("the Decided view", () => {
  it("is offered, and lists what was decided with who raised it when", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Decided" }));

    expect(screen.getByText(decidedRow.title)).toBeInTheDocument();
    /* "Approved" is also the choice above the list, so look inside the list. */
    expect(
      within(screen.getByRole("list")).getByText("Approved"),
    ).toBeInTheDocument();
    expect(screen.getByText(/raised 2026-10-20/i)).toBeInTheDocument();
    expect(screen.getByText(/decided 2026-10-21/i)).toBeInTheDocument();
  });

  it("offers nothing to decide again: a decided row is history", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Decided" }));

    const list = screen.getByRole("list");
    expect(within(list).queryByRole("button", { name: /approve/i })).toBeNull();
    expect(within(list).queryByRole("button", { name: /reject/i })).toBeNull();
  });

  it("asks for approved first, and declined when that is chosen", async () => {
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Decided" }));
    expect(asked.at(-1)?.[0]).toBe("approved");
    expect(asked.at(-1)?.[2]).toBe(true);

    await userEvent.click(screen.getByRole("radio", { name: "Declined" }));
    expect(asked.at(-1)?.[0]).toBe("declined");
  });

  it("does not ask while another view is showing", () => {
    show();
    expect(asked.every((args) => args[2] === false)).toBe(true);
  });

  it("says what is missing, by outcome", async () => {
    rows = [];
    show();
    await userEvent.click(screen.getByRole("radio", { name: "Decided" }));
    expect(screen.getByText("Nothing approved yet")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Declined" }));
    expect(screen.getByText("Nothing declined yet")).toBeInTheDocument();
  });

  it("is not offered without the API: demo mode shows its own Just decided trail", () => {
    connected = false;
    show();
    expect(screen.queryByRole("radio", { name: "Decided" })).toBeNull();
  });
});
