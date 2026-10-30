import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";
import type { LeaveFileLimits } from "@/lib/api/leave-files";
import type { LeaveRow, LeaveTypeRow } from "@/lib/api/leave";

/**
 * Raising leave with a supporting file.
 *
 * The API decides whether a file is required (from the request's own days) and
 * what a refusal says, so those are answered here from variables. What is
 * checked is what the form does with the answers: when it offers a picker, when
 * it refuses to send, what it uploads and in what order, what it sends with the
 * request, and where each kind of refusal is said. And that no sentence it
 * writes carries a file's name.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  limits: null as unknown,
  storage: true as boolean | null,
  rule: null as unknown,
  connected: true,
}));

const LIMITS: LeaveFileLimits = {
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  storage: true,
  types: [
    { contentType: "application/pdf", label: "PDF", extensions: [".pdf"] },
    { contentType: "image/png", label: "PNG", extensions: [".png"] },
    { contentType: "image/heic", label: "HEIC", extensions: [".heic"] },
  ],
};

const SICK: LeaveTypeRow = {
  id: "t-sick",
  /* The form opens on Annual, so the type under test is named for it. */
  name: "Annual",
  entitledDays: 10,
  accrual: "ANNUAL_UPFRONT",
  carryOverMax: 0,
  carryOverExpiresMonths: 0,
  requiresEvidence: true,
  minNoticeDays: 0,
  isPaid: true,
  eligibleGender: null,
  attachmentPolicy: "OPTIONAL",
  attachmentRequiredOverDays: null,
};

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => false,
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "emp-1", isConnected: mocks.connected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployee: () => ({ employee: { managerId: "mgr-1" } }),
  useEmployeeDirectory: () => ({ employees: [] }),
}));
vi.mock("@/lib/store/attendance", async (original) => ({
  ...(await original<typeof import("@/lib/store/attendance")>()),
  useAttendancePolicy: () => ({
    policy: { workingWeekdays: [1, 2, 3, 4, 5] },
  }),
}));
vi.mock("@/lib/store/holidays", () => ({
  usePublicHolidays: () => ({ holidays: [] }),
}));
vi.mock("@/lib/store/leave-api", () => ({
  useLeaveTypes: () => ({ types: [SICK] }),
  useLeaveBalancesFor: () => ({ of: () => undefined }),
  useLeaveMutations: () => ({
    create: mocks.create,
    connected: mocks.connected,
  }),
}));
vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({
    limits: mocks.limits,
    storage: mocks.storage,
  }),
  useAttachmentRule: () => ({ rule: mocks.rule }),
}));
vi.mock("@/lib/api/leave-files", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave-files")>()),
  uploadLeaveFile: (...args: unknown[]) => mocks.upload(...args),
}));

const { BookLeaveDialog } = await import("@/app/(app)/people/leave/book-leave");

const created = (over: Partial<LeaveRow> = {}) =>
  ({
    id: "r1",
    employeeName: "Ada Okafor",
    days: 3,
    approverId: "mgr-1",
    approverName: "Tolu Bello",
    ...over,
  }) as LeaveRow;

const pdf = (name = "certificate.pdf", size = 2000) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

function mount() {
  const onCreated = vi.fn();
  render(
    <ToastProvider>
      <BookLeaveDialog
        open
        onClose={vi.fn()}
        onCreated={onCreated}
        requests={[]}
      />
    </ToastProvider>,
  );
  return { onCreated };
}

/** The heading of the file group: its legend says whether a file is required. */
const legend = () =>
  document.querySelector("fieldset > legend")?.textContent ?? null;

/** The hidden input the Attach button opens. */
const chooser = () => screen.getByLabelText("Attach files") as HTMLInputElement;

function choose(...files: File[]) {
  fireEvent.change(chooser(), { target: { files } });
}

function pickDates() {
  fireEvent.change(screen.getByLabelText(/^From/), {
    target: { value: "2026-11-02" },
  });
  fireEvent.change(screen.getByLabelText(/^To/), {
    target: { value: "2026-11-04" },
  });
}

const send = () =>
  fireEvent.click(screen.getByRole("button", { name: "Raise request" }));

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({
    request: created(),
    warnings: [],
  });
  mocks.upload.mockReset();
  mocks.upload.mockImplementation(async (file: File) => ({
    storageKey: `key-${file.name}`,
    filename: file.name,
    contentType: "application/pdf",
  }));
  mocks.limits = LIMITS;
  mocks.storage = true;
  mocks.rule = { policy: "OPTIONAL", requiredOverDays: null, required: false };
  mocks.connected = true;
});

describe("when the picker is offered", () => {
  it("offers it where the server can keep a file, saying what it takes", () => {
    mount();
    expect(legend()).toBe("Supporting file (optional)");
    expect(
      screen.getByText("PDF, PNG and HEIC, up to 5 files of 5 MB each."),
    ).toBeInTheDocument();
  });

  it("does not offer it where the server cannot", () => {
    mocks.storage = false;
    mocks.limits = { ...LIMITS, storage: false };
    mount();
    expect(screen.queryByText("Supporting file")).toBeNull();
    expect(screen.queryByLabelText("Attach files")).toBeNull();
  });

  it("does not offer it while it is not known whether the server can", () => {
    mocks.storage = null;
    mocks.limits = null;
    mount();
    expect(screen.queryByText("Supporting file")).toBeNull();
  });

  it("does not offer it with no live company, and says so only for the old flag", () => {
    mocks.connected = false;
    mount();
    expect(screen.queryByText("Supporting file")).toBeNull();
    expect(screen.getByText("Annual leave needs evidence")).toBeInTheDocument();
  });

  it("does not repeat the old evidence callout beside the new setting", () => {
    mount();
    expect(screen.queryByText("Annual leave needs evidence")).toBeNull();
  });
});

describe("when a file is required", () => {
  beforeEach(() => {
    mocks.rule = { policy: "REQUIRED", requiredOverDays: 2, required: true };
  });

  it("says so, from the API's own answer", () => {
    mount();
    expect(
      screen.getByText("A supporting file is required."),
    ).toBeInTheDocument();
    expect(legend()).toBe("Supporting file* required");
  });

  it("does not send without one, and says it in red where the file goes", () => {
    mount();
    pickDates();
    send();
    expect(
      screen.getByText(
        "A supporting file is required. Attach one and send the request again.",
      ),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("stops asking once there is one", () => {
    mount();
    choose(pdf());
    expect(screen.queryByText("A supporting file is required.")).toBeNull();
  });

  it("sends nothing to the API about it when it is not known to be required", async () => {
    mocks.rule = null;
    mount();
    pickDates();
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("attachments");
  });
});

describe("choosing files", () => {
  it("lists each with its size and takes it off again", () => {
    mount();
    choose(pdf("certificate.pdf", 2048));
    const list = screen.getByRole("list", { name: "Files to send" });
    expect(within(list).getByText("certificate.pdf")).toBeInTheDocument();
    expect(within(list).getByText("2 KB")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove certificate.pdf" }),
    );
    expect(screen.queryByRole("list", { name: "Files to send" })).toBeNull();
  });

  it("refuses a kind that cannot be attached, beside the file, and never sends it", async () => {
    mount();
    pickDates();
    choose(
      new File([new Uint8Array(10)], "sheet.xlsx", {
        type: "application/vnd.ms-excel",
      }),
    );
    expect(
      screen.getByText(
        "That kind of file cannot be attached. You can attach PDF, PNG and HEIC.",
      ),
    ).toBeInTheDocument();
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("attachments");
  });

  it("refuses a sixth file, and one that is too big, in words that say the limit", () => {
    mount();
    choose(
      pdf("a.pdf"),
      pdf("b.pdf"),
      pdf("c.pdf"),
      pdf("d.pdf"),
      pdf("e.pdf"),
    );
    choose(pdf("f.pdf"));
    expect(
      screen.getByText(
        "A request can carry up to 5 files. Remove one to add another.",
      ),
    ).toBeInTheDocument();
    choose(pdf("big.pdf", 6 * 1024 * 1024));
    expect(
      screen.getByText("That file is 6 MB. Keep files under 5 MB."),
    ).toBeInTheDocument();
  });
});

describe("sending with files", () => {
  it("uploads each file for the person the leave is for, then sends the request with their keys", async () => {
    mount();
    pickDates();
    choose(pdf("a.pdf"), pdf("b.pdf"));
    send();

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0]![2]).toMatchObject({
      employeeId: "emp-1",
    });
    /* The request goes after the last upload has landed, never beside it. */
    expect(mocks.upload.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0]!,
    );
    expect(mocks.create.mock.calls[0]![0].attachments).toEqual([
      {
        storageKey: "key-a.pdf",
        filename: "a.pdf",
        contentType: "application/pdf",
      },
      {
        storageKey: "key-b.pdf",
        filename: "b.pdf",
        contentType: "application/pdf",
      },
    ]);
  });

  it("never puts a file's name in what it tells the person afterwards", async () => {
    mount();
    pickDates();
    choose(pdf("my-medical-certificate.pdf"));
    send();
    await screen.findByText("Leave request raised");
    expect(screen.queryByText(/my-medical-certificate/)).toBeNull();
  });

  it("does not send the request when a file would not upload, and says why under that file", async () => {
    mocks.upload.mockImplementation(async (file: File) => {
      if (file.name === "b.pdf") {
        throw new ApiError(
          422,
          "attachment_too_large",
          "That file is 7 MB. Keep files under 5 MB.",
        );
      }
      return {
        storageKey: `key-${file.name}`,
        filename: file.name,
        contentType: "application/pdf",
      };
    });
    mount();
    pickDates();
    choose(pdf("a.pdf"), pdf("b.pdf"));
    send();

    expect(
      await screen.findByText("That file is 7 MB. Keep files under 5 MB."),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      screen.getByText(/The request was not sent\. Fix or remove the file/),
    ).toBeInTheDocument();
  });

  it("does not upload a file twice when a send is tried again", async () => {
    mocks.upload.mockImplementationOnce(async (file: File) => ({
      storageKey: `key-${file.name}`,
      filename: file.name,
      contentType: "application/pdf",
    }));
    mocks.upload.mockRejectedValueOnce(
      new ApiError(503, "storage_unavailable", ""),
    );
    mount();
    pickDates();
    choose(pdf("a.pdf"), pdf("b.pdf"));
    send();
    await screen.findByText(/File storage did not answer/);
    expect(mocks.upload).toHaveBeenCalledTimes(2);

    mocks.upload.mockImplementation(async (file: File) => ({
      storageKey: `key-${file.name}`,
      filename: file.name,
      contentType: "application/pdf",
    }));
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    /* a.pdf was already in storage; only b.pdf is sent again. */
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(
      mocks.create.mock.calls[0]![0].attachments.map(
        (a: { storageKey: string }) => a.storageKey,
      ),
    ).toEqual(["key-a.pdf", "key-b.pdf"]);
  });
});

describe("a refusal from the request itself", () => {
  it("says a file refusal under the files, not under the dates", async () => {
    mocks.create.mockRejectedValue(
      new ApiError(
        422,
        "attachment_required",
        "Sick over 2 days needs a supporting file. Attach one and send the request again.",
      ),
    );
    mount();
    pickDates();
    send();
    expect(
      await screen.findByText(/Sick over 2 days needs a supporting file/),
    ).toBeInTheDocument();
    /* Nothing under the dates to fix. */
    expect(screen.queryByText("Pick a start date.")).toBeNull();
  });

  it("still says an overlap under the dates, in the API's own words", async () => {
    mocks.create.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "That overlaps an existing approved Annual request, 2026-11-02 to 2026-11-05.",
      ),
    );
    mount();
    pickDates();
    send();
    expect(
      await screen.findByText(
        /That overlaps an existing approved Annual request/,
      ),
    ).toBeInTheDocument();
  });
});
