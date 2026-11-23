import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkedUploadConfigured,
  uploadLinkedFile,
} from "@/lib/api/linked-upload";

/**
 * The old platform's public uploader is off unless an address is set.
 *
 * UAT 23 Nov (U5: HR-7, SELF-5, NC-10): it was on by default, so a medical
 * certificate on a leave request went to an uploader anybody with the address
 * can read, with a warning beside the picker. Unset, blank and `off` are all off
 * now, in the module and in the Content-Security-Policy.
 *
 * **Nothing here reaches a real uploader.** `fetch` is a mock in every test that
 * uploads.
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

describe("with nothing set", () => {
  it("is off, and nothing is sent", async () => {
    unset();
    expect(linkedUploadConfigured()).toBe(false);
    await expect(
      uploadLinkedFile(
        new File([new Uint8Array(3)], "a.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is on only for an address that is set", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    expect(linkedUploadConfigured()).toBe(true);
    await uploadLinkedFile(
      new File([new Uint8Array(3)], "a.pdf", { type: "application/pdf" }),
    );
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      /^https:\/\/uploader\.example\.test\/prod\//,
    );
  });

  it("is off for blank and `off`", async () => {
    for (const value of ["", "  ", "off"]) {
      vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", value);
      expect(linkedUploadConfigured(), JSON.stringify(value)).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the policy follows the same rule", () => {
  it("names no uploader when nothing is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    unset();
    expect(await connectSrc()).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it("names the one that is set, as an origin and nothing wider", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const connect = await connectSrc();
    expect(connect).toBe(
      "connect-src 'self' https://api.example.test https://uploader.example.test",
    );
  });

  it("no longer carries the old public address anywhere", () => {
    expect(readFileSync("next.config.ts", "utf8")).not.toContain("execute-api");
    expect(readFileSync("src/lib/api/linked-upload.ts", "utf8")).not.toContain(
      "execute-api",
    );
  });
});
