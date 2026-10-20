import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The apply form's "are you a person" check loads a script and draws in a frame,
 * and the Content-Security-Policy refuses both from any origin it does not name.
 * Named only when a site key is configured — the one condition under which the
 * page can ever ask for the check — so a deployment without one keeps exactly the
 * policy it had and never admits a third-party script it will not load.
 */

type Headers = { headers: { key: string; value: string }[] }[];

async function policy(): Promise<string> {
  vi.resetModules();
  const config = (await import("../next.config")).default as {
    headers: () => Promise<Headers>;
  };
  const all = await config.headers();
  return all[0]!.headers.find((h) => h.key === "Content-Security-Policy")!
    .value;
}

afterEach(() => vi.unstubAllEnvs());

describe("the challenge origin in the CSP", () => {
  it("is absent, and so is any frame-src, when there is no site key", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const csp = await policy();

    expect(csp).not.toContain("challenges.cloudflare.com");
    expect(csp).not.toMatch(/frame-src/);
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'/);
  });

  it("is admitted for scripts and frames, and nothing wider, when a site key is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0xTESTKEY");
    const csp = await policy();

    const directive = (name: string) =>
      csp.split("; ").find((d) => d.startsWith(name)) ?? "";
    expect(directive("script-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(directive("frame-src")).toBe(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
    /* Not smuggled into the directives that fall back to default-src. */
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("connect-src")).not.toContain("cloudflare");
    /* Anything that embeds this app is still refused. */
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
