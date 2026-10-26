import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_MAX_BYTES,
  acceptAttribute,
  formatBytes,
  limitsLine,
  mediaTypeOf,
  refuseFile,
} from "@/lib/marketing/apply-files";

/**
 * Getting a file from a phone into storage: the rules about which files, and the
 * two-step flow (an address from the API, then the file straight to storage).
 * `fetch` and `XMLHttpRequest` are the only fakes; the XHR fake records exactly
 * what the browser would have sent, because the signed address is only good for
 * that and nothing else.
 */

const API = "https://api.example.test/api/v1";

type Sent = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};
let puts: Sent[] = [];
let xhrScript: (xhr: FakeXhr) => void = (xhr) => xhr.finish(200);

class FakeXhr {
  status = 0;
  timeout = 0;
  upload: { onprogress: ((event: unknown) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private sent: Sent = { method: "", url: "", headers: {}, body: null };
  aborted = false;

  open(method: string, url: string) {
    this.sent.method = method;
    this.sent.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.sent.headers[name] = value;
  }
  send(body: unknown) {
    this.sent.body = body;
    puts.push(this.sent);
    queueMicrotask(() => xhrScript(this));
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
  timeoutNow() {
    this.ontimeout?.();
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const issued = () =>
  json(200, {
    data: {
      key: "org/cvs/post/abc.pdf",
      url: "https://bucket.example.test/org/cvs/post/abc.pdf?X-Amz-Signature=sig",
      expiresAt: "2026-10-15T13:00:00.000Z",
      maxBytes: UPLOAD_MAX_BYTES,
    },
  });

const pdf = (name = "CV.pdf", size = 2048) => {
  const file = new File(["x".repeat(8)], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

async function upload() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  return (await import("@/lib/marketing/apply-upload")).uploadFile;
}

beforeEach(() => {
  puts = [];
  xhrScript = (xhr) => xhr.finish(200);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("which files an application takes", () => {
  it("says what and how big, in words, before anything is chosen", () => {
    expect(limitsLine("document")).toBe("PDF, Word or a photo. Up to 25 MB.");
    expect(limitsLine("any")).toBe("PDF, Word, Excel or a photo. Up to 25 MB.");
  });

  it("opens the right picker on a phone: no spreadsheets for a CV, all of them for a work sample", () => {
    expect(acceptAttribute("document")).toContain(".pdf");
    expect(acceptAttribute("document")).toContain(".heic");
    expect(acceptAttribute("document")).not.toContain(".xlsx");
    expect(acceptAttribute("any")).toContain(".xlsx");
  });

  it("writes a size in the units a person uses", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12 MB");
  });

  it("knows a .docx or .heic whose browser left the type blank", () => {
    expect(mediaTypeOf({ name: "cv.docx", type: "" })).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mediaTypeOf({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(mediaTypeOf({ name: "cv.pdf", type: "application/pdf" })).toBe(
      "application/pdf",
    );
    expect(mediaTypeOf({ name: "notes.txt", type: "text/plain" })).toBe(
      "text/plain",
    );
  });

  it("refuses an empty file, a too-big file and the wrong kind, each in a sentence", () => {
    expect(
      refuseFile(
        { name: "a.pdf", type: "application/pdf", size: 0 },
        "document",
      ),
    ).toMatch(/empty/);
    expect(
      refuseFile(
        { name: "a.pdf", type: "application/pdf", size: UPLOAD_MAX_BYTES + 1 },
        "document",
      ),
    ).toMatch(/The limit is 25 MB/);
    expect(
      refuseFile(
        { name: "run.exe", type: "application/x-msdownload", size: 10 },
        "any",
      ),
    ).toMatch(/only\./);
    expect(
      refuseFile({ name: "sheet.xlsx", type: "", size: 10 }, "document"),
    ).toMatch(/PDF, Word or a photo only/);
    expect(
      refuseFile({ name: "sheet.xlsx", type: "", size: 10 }, "any"),
    ).toBeNull();
    expect(
      refuseFile(
        { name: "cv.pdf", type: "application/pdf", size: 10 },
        "document",
      ),
    ).toBeNull();
  });
});

describe("the two-step upload", () => {
  it("asks for an address naming the file, then puts exactly that type straight to storage", async () => {
    fetchMock.mockResolvedValueOnce(issued());
    const uploadFile = await upload();
    const progress: number[] = [];
    xhrScript = (xhr) => {
      xhr.progress(1024, 2048);
      xhr.progress(2048, 2048);
      xhr.finish(200);
    };

    const outcome = await uploadFile({
      org: "acme",
      roleSlug: "payroll",
      file: pdf("My CV.pdf", 2048),
      profile: "document",
      onProgress: (fraction) => progress.push(fraction),
    });

    expect(outcome).toEqual({
      ok: true,
      file: { key: "org/cvs/post/abc.pdf", name: "My CV.pdf", sizeBytes: 2048 },
    });
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe(`${API}/careers/public/acme/payroll/upload-url`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      filename: "My CV.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });

    expect(puts).toHaveLength(1);
    expect(puts[0]?.method).toBe("PUT");
    expect(puts[0]?.url).toContain("https://bucket.example.test/");
    /* Nothing else: the address is signed for this header and no other. */
    expect(puts[0]?.headers).toEqual({ "Content-Type": "application/pdf" });
    expect(progress).toEqual([0.5, 1, 1]);
  });

  it("sends a guessed type when the browser gave none, because the address is signed for it", async () => {
    fetchMock.mockResolvedValueOnce(issued());
    const uploadFile = await upload();
    const file = new File(["x"], "cv.docx", { type: "" });
    await uploadFile({ org: "a", roleSlug: "b", file, profile: "document" });
    expect(
      JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body)
        .contentType,
    ).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(puts[0]?.headers["Content-Type"]).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("never asks the API about a file it would refuse", async () => {
    const uploadFile = await upload();
    const outcome = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf("huge.pdf", UPLOAD_MAX_BYTES + 5),
      profile: "document",
    });
    expect(outcome).toMatchObject({ ok: false, retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it("says the API's own sentence for a refusal, and does not offer to try again", async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {
        error: {
          code: "unprocessable",
          message: "This employer cannot take file attachments yet.",
        },
      }),
    );
    const uploadFile = await upload();
    expect(
      await uploadFile({
        org: "a",
        roleSlug: "b",
        file: pdf(),
        profile: "document",
      }),
    ).toEqual({
      ok: false,
      message: "This employer cannot take file attachments yet.",
      retryable: false,
    });
    expect(puts).toHaveLength(0);
  });

  it("says how long to wait on a 429, from the body when the header is unreadable", async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { error: { code: "rate_limited", retryAfterSeconds: 600 } }),
    );
    const uploadFile = await upload();
    const outcome = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect(outcome).toMatchObject({ ok: false, retryable: true });
    expect((outcome as { message: string }).message).toContain(
      "about 10 minutes",
    );
  });

  it("calls a server fault ours and offers another try", async () => {
    fetchMock.mockResolvedValueOnce(
      json(503, { error: { code: "storage_unavailable" } }),
    );
    const uploadFile = await upload();
    expect(
      await uploadFile({
        org: "a",
        roleSlug: "b",
        file: pdf(),
        profile: "document",
      }),
    ).toMatchObject({ ok: false, retryable: true });
  });

  it("says the connection dropped when the address could not even be asked for", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uploadFile = await upload();
    const outcome = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect(outcome).toMatchObject({ ok: false, retryable: true });
    expect((outcome as { message: string }).message).toMatch(
      /connection dropped/,
    );
  });

  it("treats a storage refusal as an address that ran out, and a dropped connection as a drop", async () => {
    const uploadFile = await upload();

    fetchMock.mockResolvedValueOnce(issued());
    xhrScript = (xhr) => xhr.finish(403);
    const expired = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect(expired).toMatchObject({ ok: false, retryable: true });
    expect((expired as { message: string }).message).toMatch(/ran out/);

    fetchMock.mockResolvedValueOnce(issued());
    xhrScript = (xhr) => xhr.fail();
    const dropped = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect((dropped as { message: string }).message).toMatch(
      /connection dropped/,
    );

    fetchMock.mockResolvedValueOnce(issued());
    xhrScript = (xhr) => xhr.timeoutNow();
    const slow = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect(slow).toMatchObject({ ok: false, retryable: true });

    fetchMock.mockResolvedValueOnce(issued());
    xhrScript = (xhr) => xhr.finish(500);
    const broken = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
    });
    expect((broken as { message: string }).message).toMatch(/did not accept/);
  });

  it("can be cancelled while the file is going up, and says so without calling it a failure", async () => {
    fetchMock.mockResolvedValueOnce(issued());
    const uploadFile = await upload();
    const controller = new AbortController();
    xhrScript = () => controller.abort();
    const outcome = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
      signal: controller.signal,
    });
    expect(outcome).toMatchObject({ ok: false, cancelled: true });
  });

  it("can be cancelled before the address has arrived", async () => {
    const uploadFile = await upload();
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    const outcome = await uploadFile({
      org: "a",
      roleSlug: "b",
      file: pdf(),
      profile: "document",
      signal: controller.signal,
    });
    expect(outcome).toMatchObject({ ok: false, cancelled: true });
    expect(puts).toHaveLength(0);
  });
});
