import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_TILE_DEFAULT } from "@/components/geofence-picker/region";

/**
 * The geofence picker draws map tiles from a third party, and the
 * Content-Security-Policy decides whether the browser will load them. The tile
 * host is named in `img-src` and nowhere else, and only the host the build is
 * configured with.
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

describe("the tile host in img-src", () => {
  it("is OpenStreetMap's when nothing is configured, and only in img-src", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILE_URL", "");
    expect(await directive("img-src")).toContain(
      "https://tile.openstreetmap.org",
    );
    expect(await directive("connect-src")).not.toContain("openstreetmap");
  });

  it("follows a configured provider, as its origin and nothing more", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv(
      "NEXT_PUBLIC_MAP_TILE_URL",
      "https://tiles.example.test/styles/streets/{z}/{x}/{y}.png?key=abc",
    );
    const img = await directive("img-src");
    expect(img).toContain("https://tiles.example.test");
    expect(img).not.toContain("openstreetmap");
    expect(img).not.toContain("styles");
    expect(img).not.toContain("key=");
  });

  it("names a {s} subdomain as a wildcard on that one host", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv(
      "NEXT_PUBLIC_MAP_TILE_URL",
      "https://{s}.tiles.example.test/{z}/{x}/{y}{r}.png",
    );
    expect(await directive("img-src")).toContain(
      "https://*.tiles.example.test",
    );
  });

  it("drops an http or malformed value in production rather than trusting it", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_MAP_TILE_URL",
      "http://insecure.example.test/{z}/{x}/{y}.png",
    );
    expect(await directive("img-src")).not.toContain("insecure");

    vi.stubEnv("NEXT_PUBLIC_MAP_TILE_URL", "not a url {z}");
    const img = await directive("img-src");
    expect(img).not.toContain("not a url");
    expect(img).toMatch(/^img-src 'self' data: blob:/);
  });

  it("holds the same default as the picker, which next.config.ts cannot import", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain(`"${MAP_TILE_DEFAULT}"`);
  });
});
