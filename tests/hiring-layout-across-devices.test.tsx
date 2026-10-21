import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REDIRECTED_PATHS,
  REDIRECTED_PREFIXES,
  isRedirectedOffSite,
} from "@/lib/marketing/redirected";
import { noPrefetchIfOffSite } from "@/lib/marketing/links";

/**
 * The hiring screens fit the device they are opened on.
 *
 * Found by opening every /hiring route, the public careers pages and their
 * dialogs at 320, 375, 412, 768, 1024, 1366 and 1920px against a seeded company
 * with names and addresses as long as real ones, and measuring what the page did
 * (sideways overflow, text drawn over text, children sticking out of their card,
 * requests that fail). Each of these is a structural fact jsdom can hold even
 * though it cannot lay a page out, and each was a real defect.
 *
 * Two shapes cause nearly all of it, and both are invisible in a screenshot of
 * the data a developer usually has:
 *
 * - A grid with no column below `lg` has one `auto` track, whose floor is the
 *   widest thing in it. One long email address then made the whole candidate
 *   page 922px wide on a 320px phone, and a phone browser answers that by zooming
 *   the page out.
 * - A flex row of "words, then controls" written `flex-wrap` with `min-w-0
 *   flex-1` on the words never wraps: `flex-1` has a basis of nothing, so the
 *   words shrink to nothing before the row is judged full, and the controls are
 *   drawn on top of them.
 */

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("the candidate page", () => {
  const screen = source(
    "src/app/(app)/hiring/candidates/[id]/candidate-screen.tsx",
  );

  it("has one column below lg that is allowed to shrink, so a long address cannot widen the page", () => {
    expect(screen).toMatch(
      /className="grid grid-cols-1 gap-6 lg:grid-cols-\[300px_minmax\(0,1fr\)\]/,
    );
    expect(screen).toMatch(/<aside className="flex min-w-0 flex-col/);
  });

  it("wraps an email address and a name rather than cutting them off with an ellipsis", () => {
    /* `truncate` hid the end of the one thing a recruiter copies. */
    const start = screen.indexOf("function Contact(");
    const contact = screen.slice(
      start,
      screen.indexOf("const SOURCE_LABEL", start),
    );
    expect(contact).toContain("break-all");
    expect(contact).not.toContain("truncate");
    expect(screen).toMatch(/text-h4 break-words text-ink/);
  });
});

describe("rows of words and controls", () => {
  it.each([
    [
      "an interview in the diary",
      "src/app/(app)/hiring/interviews/real-diary.tsx",
    ],
  ])("%s puts its words on a line of their own below sm", (_label, file) => {
    const row = source(file);
    expect(row).toContain("basis-full");
    /* The date and the status stay together on the first line. */
    expect(row).toMatch(/order-1 flex w-16 shrink-0/);
    expect(row).toMatch(/order-2 ml-auto/);
  });

  it.each([
    [
      "a rejection reason",
      "src/app/(app)/hiring/settings/rejection-reasons/reasons-screen.tsx",
      /<div className="min-w-48 flex-1">\s*<p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">/,
    ],
    [
      "a tag",
      "src/app/(app)/hiring/settings/tags/tags-screen.tsx",
      /<div className="min-w-48 flex-1">\s*<Tag>/,
    ],
    [
      "a pipeline stage",
      "src/components/hiring/requisition-stages.tsx",
      /<span className="flex min-w-48 flex-1 flex-wrap items-center gap-2">\s*<span className="text-body-sm font-medium text-ink">/,
    ],
  ])(
    "%s keeps its words a width of their own, so the controls wrap under them",
    (_label, file, words) => {
      /* The one thing that must not come back: words that may shrink to
         nothing beside controls that may not. */
      expect(source(file)).toMatch(words);
    },
  );

  it.each([
    [
      "a share link",
      "src/components/hiring/share-links.tsx",
      /<div className="min-w-48 flex-1">\s*<p className="text-body-sm font-medium text-ink">/,
    ],
    [
      "the stage-email summary",
      "src/components/hiring/stage-comms.tsx",
      /<span className="flex flex-wrap items-center gap-1\.5">\s*<Badge/,
    ],
    [
      "an applicant's email",
      "src/app/(app)/hiring/requisitions/[id]/screening.tsx",
      /max-w-full items-center gap-1 font-normal break-all/,
    ],
  ])(
    "%s wraps instead of running past its card on a 320px phone",
    (_label, file, shape) => {
      expect(source(file)).toMatch(shape);
    },
  );

  it("never lets the switch beside a rejection reason shrink under the reason's text", () => {
    const row = source(
      "src/app/(app)/hiring/settings/rejection-reasons/reasons-screen.tsx",
    );
    expect(row).toMatch(/label="Offered"\s+className="shrink-0"/);
  });

  it("never lets the four stage buttons shrink under the stage's badges", () => {
    const row = source("src/components/hiring/requisition-stages.tsx");
    expect(row).toMatch(
      /<span className="flex shrink-0 items-center gap-1">\s+<IconButton\s+label=\{`Move/,
    );
  });
});

describe("the public role page", () => {
  it("has one column below lg that is allowed to shrink, so the advert preview inside the app is not clipped", () => {
    /* The preview wraps the public page in the app's own padding, so it has
       about 200px to work with at 320. The form's floor was wider than that and
       the right 32px of every line was cut off by the frame. */
    expect(source("src/components/marketing/role-view.tsx")).toMatch(
      /container-page grid grid-cols-1 gap-14 lg:grid-cols-/,
    );
  });
});

describe("links to marketing pages that have left", () => {
  it("knows which routes the proxy sends to the landing site", () => {
    for (const route of [
      "/demo",
      "/privacy",
      "/terms",
      "/security",
      "/dpa",
      "/product/payroll",
      "/product/hiring",
    ]) {
      expect(isRedirectedOffSite(route)).toBe(true);
    }
    for (const route of [
      "/pricing",
      "/paye-calculator",
      "/careers/schull",
      "/products",
      "/hiring",
    ]) {
      expect(isRedirectedOffSite(route)).toBe(false);
    }
  });

  it("switches prefetching off for those and leaves it alone for the rest", () => {
    /* A prefetch of a route that 308s to another origin is a cross-origin
       fetch, which the app's own CSP refuses: a console error per footer link on
       every public careers page. */
    expect(noPrefetchIfOffSite("/demo")).toEqual({ prefetch: false });
    expect(noPrefetchIfOffSite("/product/time")).toEqual({ prefetch: false });
    expect(noPrefetchIfOffSite("/pricing")).toEqual({});
  });

  it("is the list the proxy itself reads, so the two cannot disagree", () => {
    const proxy = source("src/proxy.ts");
    expect(proxy).toContain('from "@/lib/marketing/redirected"');
    expect(proxy).toContain("isRedirectedOffSite(pathname)");
    /* The proxy's matcher is static configuration and has to be written out;
       it must name exactly the routes the shared list does. */
    const matcher = [...proxy.matchAll(/^\s+"(\/[^"]*)",$/gm)].map((m) => m[1]);
    for (const route of REDIRECTED_PATHS) expect(matcher).toContain(route);
    for (const prefix of REDIRECTED_PREFIXES) {
      expect(matcher).toContain(`${prefix}/:path*`);
    }
  });

  it("is used by the footer, which is what loads on every public page", () => {
    const chrome = source("src/components/marketing/chrome.tsx");
    expect(chrome).toContain("{...noPrefetchIfOffSite(href)}");
    expect(
      chrome.match(/prefetch=\{false\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(5);
  });
});
