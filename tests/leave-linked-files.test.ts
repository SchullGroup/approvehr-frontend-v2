import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { LeaveFileLimits } from "@/lib/api/leave-files";

/**
 * Files that go to the old platform's uploader and are linked to a leave
 * request by their address, below the screens.
 *
 * Four things matter. **Which route a file takes**, and that the server's own
 * storage always wins: a server that can keep a file privately is never sent
 * down the public route. **That the route is off** unless the build says where
 * the uploader is, and then nothing is sent anywhere. **What the picker is
 * allowed to promise**: only the kinds and sizes that route will really take.
 * And **what the leave API is told**: an address where it used to be told a key,
 * on both routes that take one.
 *
 * `fetch` is replaced in every test. The real uploader is open to the world.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  putToStorage: vi.fn(),
  fetch: vi.fn(),
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
  fileProblem,
  fileRefusal,
  filesAvailable,
  fileRoute,
  leaveFilesApi,
  openLeaveFile,
  uploadLeaveFile,
} = await import("@/lib/api/leave-files");
const { leaveApi } = await import("@/lib/api/leave");
const { fileHint } = await import("@/components/leave/leave-file-picker");

const BASE = "https://uploader.example.test/prod";
const MIB = 1024 * 1024;

const PDF = {
  contentType: "application/pdf",
  label: "PDF",
  extensions: [".pdf"],
};
const PNG = { contentType: "image/png", label: "PNG", extensions: [".png"] };
const JPEG = {
  contentType: "image/jpeg",
  label: "JPEG",
  extensions: [".jpg", ".jpeg"],
};
const HEIC = {
  contentType: "image/heic",
  label: "HEIC",
  extensions: [".heic"],
};
const WORD = {
  contentType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  label: "Word",
  extensions: [".docx"],
};

const limits = (over: Partial<LeaveFileLimits> = {}): LeaveFileLimits => ({
  maxFiles: 5,
  maxBytes: 5 * MIB,
  storage: false,
  links: true,
  types: [PDF, PNG, JPEG, HEIC, WORD],
  ...over,
});

const file = (name: string, type: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  mocks.request.mockReset();
  mocks.putToStorage.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      responseObj: { pdf_url: "https://files.example.test/a.pdf" },
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which route a file takes", () => {
  it("is the server's own storage whenever it has any, even with links and an uploader configured", () => {
    const route = fileRoute(limits({ storage: true, links: true }));
    expect(route.kind).toBe("stored");
    /* Untouched: every kind and size the API said. */
    expect(route.limits).toEqual(limits({ storage: true, links: true }));
  });

  it("is a link only where the server takes links and this build knows where the uploader is", () => {
    expect(fileRoute(limits()).kind).toBe("linked");
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    expect(fileRoute(limits()).kind).toBe("none");
  });

  it("is nothing where the server takes neither, or says nothing about links", () => {
    expect(fileRoute(limits({ links: false })).kind).toBe("none");
    const { links: _links, ...noLinks } = limits();
    void _links;
    expect(fileRoute(noLinks).kind).toBe("none");
  });

  it("is nothing while the limits are not known", () => {
    expect(fileRoute(null)).toEqual({ kind: "none", limits: null });
  });

  it("is nothing where the server takes links but none of the kinds the uploader sends", () => {
    expect(fileRoute(limits({ types: [HEIC, WORD] })).kind).toBe("none");
  });

  it("offers the uploader's own three kinds where the server lists none, which is saying nothing about them", () => {
    const route = fileRoute(limits({ types: [] }));
    expect(route.kind).toBe("linked");
    expect(route.limits?.types.map((type) => type.label)).toEqual([
      "PDF",
      "JPEG",
      "PNG",
    ]);
    expect(route.limits?.types[0]?.extensions).toEqual([".pdf"]);
    expect(
      fileRefusal(file("a.pdf", "application/pdf"), route.limits),
    ).toBeNull();
    expect(filesAvailable(limits({ types: [] }))).toBe(true);
  });

  it("narrows to the three kinds the uploader takes, each with the smaller limit", () => {
    const route = fileRoute(limits());
    expect(route.limits?.types.map((type) => type.label)).toEqual([
      "PDF",
      "JPEG",
      "PNG",
    ]);
    const byLabel = Object.fromEntries(
      (route.limits?.types ?? []).map((type) => [type.label, type.maxBytes]),
    );
    expect(byLabel).toEqual({ PDF: 2 * MIB, JPEG: 3 * MIB, PNG: 3 * MIB });
  });

  it("never offers a size above the API's own, whatever the uploader would take", () => {
    const route = fileRoute(limits({ maxBytes: MIB }));
    for (const type of route.limits?.types ?? []) {
      expect(type.maxBytes).toBe(MIB);
    }
  });

  it("says whether a file can be attached at all, and null when it is not known", () => {
    expect(filesAvailable(null)).toBeNull();
    expect(filesAvailable(limits({ storage: true }))).toBe(true);
    expect(filesAvailable(limits())).toBe(true);
    expect(filesAvailable(limits({ links: false }))).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    expect(filesAvailable(limits())).toBe(false);
  });
});

describe("what the picker may promise", () => {
  const linked = () => fileRoute(limits()).limits!;

  it("says each limit against the kinds it applies to, smallest first", () => {
    expect(fileHint(linked())).toBe(
      "PDF up to 2 MB, JPEG and PNG up to 3 MB, up to 5 files.",
    );
  });

  it("says one size, as it always did, when every kind shares it", () => {
    expect(fileHint(limits({ storage: true }))).toBe(
      "PDF, PNG, JPEG, HEIC and Word, up to 5 files of 5 MB each.",
    );
    expect(fileHint(fileRoute(limits({ maxBytes: MIB })).limits!)).toBe(
      "PDF, JPEG and PNG, up to 5 files of 1 MB each.",
    );
  });

  it("refuses a document over 2 MB and accepts an image of the same size", () => {
    expect(
      fileRefusal(file("a.pdf", "application/pdf", 2 * MIB + 1), linked()),
    ).toBe("That file is 2.0 MB. Keep files under 2 MB.");
    expect(
      fileRefusal(file("a.png", "image/png", 2 * MIB + 1), linked()),
    ).toBeNull();
    expect(fileRefusal(file("a.png", "image/png", 3 * MIB + 1), linked())).toBe(
      "That file is 3.0 MB. Keep files under 3 MB.",
    );
  });

  it("refuses a kind the uploader does not take, naming the three that it does", () => {
    expect(fileRefusal(file("a.heic", ""), linked())).toBe(
      "That kind of file cannot be attached. You can attach PDF, JPEG and PNG.",
    );
    expect(fileRefusal(file("a.docx", WORD.contentType), linked())).toMatch(
      /You can attach PDF, JPEG and PNG\.$/,
    );
  });

  it("still checks a stored file against the API's one limit and its own kinds", () => {
    const stored = limits({ storage: true });
    expect(
      fileRefusal(file("a.pdf", "application/pdf", 5 * MIB + 1), stored),
    ).toBe("That file is 5.0 MB. Keep files under 5 MB.");
    expect(fileRefusal(file("a.heic", ""), stored)).toBeNull();
  });
});

describe("uploading to a request", () => {
  it("sends a stored file down the API's own route, exactly as it always did", async () => {
    mocks.request.mockResolvedValue({
      storageKey: "org/leave/emp/k.pdf",
      url: "https://storage.example/put",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: "2026-11-06T10:10:00Z",
    });
    const ref = await uploadLeaveFile(
      file("a.pdf", "application/pdf"),
      limits({ storage: true }),
      { employeeId: "emp-1" },
    );
    expect(ref).toEqual({
      storageKey: "org/leave/emp/k.pdf",
      filename: "a.pdf",
      contentType: "application/pdf",
    });
    expect(mocks.putToStorage).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends a stored file down the API's route even when the server also takes links", async () => {
    mocks.request.mockResolvedValue({
      storageKey: "k",
      url: "https://storage.example/put",
      headers: {},
      expiresAt: "x",
    });
    await uploadLeaveFile(
      file("a.pdf", "application/pdf"),
      limits({ storage: true, links: true }),
    );
    expect(mocks.putToStorage).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends a file to the uploader and answers with its address, asking the API for nothing", async () => {
    const ref = await uploadLeaveFile(
      file("a.pdf", "application/pdf"),
      limits(),
      {
        employeeId: "emp-1",
      },
    );
    expect(ref).toEqual({
      fileUrl: "https://files.example.test/a.pdf",
      filename: "a.pdf",
      contentType: "application/pdf",
    });
    expect(String(mocks.fetch.mock.calls[0]![0]).startsWith(`${BASE}/`)).toBe(
      true,
    );
    /* No upload link was asked for and no bytes went to storage. */
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.putToStorage).not.toHaveBeenCalled();
  });

  it("is held to the API's limit as well as the uploader's", async () => {
    const failure = await uploadLeaveFile(
      file("a.png", "image/png", 2 * MIB),
      limits({ maxBytes: MIB }),
    ).catch((caught: unknown) => caught);
    expect((failure as Error).message).toBe(
      "That file is 2 MB. Keep files under 1 MB.",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends nothing, anywhere, where there is no route", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    await expect(
      uploadLeaveFile(file("a.pdf", "application/pdf"), limits()),
    ).rejects.toThrow("Files cannot be attached on this server yet.");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.putToStorage).not.toHaveBeenCalled();
  });

  it("says the connection, and never the file, when the uploader does not answer", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const failure = await uploadLeaveFile(
      file("private.pdf", "application/pdf"),
      limits(),
    ).catch((caught: unknown) => caught);
    expect(fileProblem(failure)).toBe(
      "The upload did not finish. Check your connection and try again.",
    );
    expect(fileProblem(failure)).not.toMatch(/private/);
  });
});

describe("telling the leave API about a file", () => {
  const wireRequest = {
    id: "r1",
    employeeId: "e1",
    employeeName: "Ada Okafor",
    employeeJobTitle: null,
    leaveTypeId: "t1",
    leaveType: "Sick",
    startDate: "2026-11-02",
    endDate: "2026-11-04",
    days: 3,
    reason: "Flu",
    status: "PENDING",
    approverId: null,
    approverName: null,
    requestedAt: "2026-11-01T09:00:00Z",
    decidedAt: null,
    decidedById: null,
    decidedByName: null,
    decidedByJobTitle: null,
    decisionNote: null,
  };

  it("puts an address on a new request where it used to put a key", async () => {
    mocks.request.mockResolvedValue({ request: wireRequest, warnings: [] });
    await leaveApi.create({
      employeeId: "e1",
      leaveTypeId: "t1",
      from: "2026-11-02",
      to: "2026-11-04",
      attachments: [
        {
          fileUrl: "https://files.example.test/a.pdf",
          filename: "a.pdf",
          contentType: "application/pdf",
        },
      ],
    });
    const body = mocks.request.mock.calls[0]![1].body as {
      attachments: Record<string, string>[];
    };
    expect(body.attachments).toEqual([
      {
        fileUrl: "https://files.example.test/a.pdf",
        filename: "a.pdf",
        contentType: "application/pdf",
      },
    ]);
    /* Exactly one of the two: never both. */
    expect(body.attachments[0]).not.toHaveProperty("storageKey");
  });

  it("records an address on an open request through the same route as a key", async () => {
    mocks.request.mockResolvedValue({});
    const ref = {
      fileUrl: "https://files.example.test/a.pdf",
      filename: "a.pdf",
      contentType: "application/pdf",
    };
    await leaveFilesApi.record("req-1", ref);
    expect(mocks.request).toHaveBeenCalledWith(
      "/leave/requests/req-1/attachments",
      { method: "POST", body: ref },
    );
  });

  it("has a plain sentence for a link the server would not take, and uses its own where it wrote one", () => {
    expect(fileProblem(new ApiError(422, "attachment_link_refused", ""))).toBe(
      "That file's address was not accepted. Try attaching it again.",
    );
    expect(
      fileProblem(
        new ApiError(
          422,
          "attachment_link_refused",
          "That address is not on the list of places files may be linked from.",
        ),
      ),
    ).toBe(
      "That address is not on the list of places files may be linked from.",
    );
  });

  it("reads whether the server takes links, and treats a server that says nothing as one that does not", async () => {
    mocks.request.mockResolvedValue(limits());
    expect((await leaveFilesApi.limits()).links).toBe(true);
    mocks.request.mockResolvedValue({ ...limits(), links: undefined });
    expect(fileRoute(await leaveFilesApi.limits()).kind).toBe("none");
  });
});

describe("opening a linked file", () => {
  let tab: {
    location: { href: string };
    close: ReturnType<typeof vi.fn>;
    opener: unknown;
  };
  const assign = vi.fn();
  const opened = (mode: "view" | "download") => ({
    url: "https://files.example.test/a.pdf",
    /* A link to a file kept elsewhere does not expire. */
    expiresAt: null,
    filename: "a.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    mode,
  });

  beforeEach(() => {
    tab = { location: { href: "" }, close: vi.fn(), opener: "page" };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  it("goes to the file's own address in the tab that was opened for it", async () => {
    mocks.request.mockResolvedValue(opened("view"));
    expect(await openLeaveFile("req-1", { id: "f-1", viewable: true })).toBe(
      "opened",
    );
    expect(tab.location.href).toBe("https://files.example.test/a.pdf");
    expect(tab.opener).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("never sends this window to it, which would replace the page, even if the API says download", async () => {
    mocks.request.mockResolvedValue(opened("download"));
    await openLeaveFile("req-1", { id: "f-1", viewable: true });
    expect(tab.location.href).toBe("https://files.example.test/a.pdf");
    expect(tab.close).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("still sends a stored file that the API says is a download to this window", async () => {
    mocks.request.mockResolvedValue({
      ...opened("download"),
      url: "https://storage.example/get?sig=secret",
      expiresAt: "2026-11-06T10:05:00Z",
    });
    await openLeaveFile("req-1", { id: "f-1", viewable: true });
    expect(tab.close).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "https://storage.example/get?sig=secret",
    );
  });
});
