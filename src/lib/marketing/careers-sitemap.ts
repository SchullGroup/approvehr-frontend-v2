import { API_URL } from "@/lib/marketing/careers";

/**
 * Which careers addresses a sitemap should list, asked of the API.
 *
 * The API answers only for **open** adverts of companies that have not asked to be
 * left out of search results, and it filters in the query: a draft, a closed
 * advert and an opted-out company are rows it never fetches, so there is nothing
 * here to drop. This function adds no judgement of its own and never reads
 * anything the public pages do not already show — a slug and a modified time.
 *
 * ## It never takes the sitemap down
 *
 * A sitemap that throws is a 500 on `/sitemap.xml`, and a crawler that gets one
 * stops coming back. Anything that goes wrong — no API configured, a timeout, a
 * refusal, a body that is not what was promised — yields what was read so far, which
 * may be nothing, and the site's own pages are listed regardless.
 *
 * ## Bounded
 *
 * Pages of 500, at most twenty of them: ten thousand addresses is a great many
 * open adverts and a sitemap may hold fifty thousand, so the cap is a guard
 * against a loop, not a limit anybody should meet.
 */

export type SitemapRow = {
  orgSlug: string;
  /** Absent for a company's own list of roles. */
  slug?: string;
  /** Relative to the careers root: `/{org}` or `/{org}/{slug}`. */
  path: string;
  /** ISO 8601. */
  lastModified: string;
};

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const TIMEOUT_MS = 8_000;

const isRow = (value: unknown): value is SitemapRow => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["orgSlug"] === "string" &&
    typeof row["path"] === "string" &&
    row["path"].startsWith("/") &&
    typeof row["lastModified"] === "string"
  );
};

export async function readSitemapRows(
  kind: "postings" | "companies",
  /** For a test: how long a page of the sitemap may be cached. */
  revalidate = 900,
): Promise<SitemapRow[]> {
  if (!API_URL) return [];
  const rows: SitemapRow[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(
        `${API_URL}/careers/public/_sitemap?kind=${kind}&page=${page}&pageSize=${PAGE_SIZE}`,
        {
          headers: { Accept: "application/json" },
          next: { revalidate },
          signal: controller.signal,
        },
      );
      if (!response.ok) break;
      const body = (await response.json()) as {
        data?: unknown;
        meta?: { total?: unknown };
      };
      if (!Array.isArray(body.data)) break;
      rows.push(...body.data.filter(isRow));
      const total =
        typeof body.meta?.total === "number" ? body.meta.total : rows.length;
      if (body.data.length < PAGE_SIZE || rows.length >= total) break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  return rows;
}
