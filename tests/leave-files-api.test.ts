import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { LeaveFileLimits } from "@/lib/api/leave-files";

/**
 * Files on a leave request, below the screens.
 *
 * Three things matter at this level and none of them is the arithmetic, which is
 * the API's. What is sent has to be exactly what was signed. A refusal has to be
 * said in a sentence that never carries a file's name. And a file has to be
 * opened from a click and from nowhere else, with the link going to the address
 * bar and no further.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  putToStorage: vi.fn(),
}));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => mocks.request(...args),
}));
vi.mock("@/lib/api/uploads", async (original) => ({
  ...(await original<typeof import("@/lib/api/uploads")>()),
  putToStorage: (...args: unknown[]) => mocks.putToStorage(...args),
}));

const {
  acceptedLabels,
  acceptAttribute,
  declaredType,
  fileProblem,
  fileRefusal,
  leaveFilesApi,
  megabytes,
  openLeaveFile,
  uploadLeaveFile,
} = await import("@/lib/api/leave-files");
const { leaveApi } = await import("@/lib/api/leave");

const LIMITS: LeaveFileLimits = {
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  storage: true,
  types: [
    { contentType: "application/pdf", label: "PDF", extensions: [".pdf"] },
    { contentType: "image/png", label: "PNG", extensions: [".png"] },
    { contentType: "image/jpeg", label: "JPEG", extensions: [".jpg", ".jpeg"] },
    { contentType: "image/heic", label: "HEIC", extensions: [".heic"] },
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      label: "Word",
      extensions: [".docx"],
    },
  ],
};

const file = (name: string, type: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  mocks.request.mockReset();
  mocks.putToStorage.mockReset().mockResolvedValue(undefined);
});

describe("what a file is declared as", () => {
  it("sends image/heic for a .heic the browser gave no type for", () => {
    expect(declaredType(file("scan.heic", ""), LIMITS)).toBe("image/heic");
  });

  it("does not trust a type the API would not accept, when the name says otherwise", () => {
    /* Some browsers say image/heif for a HEIC. The allowlist knows image/heic. */
    expect(declaredType(file("scan.HEIC", "image/heif"), LIMITS)).toBe(
      "image/heic",
    );
  });

  it("keeps a browser type the API does accept", () => {
    expect(declaredType(file("note.pdf", "application/pdf"), LIMITS)).toBe(
      "application/pdf",
    );
  });

  it("passes an unknown kind through, to be refused in the API's words", () => {
    expect(
      declaredType(file("sheet.xlsx", "application/vnd.ms-excel"), LIMITS),
    ).toBe("application/vnd.ms-excel");
  });
});

describe("what is refused before anything is uploaded", () => {
  it("refuses an empty file", () => {
    expect(fileRefusal(file("a.pdf", "application/pdf", 0), LIMITS)).toMatch(
      /empty/,
    );
  });

  it("refuses one over the limit, in megabytes, saying the limit", () => {
    const big = file("a.pdf", "application/pdf", 6 * 1024 * 1024);
    expect(fileRefusal(big, LIMITS)).toBe(
      "That file is 6 MB. Keep files under 5 MB.",
    );
  });

  it("refuses a kind that cannot be attached, listing what can", () => {
    expect(
      fileRefusal(file("a.xlsx", "application/vnd.ms-excel"), LIMITS),
    ).toBe(
      "That kind of file cannot be attached. You can attach PDF, PNG, JPEG, HEIC and Word.",
    );
  });

  it("accepts a file that is allowed", () => {
    expect(fileRefusal(file("a.pdf", "application/pdf"), LIMITS)).toBeNull();
  });

  it("checks nothing it does not know when the limits have not loaded", () => {
    expect(fileRefusal(file("a.xlsx", "application/x"), null)).toBeNull();
    /* An empty file is empty whatever the limits are. */
    expect(fileRefusal(file("a.pdf", "application/pdf", 0), null)).toMatch(
      /empty/,
    );
  });

  it("builds the picker's hint and sentence from the limits", () => {
    expect(acceptAttribute(LIMITS)).toBe(".pdf,.png,.jpg,.jpeg,.heic,.docx");
    expect(acceptedLabels(LIMITS)).toBe("PDF, PNG, JPEG, HEIC and Word");
    expect(megabytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("uploading one file", () => {
  it("asks for a link, sends exactly the headers it was given, and returns the key", async () => {
    mocks.request.mockResolvedValue({
      storageKey: "org/leave/emp/key.heic",
      url: "https://storage.example/put",
      headers: { "Content-Type": "image/heic" },
      expiresAt: "2026-10-30T10:10:00Z",
    });

    const ref = await uploadLeaveFile(file("scan.heic", ""), LIMITS, {
      employeeId: "emp-1",
    });

    expect(mocks.request).toHaveBeenCalledWith(
      "/leave/attachments/upload-url",
      {
        method: "POST",
        body: {
          employeeId: "emp-1",
          filename: "scan.heic",
          contentType: "image/heic",
          sizeBytes: 1000,
        },
      },
    );
    expect(mocks.putToStorage).toHaveBeenCalledTimes(1);
    const presigned = mocks.putToStorage.mock.calls[0]![1] as {
      url: string;
      headers: Record<string, string>;
    };
    /* The returned headers, and nothing added to them. */
    expect(presigned.headers).toEqual({ "Content-Type": "image/heic" });
    expect(presigned.url).toBe("https://storage.example/put");
    expect(ref).toEqual({
      storageKey: "org/leave/emp/key.heic",
      filename: "scan.heic",
      contentType: "image/heic",
    });
  });

  it("records nothing when the bytes did not land", async () => {
    mocks.request.mockResolvedValue({
      storageKey: "k",
      url: "https://storage.example/put",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: "x",
    });
    mocks.putToStorage.mockRejectedValue(
      new Error("The file could not be stored."),
    );
    await expect(
      uploadLeaveFile(file("a.pdf", "application/pdf"), LIMITS),
    ).rejects.toThrow("could not be stored");
    /* Only the link was asked for: no record call exists to make. */
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});

describe("a refusal, as a sentence", () => {
  const codes: [string, number][] = [
    ["attachment_required", 422],
    ["attachment_limit", 422],
    ["attachment_too_large", 422],
    ["attachment_type_refused", 422],
    ["attachment_flagged", 422],
    ["attachment_missing", 422],
    ["attachment_locked", 409],
    ["storage_off", 422],
    ["storage_unavailable", 503],
    ["forbidden", 403],
    ["not_found", 404],
    ["rate_limited", 429],
    ["validation_failed", 400],
  ];

  it("has a plain sentence for every code the API sends, even with no message", () => {
    for (const [code, status] of codes) {
      const sentence = fileProblem(new ApiError(status, code, ""));
      expect(sentence.length, code).toBeGreaterThan(10);
      expect(sentence, code).not.toMatch(/\b(4\d\d|5\d\d)\b/);
    }
  });

  it("uses the API's own words where it wrote some about this refusal", () => {
    expect(
      fileProblem(
        new ApiError(
          422,
          "attachment_too_large",
          "That file is 7 MB. Keep files under 5 MB.",
        ),
      ),
    ).toBe("That file is 7 MB. Keep files under 5 MB.");
    /* One code, several causes: only the API's sentence is right for each. */
    expect(
      fileProblem(
        new ApiError(
          422,
          "attachment_type_refused",
          "That file is already attached.",
        ),
      ),
    ).toBe("That file is already attached.");
  });

  it("says unavailable, never missing, when storage did not answer", () => {
    expect(
      fileProblem(new ApiError(503, "storage_unavailable", "")),
    ).not.toMatch(/missing|gone|not there/i);
  });

  it("shows a decline's missing reason at its field", () => {
    const error = new ApiError(400, "validation_failed", "Invalid", [
      { field: "note", message: "Say why, so they know what to change." },
    ]);
    expect(fileProblem(error)).toBe("Say why, so they know what to change.");
  });

  it("falls back to something plain for anything else", () => {
    expect(fileProblem(new ApiError(500, "boom", ""))).toBe(
      "That did not work. Try again.",
    );
    expect(fileProblem("nope")).toBe("That did not work. Try again.");
  });
});

describe("opening a file", () => {
  const opened = (mode: "view" | "download") => ({
    url: "https://storage.example/get?sig=secret",
    expiresAt: "2026-10-30T10:05:00Z",
    filename: "certificate.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    mode,
  });

  let tab: {
    location: { href: string };
    close: ReturnType<typeof vi.fn>;
    opener: unknown;
  };
  const assign = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    tab = { location: { href: "" }, close: vi.fn(), opener: "page" };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  it("opens the tab inside the click, then points it at the file", async () => {
    mocks.request.mockResolvedValue(opened("view"));
    const result = await openLeaveFile("req-1", { id: "f-1", viewable: true });

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(mocks.request).toHaveBeenCalledWith(
      "/leave/requests/req-1/attachments/f-1/url",
      { query: { mode: "view" } },
    );
    expect(tab.location.href).toBe("https://storage.example/get?sig=secret");
    expect(assign).not.toHaveBeenCalled();
    expect(result).toBe("opened");
  });

  it("asks for no link at all when the browser stopped the tab", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const result = await openLeaveFile("req-1", { id: "f-1", viewable: true });
    expect(result).toBe("blocked");
    /* A link issued is a look in the audit trail, and there is nothing to look with. */
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("downloads a file a browser cannot show, with no tab opened", async () => {
    mocks.request.mockResolvedValue(opened("download"));
    await openLeaveFile("req-1", { id: "f-2", viewable: false });

    expect(window.open).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(
      "/leave/requests/req-1/attachments/f-2/url",
      { query: { mode: "download" } },
    );
    expect(assign).toHaveBeenCalledWith(
      "https://storage.example/get?sig=secret",
    );
  });

  it("does what the API says was issued, not what was asked for", async () => {
    mocks.request.mockResolvedValue(opened("download"));
    await openLeaveFile("req-1", { id: "f-3", viewable: true });

    expect(tab.close).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "https://storage.example/get?sig=secret",
    );
    expect(tab.location.href).toBe("");
  });

  it("closes the blank tab when the link is refused, and keeps the link out of the error", async () => {
    mocks.request.mockRejectedValue(
      new ApiError(409, "attachment_flagged", "x"),
    );
    await expect(
      openLeaveFile("req-1", { id: "f-1", viewable: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(tab.close).toHaveBeenCalled();
  });
});

describe("the leave request, as it now arrives", () => {
  const wireRequest = {
    id: "r1",
    employeeId: "e1",
    employeeName: "Ada Okafor",
    employeeJobTitle: null,
    leaveTypeId: "t1",
    leaveType: "Sick",
    startDate: "2026-10-20",
    endDate: "2026-10-22",
    days: 3,
    reason: "Flu",
    status: "PENDING",
    approverId: null,
    approverName: null,
    requestedAt: "2026-10-18T09:00:00Z",
    decidedAt: null,
    decidedById: null,
    decidedByName: null,
    decidedByJobTitle: null,
    decisionNote: null,
  };

  it("leaves cover and balance absent on a reduced read, not empty", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      reduced: true,
      attachmentCount: 2,
      history: [],
    });
    const detail = await leaveApi.get("r1");
    expect(detail.reduced).toBe(true);
    /* `[]` would say "nobody else is off". */
    expect(detail.clashes).toBeNull();
    expect(detail.balance).toBeNull();
    expect(detail.request.attachmentCount).toBe(2);
  });

  it("keeps an empty list of clashes as empty on the full read", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      clashes: [],
      balance: null,
      reduced: false,
    });
    const detail = await leaveApi.get("r1");
    expect(detail.reduced).toBe(false);
    expect(detail.clashes).toEqual([]);
  });

  it("reads the history, and the first approver's note apart from the decision's", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      clashes: [],
      status: "AWAITING_HR",
      firstApprovalNote: "Covered by Tolu.",
      decisionNote: null,
      history: [
        {
          kind: "REQUESTED",
          at: "2026-10-18T09:00:00Z",
          byName: "Ada Okafor",
          byJobTitle: "Analyst",
          note: "Flu",
        },
        {
          kind: "FIRST_APPROVED",
          at: "2026-10-19T09:00:00Z",
          byName: "Tolu Bello",
          byJobTitle: "Head of Ops",
          note: "Covered by Tolu.",
        },
      ],
    });
    const detail = await leaveApi.get("r1");
    expect(detail.request.firstApprovalNote).toBe("Covered by Tolu.");
    expect(detail.request.decisionNote).toBeNull();
    expect(detail.history.map((e) => e.kind)).toEqual([
      "REQUESTED",
      "FIRST_APPROVED",
    ]);
    expect(detail.history[1]?.at).toBe("2026-10-19");
  });

  it("counts no files for an API that does not send a count", async () => {
    mocks.request.mockResolvedValue({ ...wireRequest, clashes: [] });
    expect((await leaveApi.get("r1")).request.attachmentCount).toBe(0);
  });

  it("sends the files with the request, and nothing when there are none", async () => {
    mocks.request.mockResolvedValue({ request: wireRequest, warnings: [] });
    await leaveApi.create({
      employeeId: "e1",
      leaveTypeId: "t1",
      from: "2026-10-20",
      to: "2026-10-22",
      attachments: [
        { storageKey: "k1", filename: "a.pdf", contentType: "application/pdf" },
      ],
    });
    expect(mocks.request.mock.calls[0]![1].body.attachments).toEqual([
      { storageKey: "k1", filename: "a.pdf", contentType: "application/pdf" },
    ]);

    mocks.request.mockClear();
    mocks.request.mockResolvedValue({ request: wireRequest, warnings: [] });
    await leaveApi.create({
      employeeId: "e1",
      leaveTypeId: "t1",
      from: "2026-10-20",
      to: "2026-10-22",
      attachments: [],
    });
    expect(mocks.request.mock.calls[0]![1].body).not.toHaveProperty(
      "attachments",
    );
  });

  it("reads a leave type's file setting, and none as not asked for", async () => {
    const wire = {
      id: "t1",
      name: "Sick",
      entitledDays: 10,
      accrual: "ANNUAL_UPFRONT",
      carryOverMax: 0,
      carryOverExpiresMonths: 0,
      requiresEvidence: true,
      minNoticeDays: 0,
      isPaid: true,
      eligibleGender: null,
    };
    mocks.request.mockResolvedValue([
      { ...wire, attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 },
      { ...wire, id: "t2", name: "Annual" },
    ]);
    const types = await leaveApi.types();
    expect(types[0]).toMatchObject({
      attachmentPolicy: "REQUIRED",
      attachmentRequiredOverDays: 2,
    });
    /* The old informational flag is not the setting, and is not read as one. */
    expect(types[1]).toMatchObject({
      attachmentPolicy: "NONE",
      attachmentRequiredOverDays: null,
    });
  });
});

describe("the rule for a request of this length", () => {
  it("is the API's, and null when the API says nothing about files", async () => {
    mocks.request.mockResolvedValueOnce({
      days: 3,
      attachment: { policy: "REQUIRED", requiredOverDays: 2, required: true },
    });
    expect(
      await leaveFilesApi.rule({
        leaveTypeId: "t1",
        startDate: "2026-10-20",
        endDate: "2026-10-22",
      }),
    ).toEqual({ policy: "REQUIRED", requiredOverDays: 2, required: true });

    mocks.request.mockResolvedValueOnce({ days: 3 });
    expect(
      await leaveFilesApi.rule({
        leaveTypeId: "t1",
        startDate: "2026-10-20",
        endDate: "2026-10-22",
      }),
    ).toBeNull();
  });
});
