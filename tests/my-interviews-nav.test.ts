import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

/**
 * "My interviews" belongs in the sidebar of somebody on a panel, and of nobody else.
 *
 * No permission can say who that is: a panelist holds none of the hiring ones, which
 * is the point of the page. So the sidebar asks the rows, and until they have
 * answered the row is absent, because a row that appears a moment late is better than
 * one that appears and is taken away under somebody's pointer.
 */

const NOBODY = new Set<PermissionKey>([]);
const HR = new Set<PermissionKey>(["MANAGE_HIRING", "APPROVE_HIRING"]);

const facts = (interviews: boolean): NavFacts => ({
  assistantWired: true,
  earlyPay: true,
  rows: {
    "one-on-ones": false,
    signatures: false,
    interviews,
    "team-tasks": false,
  },
});

const hiring = (
  permissions: ReadonlySet<PermissionKey>,
  answered: NavFacts,
  features: Record<string, boolean> = {},
) =>
  visibleNav(NAV, permissions, features, answered)
    .filter((group) => group.items.some((i) => i.href.startsWith("/hiring")))
    .flatMap((group) => group.items.map((item) => item.label));

describe("the sidebar row", () => {
  it("is there for an employee on a panel, who holds no hiring permission, and is the only hiring row they get", () => {
    expect(hiring(NOBODY, facts(true))).toEqual(["My interviews"]);
  });

  it("is absent for an employee who is on no panel", () => {
    expect(hiring(NOBODY, facts(false))).toEqual([]);
  });

  it("is absent until the rows have answered", () => {
    expect(hiring(NOBODY, NOTHING_ANSWERED_YET)).toEqual([]);
    expect(NOTHING_ANSWERED_YET.rows.interviews).toBe(false);
  });

  it("is not bought by permission: somebody who manages hiring but is on no panel does not get it", () => {
    const labels = hiring(HR, facts(false));
    expect(labels).toContain("Interviews");
    expect(labels).not.toContain("My interviews");
  });

  it("sits beside the full Interviews page for somebody who has both, because they are different rooms", () => {
    const labels = hiring(HR, facts(true));
    expect(labels).toContain("Interviews");
    expect(labels).toContain("My interviews");
  });

  it("is not bought by every permission there is", () => {
    const all = new Set<PermissionKey>(PERMISSION_KEYS);
    expect(hiring(all, facts(false))).not.toContain("My interviews");
  });

  it("goes with the module: a company that has switched hiring off has no such row", () => {
    expect(hiring(NOBODY, facts(true), { hiring: false })).toEqual([]);
  });

  it("opens the panelist's own page, not the hiring overview", () => {
    const item = visibleNav(NAV, NOBODY, {}, facts(true))
      .flatMap((group) => group.items)
      .find((entry) => entry.label === "My interviews");
    expect(item?.href).toBe("/hiring/my-interviews");
  });
});
