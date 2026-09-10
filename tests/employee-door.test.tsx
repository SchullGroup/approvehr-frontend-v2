import { describe, expect, it } from "vitest";
import { NAV, visibleNav, type NavFacts } from "@/components/portal/nav";
import { failureMessage } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * An employee has a door to the things that are about them.
 *
 * Documents, Equipment and Exit management were all gated on `EDIT_RECORDS`,
 * so the person the flow exists *for* had no sidebar entry to any of them.
 * Their screens were built and live: `/documents` is where the "send us your
 * work permit" notification lands, `MyAssets` renders on `/profile`. The
 * feedback was "they don't have an end to end flow to the Employee… there is
 * no place employee will send it except that I will see it in my
 * notifications" — and the notification *was* the only door.
 *
 * `tsc` cannot see any of this. `permission: "EDIT_RECORDS"` is a perfectly
 * good `NavItem`, and so is the version that hides a screen from everybody who
 * needs it.
 */

const HR = new Set<PermissionKey>(["EDIT_RECORDS"]);
const EMPLOYEE = new Set<PermissionKey>([]);
const ALL_FEATURES = {};
/* The row-level answers this file does not care about, set to whatever keeps
   the most items on screen — these tests are about permissions and feature
   flags, and a hidden row would be a false negative rather than a finding.
   `one-on-ones` is exercised properly in `one-on-one-by-role.test.ts`. */
const EVERYTHING_ANSWERED: NavFacts = {
  assistantWired: true,
  rows: { "one-on-ones": true, signatures: true },
};

const hrefFor = (label: string, permissions: ReadonlySet<PermissionKey>) => {
  for (const group of visibleNav(
    NAV,
    permissions,
    ALL_FEATURES,
    EVERYTHING_ANSWERED,
  )) {
    const item = group.items.find((candidate) => candidate.label === label);
    if (item) return item.href;
  }
  return null;
};

describe("one label, the destination that belongs to the reader", () => {
  it("sends HR to the register", () => {
    expect(hrefFor("Documents", HR)).toBe("/people/documents");
    expect(hrefFor("Equipment", HR)).toBe("/people/assets");
  });

  it("sends an employee to their own page, rather than hiding it", () => {
    /* The whole fix. Before this both returned null for an employee — no row
       at all — and the screens were reachable only by the account menu, a
       notification, or guessing the URL. */
    expect(hrefFor("Documents", EMPLOYEE)).toBe("/documents");
    expect(hrefFor("Equipment", EMPLOYEE)).toBe("/equipment");
  });

  it("does not give HR two rows for one noun", () => {
    /* The obvious alternative — a second "My documents" entry — grows a
       sidebar this product deliberately keeps short, which is the argument
       that moved these into the account menu in the first place. */
    const labels = visibleNav(
      NAV,
      HR,
      ALL_FEATURES,
      EVERYTHING_ANSWERED,
    ).flatMap((group) => group.items.map((item) => item.label));
    expect(labels.filter((l) => l === "Documents")).toHaveLength(1);
    expect(labels.filter((l) => l === "Equipment")).toHaveLength(1);
  });

  it("still hides the row when the company has the module switched off", () => {
    /* `personalHref` opts out of the *permission* check only. A capability the
       company turned off has no screen for either audience — Rule 2.
       Asserted against a made-up group rather than the real `NAV`: neither
       Documents nor Equipment is feature-gated today, so the real nav cannot
       exercise this. A first draft asserted it on Equipment with a
       `feature` key that does not exist and failed — the product was right and
       the test was describing something it does not do. */
    const group = [
      {
        heading: "Test",
        items: [
          {
            href: "/people/loans",
            label: "Loans",
            icon: null,
            permission: "EDIT_RECORDS" as PermissionKey,
            personalHref: "/loans",
            feature: "loans" as const,
          },
        ],
      },
    ];

    expect(
      visibleNav(group, EMPLOYEE, { loans: true }, EVERYTHING_ANSWERED)[0]
        ?.items[0]?.href,
    ).toBe("/loans");
    expect(
      visibleNav(group, EMPLOYEE, { loans: false }, EVERYTHING_ANSWERED),
    ).toEqual([]);
    /* And for HR too — the flag is about the company, not the reader. */
    expect(
      visibleNav(group, HR, { loans: false }, EVERYTHING_ANSWERED),
    ).toEqual([]);
  });
});

describe("a gap says it is a gap", () => {
  const notFound = new ApiError(
    404,
    "not_found",
    "GET /signatures could not be found.",
  );

  it("does not tell somebody their records were removed", () => {
    /* What production actually said on a deployment whose API did not carry
       the module: "Signatures is not here, it may have been removed." Which
       reads as data loss, and produced "why did we add signatures". */
    const words = failureMessage(notFound, "signatures", "module");
    expect(words).not.toMatch(/may have been removed/);
    expect(words).toMatch(/not switched on for this deployment/);
    expect(words).toMatch(/Nothing is missing from your company's records/);
  });

  it("still says 'removed' for a record, which is what a 404 means there", () => {
    /* The default, and right for almost everything: a stale link to an
       employee or a payroll run. Changing that copy everywhere would trade one
       wrong sentence for another. */
    expect(failureMessage(notFound, "that person")).toMatch(
      /may have been removed/,
    );
  });

  it("is unchanged for every other status", () => {
    /* The distinction is only ever about 404. A 500 on a module the
       deployment does not have is still a 500. */
    const boom = new ApiError(500, "server_error", "boom");
    expect(failureMessage(boom, "signatures", "module")).toBe(
      failureMessage(boom, "signatures"),
    );
  });
});
