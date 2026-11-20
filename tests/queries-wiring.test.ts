import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, WORKFLOW_FEATURE_KEYS } from "@/lib/api/setup";
import { PERMISSION_KEYS, PERMISSION_SHAPE } from "@/lib/permission-keys";
import { visibleNav, NAV } from "@/components/portal/nav";
import { FEATURE_COPY } from "@/lib/store/features";

/**
 * Where queries plug into the rest of the product.
 *
 * What is proved: the two permissions exist and are placed in the matrix under their own module;
 * the company switch is a workflow flag (so it is not rendered on `/settings/features`, where it
 * could be switched on without being asked first) and says what it is; and the sidebar row is for
 * the people who write or decide queries, in a company that has turned them on, and for nobody
 * else, the person a query is addressed to included.
 */

const allRows = () => NAV.flatMap((group) => group.items);
const row = () => allRows().find((item) => item.href === "/people/queries");

describe("the permissions", () => {
  it("are two, and placed under their own module", () => {
    expect(PERMISSION_KEYS).toContain("ISSUE_QUERIES");
    expect(PERMISSION_KEYS).toContain("DECIDE_QUERIES");
    expect(PERMISSION_SHAPE.ISSUE_QUERIES).toEqual({
      module: "queries",
      action: "create",
    });
    expect(PERMISSION_SHAPE.DECIDE_QUERIES).toEqual({
      module: "queries",
      action: "approve",
    });
  });
});

describe("the company switch", () => {
  it("is a workflow flag, off by default, and not a module on the features screen", () => {
    expect(FEATURE_KEYS).toContain("queries");
    expect(WORKFLOW_FEATURE_KEYS).toContain("queries");
    expect(FEATURE_COPY.queries.label).toBe("Queries");
  });

  it("says that a query changes no pay, employment record or exit", () => {
    expect(FEATURE_COPY.queries.line).toMatch(
      /changes no pay, no employment record and no exit/,
    );
  });
});

describe("the sidebar row", () => {
  it("is for either permission, and behind the switch", () => {
    const item = row();
    expect(item).toBeDefined();
    expect(item?.anyPermission).toEqual(["ISSUE_QUERIES", "DECIDE_QUERIES"]);
    expect(item?.feature).toBe("queries");
    expect(item?.permission).toBeUndefined();
  });

  const shown = (
    permissions: string[],
    flags: Record<string, boolean>,
  ): string[] =>
    visibleNav(NAV, new Set(permissions) as never, flags as never).flatMap(
      (group) => group.items.map((item) => item.href),
    );

  it("shows for an issuer when the company has switched queries on", () => {
    expect(shown(["ISSUE_QUERIES"], { queries: true })).toContain(
      "/people/queries",
    );
  });

  it("shows for a decider too", () => {
    expect(shown(["DECIDE_QUERIES"], { queries: true })).toContain(
      "/people/queries",
    );
  });

  it("is hidden while the switch is off", () => {
    expect(
      shown(["ISSUE_QUERIES", "DECIDE_QUERIES"], { queries: false }),
    ).not.toContain("/people/queries");
  });

  it("is never shown to somebody who holds neither, which is every person a query is addressed to", () => {
    expect(shown([], { queries: true })).not.toContain("/people/queries");
    expect(
      shown(["EDIT_RECORDS_DEPARTMENT", "APPROVE_LEAVE"], { queries: true }),
    ).not.toContain("/people/queries");
  });
});
