import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/portal/sidebar";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import {
  COLLABORATOR_HOME,
  isCollaboratorAccount,
  isCollaboratorUser,
} from "@/lib/hiring/access/collaborator";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";
import { NO_BADGES } from "./sidebar-personas";

/**
 * Somebody invited to help hire with the company has a sign-in and nothing else: no
 * employee record, no permissions. They are shown one room, My interviews, and no door
 * to anywhere else. Not hiring, not employees, not payroll, not even Home. They land in
 * that room after accepting the invitation, and the dashboard sends them there too.
 *
 * What a person is shown is not what they are allowed: the API decides every request.
 * This is about what is worth drawing, and about never drawing a door that is a
 * guaranteed refusal.
 */

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  usePathname: () => "/hiring/my-interviews",
  useSearchParams: () => new URLSearchParams(),
}));

const { acceptInvite, markSignedIn } = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  markSignedIn: vi.fn(),
}));
vi.mock("@/lib/api/account", async (original) => ({
  ...(await original<typeof import("@/lib/api/account")>()),
  account: {
    requirementsForInvite: vi.fn(async () => ({
      requiresStrongPassword: false,
    })),
    acceptInvite: (...args: unknown[]) => acceptInvite(...args),
  },
}));
vi.mock("@/lib/store/session", () => ({
  markSignedIn: (...args: unknown[]) => markSignedIn(...args),
}));

const EVERYTHING = new Set<PermissionKey>(PERMISSION_KEYS);
const NOTHING = new Set<PermissionKey>([]);

const facts = (collaborator: boolean | undefined): NavFacts => ({
  assistantWired: true,
  earlyPay: true,
  rows: {
    "one-on-ones": true,
    signatures: true,
    interviews: true,
    "team-tasks": false,
  },
  ...(collaborator === undefined ? {} : { collaborator }),
});

const drawn = (permissions: ReadonlySet<PermissionKey>, f: NavFacts) =>
  visibleNav(NAV, permissions, {}, f).flatMap((group) =>
    group.items.map((item) => item.href),
  );

describe("who is a collaborator", () => {
  it("is a connected account with no employee record and no permissions, and nobody else", () => {
    const connected = { isConnected: true, employeeId: null };
    expect(isCollaboratorAccount(connected, 0)).toBe(true);
    /* Staff, even with nothing yet. */
    expect(
      isCollaboratorAccount({ isConnected: true, employeeId: "e1" }, 0),
    ).toBe(false);
    /* Anybody who holds any permission, with or without an employee record. */
    expect(isCollaboratorAccount(connected, 1)).toBe(false);
    /* A demo session holds everything and is never one. */
    expect(
      isCollaboratorAccount({ isConnected: false, employeeId: null }, 0),
    ).toBe(false);
  });

  it("reads the same off an account the API has just handed back", () => {
    expect(isCollaboratorUser({ employeeId: null, permissions: [] })).toBe(
      true,
    );
    expect(isCollaboratorUser({ employeeId: "e1", permissions: [] })).toBe(
      false,
    );
    expect(
      isCollaboratorUser({ employeeId: null, permissions: ["MANAGE_HIRING"] }),
    ).toBe(false);
  });
});

describe("what the sidebar draws for them", () => {
  it("is My interviews and nothing else", () => {
    expect(drawn(NOTHING, facts(true))).toEqual(["/hiring/my-interviews"]);
  });

  it("is still only that when every permission and every row says otherwise: the first question wins", () => {
    expect(drawn(EVERYTHING, facts(true))).toEqual(["/hiring/my-interviews"]);
  });

  it("names no payroll, employee, leave, approvals, reports or settings door", () => {
    const hrefs = drawn(EVERYTHING, facts(true));
    for (const area of [
      "/payroll",
      "/people",
      "/profile",
      "/dashboard",
      "/reports",
      "/settings",
      "/approvals",
      "/hiring/hired",
      "/hiring/offers",
      "/hiring/postings",
    ]) {
      expect(hrefs.some((href) => href.startsWith(area))).toBe(false);
    }
  });

  it("changes nothing for anybody who is not one: narrowed only when it is known", () => {
    expect(drawn(NOTHING, facts(false))).toEqual(
      drawn(NOTHING, facts(undefined)),
    );
    expect(drawn(EVERYTHING, facts(false)).length).toBeGreaterThan(20);
    expect(NOTHING_ANSWERED_YET.collaborator).toBe(false);
  });

  it("is one plain link in the real sidebar: no group to open, no search for people", () => {
    const groups = visibleNav(NAV, NOTHING, {}, facts(true));
    const { container } = render(
      <SidebarNav
        groups={groups}
        pathname="/hiring/my-interviews"
        badges={NO_BADGES}
        onNavigate={() => undefined}
        onSearchPeople={() => undefined}
      />,
    );
    const links = Array.from(container.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual(["/hiring/my-interviews"]);
    expect(container.querySelectorAll("button[data-nav-row]")).toHaveLength(0);
  });
});

describe("accepting an invitation", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    acceptInvite.mockReset();
    markSignedIn.mockReset();
  });

  const accept = async (user: {
    employeeId: string | null;
    permissions: string[];
  }) => {
    acceptInvite.mockResolvedValue({ user });
    const { AcceptInviteScreen } =
      await import("@/app/(auth)/accept-invite/accept-invite-screen");
    render(<AcceptInviteScreen token="tok" />);
    const box = document.querySelector(
      'input[autocomplete="new-password"]',
    ) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "a-long-enough-password-1" } });
    await userEvent.click(
      screen.getByRole("button", { name: "Create my account" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());
  };

  it("lands a collaborator in My interviews", async () => {
    await accept({ employeeId: null, permissions: [] });
    expect(replace).toHaveBeenCalledWith(COLLABORATOR_HOME);
    expect(COLLABORATOR_HOME).toBe("/hiring/my-interviews");
  });

  it("lands anybody else on the dashboard, as before", async () => {
    await accept({ employeeId: "e1", permissions: [] });
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
});
