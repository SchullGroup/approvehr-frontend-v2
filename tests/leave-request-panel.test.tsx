import { render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type {
  LeaveDetail,
  LeaveHistoryEntry,
  LeaveRow,
  LeaveRowStatus,
} from "@/lib/api/leave";

/**
 * The request panel, for the person whose leave it is.
 *
 * What they open it to find out is where it stands and, if it was sent back, why;
 * and to give the person deciding it the supporting file. Rendered against the
 * real screen with the leave hooks stood in for, as `leave-hr-decides-awaiting`
 * does, because what is under test is what the panel shows for what the API sent.
 */

let held = new Set<PermissionKey>();
let me: string | null = null;
let detail: LeaveDetail | null = null;
let files: unknown = { list: null, loading: false, error: null };

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
  /* Opened from the approvals inbox as ?request=<id>. */
  useSearchParams: () => new URLSearchParams("request=r1"),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFiles: () => ({ ...(files as object), reload: vi.fn() }),
  useLeaveFileLimits: () => ({ limits: null, storage: null }),
  useAttachmentRule: () => ({ rule: null }),
}));

vi.mock("@/lib/store/leave-api", async (original) => {
  const actual = await original<typeof import("@/lib/store/leave-api")>();
  return {
    ...actual,
    useLeaveRequests: () => ({
      requests: detail ? [detail.request] : [],
      total: detail ? 1 : 0,
      loading: false,
      error: null,
      connected: true,
      reload: () => {},
    }),
    useLeaveRequestDetail: () => ({
      loading: false,
      connected: true,
      detail,
    }),
    useLeaveMutations: () => ({
      create: vi.fn(),
      decide: vi.fn(),
      reopen: vi.fn(),
      cancel: vi.fn(),
      connected: true,
    }),
  };
});

const { LeaveScreen } = await import("@/app/(app)/people/leave/leave-screen");

const request = (
  status: LeaveRowStatus,
  over: Partial<LeaveRow> = {},
): LeaveRow => ({
  id: "r1",
  employeeId: "emp-1",
  employeeName: "Ada Okafor",
  employeeJobTitle: "Analyst",
  leaveTypeId: "t-sick",
  leaveType: "Sick",
  from: "2026-10-20",
  to: "2026-10-22",
  days: 3,
  status,
  reason: "Flu, with a doctor's note",
  approverId: "mgr-1",
  approverName: "Tolu Bello",
  requestedAt: "2026-10-18",
  decidedAt: null,
  decidedById: null,
  decidedByName: null,
  decidedByJobTitle: null,
  firstApprovedAt: null,
  firstApprovedByName: null,
  firstApprovedByJobTitle: null,
  decisionNote: null,
  firstApprovalNote: null,
  attachmentCount: 0,
  ...over,
});

const detailOf = (
  row: LeaveRow,
  history: LeaveHistoryEntry[] = [],
  over: Partial<LeaveDetail> = {},
): LeaveDetail => ({
  request: row,
  clashes: [],
  balance: null,
  reduced: false,
  history,
  ...over,
});

const entry = (over: Partial<LeaveHistoryEntry>): LeaveHistoryEntry => ({
  kind: "REQUESTED",
  at: "2026-10-18",
  byName: "Ada Okafor",
  byJobTitle: "Analyst",
  note: null,
  ...over,
});

const panel = () => screen.getByRole("dialog");

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  held = new Set();
  me = "emp-1";
  detail = null;
  files = { list: null, loading: false, error: null };
  window.localStorage?.clear?.();
});

describe("a request that was sent back", () => {
  beforeEach(() => {
    detail = detailOf(
      request("declined", {
        decisionNote: "Two people are already off that week.",
        decidedByName: "Fatima Bello",
        decidedByJobTitle: "HR manager",
        decidedAt: "2026-10-20",
      }),
      [
        entry({ note: "Flu, with a doctor's note" }),
        entry({
          kind: "DECLINED",
          at: "2026-10-20",
          byName: "Fatima Bello",
          byJobTitle: "HR manager",
          note: "Two people are already off that week.",
        }),
      ],
    );
  });

  it("says why, on the request, to the person who filed it", () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(dialog.getByText("Why it was sent back")).toBeInTheDocument();
    /* In the row and as a line of the history: the reason is on screen. */
    expect(
      dialog.getAllByText(/Two people are already off that week\./).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("tells what happened, in order, with who said it", () => {
    render(<LeaveScreen />);
    const items = within(
      within(panel()).getByRole("list", { name: "What happened" }),
    ).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Requested");
    expect(items[1]).toHaveTextContent("Sent back");
    expect(items[1]).toHaveTextContent("Fatima Bello, HR manager");
  });

  it("keeps the employee's own reason as its own row, and does not say it twice", () => {
    render(<LeaveScreen />);
    expect(
      within(panel()).getAllByText("Flu, with a doctor's note"),
    ).toHaveLength(1);
  });
});

describe("a request whose API sends no history", () => {
  it("keeps the old decision-note row, which is the only place the words are", () => {
    detail = detailOf(
      request("approved", { decisionNote: "Enjoy the rest." }),
      [],
    );
    render(<LeaveScreen />);
    expect(within(panel()).getByText("Decision note")).toBeInTheDocument();
    expect(within(panel()).getByText("Enjoy the rest.")).toBeInTheDocument();
    expect(within(panel()).queryByText("What happened")).toBeNull();
  });

  it("says nothing about why for a request that was not sent back and has a history", () => {
    detail = detailOf(
      request("approved", { decisionNote: "Enjoy the rest." }),
      [
        entry({}),
        entry({ kind: "APPROVED", at: "2026-10-19", note: "Enjoy the rest." }),
      ],
    );
    render(<LeaveScreen />);
    expect(within(panel()).queryByText("Why it was sent back")).toBeNull();
    expect(within(panel()).queryByText("Decision note")).toBeNull();
    /* Still said once, as a line of what happened. */
    expect(within(panel()).getByText("“Enjoy the rest.”")).toBeInTheDocument();
  });
});

describe("the files on their own request", () => {
  it("shows them to the person they belong to, with a way to open each", () => {
    detail = detailOf(request("pending", { attachmentCount: 1 }));
    files = {
      loading: false,
      error: null,
      list: {
        files: [
          {
            id: "f1",
            filename: "certificate.pdf",
            contentType: "application/pdf",
            sizeBytes: 2048,
            createdAt: "2026-10-18T09:00:00Z",
            scanStatus: "NOT_SCANNED",
            flagged: false,
            viewable: true,
            uploadedByYou: true,
            canRemove: true,
          },
        ],
        access: { role: "owner", canView: true, canAdd: true },
        requirement: {
          policy: "OPTIONAL",
          requiredOverDays: null,
          required: false,
          met: true,
        },
        limits: {
          maxFiles: 5,
          maxBytes: 5 * 1024 * 1024,
          storage: true,
          types: [],
        },
      },
    };
    render(<LeaveScreen />);
    expect(
      within(panel()).getByRole("button", { name: "Open certificate.pdf" }),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByRole("button", { name: "Remove certificate.pdf" }),
    ).toBeInTheDocument();
  });

  it("shows no files heading at all on a request with none that nobody can add to", () => {
    detail = detailOf(request("approved", { attachmentCount: 0 }));
    files = {
      loading: false,
      error: null,
      list: {
        files: [],
        access: { role: "owner", canView: true, canAdd: false },
        requirement: {
          policy: "NONE",
          requiredOverDays: null,
          required: false,
          met: true,
        },
        limits: { maxFiles: 5, maxBytes: 1, storage: true, types: [] },
      },
    };
    render(<LeaveScreen />);
    expect(within(panel()).queryByText("Supporting files")).toBeNull();
  });
});
