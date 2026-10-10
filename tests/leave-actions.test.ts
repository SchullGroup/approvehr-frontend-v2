import { describe, expect, it } from "vitest";
import type { LeaveRowStatus } from "@/lib/api/leave";
import {
  isOpen,
  leaveRowActions,
  waitingOnDecision,
} from "@/app/(app)/people/leave/leave-actions";

/**
 * What a leave row offers, and what the "Waiting on a decision" tile counts.
 *
 * Tested as plain functions because the defect was a rule written three times
 * (desktop row, narrow list, drawer) and wrong in all three: `pending` got
 * Approve, everything else got Undo, so HR looking at a request that was with
 * HR could only wipe the department head's approval. The component test next
 * door proves the screen uses these; this proves the rule.
 */

const STATUSES: LeaveRowStatus[] = [
  "pending",
  "awaitingHr",
  "approved",
  "declined",
  "cancelled",
];

describe("which requests are open", () => {
  it("is both steps of the workflow and nothing that is finished", () => {
    expect(STATUSES.filter(isOpen)).toEqual(["pending", "awaitingHr"]);
  });
});

describe("what somebody who can decide is offered on somebody else's request", () => {
  it.each(["pending", "awaitingHr"] as const)(
    "gives a %s request Approve and Send back",
    (status) => {
      expect(leaveRowActions({ status, canDecide: true, isOwn: false })).toBe(
        "decide",
      );
    },
  );

  it.each(["approved", "declined", "cancelled"] as const)(
    "gives a %s request Undo",
    (status) => {
      expect(leaveRowActions({ status, canDecide: true, isOwn: false })).toBe(
        "undo",
      );
    },
  );

  it("never gives a request that is with HR Undo, which would wipe the department head's approval", () => {
    expect(
      leaveRowActions({
        status: "awaitingHr",
        canDecide: true,
        isOwn: false,
      }),
    ).not.toBe("undo");
  });
});

describe("what somebody who can decide is offered on their own request", () => {
  it.each(["pending", "awaitingHr"] as const)(
    "says somebody else decides a %s one, instead of offering a button the API refuses",
    (status) => {
      expect(leaveRowActions({ status, canDecide: true, isOwn: true })).toBe(
        "somebodyElse",
      );
    },
  );

  it.each(["approved", "declined", "cancelled"] as const)(
    "offers nothing on a %s one, because reopening is the same refusal",
    (status) => {
      expect(leaveRowActions({ status, canDecide: true, isOwn: true })).toBe(
        "none",
      );
    },
  );
});

describe("what somebody who cannot decide is offered", () => {
  it.each(STATUSES)("nothing on a %s request, theirs or not", (status) => {
    expect(leaveRowActions({ status, canDecide: false, isOwn: false })).toBe(
      "none",
    );
    expect(leaveRowActions({ status, canDecide: false, isOwn: true })).toBe(
      "none",
    );
  });
});

describe("the Waiting on a decision tile", () => {
  const today = "2026-10-09";
  const rows = [
    { status: "pending", requestedAt: "2026-10-08" },
    { status: "pending", requestedAt: "2026-10-07" },
    { status: "pending", requestedAt: "2026-10-09" },
    { status: "awaitingHr", requestedAt: "2026-10-01" },
    { status: "awaitingHr", requestedAt: "2026-10-05" },
    { status: "approved", requestedAt: "2026-09-01" },
    { status: "declined", requestedAt: "2026-09-02" },
    { status: "cancelled", requestedAt: "2026-09-03" },
  ] satisfies { status: LeaveRowStatus; requestedAt: string }[];

  it("counts the ones with HR as well as the fresh ones, for somebody who decides", () => {
    /* The real-API run: 3 shown, 5 needed them. */
    expect(waitingOnDecision(rows, true, today).count).toBe(5);
  });

  it("dates the oldest across both steps, not only the fresh ones", () => {
    /* The oldest is the one with HR, raised 8 days ago; among `pending` alone
       it would have said 2. */
    expect(waitingOnDecision(rows, true, today).oldestDays).toBe(8);
  });

  it("is unchanged for somebody who cannot decide: pending only", () => {
    expect(waitingOnDecision(rows, false, today)).toEqual({
      count: 3,
      oldestDays: 2,
    });
  });

  it("has no oldest when nothing is waiting, or nothing carries a date", () => {
    expect(
      waitingOnDecision(
        [{ status: "approved", requestedAt: "2026-09-01" }],
        true,
        today,
      ),
    ).toEqual({ count: 0, oldestDays: null });
    expect(
      waitingOnDecision(
        [{ status: "awaitingHr", requestedAt: null }],
        true,
        today,
      ),
    ).toEqual({ count: 1, oldestDays: null });
  });

  it("never reports a negative age for a request dated after today", () => {
    expect(
      waitingOnDecision(
        [{ status: "pending", requestedAt: "2026-10-12" }],
        true,
        today,
      ).oldestDays,
    ).toBe(0);
  });
});
