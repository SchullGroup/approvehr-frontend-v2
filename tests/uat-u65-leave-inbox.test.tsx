import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { QueueItem } from "@/lib/workflows/queue";

/**
 * UAT 23 Nov, U65 (SELF-23): every undecided leave card in the approvals inbox
 * had Archive beside Approve and Decline, and archiving moved the request out of
 * the inbox without the person who asked being told.
 */

const items = vi.hoisted(() => [] as QueueItem[]);

vi.mock("@/lib/store/approvals-api", () => ({
  useApprovalQueue: () => ({
    items,
    counts: { pending: items.length, withDeadline: 0, ageing: 0, atStake: 0 },
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
  usePermissions: () => ({ permissions: new Set(["APPROVE_LEAVE"]) }),
}));

const { ApprovalInbox } = await import("@/app/(app)/approvals/inbox");

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: "x",
  kind: "record_change",
  kindLabel: "Record change",
  title: "Bank details. Femi Balogun",
  summary: "Bank: Access Bank → GTBank",
  requestedAt: "13 Oct",
  waitingDays: 2,
  href: "/people/e1",
  ref: { store: "approval", id: "x" },
  ...over,
});

describe("an undecided card in the approvals inbox", () => {
  it("has no Archive when it is leave", () => {
    items.splice(
      0,
      items.length,
      item({
        id: "lv",
        kind: "leave",
        kindLabel: "Leave",
        title: "Annual leave. Chidi Nwosu",
        ref: { store: "leave", id: "lv" },
      }),
    );
    render(
      <ToastProvider>
        <ApprovalInbox />
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: /^decline$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Archive/ })).toBeNull();
  });

  it("has no Archive on anything else either", () => {
    items.splice(0, items.length, item({}));
    render(
      <ToastProvider>
        <ApprovalInbox />
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: /^Archive/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: "My archive" })).toBeNull();
  });
});
