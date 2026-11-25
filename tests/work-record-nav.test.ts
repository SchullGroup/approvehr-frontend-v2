import { describe, expect, it } from "vitest";
import { NAV, NOTHING_ANSWERED_YET, visibleNav } from "@/components/portal/nav";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * "My work record" is not in the Performance menu (owner, 24 Nov 2026): what
 * somebody finished on the project boards is read inside their reviews and on
 * their history, not on a page of its own.
 */

const NOBODY = new Set<PermissionKey>([]);
const HR = new Set<PermissionKey>(["MANAGE_SETTINGS", "EDIT_RECORDS"]);

const rows = (
  permissions: ReadonlySet<PermissionKey>,
  features: Parameters<typeof visibleNav>[2],
) =>
  visibleNav(NAV, permissions, features, NOTHING_ANSWERED_YET).flatMap(
    (group) => group.items.filter((item) => item.label === "My work record"),
  );

describe("the My work record row", () => {
  it("is not in the menu, whoever is looking and whatever is switched on", () => {
    expect(rows(NOBODY, { projects: true })).toHaveLength(0);
    expect(rows(HR, { projects: true })).toHaveLength(0);
    expect(rows(NOBODY, {})).toHaveLength(0);
  });
});
