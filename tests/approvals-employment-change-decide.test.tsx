/**
 * U17 (HR-3): Approve and Reject on My approvals did nothing for a promotion or
 * pay change: the API answers 422, "employment_changes cannot be decided from
 * the approvals queue", and the card stayed. The card now offers "Decide",
 * which opens that change's decide dialog on Promotions and transfers.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { isDecidableHere, realScreenFor } from "@/lib/api/approvals";
import { queueItemFromApproval } from "@/lib/workflows/queue";
import type { ApprovalRow } from "@/lib/api/approvals";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("change=ch-1"),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/store/employment-changes", () => ({
  useEmploymentChanges: () => ({
    rows: [
      {
        id: "ch-1",
        status: "PENDING_APPROVAL",
        kind: "PROMOTION",
        employee: { id: "e1", name: "Chidi Nwosu" },
        effectiveOn: "2026-12-01",
        from: {},
        to: { jobTitle: "Senior Analyst" },
      },
    ],
    loading: false,
    error: null,
    unavailable: false,
    reload: vi.fn(),
  }),
  useEmploymentChangeActions: () => ({ readOnly: false }),
}));
vi.mock("@/app/(app)/people/changes/decide-dialog", () => ({
  DecideChangeDialog: ({ row }: { row: { id: string } }) => (
    <div role="dialog">Deciding {row.id}</div>
  ),
}));
vi.mock("@/app/(app)/people/changes/propose-dialog", () => ({
  ProposeChangeDialog: () => null,
}));

import { ChangesScreen } from "@/app/(app)/people/changes/changes-screen";

const row: ApprovalRow = {
  id: "ap-1",
  kind: "employment_change",
  kindLabel: "Promotion or transfer",
  subjectType: "employment_changes",
  subjectId: "ch-1",
  title: "Promotion for Chidi Nwosu",
  summary: null,
  amount: null,
  deadlineAt: null,
  status: "pending",
  requestedAt: "2026-11-20",
  waitingDays: 3,
  decidedAt: null,
  decisionNote: null,
} as unknown as ApprovalRow;

describe("a promotion on My approvals", () => {
  it("is not decided from the inbox, which the API refuses", () => {
    expect(isDecidableHere("employment_change")).toBe(false);
    expect(realScreenFor("employment_change")).toBe("/people/changes");
  });

  it("links to that change on Promotions and transfers", () => {
    expect(queueItemFromApproval(row, "Africa/Lagos").href).toBe(
      "/people/changes?change=ch-1",
    );
  });

  it("opens the decide dialog for the change the link names", () => {
    render(<ChangesScreen />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Deciding ch-1");
  });
});
