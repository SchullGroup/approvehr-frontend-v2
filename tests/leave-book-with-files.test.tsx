import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";
import type { LeaveFileLimits } from "@/lib/api/leave-files";
import { UPLOAD_BLOCKED, UploadBlockedError } from "@/lib/api/uploads";
import { LINKED_FILES_NOTE } from "@/lib/api/linked-upload";
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
  /** What the chosen type says. Null is a server that says nothing. */
  reasonRequired: null as boolean | null,
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
  reasonRequired: null,
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
  useLeaveTypes: () => ({
    types: [{ ...SICK, reasonRequired: mocks.reasonRequired }],
  }),
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
  mocks.reasonRequired = null;
});

afterEach(() => vi.unstubAllEnvs());

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

  it("takes the red refusal down once a file is attached", () => {
    /* The muted line above goes by itself, because it is read off the staged
       files. The red sentence is what a refused send said, and it used to stay
       under the file that answered it until the next send. */
    mount();
    pickDates();
    send();
    const refusal =
      "A supporting file is required. Attach one and send the request again.";
    expect(screen.getByText(refusal)).toBeInTheDocument();
    choose(pdf());
    expect(screen.queryByText(refusal)).toBeNull();
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

  it("takes 'fix or remove the file' down when that file is taken off", async () => {
    mocks.upload.mockRejectedValue(
      new ApiError(
        422,
        "attachment_too_large",
        "That file is 7 MB. Keep files under 5 MB.",
      ),
    );
    mount();
    pickDates();
    choose(pdf("b.pdf"));
    send();
    await screen.findByText(
      /The request was not sent\. Fix or remove the file/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove b.pdf" }));
    expect(screen.queryByText(/The request was not sent/)).toBeNull();
  });

  describe("when the browser itself refuses to send the file", () => {
    /* This site's security policy does not name the storage address, so the
       request never leaves. Retrying cannot help and the file is not at fault,
       so neither "check your connection" nor "fix or remove the file" is said. */
    beforeEach(() => {
      mocks.upload.mockRejectedValue(new UploadBlockedError());
    });

    it("says why under the file, in words that do not blame the connection or the file", async () => {
      mount();
      pickDates();
      choose(pdf("a.pdf"));
      send();
      expect(await screen.findByText(UPLOAD_BLOCKED)).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(screen.queryByText(/check your connection/i)).toBeNull();
      expect(screen.queryByText(/Fix or remove the file/)).toBeNull();
    });

    it("tells somebody whose leave needs a file that it cannot be raised yet", async () => {
      mocks.rule = { policy: "REQUIRED", requiredOverDays: 2, required: true };
      mount();
      pickDates();
      choose(pdf("a.pdf"));
      send();
      expect(
        await screen.findByText(
          "The request was not sent. This leave needs a file, so it cannot be raised until this site is set up to send files.",
        ),
      ).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("tells somebody whose leave does not need one that they can send it without", async () => {
      mount();
      pickDates();
      choose(pdf("a.pdf"));
      send();
      await screen.findByText(
        "The request was not sent. Remove the file to send it without one.",
      );
      fireEvent.click(screen.getByRole("button", { name: "Remove a.pdf" }));
      send();
      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("attachments");
    });
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

/** The Reason box, whose label says whether it is asked for. */
const reasonBox = () => screen.getByLabelText(/^Reason/) as HTMLTextAreaElement;
const reasonLabel = () =>
  document.querySelector(`label[for="${reasonBox().id}"]`)!;

const REASON_MISSING = "Say why you are asking for this leave.";

describe("when the leave type asks for a reason", () => {
  beforeEach(() => {
    mocks.reasonRequired = true;
  });

  it("marks the Reason required and does not call it optional", () => {
    mount();
    expect(reasonLabel().textContent).toBe("Reason* required");
    expect(reasonLabel().textContent).not.toMatch(/optional/);
  });

  it("does not send without one, says so under the box, and sends nothing at all", () => {
    mount();
    pickDates();
    send();
    expect(screen.getByText(REASON_MISSING)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("takes spaces for nothing", () => {
    mount();
    pickDates();
    fireEvent.change(reasonBox(), { target: { value: "   \n  " } });
    send();
    expect(screen.getByText(REASON_MISSING)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks the reason before it uploads anything, so a refused request leaves no file behind", () => {
    mount();
    pickDates();
    choose(pdf("a.pdf"));
    send();
    expect(screen.getByText(REASON_MISSING)).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("takes the sentence down once there is something to read", () => {
    mount();
    pickDates();
    send();
    expect(screen.getByText(REASON_MISSING)).toBeInTheDocument();
    fireEvent.change(reasonBox(), { target: { value: "Flu" } });
    expect(screen.queryByText(REASON_MISSING)).toBeNull();
  });

  it("sends the reason with its spaces trimmed", async () => {
    mount();
    pickDates();
    fireEvent.change(reasonBox(), { target: { value: "  Down with flu.  " } });
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]![0].reason).toBe("Down with flu.");
  });

  it("says the server's own sentence, under the reason, when it is the one to refuse", async () => {
    mocks.create.mockRejectedValue(
      new ApiError(422, "validation_failed", "Invalid", [
        {
          field: "reason",
          message: "Annual needs a reason. Say why you are asking for it.",
        },
      ]),
    );
    mount();
    pickDates();
    fireEvent.change(reasonBox(), { target: { value: "Rest" } });
    send();
    const sentence = await screen.findByText(
      "Annual needs a reason. Say why you are asking for it.",
    );
    expect(sentence.closest("[id$=error]")).not.toBeNull();
    /* Typed text is still there. */
    expect(reasonBox().value).toBe("Rest");
  });

  it("says the server's own sentence verbatim even where it names no field", async () => {
    mocks.create.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Annual needs a reason. Say why you are asking for it.",
      ),
    );
    mount();
    pickDates();
    fireEvent.change(reasonBox(), { target: { value: "Rest" } });
    send();
    expect(
      await screen.findByText(
        "Annual needs a reason. Say why you are asking for it.",
      ),
    ).toBeInTheDocument();
  });
});

describe("when the leave type does not ask for a reason, or the server does not say", () => {
  it.each([
    ["says it does not", false],
    ["says nothing", null],
  ])(
    "a server that %s: optional, and sends without one",
    async (_name, setting) => {
      mocks.reasonRequired = setting;
      mount();
      expect(reasonLabel().textContent).toBe("Reason (optional)");
      pickDates();
      send();
      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("reason");
      expect(screen.queryByText(REASON_MISSING)).toBeNull();
    },
  );

  it("the demo has no setting and never holds the form on one", async () => {
    mocks.connected = false;
    mocks.reasonRequired = null;
    mount();
    pickDates();
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  });
});

describe("files that go to the uploader and are linked by their address", () => {
  const UPLOADER = "https://uploader.example.test/prod";
  const linked = (over: Partial<LeaveFileLimits> = {}): LeaveFileLimits => ({
    ...LIMITS,
    storage: false,
    links: true,
    types: [
      { contentType: "application/pdf", label: "PDF", extensions: [".pdf"] },
      { contentType: "image/jpeg", label: "JPEG", extensions: [".jpg"] },
      { contentType: "image/png", label: "PNG", extensions: [".png"] },
      { contentType: "image/heic", label: "HEIC", extensions: [".heic"] },
    ],
    ...over,
  });
  const png = (name = "scan.png", size = 2000) =>
    new File([new Uint8Array(size)], name, { type: "image/png" });

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", UPLOADER);
    mocks.storage = false;
    mocks.limits = linked();
    mocks.upload.mockImplementation(async (f: File) => ({
      fileUrl: `https://files.example.test/${f.name}`,
      filename: f.name,
      contentType: f.type,
    }));
  });

  it("offers the picker, says what the route takes, and says the files are public to anyone with the address", () => {
    mount();
    expect(legend()).toBe("Supporting file (optional)");
    expect(
      screen.getByText(
        "PDF up to 2 MB, JPEG and PNG up to 3 MB, up to 5 files.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(LINKED_FILES_NOTE)).toBeInTheDocument();
  });

  it("offers no picker where the server takes links and this build has nowhere to send them", () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    mount();
    expect(screen.queryByLabelText("Attach files")).toBeNull();
    expect(screen.queryByText(LINKED_FILES_NOTE)).toBeNull();
  });

  it("offers none where the server says nothing about links", () => {
    mocks.limits = linked({ links: undefined });
    mount();
    expect(screen.queryByLabelText("Attach files")).toBeNull();
  });

  it("goes the server's own way, with no note, wherever it can store a file", () => {
    mocks.storage = true;
    mocks.limits = linked({ storage: true });
    mount();
    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();
    expect(screen.queryByText(LINKED_FILES_NOTE)).toBeNull();
    /* Every kind and size the API said, not the uploader's three. */
    expect(
      screen.getByText("PDF, JPEG, PNG and HEIC, up to 5 files of 5 MB each."),
    ).toBeInTheDocument();
  });

  it("refuses a kind the uploader does not take, beside the file, naming the three that it does", () => {
    mount();
    choose(new File([new Uint8Array(10)], "scan.heic", { type: "image/heic" }));
    expect(
      screen.getByText(
        "That kind of file cannot be attached. You can attach PDF, JPEG and PNG.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses a document over 2 MB but takes an image of the same size", () => {
    mount();
    choose(pdf("big.pdf", 2 * 1024 * 1024 + 1));
    expect(
      screen.getByText("That file is 2.0 MB. Keep files under 2 MB."),
    ).toBeInTheDocument();
    choose(png("photo.png", 2 * 1024 * 1024 + 1));
    expect(screen.queryByText(/Keep files under 3 MB/)).toBeNull();
  });

  it("uploads with what the server said, then sends the request with each file's address", async () => {
    mount();
    pickDates();
    choose(pdf("a.pdf"), png("b.png"));
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    /* The upload is given the server's own limits, not the narrowed ones the
       picker checked with: the route narrows them again, once. */
    expect(mocks.upload.mock.calls[0]![1]).toBe(mocks.limits);
    expect(mocks.create.mock.calls[0]![0].attachments).toEqual([
      {
        fileUrl: "https://files.example.test/a.pdf",
        filename: "a.pdf",
        contentType: "application/pdf",
      },
      {
        fileUrl: "https://files.example.test/b.png",
        filename: "b.png",
        contentType: "image/png",
      },
    ]);
  });

  it("does not upload a file twice when a send is tried again", async () => {
    mocks.upload.mockImplementationOnce(async (f: File) => ({
      fileUrl: `https://files.example.test/${f.name}`,
      filename: f.name,
      contentType: f.type,
    }));
    mocks.upload.mockRejectedValueOnce(
      new Error(
        "The upload did not finish. Check your connection and try again.",
      ),
    );
    mount();
    pickDates();
    choose(pdf("a.pdf"), pdf("b.pdf"));
    send();
    expect(
      await screen.findByText(
        "The upload did not finish. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(2);

    mocks.upload.mockImplementation(async (f: File) => ({
      fileUrl: `https://files.example.test/${f.name}`,
      filename: f.name,
      contentType: f.type,
    }));
    send();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    /* a.pdf was already sent; only b.pdf goes again. */
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });

  it("says the connection, under the file, and never the file's name, when the uploader did not answer", async () => {
    mocks.upload.mockRejectedValue(
      new Error(
        "The upload did not finish. Check your connection and try again.",
      ),
    );
    mount();
    pickDates();
    choose(pdf("my-private-note.pdf"));
    send();
    const sentence = await screen.findByText(
      "The upload did not finish. Check your connection and try again.",
    );
    expect(sentence.textContent).not.toMatch(/private/);
    expect(
      screen.getByText(/The request was not sent\. Fix or remove the file/),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("says the server's own sentence for a link it would not take", async () => {
    mocks.create.mockRejectedValue(
      new ApiError(
        422,
        "attachment_link_refused",
        "That address is not on the list of places files may be linked from.",
      ),
    );
    mount();
    pickDates();
    choose(pdf("a.pdf"));
    send();
    expect(
      await screen.findByText(
        "That address is not on the list of places files may be linked from.",
      ),
    ).toBeInTheDocument();
  });

  it("still requires a file where the API says one is required, and sends nothing without one", () => {
    mocks.rule = { policy: "REQUIRED", requiredOverDays: 2, required: true };
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
});
