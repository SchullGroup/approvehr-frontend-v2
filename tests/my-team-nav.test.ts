/**
 * U22: "My team" is in the sidebar for somebody with people reporting to them,
 * and absent for everybody else, whatever their permissions.
 */
import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

const EVERYTHING: ReadonlySet<PermissionKey> = new Set(PERMISSION_KEYS);

const facts = (leads: boolean): NavFacts => ({
  ...NOTHING_ANSWERED_YET,
  rows: { ...NOTHING_ANSWERED_YET.rows, "my-team": leads },
});

const hrefs = (permissions: ReadonlySet<PermissionKey>, answered: NavFacts) =>
  visibleNav(NAV, permissions, {}, answered).flatMap((group) =>
    group.items.map((item) => item.href),
  );

describe("My team in the sidebar", () => {
  it("is there for somebody who leads people", () => {
    expect(hrefs(new Set(), facts(true))).toContain("/people/team");
  });

  it("is not there for somebody who leads nobody, however much they hold", () => {
    expect(hrefs(new Set(), facts(false))).not.toContain("/people/team");
    expect(hrefs(EVERYTHING, facts(false))).not.toContain("/people/team");
  });
});
