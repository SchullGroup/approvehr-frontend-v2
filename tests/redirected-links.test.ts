import { describe, expect, it } from "vitest";
import { leavesTheApp, prefetchFor } from "@/lib/marketing/redirected";

/**
 * A link to an address the proxy redirects off-site must not be prefetched:
 * the prefetch follows the redirect to another origin and the app's own
 * Content Security Policy refuses it, once per link, on every page.
 */

describe("links to redirected marketing routes", () => {
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
