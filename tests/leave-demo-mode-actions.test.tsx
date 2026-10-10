import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * The leave screen in demo mode, where the local store has one approval step.
 *
 * `awaitingHr` never appears there, so what this guards is that widening the
 * rule from `pending` to "open" changed nothing for it: waiting requests still
 * get Approve and Send back, decided ones still get Undo, and approving still
 * says "approved" — the store answers `null`, which is a final decision.
 * Rendered with no session, the way `hr-corrects-a-past-day.test.tsx` does.
 */

let held = new Set<PermissionKey>();

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { LeaveScreen } = await import("@/app/(app)/people/leave/leave-screen");

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
  window.localStorage?.clear?.();
});

describe("the leave screen offline", () => {
  it("offers Approve on a waiting request and Undo on a decided one, and never shows With HR", () => {
    render(<LeaveScreen />);

    expect(
      screen.getAllByRole("button", { name: /^Approve .+'s leave$/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /^Undo the decision on / }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("With HR")).toBeNull();
  });

  it("says approved when a waiting request is approved", async () => {
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /^Approve .+'s leave$/ })[0]!,
    );

    expect(
      await screen.findByText(/'s .+ leave is approved$/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/has your approval/)).toBeNull();
  });

  it("offers nothing to somebody who cannot decide", () => {
    held = new Set();
    render(<LeaveScreen />);

    expect(
      screen.queryByRole("button", { name: /^(Approve|Send back|Undo)/ }),
    ).toBeNull();
  });
});
