/**
 * U54 (NC-22): importing people emailed every one of them an invitation, and
 * nothing said so first. The check now says how many it will email, and a
 * tick box beside the confirm button holds them all back.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CheckOutcome } from "@/lib/store/imports";
import { EMPLOYEES } from "@/lib/imports/employees";

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ create: vi.fn() }),
}));

import { CheckReport } from "@/components/imports/check-report";

const check = (toInvite: number | null): CheckOutcome => ({
  filename: "staff.csv",
  totalRows: 8,
  rowsChecked: 8,
  toCreate: 8,
  toUpdate: 0,
  toSkip: 0,
  problems: [],
  notes: [],
  missing: {},
  parts: [{ index: 1, batchId: "b1", rowNumbers: [1, 2, 3, 4, 5, 6, 7, 8] }],
  duplicates: { undecided: 0, skipping: 0, updating: 0 },
  flagged: 0,
  missingOrgTaxState: false,
  fixCount: 0,
  authoritative: true,
  toInvite,
});

function renderReport(toInvite: number | null) {
  const onConfirm = vi.fn();
  render(
    <CheckReport
      dictionary={EMPLOYEES}
      prerequisites={{}}
      check={check(toInvite)}
      refusalWithoutApi="Needs the API"
      onBack={vi.fn()}
      onDownload={vi.fn()}
      fixes={{}}
      fixCount={0}
      onFix={vi.fn()}
      onRecheck={vi.fn()}
      rechecking={false}
      unchecked={false}
      decisions={{}}
      onDecide={vi.fn()}
      onDecideAll={vi.fn()}
      onSeedDecisions={vi.fn()}
      onConfirm={onConfirm}
      confirming={false}
    />,
  );
  return { onConfirm };
}

describe("invitations on an employee import", () => {
  it("are counted, and sent unless held back", () => {
    const { onConfirm } = renderReport(8);
    const box = screen.getByRole("checkbox", {
      name: "Send invitations now (8 emails)",
    });
    expect(box).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Add 8/ }));
    expect(onConfirm).toHaveBeenLastCalledWith({ sendInvitations: true });
  });

  it("can be held back, so nobody is emailed yet", () => {
    const { onConfirm } = renderReport(1);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Send invitations now (1 email)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Add 8/ }));
    expect(onConfirm).toHaveBeenLastCalledWith({ sendInvitations: false });
  });

  it("is not offered when nobody would be emailed, or the server does not say", () => {
    renderReport(0);
    expect(
      screen.queryByRole("checkbox", { name: /Send invitations/ }),
    ).toBeNull();
  });
});
