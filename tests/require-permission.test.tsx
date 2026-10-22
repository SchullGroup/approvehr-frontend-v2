import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequirePermission } from "@/components/portal/require-permission";
import {
  NO_PERMISSIONS,
  toPermissionSet,
  usePermissions,
  type Access,
} from "@/lib/permissions";

/**
 * A screen that is not for this reader says so — and says nothing false while it
 * is still finding out.
 *
 * The two doors this guards were open to every signed-in employee: the whole
 * Settings hub, and the payroll wizard with a Continue button. What matters is
 * both halves of the rule: the screen is never offered to somebody without the
 * permission, and the refusal is never shown to somebody who has it while the
 * session is still resolving.
 */

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: vi.fn(),
}));

/* The shell pulls in the whole app chrome; the gate only needs a header and a
   body to put its refusal in. */
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function access(keys: string[], loading = false): Access {
  return {
    permissions: loading ? NO_PERMISSIONS : toPermissionSet(keys),
    can: () => false,
    loading,
    enforced: true,
    roles: [],
    grantedBy: () => [],
    previewingRole: null,
  };
}

beforeEach(() => {
  vi.mocked(usePermissions).mockReset();
});

const gate = (
  props?: Partial<React.ComponentProps<typeof RequirePermission>>,
) => (
  <RequirePermission
    permission="MANAGE_SETTINGS"
    title="You cannot open Settings"
    what="Setting the company up"
    {...props}
  >
    <p>the admin hub</p>
  </RequirePermission>
);

describe("RequirePermission", () => {
  it("offers the screen to somebody who holds the permission", () => {
    vi.mocked(usePermissions).mockReturnValue(access(["MANAGE_SETTINGS"]));
    render(gate());
    expect(screen.getByText("the admin hub")).toBeInTheDocument();
    expect(screen.queryByText(/You cannot/)).not.toBeInTheDocument();
  });

  it("refuses everybody else, naming the permission the way the roles screen does", () => {
    vi.mocked(usePermissions).mockReturnValue(access([]));
    render(gate());
    expect(screen.queryByText("the admin hub")).not.toBeInTheDocument();
    expect(screen.getByText("You cannot open Settings")).toBeInTheDocument();
    expect(
      screen.getByText(/needs the “Change company settings” permission/),
    ).toBeInTheDocument();
  });

  it("shows neither the screen nor the refusal while permissions are unknown", () => {
    vi.mocked(usePermissions).mockReturnValue(access([], true));
    render(gate());
    expect(screen.queryByText("the admin hub")).not.toBeInTheDocument();
    expect(screen.queryByText(/You cannot/)).not.toBeInTheDocument();
  });

  it("lets either of two permissions in when given an array", () => {
    const wizard = {
      permission: ["RUN_PAYROLL", "APPROVE_PAYROLL"] as const,
      title: "You cannot run payroll",
      what: "Preparing or approving a payroll",
    };
    for (const holds of ["RUN_PAYROLL", "APPROVE_PAYROLL"]) {
      vi.mocked(usePermissions).mockReturnValue(access([holds]));
      const { unmount } = render(gate(wizard));
      expect(screen.getByText("the admin hub")).toBeInTheDocument();
      unmount();
    }
  });

  it("names every permission an array would accept", () => {
    vi.mocked(usePermissions).mockReturnValue(access(["VIEW_SALARIES"]));
    render(
      gate({
        permission: ["RUN_PAYROLL", "APPROVE_PAYROLL"],
        title: "You cannot run payroll",
        what: "Preparing or approving a payroll",
      }),
    );
    expect(
      screen.getByText(
        /needs the “Prepare payroll” or “Approve payroll” permission/,
      ),
    ).toBeInTheDocument();
  });

  it("carries its own header when it guards a whole page", () => {
    vi.mocked(usePermissions).mockReturnValue(access([]));
    render(gate({ pageTitle: "Settings" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("You cannot open Settings")).toBeInTheDocument();
  });
});
