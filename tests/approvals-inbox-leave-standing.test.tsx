import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { mayDecideLeave } from "@/lib/api/approvals";
import type { QueueItem } from "@/lib/workflows/queue";

/**
 * A manager is routed their report's leave request and is shown it in "Waiting on you",
 * whether or not their role can decide leave. The API then refuses every decision from
 * somebody who holds none of the four leave-approval permissions ("You can decide leave
 * for the people who report to you ... This one is none of those"), so the Approve and
 * Decline on that card were buttons that could only fail.
 *
 * This is the floor only: holding a permission is not being that person's manager, and the
 * API's own refusal still says so when it is not.
 */

const leaveRow: QueueItem = {
  id: "ap-leave",
  kind: "leave",
  kindLabel: "Leave",
  title: "Compassionate leave for Christianah Ipoola",
  summary: "2026-11-24 to 2026-11-25 · 2 days",
  requestedAt: "20 Nov",
  waitingDays: 3,
  href: "/people/leave?request=lv-1",
  ref: { store: "approval", id: "ap-leave" },
};

const recordRow: QueueItem = {
  id: "ap-record",
  kind: "record_change",
  kindLabel: "Record change",
  title: "Bank details. Femi Balogun",
  summary: "Bank: Access Bank → GTBank",
  requestedAt: "13 Oct",
  waitingDays: 2,
  href: "/people/e1",
  ref: { store: "approval", id: "ap-record" },
};

let rows: QueueItem[];
let held: Set<string>;

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items: rows,
    counts: { pending: rows.length, withDeadline: 0, ageing: 0, atStake: 0 },
    decided: [],
    loading: false,
    error: null,
    connected: true,
    decide: vi.fn(),
    reopen: vi.fn(),
    approveRoutine: vi.fn(),
    routine: [],
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
  usePermissions: () => ({ permissions: held }),
}));

const { ApprovalInbox } = await import("@/app/(app)/approvals/inbox");

const show = () =>
  render(
    <ToastProvider>
      <ApprovalInbox />
    </ToastProvider>,
  );

beforeEach(() => {
  rows = [leaveRow];
  held = new Set();
});

describe("which permissions could ever decide leave", () => {
  it("is each of the four verbs, and nothing else", () => {
    for (const verb of [
      "APPROVE_LEAVE",
      "APPROVE_LEAVE_ALL",
      "APPROVE_LEAVE_DEPARTMENT",
      "APPROVE_LEAVE_BRANCH",
    ]) {
      expect(mayDecideLeave(new Set([verb])), verb).toBe(true);
    }
    expect(mayDecideLeave(new Set())).toBe(false);
    /* An HR role that edits records and approves payroll still cannot decide leave. */
    expect(
      mayDecideLeave(
        new Set(["EDIT_RECORDS", "APPROVE_PAYROLL", "VIEW_SALARIES"]),
      ),
    ).toBe(false);
  });
});

describe("a manager whose role cannot decide leave", () => {
  it("is not offered Approve or Decline on the leave row, and is told why", () => {
    held = new Set(["VIEW_TIMESHEETS"]);
    show();

    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^decline$/i })).toBeNull();
    expect(
      screen.getByText(/your role does not include approving leave/i),
    ).toBeInTheDocument();
    /* The request itself is still one click away. */
    expect(screen.getByRole("link", { name: /open leave/i })).toHaveAttribute(
      "href",
      "/people/leave?request=lv-1",
    );
  });

  it("is not offered Archive on it either: archiving undecided leave tells nobody (U65)", () => {
    held = new Set(["VIEW_TIMESHEETS"]);
    show();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
  });

  it("still decides every other kind of row in the inbox", () => {
    held = new Set(["VIEW_TIMESHEETS"]);
    rows = [leaveRow, recordRow];
    show();

    /* One Approve, for the bank-details row. */
    expect(screen.getAllByRole("button", { name: /^approve$/i })).toHaveLength(
      1,
    );
    expect(screen.getAllByRole("button", { name: /^decline$/i })).toHaveLength(
      1,
    );
  });
});

describe("somebody who holds a leave-approval permission", () => {
  it.each([
    "APPROVE_LEAVE",
    "APPROVE_LEAVE_ALL",
    "APPROVE_LEAVE_DEPARTMENT",
    "APPROVE_LEAVE_BRANCH",
  ])("is offered Approve and Decline with %s", (verb) => {
    held = new Set([verb]);
    show();

    expect(
      screen.getByRole("button", { name: /^approve$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^decline$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/your role does not include approving leave/i),
    ).toBeNull();
  });
});
