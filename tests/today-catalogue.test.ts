import { describe, expect, it } from "vitest";
import {
  defaultLayout,
  resolveLayout,
  widgetById,
  type WidgetContext,
} from "@/app/(app)/dashboard/catalogue";
import { dashboardSections } from "@/app/(app)/dashboard/dashboard-screen";
import { WIDGET_COMPONENTS } from "@/app/(app)/dashboard/widgets";
import type { PermissionKey } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/api/setup";
import type { RoleTier } from "@/lib/roles";

/**
 * Where the Today panel and the app-use card sit on the dashboard, and for whom.
 *
 * Two promises are made in the catalogue and neither is visible to `tsc`: the
 * Today panel is **for everybody and near the top**, and the app-use card is
 * **only for somebody who may read it, in a company that turned it on**. A
 * widget that shows for the wrong person is a card that either draws nothing or,
 * worse, asks the API for something the person may not have.
 */

const TIERS: readonly RoleTier[] = ["owner", "admin", "custom", "staff"];

function context(
  options: {
    permissions?: readonly PermissionKey[];
    off?: readonly FeatureKey[];
  } = {},
): WidgetContext {
  const held = new Set<string>(options.permissions ?? []);
  const off = new Set<string>(options.off ?? []);
  return {
    has: (permission) => held.has(permission),
    featureOff: (feature) => off.has(feature),
  };
}

const layout = (tier: RoleTier, ctx: WidgetContext) =>
  resolveLayout(defaultLayout(tier, ctx), ctx);

describe("the Today panel", () => {
  it("is registered, with a component", () => {
    expect(widgetById("today")).toBeDefined();
    expect(WIDGET_COMPONENTS["today"]).toBeTypeOf("function");
  });

  it.each(TIERS)(
    "is on by default for %s, with no permission at all",
    (tier) => {
      /* Nothing held and every feature off: the panel has no gate of its own,
       because every section is about the caller and says so itself. */
      const ctx = context({
        off: ["attendance", "appraisals", "departments", "hiring"],
      });
      expect(layout(tier, ctx).map((widget) => widget.id)).toContain("today");
    },
  );

  it("asks nothing of a permission or a feature switch", () => {
    const spec = widgetById("today");
    expect(spec?.permission).toBeUndefined();
    expect(spec?.anyPermission).toBeUndefined();
    expect(spec?.feature).toBeUndefined();
  });

  it.each(TIERS)(
    "is one of the first two cards for %s, with only the metrics and a banner above it",
    (tier) => {
      const ctx = context({
        permissions: ["EDIT_RECORDS", "VIEW_SALARIES", "MANAGE_SETTINGS"],
      });
      const rows = dashboardSections(layout(tier, ctx), tier);
      const cards = rows.find((row) => row.key === "cards");
      expect(cards?.widgets.slice(0, 2).map((widget) => widget.id)).toContain(
        "today",
      );
      const above = rows.slice(
        0,
        rows.findIndex((row) => row.key === "cards"),
      );
      expect(
        above.every((row) => ["lead", "metrics", "banner"].includes(row.key)),
      ).toBe(true);
    },
  );

  it("comes after what needs a decision, for the people who have that card", () => {
    const ctx = context({ permissions: ["EDIT_RECORDS", "VIEW_SALARIES"] });
    const ids = layout("owner", ctx).map((widget) => widget.id);
    expect(ids.indexOf("needs-you")).toBeLessThan(ids.indexOf("today"));
  });

  it("reads its own request, so it costs the dashboard's payload nothing", () => {
    expect(widgetById("today")?.source).toBe("local");
  });
});

describe("the app-use card", () => {
  const ALLOWED: readonly PermissionKey[] = ["MANAGE_SETTINGS"];

  it("is registered, with a component", () => {
    expect(widgetById("app-use")).toBeDefined();
    expect(WIDGET_COMPONENTS["app-use"]).toBeTypeOf("function");
  });

  it("is gated on the permission the API gates it on, and on the company's switch", () => {
    const spec = widgetById("app-use");
    expect(spec?.permission).toBe("MANAGE_SETTINGS");
    expect(spec?.feature).toBe("appOpenTracking");
  });

  it("appears for an owner who holds the permission in a company that turned it on", () => {
    const ctx = context({ permissions: ALLOWED });
    expect(layout("owner", ctx).map((widget) => widget.id)).toContain(
      "app-use",
    );
  });

  it("does not appear while the company has the measure off", () => {
    const ctx = context({ permissions: ALLOWED, off: ["appOpenTracking"] });
    expect(layout("owner", ctx).map((widget) => widget.id)).not.toContain(
      "app-use",
    );
  });

  it("does not appear for somebody without the permission, whatever the tier", () => {
    for (const tier of TIERS) {
      const ctx = context({ permissions: ["EDIT_RECORDS", "VIEW_SALARIES"] });
      expect(layout(tier, ctx).map((widget) => widget.id)).not.toContain(
        "app-use",
      );
    }
  });

  it("is not on a member of staff's dashboard even with the permission", () => {
    const ctx = context({ permissions: ALLOWED });
    expect(layout("staff", ctx).map((widget) => widget.id)).not.toContain(
      "app-use",
    );
  });
});
