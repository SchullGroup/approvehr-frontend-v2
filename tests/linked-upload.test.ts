import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINKED_FILES_NOTE,
  LINKED_FOLDER,
  LINKED_UPLOAD_DEFAULT,
  LINKED_UPLOAD_INTERRUPTED,
  LINKED_UPLOAD_NOT_STORED,
  LinkedUploadRefused,
  linkedKindOf,
  linkedRefusal,
  linkedUploadConfigured,
  sanitizeFileName,
  uploadLinkedFile,
} from "@/lib/api/linked-upload";

/**
 * The port of the old platform's uploader.
 *
 * **Nothing here sends a request anywhere.** `fetch` is replaced in every test,
 * and the address every upload goes to is a local, made-up one. The real
 * uploader is open and unauthenticated and makes what it is given public, so this
 * file asserts as hard that nothing reaches it as it asserts what is sent: no
 * request when the path is switched off, the default being the one address the
 * source names, no bearer token and no cookies on the wire.
 */

const BASE = "https://uploader.example.test/prod";
const MIB = 1024 * 1024;

const fetchMock = vi.fn();

const file = (
  name: string,
  type: string,
  bytes: number | Uint8Array<ArrayBuffer> = 3,
): File =>
  new File(
    [typeof bytes === "number" ? new Uint8Array(bytes).fill(7) : bytes],
    name,
    { type },
  );

const answer = (body: unknown, init: { ok?: boolean } = {}) => ({
  ok: init.ok ?? true,
  json: async () => body,
});

const document = (url = "https://files.example.test/approvehr-leave/a.pdf") =>
  answer({ responseObj: { pdf_url: url } });
const image = (url = "https://files.example.test/approvehr-leave/a.png") =>
  answer({ uploadResult: { Location: url } });

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(document());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("where the uploader is", () => {
  it("is off when the variable is blank, and then nothing is ever sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    expect(linkedUploadConfigured()).toBe(false);
    await expect(
      uploadLinkedFile(file("a.pdf", "application/pdf")),
    ).rejects.toBeInstanceOf(LinkedUploadRefused);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is the old platform's uploader when the variable is not set at all, which is not off", () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", undefined as unknown as string);
    delete process.env["NEXT_PUBLIC_LINKED_UPLOAD_URL"];
    expect(linkedUploadConfigured()).toBe(true);
  });

  it("is off for `off`, which is not an address", () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "off");
    expect(linkedUploadConfigured()).toBe(false);
  });

  it("is on for an https address", () => {
    expect(linkedUploadConfigured()).toBe(true);
  });

  it("refuses an address that is not https, and one that is not an address", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [
      "http://uploader.example.test/prod",
      "ftp://uploader.example.test",
      "not a url",
      "uploader.example.test/prod",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", value);
      expect(linkedUploadConfigured(), value).toBe(false);
    }
  });

  it("takes http for localhost outside production, and never in production", () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "http://localhost:9100");
    vi.stubEnv("NODE_ENV", "development");
    expect(linkedUploadConfigured()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "http://127.0.0.1:9100");
    expect(linkedUploadConfigured()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(linkedUploadConfigured()).toBe(false);
  });

  it("does not take http for a host that is not this machine, even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "http://uploader.example.test");
    expect(linkedUploadConfigured()).toBe(false);
  });

  it("puts the endpoint after the path, trailing slash or not", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", `${BASE}///`);
    await uploadLinkedFile(file("a.pdf", "application/pdf"));
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      /^https:\/\/uploader\.example\.test\/prod\/upload-file\?/,
    );
  });

  it("names the real address once, as the default, and nowhere else in its source", () => {
    const source = readFileSync("src/lib/api/linked-upload.ts", "utf8");
    expect(source.match(/execute-api/g)).toHaveLength(1);
    expect(source).toContain(LINKED_UPLOAD_DEFAULT);
  });
});

describe("a document", () => {
  it("goes to upload-file with the cleaned name and the folder, as the original", async () => {
    const result = await uploadLinkedFile(
      file("My Medical Cert (1).pdf", "application/pdf"),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${BASE}/upload-file?fileName=My_Medical_Cert_1_.pdf&projectFolder=${LINKED_FOLDER}`,
    );
    expect(LINKED_FOLDER).toBe("approvehr-leave");
    expect(init.method).toBe("POST");
    /* No fileFormat for a document: that parameter is the image route's. */
    expect(String(url)).not.toContain("fileFormat");
    expect(result).toEqual({
      fileUrl: "https://files.example.test/approvehr-leave/a.pdf",
      /* The name the person chose, not the cleaned one. */
      filename: "My Medical Cert (1).pdf",
      contentType: "application/pdf",
    });
  });

  it("sends the file as base64 in a JSON body of one field", async () => {
    await uploadLinkedFile(
      file("a.pdf", "application/pdf", new Uint8Array([1, 2, 3])),
    );
    const init = fetchMock.mock.calls[0]![1];
    expect(JSON.parse(init.body)).toEqual({ file: "AQID" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("reads the address from responseObj.pdf_url and from nowhere else", async () => {
    fetchMock.mockResolvedValue(
      answer({
        uploadResult: { Location: "https://files.example.test/image.png" },
      }),
    );
    await expect(
      uploadLinkedFile(file("a.pdf", "application/pdf")),
    ).rejects.toThrow(LINKED_UPLOAD_NOT_STORED);
  });
});

describe("an image", () => {
  it.each([
    ["scan.jpg", "image/jpeg", "jpeg"],
    ["scan.png", "image/png", "png"],
  ])(
    "%s goes to upload-image with its format, and the address is read from uploadResult.Location",
    async (name, type, format) => {
      fetchMock.mockResolvedValue(image());
      const result = await uploadLinkedFile(file(name, type));
      expect(fetchMock.mock.calls[0]![0]).toBe(
        `${BASE}/upload-image?fileName=${name}&projectFolder=approvehr-leave&fileFormat=${format}`,
      );
      expect(result).toEqual({
        fileUrl: "https://files.example.test/approvehr-leave/a.png",
        filename: name,
        contentType: type,
      });
    },
  );

  it("does not read pdf_url for an image", async () => {
    fetchMock.mockResolvedValue(document());
    await expect(
      uploadLinkedFile(file("scan.png", "image/png")),
    ).rejects.toThrow(LINKED_UPLOAD_NOT_STORED);
  });
});

describe("what leaves the browser", () => {
  it("carries no cookies and none of the app's headers, and a time limit", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await uploadLinkedFile(file("a.pdf", "application/pdf"));
    const init = fetchMock.mock.calls[0]![1];
    expect(init.credentials).toBe("omit");
    expect(Object.keys(init.headers)).toEqual(["Content-Type"]);
    expect(JSON.stringify(init)).not.toMatch(/authorization|bearer/i);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("only ever calls the configured address", async () => {
    await uploadLinkedFile(file("a.pdf", "application/pdf"));
    fetchMock.mockResolvedValue(image());
    await uploadLinkedFile(file("a.png", "image/png"));
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith(`${BASE}/`)).toBe(true);
      expect(String(url)).not.toMatch(/amazonaws/);
    }
  });
});

describe("what is refused before anything is sent", () => {
  const refused = async (f: File, apiMax?: number) => {
    const failure = await uploadLinkedFile(
      f,
      apiMax === undefined ? {} : { maxBytes: apiMax },
    ).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(LinkedUploadRefused);
    expect(fetchMock).not.toHaveBeenCalled();
    return (failure as Error).message;
  };

  it("an empty file", async () => {
    expect(await refused(file("a.pdf", "application/pdf", 0))).toBe(
      "That file is empty. Choose it again.",
    );
  });

  it.each([
    [
      "note.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["scan.heic", "image/heic"],
    ["scan.gif", "image/gif"],
    ["sheet.xlsx", "application/vnd.ms-excel"],
    ["note.txt", "text/plain"],
    ["scan.webp", "image/webp"],
  ])("%s, naming what can be sent", async (name, type) => {
    expect(await refused(file(name, type))).toBe(
      "That kind of file cannot be attached. You can attach PDF, JPEG and PNG.",
    );
  });

  it("a file whose type says one thing and whose name says another", async () => {
    expect(await refused(file("scan.png", "image/gif"))).toMatch(
      /cannot be attached/,
    );
  });

  it("a document over 2 MB, a image over 3 MB, each saying its own limit", async () => {
    expect(await refused(file("a.pdf", "application/pdf", 2 * MIB + 1))).toBe(
      "That file is 2.0 MB. Keep files under 2 MB.",
    );
    expect(await refused(file("a.png", "image/png", 3 * MIB + 1))).toBe(
      "That file is 3.0 MB. Keep files under 3 MB.",
    );
  });

  it("takes the smaller of its own limit and the API's, and says that one", async () => {
    expect(await refused(file("a.png", "image/png", 2 * MIB), MIB)).toBe(
      "That file is 2 MB. Keep files under 1 MB.",
    );
    /* A larger API limit does not raise the uploader's. */
    expect(
      await refused(file("a.pdf", "application/pdf", 2 * MIB + 1), 50 * MIB),
    ).toBe("That file is 2.0 MB. Keep files under 2 MB.");
  });

  it("carries no file name and no status code in any of it", async () => {
    const messages = [
      await refused(file("my-private-note.docx", "application/msword")),
      await refused(file("my-private-note.pdf", "application/pdf", 0)),
    ];
    for (const message of messages) {
      expect(message).not.toMatch(/my-private-note/);
      expect(message).not.toMatch(/\b[45]\d\d\b/);
    }
  });

  it("allows an image up to 3 MB, which a document may not be", async () => {
    fetchMock.mockResolvedValue(image());
    await uploadLinkedFile(file("a.png", "image/png", 3 * MIB));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("what kind a file is", () => {
  it("is taken from the browser's type when it names one", () => {
    expect(linkedKindOf(file("x", "application/pdf"))?.label).toBe("PDF");
    expect(linkedKindOf(file("x", "image/jpeg"))?.label).toBe("JPEG");
    expect(linkedKindOf(file("x", "image/png"))?.label).toBe("PNG");
  });

  it("falls back to the extension only when the browser said nothing useful", () => {
    expect(linkedKindOf(file("scan.JPG", ""))?.contentType).toBe("image/jpeg");
    expect(linkedKindOf(file("scan.jpeg", "image/jpg"))?.contentType).toBe(
      "image/jpeg",
    );
    expect(
      linkedKindOf(file("n.pdf", "application/octet-stream"))?.contentType,
    ).toBe("application/pdf");
    expect(linkedKindOf(file("scan.heic", ""))).toBeNull();
  });

  it("does not let an extension override a browser type that names something else", () => {
    expect(linkedKindOf(file("scan.png", "image/gif"))).toBeNull();
    expect(linkedKindOf(file("n.pdf", "text/plain"))).toBeNull();
  });

  it("sends a .jpg with no browser type as a JPEG to the image route", async () => {
    fetchMock.mockResolvedValue(image());
    const result = await uploadLinkedFile(file("scan.jpg", ""));
    expect(result.contentType).toBe("image/jpeg");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/upload-image?fileName=scan.jpg&projectFolder=approvehr-leave&fileFormat=jpeg",
    );
  });

  it("has the same refusal for the picker as for the upload", () => {
    expect(linkedRefusal(file("a.pdf", "application/pdf"))).toBeNull();
    expect(linkedRefusal(file("a.docx", "application/msword"))).toMatch(
      /PDF, JPEG and PNG/,
    );
  });
});

describe("when the upload does not work", () => {
  const plain = async (f = file("a.pdf", "application/pdf")) =>
    (await uploadLinkedFile(f).catch((caught: unknown) => caught)) as Error;

  it("says the connection, for a request that never got an answer", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const failure = await plain();
    expect(failure.message).toBe(LINKED_UPLOAD_INTERRUPTED);
    expect(failure).not.toBeInstanceOf(LinkedUploadRefused);
  });

  it("says the connection, for a timeout", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("signal timed out", "TimeoutError"),
    );
    expect((await plain()).message).toBe(LINKED_UPLOAD_INTERRUPTED);
  });

  it("says it could not be stored, for an answer that is not a success", async () => {
    fetchMock.mockResolvedValue(answer({}, { ok: false }));
    expect((await plain()).message).toBe(LINKED_UPLOAD_NOT_STORED);
  });

  it("says it could not be stored, for an answer that is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect((await plain()).message).toBe(LINKED_UPLOAD_NOT_STORED);
  });

  it.each([
    ["no address in it", answer({})],
    [
      "an address that is not a string",
      answer({ responseObj: { pdf_url: 7 } }),
    ],
    [
      "an address that is not https",
      document("http://files.example.test/a.pdf"),
    ],
    ["an address that is not an address", document("not a url")],
    [
      "an address over 500 characters",
      document(`https://files.example.test/${"a".repeat(480)}.pdf`),
    ],
    ["a body that is null", answer(null)],
  ])("says it could not be stored, for %s", async (_name, response) => {
    fetchMock.mockResolvedValue(response);
    expect((await plain()).message).toBe(LINKED_UPLOAD_NOT_STORED);
  });

  it("never carries a file's name, a status code, or the address in what it says", async () => {
    const messages: string[] = [];
    for (const response of [
      answer({}, { ok: false }),
      answer({}),
      document("http://files.example.test/private-name.pdf"),
    ]) {
      fetchMock.mockResolvedValue(response);
      messages.push(
        (await plain(file("private-name.pdf", "application/pdf"))).message,
      );
    }
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    messages.push(
      (await plain(file("private-name.pdf", "application/pdf"))).message,
    );
    for (const message of messages) {
      expect(message).not.toMatch(/private-name/);
      expect(message).not.toMatch(/\b[45]\d\d\b/);
      expect(message).not.toMatch(/https?:/);
    }
  });
});

describe("the name it cleans", () => {
  it("is the original's own example, character for character", () => {
    expect(sanitizeFileName("IFT 212 COMPUTER ORGANIZATION.pdf")).toBe(
      "IFT_212_COMPUTER_ORGANIZATION.pdf",
    );
  });

  it("leaves hyphens and underscores, collapses runs, keeps the extension", () => {
    expect(sanitizeFileName("a  b--c__d..e.pdf")).toBe("a_b--c_d_e.pdf");
    expect(sanitizeFileName("no extension")).toBe("no_extension");
  });
});

describe("the sentence beside the picker", () => {
  it("says the one thing that matters about a public file", () => {
    expect(LINKED_FILES_NOTE).toBe(
      "For now these files are kept where anyone with their address can open them. Do not attach anything you would not want shared.",
    );
  });
});
