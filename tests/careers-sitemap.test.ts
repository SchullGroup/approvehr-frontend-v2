import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sitemap lists the site's own pages, and then every open advert the API says
 * is open and may be listed. It must never take the sitemap down, and it must
 * never invent an address.
 */

const API = "https://api.example.test/api/v1";
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const row = (
  org: string,
  slug?: string,
  over: Record<string, unknown> = {},
) => ({
  orgSlug: org,
  ...(slug ? { slug } : {}),
  path: slug ? `/${org}/${slug}` : `/${org}`,
  lastModified: "2026-10-14T09:30:00.000Z",
  ...over,
});

const page = (rows: unknown[], total = rows.length) =>
  json(200, { data: rows, meta: { total, page: 1, pageSize: 500 } });

async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://approvehr.io");
  const { default: sitemap } = await import("@/app/sitemap");
  const { readSitemapRows } = await import("@/lib/marketing/careers-sitemap");
  return { sitemap, readSitemapRows };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the careers part of the sitemap", () => {
  it("lists open adverts and the companies that have them, under /careers, with their own modified dates", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("kind=companies")
        ? page([row("acme")])
        : page([
            row("acme", "payroll-analyst"),
            row("acme", "hr-officer", {
              lastModified: "2026-09-01T00:00:00.000Z",
            }),
          ]),
    );
    const { sitemap } = await load();
    const entries = await sitemap();
    const careers = entries.filter((entry) => entry.url.includes("/careers/"));

    expect(careers.map((entry) => entry.url).sort()).toEqual([
      "https://approvehr.io/careers/acme",
      "https://approvehr.io/careers/acme/hr-officer",
      "https://approvehr.io/careers/acme/payroll-analyst",
    ]);
    const advert = careers.find((entry) => entry.url.endsWith("/hr-officer"));
    expect(advert?.lastModified).toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });

  it("asks for open adverts only, and for nothing else about them", async () => {
    fetchMock.mockImplementation(async () => page([]));
    const { sitemap } = await load();
    await sitemap();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      urls.some((url) =>
        url.includes("/careers/public/_sitemap?kind=postings"),
      ),
    ).toBe(true);
    expect(urls.some((url) => url.includes("kind=companies"))).toBe(true);
    /* No draft or closed filter is sent because the API does not offer one. */
    expect(urls.every((url) => !/status=|draft|closed/i.test(url))).toBe(true);
  });

  it("keeps listing the site's own pages when the API is down, refuses, or answers nonsense", async () => {
    const { sitemap } = await load();

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(
      (await sitemap()).some((e) => e.url === "https://approvehr.io/pricing"),
    ).toBe(true);

    fetchMock.mockResolvedValue(json(500, { error: { code: "internal" } }));
    expect(
      (await sitemap()).some((e) => e.url === "https://approvehr.io/pricing"),
    ).toBe(true);

    fetchMock.mockResolvedValue(json(200, { data: "not a list" }));
    const entries = await sitemap();
    expect(entries.some((e) => e.url === "https://approvehr.io/pricing")).toBe(
      true,
    );
    expect(entries.some((e) => e.url.includes("/careers/"))).toBe(false);
  });

  it("drops a row that is not what was promised, rather than writing an address from it", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("kind=companies")
        ? page([])
        : page([
            row("acme", "good"),
            {
              orgSlug: "acme",
              path: "javascript:alert(1)",
              lastModified: "2026-10-14T00:00:00.000Z",
            },
            { orgSlug: "acme", path: "/acme/no-date" },
            "nonsense",
            null,
          ]),
    );
    const { readSitemapRows } = await load();
    const rows = await readSitemapRows("postings");
    expect(rows.map((r) => r.path)).toEqual(["/acme/good"]);
  });

  it("reads every page until it has them all, and stops there", async () => {
    const first = Array.from({ length: 500 }, (_, i) =>
      row("acme", `role-${i}`),
    );
    const second = Array.from({ length: 120 }, (_, i) =>
      row("acme", `more-${i}`),
    );
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("page=1") ? page(first, 620) : page(second, 620),
    );
    const { readSitemapRows } = await load();
    const rows = await readSitemapRows("postings");
    expect(rows).toHaveLength(620);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists nothing from the API where none is configured (the standalone site's normal state)", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { readSitemapRows } = await import("@/lib/marketing/careers-sitemap");
    expect(await readSitemapRows("postings")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
