/**
 * U22 (SELF-6): a manager deciding leave from the inbox saw the type, the dates
 * and the number of days, and not the reason the person gave ("Shown to the
 * approver") or how many days they have left. Approval rows now carry a leave
 * block, and the card says both.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { queueItemFromApproval, leaveFacts } from "@/lib/workflows/queue";
import type { ApprovalRow } from "@/lib/api/approvals";

const row = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "ap1",
  kind: "leave",
  kindLabel: "Leave",
  subjectType: "leave_requests",
  subjectId: "lr1",
  title: "Annual leave — Chidi Nwosu",
  summary: "15 Nov to 24 Nov 2026 · 6 days",
  amount: null,
  deadlineAt: null,
  status: "pending",
  requestedAt: "2026-11-23",
  waitingDays: 0,
  decidedAt: null,
  decisionNote: null,
  ...over,
});

describe("a leave card in the inbox", () => {
  it("carries the reason and the balance from the row", () => {
    const item = queueItemFromApproval(
      row({
        leave: {
          reason: "Family wedding in Enugu",
          leaveType: "Annual",
          startDate: "2026-11-15",
          endDate: "2026-11-24",
          days: 6,
          daysLeft: 14,
          daysLeftAfter: 8,
        },
      }),
      "Africa/Lagos",
    );
    expect(item.leave).toEqual({
      reason: "Family wedding in Enugu",
      daysLeft: 14,
      daysLeftAfter: 8,
    });
  });

  it("says the balance before and after, in words", () => {
    expect(
      leaveFacts({ reason: null, daysLeft: 14, daysLeftAfter: 8 }),
    ).toEqual({ reason: null, balance: "14 days left, 8 after this" });
    expect(leaveFacts({ reason: "x", daysLeft: 1, daysLeftAfter: 0 })).toEqual({
      reason: "x",
      balance: "1 day left, 0 after this",
    });
    expect(
      leaveFacts({ reason: null, daysLeft: 3, daysLeftAfter: -2 }).balance,
    ).toBe("3 days left, 2 over after this");
  });

  it("says nothing about a balance the type does not keep", () => {
    expect(
      leaveFacts({ reason: "Flu", daysLeft: null, daysLeftAfter: null }),
    ).toEqual({ reason: "Flu", balance: null });
  });

  it("leaves a row from an older server as it was", () => {
    expect(queueItemFromApproval(row(), "Africa/Lagos").leave).toBeUndefined();
  });

  it("is drawn on the card", () => {
    const inbox = readFileSync("src/app/(app)/approvals/inbox.tsx", "utf8");
    expect(inbox).toContain("<LeaveFacts leave={item.leave} />");
  });
});
