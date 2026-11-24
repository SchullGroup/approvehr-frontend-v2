import { describe, expect, it } from "vitest";
import {
  WIDGETS,
  defaultLayout,
  resolveLayout,
  type WidgetContext,
} from "@/app/(app)/dashboard/catalogue";
import {
  MAX_METRICS,
  dashboardSections,
} from "@/app/(app)/dashboard/dashboard-screen";
import type { PermissionKey } from "@/lib/permissions";
import type { RoleTier } from "@/lib/roles";

/**
 * The shape of the page: one row of metric cards, a two-column grid of cards,
 * the rest quiet.
 *
 * The old arrangement had six kinds of row, and a stat row that left a tile on
 * its own whenever its count was not a divisor of twelve. What is pinned here is
 * the arithmetic that made that impossible, for every tier and for the widest
 * set of permissions a person can hold — the case with the most widgets, and so
 * the one that overflows first.
 */

const TIERS: readonly RoleTier[] = ["owner", "admin", "custom", "staff"];

const EVERYTHING: readonly PermissionKey[] = [
  "EDIT_RECORDS",
  "VIEW_SALARIES",
  "MANAGE_SETTINGS",
  "MANAGE_HIRING",
  "RUN_PAYROLL",
];

function context(held: readonly PermissionKey[]): WidgetContext {
  const has = new Set<string>(held);
  return { has: (permission) => has.has(permission), featureOff: () => false };
}

const sectionsFor = (tier: RoleTier, held: readonly PermissionKey[]) => {
  const ctx = context(held);
  return dashboardSections(resolveLayout(defaultLayout(tier, ctx), ctx), tier);
};

describe.each(TIERS)("the dashboard for %s", (tier) => {
  it("has at most one row of metrics, and no more than four in it", () => {
    for (const held of [[], EVERYTHING]) {
      const rows = sectionsFor(tier, held);
      expect(rows.filter((row) => row.key === "metrics")).toHaveLength(
        rows.some((row) => row.key === "metrics") ? 1 : 0,
      );
      const metrics = rows.find((row) => row.key === "metrics");
      expect(metrics?.widgets.length ?? 0).toBeLessThanOrEqual(MAX_METRICS);
    }
  });

  it("puts every widget in exactly one place", () => {
    const ctx = context(EVERYTHING);
    const chosen = resolveLayout(defaultLayout(tier, ctx), ctx);
    const inHeader = chosen.filter((widget) => widget.slot === "header");
    const placed = dashboardSections(chosen, tier).flatMap((row) =>
      row.widgets.map((widget) => widget.id),
    );
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed, ...inHeader.map((widget) => widget.id)].sort()).toEqual(
      chosen.map((widget) => widget.id).sort(),
    );
  });

  it("draws the rows in reading order", () => {
    const order = ["lead", "metrics", "banner", "cards", "foot"];
    const keys = sectionsFor(tier, EVERYTHING).map((row) => row.key);
    expect(keys).toEqual(
      [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    );
  });

  it("never offers a metric card that is not a quarter-width figure", () => {
    const metrics = sectionsFor(tier, EVERYTHING).find(
      (row) => row.key === "metrics",
    );
    for (const widget of metrics?.widgets ?? []) {
      expect(widget.span).toBe("quarter");
    }
  });
});

describe("what moved off the page", () => {
  it("keeps the Start-something menu in the header and out of every row", () => {
    for (const tier of TIERS) {
      const ctx = context(EVERYTHING);
      const chosen = resolveLayout(defaultLayout(tier, ctx), ctx);
      const rows = dashboardSections(chosen, tier);
      expect(rows.flatMap((row) => row.widgets.map((w) => w.id))).not.toContain(
        "quick-actions",
      );
    }
    expect(WIDGETS.find((w) => w.id === "quick-actions")?.slot).toBe("header");
  });

  it("closes the noticeboard at the foot, after every card", () => {
    const rows = sectionsFor("staff", []);
    const keys = rows.map((row) => row.key);
    expect(keys.at(-1)).toBe("foot");
    expect(
      rows.find((row) => row.key === "foot")?.widgets.map((w) => w.id),
    ).toContain("noticeboard");
  });

  it("does not offer the owner or an administrator a queue tile beside Needs you", () => {
    for (const tier of ["owner", "admin"] as const) {
      const ids = sectionsFor(tier, EVERYTHING).flatMap((row) =>
        row.widgets.map((widget) => widget.id),
      );
      expect(ids).toContain("needs-you");
      expect(ids).not.toContain("my-queue");
    }
  });

  it("still gives a member of staff the queue tile, since they have no Needs you", () => {
    const ids = sectionsFor("staff", []).flatMap((row) =>
      row.widgets.map((widget) => widget.id),
    );
    expect(ids).toContain("my-queue");
    expect(ids).not.toContain("needs-you");
  });
});

describe("a figure that does not fit the row", () => {
  it("joins the cards instead of being dropped", () => {
    const quarters = WIDGETS.filter((widget) => widget.span === "quarter");
    expect(quarters.length).toBeGreaterThan(MAX_METRICS);
    const rows = dashboardSections(quarters, "owner");
    const ids = rows.flatMap((row) => row.widgets.map((widget) => widget.id));
    expect(ids.sort()).toEqual(quarters.map((widget) => widget.id).sort());
    expect(rows.find((row) => row.key === "metrics")?.widgets).toHaveLength(
      MAX_METRICS,
    );
    expect(
      rows.find((row) => row.key === "cards")?.widgets.length,
    ).toBeGreaterThan(0);
  });
});
