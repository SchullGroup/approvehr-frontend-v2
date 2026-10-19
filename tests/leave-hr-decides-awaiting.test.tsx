import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { LeaveRow, LeaveRowStatus } from "@/lib/api/leave";

/**
 * HR can decide a request that is with HR, from the leave screen.
 *
 * A real-API run found that with two-step approval on, a request a department
 * head had approved showed HR "With HR" and a lone Undo — which reopens it and
 * wipes the head's approval — while the API would have taken Approve or Send
 * back from HR all along. The tile also counted only the fresh ones, 3 where 5
 * needed them. Both came from testing `status === "pending"` where the question
 * was "is this still open".
 *
 * Rendered against the real screen with the leave hooks stood in for, because
 * what is under test is which controls each row gets and what the moment says,
 * not the API (the pure rule is in `leave-actions.test.ts`). jsdom does not
 * apply the `sm:` breakpoint, so the table and the narrow list are both in the
 * document and every row's controls appear twice.
 */

let held = new Set<PermissionKey>();
let me: string | null = null;
let rows: LeaveRow[] = [];

const decide =
  vi.fn<
    (
      id: string,
      decision: "approved" | "declined",
      note?: string,
    ) => Promise<LeaveRow | null>
  >();
const reopen = vi.fn(() => Promise.resolve());

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

vi.mock("@/lib/store/session", async (original) => {
  const actual = await original<typeof import("@/lib/store/session")>();
  return {
    ...actual,
    useSession: () => ({ ...actual.useSession(), employeeId: me }),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/lib/store/leave-api", async (original) => {
  const actual = await original<typeof import("@/lib/store/leave-api")>();
  return {
    ...actual,
    useLeaveRequests: () => ({
      requests: rows,
      total: rows.length,
      loading: false,
      error: null,
      connected: true,
      reload: () => {},
    }),
    useLeaveRequestDetail: (id: string | null) => {
      const request = rows.find((r) => r.id === id);
      return {
        loading: false,
        detail: request ? { request, clashes: [], balance: null } : null,
      };
    },
    useLeaveMutations: () => ({
      create: vi.fn(),
      decide,
      reopen,
      cancel: vi.fn(),
      connected: true,
    }),
  };
});

const { LeaveScreen } = await import("@/app/(app)/people/leave/leave-screen");

const row = (
  id: string,
  name: string,
  status: LeaveRowStatus,
  over: Partial<LeaveRow> = {},
): LeaveRow => ({
  id,
  employeeId: `emp-${id}`,
  employeeName: name,
  employeeJobTitle: null,
  leaveTypeId: "type-annual",
  leaveType: "Annual",
  from: "2026-10-12",
  to: "2026-10-16",
  days: 5,
  status,
  reason: null,
  approverId: null,
  approverName: "Adaeze Okonkwo",
  requestedAt: "2026-10-05",
  decidedAt: null,
  decidedById: null,
  decidedByName: null,
  decidedByJobTitle: null,
  firstApprovedAt: null,
  firstApprovedByName: null,
  firstApprovedByJobTitle: null,
  decisionNote: null,
  ...over,
});

const withHr = row("a", "Chidi Nwosu", "awaitingHr", {
  firstApprovedAt: "2026-10-07",
  firstApprovedByName: "Adaeze Okonkwo",
  firstApprovedByJobTitle: "Head of Engineering",
});

const tile = () =>
  screen.getByText("Waiting on a decision").parentElement!.parentElement!;

beforeAll(() => {
  /* jsdom has no layout, and the moment scrolls itself into view. */
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  held = new Set();
  me = null;
  rows = [];
  decide.mockReset();
  reopen.mockReset();
  reopen.mockResolvedValue();
  window.localStorage?.clear?.();
});

describe("a request that is with HR", () => {
  beforeEach(() => {
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    me = "emp-hr";
    rows = [withHr];
  });

  it("offers Approve and Send back, and not Undo, which would wipe the department head's approval", () => {
    render(<LeaveScreen />);

    expect(
      screen.getAllByRole("button", { name: "Approve Chidi Nwosu's leave" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: "Send back Chidi Nwosu's request",
      }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    /* The status still says whose turn it is. */
    expect(screen.getAllByText("With HR").length).toBeGreaterThan(0);
  });

  it("says the approval is final, because HR's approval is", async () => {
    /* What the API answers when somebody holding APPROVE_LEAVE_ALL approves
       from AWAITING_HR. */
    decide.mockResolvedValue({ ...withHr, status: "approved" });
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Approve Chidi Nwosu's leave",
      })[0]!,
    );

    expect(
      await screen.findByText("Chidi Nwosu's annual leave is approved"),
    ).toBeInTheDocument();
    expect(decide).toHaveBeenCalledWith("a", "approved");
    expect(screen.queryByText(/has your approval/)).toBeNull();
  });

  it("asks for a reason before sending it back, and sends it back as a decline", async () => {
    decide.mockResolvedValue({ ...withHr, status: "declined" });
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Send back Chidi Nwosu's request",
      })[0]!,
    );
    const dialog = await screen.findByRole("dialog");

    /* No reason, no decision. */
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send it back" }),
    );
    expect(
      await within(dialog).findByText(
        "Write a line so they know what to change.",
      ),
    ).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Cover is thin that week" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send it back" }),
    );

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(
        "a",
        "declined",
        "Cover is thin that week",
      ),
    );
  });

  it("offers the same in the request panel, and says who approved first", async () => {
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Open Chidi Nwosu's Annual request",
      })[0]!,
    );

    expect(
      await screen.findByRole("button", { name: "Approve" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send back" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Undo the decision" }),
    ).toBeNull();
    expect(screen.getByText("Approved first by")).toBeInTheDocument();
    expect(
      screen.getByText("Adaeze Okonkwo, Head of Engineering · 7 Oct"),
    ).toBeInTheDocument();
  });
});

describe("a request that is already decided", () => {
  it("keeps Undo, and offers no Approve", () => {
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    me = "emp-hr";
    rows = [
      row("b", "Emeka Anyanwu", "approved", { decidedAt: "2026-10-08" }),
      row("c", "Ngozi Eze", "declined", { decidedAt: "2026-10-08" }),
    ];
    render(<LeaveScreen />);

    expect(
      screen.getAllByRole("button", {
        name: "Undo the decision on Emeka Anyanwu's request",
      }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: "Undo the decision on Ngozi Eze's request",
      }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
  });
});

describe("the approver's own request", () => {
  beforeEach(() => {
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    me = "emp-hr";
  });

  it.each(["pending", "awaitingHr"] as const)(
    "offers no Approve or Send back on their own %s one, and says so",
    (status) => {
      rows = [row("own", "Fatima Bello", status, { employeeId: "emp-hr" })];
      render(<LeaveScreen />);

      expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Send back/ })).toBeNull();
      expect(screen.getAllByText("Somebody else decides")).toHaveLength(2);
    },
  );

  it("offers no Undo on their own decided one either: reopening is the same refusal", () => {
    rows = [
      row("own", "Fatima Bello", "approved", {
        employeeId: "emp-hr",
        decidedAt: "2026-10-08",
      }),
    ];
    render(<LeaveScreen />);

    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(screen.queryByText("Somebody else decides")).toBeNull();
  });

  it("still lets them decide everybody else's alongside it", () => {
    rows = [
      row("own", "Fatima Bello", "pending", { employeeId: "emp-hr" }),
      withHr,
    ];
    render(<LeaveScreen />);

    expect(
      screen.getAllByRole("button", { name: "Approve Chidi Nwosu's leave" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Approve Fatima Bello's leave" }),
    ).toBeNull();
  });

  it("says it in the request panel, with Withdraw still theirs", async () => {
    rows = [row("own", "Fatima Bello", "awaitingHr", { employeeId: "emp-hr" })];
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Open Fatima Bello's Annual request",
      })[0]!,
    );

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Somebody else decides")).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: "Withdraw request" }),
    ).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("the Waiting on a decision tile", () => {
  const queue = () => [
    row("p1", "Ada One", "pending", { requestedAt: "2026-10-08" }),
    row("p2", "Ben Two", "pending", { requestedAt: "2026-10-07" }),
    row("p3", "Cy Three", "pending", { requestedAt: "2026-10-09" }),
    row("h1", "Di Four", "awaitingHr", { requestedAt: "2026-10-01" }),
    row("h2", "Ed Five", "awaitingHr", { requestedAt: "2026-10-05" }),
    row("d1", "Flo Six", "approved", { requestedAt: "2026-09-01" }),
  ];

  it("counts the requests with HR as well as the fresh ones for somebody who decides", () => {
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    me = "emp-hr";
    rows = queue();
    render(<LeaveScreen />);

    expect(tile()).toHaveTextContent("5");
  });

  it("is unchanged for somebody who cannot decide", () => {
    held = new Set();
    me = "emp-ada";
    rows = queue();
    render(<LeaveScreen />);

    expect(tile()).toHaveTextContent("3");
    expect(
      screen.queryByRole("button", { name: /^(Approve|Send back|Undo)/ }),
    ).toBeNull();
  });
});

describe("a first approval is still not an approval", () => {
  it("says it has your approval when the API leaves the request with HR", async () => {
    /* A decider approving a fresh request on a company where the API still
       sends it on, so the moment must follow the answer and not the click. */
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    me = "emp-hr";
    const fresh = row("f", "Chidi Nwosu", "pending");
    rows = [fresh];
    decide.mockResolvedValue({ ...fresh, status: "awaitingHr" });
    render(<LeaveScreen />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Approve Chidi Nwosu's leave",
      })[0]!,
    );

    expect(
      await screen.findByText(/Chidi Nwosu's annual leave has your approval/),
    ).toBeInTheDocument();
  });
});
