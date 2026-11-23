/**
 * U78 (PAY-22): pressing Continue to look at the Approve step emailed the
 * approvers, and the preparer was not told. Asking is now a "Send for approval"
 * button, and entering the step sends nothing.
 *
 * U79 (PAY-23): an approver opened a run on the preparer's screen, and an
 * approved run reopened at step 1. Both now open on Approve.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ApproveActions,
  sentForApprovalDetail,
} from "@/app/(app)/payroll/runs/new/approve-actions";
import { opensOnApprove } from "@/app/(app)/payroll/runs/new/opening-step";

const wizard = readFileSync(
  "src/app/(app)/payroll/runs/new/wizard.tsx",
  "utf8",
);

function actions(over: Partial<Parameters<typeof ApproveActions>[0]> = {}) {
  const onApprove = vi.fn();
  const onSend = vi.fn();
  render(
    <ApproveActions
      settled={false}
      canApprove={false}
      canPrepare
      canSend
      ready
      busy={null}
      onApprove={onApprove}
      onSend={onSend}
      {...over}
    />,
  );
  return { onApprove, onSend };
}

describe("asking for approval", () => {
  it("is a button the preparer presses", async () => {
    const { onSend } = actions();
    await userEvent.click(
      screen.getByRole("button", { name: "Send for approval" }),
    );
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not show a preparer a greyed Approve they cannot press", () => {
    actions();
    expect(
      screen.queryByRole("button", { name: /Approve this run/ }),
    ).toBeNull();
  });

  it("shows both to somebody who prepares and approves", () => {
    actions({ canApprove: true });
    expect(
      screen.getByRole("button", { name: "Send for approval" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Approve this run/ }),
    ).toBeEnabled();
  });

  it("shows an approver only Approve", () => {
    actions({ canPrepare: false, canApprove: true });
    expect(
      screen.queryByRole("button", { name: "Send for approval" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Approve this run/ }),
    ).toBeEnabled();
  });

  it("cannot be sent while something blocks the run", () => {
    actions({ ready: false });
    expect(
      screen.getByRole("button", { name: "Send for approval" }),
    ).toBeDisabled();
  });

  it("shows nothing once the run is approved", () => {
    actions({ settled: true, canApprove: true });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says how many approvers the server told", () => {
    expect(sentForApprovalDetail(2)).toBe("2 approvers were told.");
    expect(sentForApprovalDetail(1)).toBe("1 approver was told.");
    expect(sentForApprovalDetail(0)).toMatch(/Nobody new was told/);
  });

  it("is not sent by entering the step", () => {
    /* The only call is inside the button's handler, never an effect. */
    const effects = wizard.split("useEffect(").slice(1);
    for (const body of effects) {
      expect(body.slice(0, 600)).not.toContain("submitForApproval");
    }
    expect(wizard).toContain("payrollApi.submitForApproval");
    expect(wizard).toContain("<ApproveActions");
  });
});

describe("which step a run opens on", () => {
  const base = {
    stepRequested: false,
    approved: false,
    canPrepare: true,
    canApprove: false,
  };

  it("opens an approved run on Approve", () => {
    expect(opensOnApprove({ ...base, approved: true })).toBe(true);
  });

  it("opens a run on Approve for somebody who only approves", () => {
    expect(
      opensOnApprove({ ...base, canPrepare: false, canApprove: true }),
    ).toBe(true);
  });

  it("opens a run in review on Period & review for the preparer", () => {
    expect(opensOnApprove(base)).toBe(false);
    expect(opensOnApprove({ ...base, canApprove: true })).toBe(false);
  });

  it("leaves a link that names a step alone", () => {
    expect(
      opensOnApprove({ ...base, approved: true, stepRequested: true }),
    ).toBe(false);
  });

  it("is used by the wizard", () => {
    expect(wizard).toContain("opensOnApprove(");
  });
});
