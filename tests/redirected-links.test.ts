import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REDIRECTED_PATHS,
  REDIRECTED_PREFIXES,
  leavesTheApp,
  prefetchFor,
} from "@/lib/marketing/redirected";

/**
 * A link to an address the proxy redirects off-site must not be prefetched:
 * the prefetch follows the redirect to another origin and the app's own
 * Content Security Policy refuses it, once per link, on every page.
 */

const proxy = readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");

function listIn(source: string, declaration: RegExp): string[] {
  const match = declaration.exec(source);
  if (!match) throw new Error(`proxy.ts no longer has ${declaration}`);
  return [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("links to redirected marketing routes", () => {
  it("agrees with the proxy about which paths leave the app", () => {
    const fromProxy = listIn(
      proxy,
      /const REDIRECTED_PATHS = new Set\(\[([\s\S]*?)\]\)/,
    );
    expect([...REDIRECTED_PATHS].sort()).toEqual([...fromProxy].sort());
  });

  it("agrees with the proxy about which prefixes do", () => {
    const fromProxy = listIn(
      proxy,
      /const REDIRECTED_PREFIXES = \[([\s\S]*?)\]/,
    );
    expect([...REDIRECTED_PREFIXES].sort()).toEqual([...fromProxy].sort());
  });

  it("recognises each of them, with a query or a fragment", () => {
    for (const href of [
      "/privacy",
      "/terms?x=1",
      "/security#top",
      "/dpa",
      "/demo",
      "/product/payroll",
    ]) {
      expect(leavesTheApp(href), href).toBe(true);
      expect(prefetchFor(href)).toEqual({ prefetch: false });
    }
  });

  it("leaves everything else prefetched, including look-alikes", () => {
    for (const href of [
      "/dashboard",
      "/pricing",
      "/careers/acme",
      "/privacy-settings",
      "/products",
      "/people/demo",
    ]) {
      expect(leavesTheApp(href), href).toBe(false);
      expect(prefetchFor(href)).toEqual({});
    }
  });
});
