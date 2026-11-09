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
  uniqueFileName,
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

/** What `getRandomValues` is made to give, so a test can name the address it expects. */
const TOKEN = "ab".repeat(16);
const pinToken = () =>
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((
    array: ArrayBufferView,
  ) => {
    (array as Uint8Array).fill(0xab);
    return array;
  }) as typeof globalThis.crypto.getRandomValues);

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
    pinToken();
    const result = await uploadLinkedFile(
      file("My Medical Cert (1).pdf", "application/pdf"),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${BASE}/upload-file?fileName=My_Medical_Cert_1_-${TOKEN}.pdf&projectFolder=${LINKED_FOLDER}`,
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
    ["scan.jpg", "image/jpeg", "jpeg", `scan-${TOKEN}.jpg`],
    ["scan.png", "image/png", "png", `scan-${TOKEN}.png`],
  ])(
    "%s goes to upload-image with its format, and the address is read from uploadResult.Location",
    async (name, type, format, sent) => {
      pinToken();
      fetchMock.mockResolvedValue(image());
      const result = await uploadLinkedFile(file(name, type));
      expect(fetchMock.mock.calls[0]![0]).toBe(
        `${BASE}/upload-image?fileName=${sent}&projectFolder=approvehr-leave&fileFormat=${format}`,
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
    pinToken();
    fetchMock.mockResolvedValue(image());
    const result = await uploadLinkedFile(file("scan.jpg", ""));
    expect(result.contentType).toBe("image/jpeg");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      `/upload-image?fileName=scan-${TOKEN}.jpg&projectFolder=approvehr-leave&fileFormat=jpeg`,
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

describe("a name is never reused", () => {
  /** The `fileName` the uploader was last asked to store. */
  const sentName = (call = 0): string =>
    new URL(String(fetchMock.mock.calls[call]![0])).searchParams.get(
      "fileName",
    ) ?? "";

  it("puts a token between the cleaned name and its extension", () => {
    expect(uniqueFileName("My Medical Cert (1).pdf", "t0k")).toBe(
      "My_Medical_Cert_1_-t0k.pdf",
    );
    expect(uniqueFileName("scan.jpg", "t0k")).toBe("scan-t0k.jpg");
  });

  it("copes with no extension, and with nothing before the extension", () => {
    expect(uniqueFileName("no extension", "t0k")).toBe("no_extension-t0k");
    expect(uniqueFileName(".pdf", "t0k")).toBe("file-t0k.pdf");
    expect(uniqueFileName("", "t0k")).toBe("file-t0k");
  });

  it("keeps the last extension only, as the cleaning does", () => {
    expect(uniqueFileName("report.final.pdf", "t0k")).toBe(
      "report_final-t0k.pdf",
    );
  });

  it("shortens a long name so the address stays under what the leave API takes", () => {
    const name = uniqueFileName(`${"a".repeat(255)}.pdf`, "b".repeat(32));
    expect(name).toBe(`${"a".repeat(100)}-${"b".repeat(32)}.pdf`);
    const address = `https://generic-file-uploader-bucket.s3.amazonaws.com/${LINKED_FOLDER}/${name}`;
    expect(address.length).toBeLessThan(500);
  });

  it("sends the same file twice under two different names", async () => {
    await uploadLinkedFile(file("medical_certificate.pdf", "application/pdf"));
    await uploadLinkedFile(file("medical_certificate.pdf", "application/pdf"));
    expect(sentName(0)).not.toBe(sentName(1));
    expect(sentName(0)).toMatch(/^medical_certificate-[0-9a-f]{32}\.pdf$/);
    expect(sentName(1)).toMatch(/^medical_certificate-[0-9a-f]{32}\.pdf$/);
  });

  it("does the same for an image", async () => {
    fetchMock.mockResolvedValue(image());
    await uploadLinkedFile(file("scan.png", "image/png"));
    await uploadLinkedFile(file("scan.png", "image/png"));
    expect(sentName(0)).not.toBe(sentName(1));
    expect(sentName(0)).toMatch(/^scan-[0-9a-f]{32}\.png$/);
  });

  it("draws the token from the browser's random source, 16 bytes of it, and never from Math.random", async () => {
    const random = vi.spyOn(Math, "random");
    const source = pinToken();
    await uploadLinkedFile(file("a.pdf", "application/pdf"));
    expect(source).toHaveBeenCalledTimes(1);
    expect(source.mock.calls[0]![0]).toBeInstanceOf(Uint8Array);
    expect((source.mock.calls[0]![0] as Uint8Array).length).toBe(16);
    expect(random).not.toHaveBeenCalled();
  });

  it("has nothing in the name that the address would have to encode", async () => {
    await uploadLinkedFile(
      file("Dr Ade's note (final).pdf", "application/pdf"),
    );
    expect(sentName()).toMatch(/^[A-Za-z0-9_-]+\.pdf$/);
  });

  it("still hands back the name the person chose, not the one it was stored under", async () => {
    const result = await uploadLinkedFile(
      file("My Medical Cert (1).pdf", "application/pdf"),
    );
    expect(result.filename).toBe("My Medical Cert (1).pdf");
    expect(sentName()).not.toBe(result.filename);
  });

  it("sends nothing when the browser has no random source, rather than a name that can be guessed", async () => {
    vi.stubGlobal("crypto", undefined);
    const failure = await uploadLinkedFile(
      file("a.pdf", "application/pdf"),
    ).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(LinkedUploadRefused);
    expect((failure as Error).message).toBe(
      "This browser cannot send files safely, so the file was not sent.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not put the person's file name in that sentence", async () => {
    vi.stubGlobal("crypto", undefined);
    const failure = (await uploadLinkedFile(
      file("private-name.pdf", "application/pdf"),
    ).catch((caught: unknown) => caught)) as Error;
    expect(failure.message).not.toMatch(/private-name/);
  });
});

describe("the sentence beside the picker", () => {
  it("says the one thing that matters about a public file", () => {
    expect(LINKED_FILES_NOTE).toBe(
      "For now these files are kept where anyone with their address can open them. Do not attach anything you would not want shared.",
    );
  });
});
