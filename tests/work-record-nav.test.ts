import { describe, expect, it } from "vitest";
import { NAV, NOTHING_ANSWERED_YET, visibleNav } from "@/components/portal/nav";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * "My work record" lists what somebody finished on the project boards, so it is
 * in the sidebar for a company that has Projects switched on, and gone for one
 * that has not: there is nothing for it to show there, and a row that leads to a
 * page about a module the company does not use is the clutter the feature flags
 * exist to remove.
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
  it("is shown to an employee once the company has Projects on", () => {
    const [row] = rows(NOBODY, { projects: true });
    expect(row?.href).toBe("/performance/work-record");
  });

  it("is shown to HR in the same place, once", () => {
    expect(rows(HR, { projects: true })).toHaveLength(1);
  });

  it("is gone while the company has Projects off, whoever is looking", () => {
    expect(rows(NOBODY, { projects: false })).toHaveLength(0);
    expect(rows(HR, { projects: false })).toHaveLength(0);
  });

  it("is not taken away while the answer is still arriving", () => {
    expect(rows(NOBODY, {})).toHaveLength(1);
  });
});
