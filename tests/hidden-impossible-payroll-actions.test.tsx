import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApproveActions } from "@/app/(app)/payroll/runs/new/approve-actions";

/** A button that could only fail is absent, not greyed (owner rule, 24 Nov 2026). */
describe("payroll buttons that could only fail are not drawn", () => {
  it("shows neither Approve nor Send to somebody who can do neither", () => {
    render(
      <ApproveActions
        settled={false}
        canApprove={false}
        canPrepare={false}
        canSend={false}
        ready
        busy={null}
        onApprove={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("the run's Run button needs the right to prepare and an unapproved run", () => {
    const wizard = readFileSync(
      "src/app/(app)/payroll/runs/new/wizard.tsx",
      "utf8",
    );
    expect(wizard).toMatch(/\{canPrepare && !settled && \(\s*<Button/);
    expect(wizard).not.toContain("disabled={!canPrepare || settled");
  });

  it("Release is drawn only for somebody who can approve, with a bank connected", () => {
    const panel = readFileSync(
      "src/app/(app)/payroll/payments/[id]/release-panel.tsx",
      "utf8",
    );
    expect(panel).toMatch(/\{providerConnected && canApprove && \(\s*<Button/);
    expect(panel).not.toContain("disabled={!providerConnected || !canApprove");
  });
});
