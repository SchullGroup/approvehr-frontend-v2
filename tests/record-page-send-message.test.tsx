import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * Who is offered "Send message" on a staff record.
 *
 * A message is a notice, so it needs what posting a notice needs
 * (`MANAGE_SETTINGS`) and a live API. Nothing pinned that: taking the permission
 * out left every neighbouring test passing, which would have offered the button
 * to anybody who can open a record, and the API's refusal would have been the
 * only thing standing between them and the company's noticeboard.
 */

const state = vi.hoisted(() => ({
  can: new Set<string>(),
  connected: true,
  archived: false,
  access: undefined as
    undefined | { state: string; expiresAt: null; roles: [] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/people/emp-1",
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: "somebody-else", isConnected: true }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => state.can.has(permission),
}));
vi.mock("@/lib/store/leave-api", () => ({
  useEmployeeLeaveBalances: () => ({ balances: [], loading: false }),
  useLeaveRequests: () => ({ requests: [], loading: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployee: () => ({
    employee: {
      id: "emp-1",
      employeeNo: "EMP-001",
      firstName: "Ada",
      lastName: "Okafor",
      managerId: null,
      ...(state.access ? { access: state.access } : {}),
    },
    loading: false,
    connected: state.connected,
    archived: state.archived,
    managerName: null,
    reload: vi.fn(),
  }),
  useEmployeeDirectory: () => ({ employees: [], error: null, reload: vi.fn() }),
  useEmployeeMutations: () => ({
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  }),
}));
/* The record itself is a thousand lines of tabs and is not what is under test. */
vi.mock("@/app/(app)/people/[id]/record", () => ({
  EmployeeRecord: () => <div>the record</div>,
}));
vi.mock("@/components/portal/shell", () => ({
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PageHeader: ({
    title,
    meta,
    action,
  }: {
    title: string;
    meta?: React.ReactNode;
    action?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {meta}
      {action}
    </header>
  ),
}));

const { EmployeeRecordPage } =
  await import("@/app/(app)/people/[id]/record-page");

beforeEach(() => {
  state.can = new Set(["MANAGE_SETTINGS"]);
  state.connected = true;
  state.archived = false;
  state.access = undefined;
});

const sendMessage = () =>
  screen.queryByRole("button", { name: "Send message" });

describe("the Send message button on a record", () => {
  it("is offered to somebody who can post notices, against a live API", () => {
    renderInToasts(<EmployeeRecordPage id="emp-1" />);
    expect(sendMessage()).toBeInTheDocument();
  });

  it("is not offered without MANAGE_SETTINGS, however much else they can do", () => {
    state.can = new Set([
      "EDIT_RECORDS",
      "VIEW_SALARIES",
      "MANAGE_PAY_STRUCTURE",
      "APPROVE_PAYROLL",
      "MANAGE_ROLES",
    ]);
    renderInToasts(<EmployeeRecordPage id="emp-1" />);
    expect(sendMessage()).toBeNull();
    /* The rest of the page is still there: this is about one button. */
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("is not offered with no API, where there is nowhere to send it", () => {
    state.connected = false;
    renderInToasts(<EmployeeRecordPage id="emp-1" />);
    expect(sendMessage()).toBeNull();
  });

  it("is not offered on an archived record", () => {
    state.archived = true;
    renderInToasts(<EmployeeRecordPage id="emp-1" />);
    expect(sendMessage()).toBeNull();
  });

  it("opens the dialog for this person, with where their account stands", async () => {
    state.access = { state: "NONE", expiresAt: null, roles: [] };
    const user = userEvent.setup();
    renderInToasts(<EmployeeRecordPage id="emp-1" />);

    await user.click(sendMessage() as HTMLElement);

    expect(
      await screen.findByRole("dialog", { name: "Send Ada Okafor a message" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ada Okafor has no account yet"),
    ).toBeInTheDocument();
  });
});
