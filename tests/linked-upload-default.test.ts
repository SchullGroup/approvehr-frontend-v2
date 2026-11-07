import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINKED_UPLOAD_DEFAULT,
  linkedUploadConfigured,
  uploadLinkedFile,
} from "@/lib/api/linked-upload";

/**
 * A leave request carries a file by the old platform's uploader with nothing set.
 *
 * The instruction was to upload the way `s3.service.ts` does, which has the address
 * built in. The path used to be off until a deployment supplied it, and no
 * deployment ever did, so no attachment area was ever shown. Unset is now that
 * uploader; blank or `off` switches it off.
 *
 * **Nothing here reaches the real uploader.** `fetch` is a mock in every test that
 * uploads, so what is asserted is the address a request would have been made to.
 */

type Headers = { headers: { key: string; value: string }[] }[];

async function connectSrc(): Promise<string> {
  vi.resetModules();
  const config = (await import("../next.config")).default as {
    headers: () => Promise<Headers>;
  };
  const all = await config.headers();
  const policy = all[0]!.headers.find(
    (h) => h.key === "Content-Security-Policy",
  )!.value;
  return policy.split("; ").find((d) => d.startsWith("connect-src")) ?? "";
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      responseObj: {
        pdf_url: "https://files.example.test/approvehr-leave/a.pdf",
      },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const unset = () => {
  vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", undefined as unknown as string);
  delete process.env["NEXT_PUBLIC_LINKED_UPLOAD_URL"];
};

describe("the test suite", () => {
  it("starts with the uploader switched off, so no leave test can reach the network", () => {
    /* `tests/setup.ts` pins the variable blank. Without it, every test that renders
       a leave form would see a picker and, pressing Send, try the real address. */
    expect(process.env["NEXT_PUBLIC_LINKED_UPLOAD_URL"]).toBe("");
    expect(linkedUploadConfigured()).toBe(false);
  });
});

describe("the default uploader", () => {
  it("is the address s3.service.ts in the platform frontend has built in", () => {
    expect(LINKED_UPLOAD_DEFAULT).toBe(
      "https://qerhd0lxje.execute-api.us-east-1.amazonaws.com/prod",
    );
  });

  it("is what an upload is made to when nothing is set (the request is mocked)", async () => {
    unset();
    expect(linkedUploadConfigured()).toBe(true);
    await uploadLinkedFile(
      new File([new Uint8Array(3)], "a.pdf", { type: "application/pdf" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      new RegExp(
        `^${LINKED_UPLOAD_DEFAULT.replace(/[.]/g, "\\.")}/upload-file\\?`,
      ),
    );
  });

  it("is overridden by an address that is set", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    await uploadLinkedFile(
      new File([new Uint8Array(3)], "a.pdf", { type: "application/pdf" }),
    );
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      /^https:\/\/uploader\.example\.test\/prod\//,
    );
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("execute-api");
  });

  it("is switched off by blank and by `off`, and then nothing is sent", async () => {
    for (const value of ["", "  ", "off"]) {
      vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", value);
      expect(linkedUploadConfigured(), JSON.stringify(value)).toBe(false);
      await expect(
        uploadLinkedFile(
          new File([new Uint8Array(3)], "a.pdf", { type: "application/pdf" }),
        ),
      ).rejects.toBeTruthy();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the policy follows the same default", () => {
  it("names the default origin in connect-src, as an origin and nothing wider, when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    unset();
    const connect = await connectSrc();
    expect(connect).toBe(
      `connect-src 'self' https://api.example.test ${new URL(LINKED_UPLOAD_DEFAULT).origin}`,
    );
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("/prod");
  });

  it("does not name it when switched off, which leaves the policy as it was", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    for (const value of ["", "off"]) {
      vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", value);
      expect(await connectSrc(), JSON.stringify(value)).toBe(
        "connect-src 'self' https://api.example.test",
      );
    }
  });

  it("names the one that is set instead of the default", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const connect = await connectSrc();
    expect(connect).toContain("https://uploader.example.test");
    expect(connect).not.toContain("execute-api");
  });

  it("holds the same default string as the module, which next.config.ts cannot import", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain(`"${LINKED_UPLOAD_DEFAULT}"`);
    expect(config.match(/execute-api/g)).toHaveLength(1);
  });
});
