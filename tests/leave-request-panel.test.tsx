import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
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
const decide = vi.fn();

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
      decide,
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
  decide.mockReset();
  decide.mockResolvedValue(null);
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

/* ------------------------------------------------- a manager who decides it */

const filesFor = (role: "owner" | "hr" | "approver", canAdd: boolean) => ({
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
        uploadedByYou: false,
        canRemove: false,
      },
    ],
    access: { role, canView: true, canAdd },
    requirement: {
      policy: "REQUIRED",
      requiredOverDays: 2,
      required: true,
      met: true,
    },
    limits: {
      maxFiles: 5,
      maxBytes: 5 * 1024 * 1024,
      storage: true,
      types: [],
    },
  },
});

/** A Modal opened from the panel is a second dialog on top of it. */
const modal = () => screen.getAllByRole("dialog").at(-1)!;

describe("a manager reading the request they decide", () => {
  beforeEach(() => {
    me = "mgr-1";
    held = new Set();
    /* The reduced read: cover and balance withheld, not empty. */
    detail = detailOf(
      request("pending", { attachmentCount: 1 }),
      [entry({ note: "Flu" })],
      { reduced: true, clashes: null, balance: null },
    );
    files = filesFor("approver", false);
  });

  it("says cover is not shown to them, never that nobody else is off", () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(
      dialog.getByText("Who else is off is not shown to you."),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/Nobody else/)).toBeNull();
    /* No balance section, and no zero standing in for one. */
    expect(dialog.queryByText(/balance/i)).toBeNull();
  });

  it("can open the files, and cannot add or take one off", () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(
      dialog.getByRole("button", { name: "Open certificate.pdf" }),
    ).toBeInTheDocument();
    expect(dialog.queryByLabelText("Add files")).toBeNull();
    expect(dialog.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("is offered Approve and Send back while it is waiting", () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(dialog.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Send back" }),
    ).toBeInTheDocument();
  });

  it("approves with no note as a plain approval", async () => {
    render(<LeaveScreen />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Approve" }));
    const dialog = within(modal());
    expect(dialog.getByText(/A note is optional/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    /* The same two arguments a quick approve has always sent. */
    expect(decide).toHaveBeenCalledWith("r1", "approved");
  });

  it("approves with a note when there is one", async () => {
    render(<LeaveScreen />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Approve" }));
    const dialog = within(modal());
    fireEvent.change(dialog.getByRole("textbox"), {
      target: { value: "  Covered by Kemi that week.  " },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(
        "r1",
        "approved",
        "Covered by Kemi that week.",
      ),
    );
  });

  it("keeps the dialog open, with the note, and says the API's reason when it refuses", async () => {
    decide.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You have approved this one. It is with HR now.",
      ),
    );
    render(<LeaveScreen />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Approve" }));
    const dialog = within(modal());
    fireEvent.change(dialog.getByRole("textbox"), {
      target: { value: "Fine by me." },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Approve" }));
    expect(
      await dialog.findByText("You have approved this one. It is with HR now."),
    ).toBeInTheDocument();
    expect((dialog.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Fine by me.",
    );
  });

  it("will not send it back without a reason, and asks before sending", async () => {
    render(<LeaveScreen />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Send back" }));
    const dialog = within(modal());
    fireEvent.click(dialog.getByRole("button", { name: "Send it back" }));
    expect(
      await dialog.findByText("Write a line so they know what to change."),
    ).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByRole("textbox"), {
      target: { value: "Two people are already off that week." },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Send it back" }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(
        "r1",
        "declined",
        "Two people are already off that week.",
      ),
    );
  });

  it("shows the server's own message in the dialog when it refuses the reason", async () => {
    decide.mockRejectedValue(
      new ApiError(400, "validation_failed", "Invalid request", [
        { field: "note", message: "Say why, so they know what to change." },
      ]),
    );
    render(<LeaveScreen />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Send back" }));
    const dialog = within(modal());
    fireEvent.change(dialog.getByRole("textbox"), {
      target: { value: "no" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Send it back" }));
    expect(
      await dialog.findByText("Say why, so they know what to change."),
    ).toBeInTheDocument();
    /* Still open, with what was typed. */
    expect((dialog.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "no",
    );
  });

  it("is given nothing to press on a request that is with HR, and is told whose it is", () => {
    detail = detailOf(
      request("awaitingHr", {
        attachmentCount: 1,
        firstApprovedByName: "Tolu Bello",
        firstApprovalNote: "Covered by Kemi.",
      }),
      [entry({})],
      { reduced: true, clashes: null, balance: null },
    );
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(dialog.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(dialog.queryByRole("button", { name: "Send back" })).toBeNull();
    expect(
      dialog.getByText("With HR now. They make the final decision."),
    ).toBeInTheDocument();
  });

  it("is given nothing to press on a request that is already decided", () => {
    detail = detailOf(
      request("approved", { attachmentCount: 1 }),
      [entry({})],
      {
        reduced: true,
        clashes: null,
        balance: null,
      },
    );
    render(<LeaveScreen />);
    expect(
      within(panel()).queryByRole("button", { name: /Approve|Send back|Undo/ }),
    ).toBeNull();
  });
});

describe("HR finishing a request a head has approved", () => {
  beforeEach(() => {
    me = "emp-hr";
    held = new Set<PermissionKey>(["APPROVE_LEAVE_ALL"]);
    detail = detailOf(
      request("awaitingHr", {
        employeeId: "emp-1",
        firstApprovedAt: "2026-10-19",
        firstApprovedByName: "Tolu Bello",
        firstApprovedByJobTitle: "Head of Operations",
        firstApprovalNote: "Covered by Kemi.",
        attachmentCount: 1,
      }),
      [
        entry({}),
        entry({
          kind: "FIRST_APPROVED",
          at: "2026-10-19",
          byName: "Tolu Bello",
          byJobTitle: "Head of Operations",
          note: "Covered by Kemi.",
        }),
      ],
    );
    files = filesFor("hr", true);
  });

  it("shows the first approver's note to the person who finishes it", () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(dialog.getByText("First approver's note")).toBeInTheDocument();
    /* The row, and the same words as a line of what happened. */
    expect(dialog.getAllByText(/Covered by Kemi\./)).toHaveLength(2);
  });

  it("can open the file and add more on the employee's behalf, and approves with a note of their own", async () => {
    render(<LeaveScreen />);
    const dialog = within(panel());
    expect(
      dialog.getByRole("button", { name: "Open certificate.pdf" }),
    ).toBeInTheDocument();
    expect(dialog.getByLabelText("Add files")).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Approve" }));
    const approve = within(modal());
    fireEvent.change(approve.getByRole("textbox"), {
      target: { value: "Entitlement checked." },
    });
    fireEvent.click(approve.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(
        "r1",
        "approved",
        "Entitlement checked.",
      ),
    );
  });
});

describe("the person whose leave it is", () => {
  it("is not offered a way to decide it", () => {
    me = "emp-1";
    held = new Set();
    detail = detailOf(request("pending"));
    render(<LeaveScreen />);
    expect(
      within(panel()).queryByRole("button", { name: /^(Approve|Send back)/ }),
    ).toBeNull();
  });
});
