import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A leave file can go from the browser to the old platform's uploader, and the
 * Content-Security-Policy decides whether the browser will send it. Its origin is
 * named **only** when the deployment says where it is, and never as a wildcard:
 * a build that does not use this path keeps exactly the policy it had.
 */

type Headers = { headers: { key: string; value: string }[] }[];

async function csp(): Promise<string> {
  vi.resetModules();
  const config = (await import("../next.config")).default as {
    headers: () => Promise<Headers>;
  };
  const all = await config.headers();
  return all[0]!.headers.find((h) => h.key === "Content-Security-Policy")!
    .value;
}

const directive = async (name: string): Promise<string> =>
  (await csp()).split("; ").find((d) => d.startsWith(name)) ?? "";

afterEach(() => vi.unstubAllEnvs());

describe("the uploader's origin in connect-src", () => {
  it("is absent when no uploader is configured, which leaves the policy as it was", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    expect(await directive("connect-src")).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it("is named, as an origin and nothing wider, when one is", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod/",
    );
    const connect = await directive("connect-src");
    expect(connect).toBe(
      "connect-src 'self' https://api.example.test https://uploader.example.test",
    );
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("/prod");
  });

  it("is in connect-src alone: a file is sent there, never shown from there", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const policy = await csp();
    const elsewhere = policy
      .split("; ")
      .filter((d) => !d.startsWith("connect-src"))
      .join("; ");
    expect(elsewhere).not.toContain("uploader.example.test");
  });

  it("sits beside the storage and error-report origins without displacing them", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv(
      "NEXT_PUBLIC_ERROR_REPORT_URL",
      "https://errors.example.test/in",
    );
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "https://bucket.example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const connect = await directive("connect-src");
    for (const origin of [
      "https://api.example.test",
      "https://errors.example.test",
      "https://bucket.example.test",
      "https://uploader.example.test",
    ]) {
      expect(connect).toContain(origin);
    }
  });

  it("is not named twice when it is already there", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "https://uploader.example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const connect = await directive("connect-src");
    expect(connect.split("https://uploader.example.test")).toHaveLength(2);
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://api.example.test/prod",
    );
    expect(
      (await directive("connect-src")).split("https://api.example.test"),
    ).toHaveLength(2);
  });

  it("drops anything that is not https, and a malformed value, rather than trusting it", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [
      "http://insecure.example.test/prod",
      "http://localhost:9100",
      "not a url",
      "ftp://uploader.example.test",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", value);
      expect(await directive("connect-src"), value).toBe(
        "connect-src 'self' https://api.example.test",
      );
    }
  });

  it("admits a local stand-in in a development build only", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "http://localhost:9100");
    vi.stubEnv("NODE_ENV", "development");
    expect(await directive("connect-src")).toContain("http://localhost:9100");
    vi.stubEnv("NODE_ENV", "production");
    expect(await directive("connect-src")).not.toContain("localhost");
  });

  it("does not change the rest of the policy", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    const without = (await csp())
      .split("; ")
      .filter((d) => !d.startsWith("connect-src"));
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    const withIt = (await csp())
      .split("; ")
      .filter((d) => !d.startsWith("connect-src"));
    expect(withIt).toEqual(without);
  });
});
