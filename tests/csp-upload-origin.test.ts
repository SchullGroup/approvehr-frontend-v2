import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A CV goes from the applicant's browser straight to the storage bucket, and the
 * Content-Security-Policy decides whether the browser will send it. The bucket's
 * origin is named only when the deployment says what it is, and never as a
 * wildcard over everybody's buckets.
 */

type Headers = { headers: { key: string; value: string }[] }[];

async function directive(name: string): Promise<string> {
  vi.resetModules();
  const config = (await import("../next.config")).default as {
    headers: () => Promise<Headers>;
  };
  const all = await config.headers();
  const csp = all[0]!.headers.find(
    (h) => h.key === "Content-Security-Policy",
  )!.value;
  return csp.split("; ").find((d) => d.startsWith(name)) ?? "";
}

afterEach(() => vi.unstubAllEnvs());

describe("the storage origin in connect-src", () => {
  it("is absent when no upload origin is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "");
    expect(await directive("connect-src")).toBe(
      "connect-src 'self' https://api.example.test",
    );
  });

  it("names exactly the configured https origins, and nothing wider", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv(
      "NEXT_PUBLIC_UPLOAD_ORIGINS",
      "https://bucket.s3.us-east-1.amazonaws.com/some/path, https://other.example.test",
    );
    const connect = await directive("connect-src");
    expect(connect).toContain("https://bucket.s3.us-east-1.amazonaws.com");
    expect(connect).toContain("https://other.example.test");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("/some/path");
  });

  it("drops anything that is not https, and a malformed entry, rather than trusting it", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_UPLOAD_ORIGINS",
      "http://insecure.example.test, not a url, http://localhost:9000, https://ok.example.test",
    );
    const connect = await directive("connect-src");
    expect(connect).toContain("https://ok.example.test");
    expect(connect).not.toContain("insecure");
    expect(connect).not.toContain("localhost");
  });

  it("admits a local fake storage in a development build only", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_UPLOAD_ORIGINS", "http://localhost:9000");
    vi.stubEnv("NODE_ENV", "development");
    expect(await directive("connect-src")).toContain("http://localhost:9000");
  });
});

describe("the API's origin in img-src", () => {
  it("is named, so a company's logo from the API can be drawn", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    expect(await directive("img-src")).toBe(
      "img-src 'self' data: blob: https://api.example.test",
    );
  });
});
