import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, WORKFLOW_FEATURE_KEYS } from "@/lib/api/setup";
import { PERMISSION_KEYS, PERMISSION_SHAPE } from "@/lib/permission-keys";
import { visibleNav, NAV } from "@/components/portal/nav";
import {
  buildSidebar,
  findDestinations,
} from "@/components/portal/sidebar-model";
import { FEATURE_COPY } from "@/lib/store/features";

/**
 * Where queries plug into the rest of the product.
 *
 * What is proved: the two permissions exist and are placed in the matrix under their own module;
 * the company switch is a workflow flag (so it is not rendered on `/settings/features`, where it
 * could be switched on without being asked first) and says what it is; and the sidebar row is for
 * everybody in a company that has turned queries on, the person a query is addressed to and every
 * manager included, and for nobody while it is off.
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

  it("include the manager's drafting one, in the Queries row of the matrix, as Edit", () => {
    expect(PERMISSION_KEYS).toContain("DRAFT_QUERIES");
    expect(PERMISSION_SHAPE.DRAFT_QUERIES).toEqual({
      module: "queries",
      action: "edit",
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
  it("is for everybody, behind the switch, and asks for no permission", () => {
    const item = row();
    expect(item).toBeDefined();
    expect(item?.feature).toBe("queries");
    /* The row used to ask for a query permission, so the person a letter was issued to, and every
       manager, had no way in but a notification. Neither field may come back. */
    expect(item?.permission).toBeUndefined();
    expect(item?.anyPermission).toBeUndefined();
    expect(item?.rows).toBeUndefined();
  });

  const shown = (
    permissions: string[],
    flags: Record<string, boolean>,
  ): string[] =>
    visibleNav(NAV, new Set(permissions) as never, flags as never).flatMap(
      (group) => group.items.map((item) => item.href),
    );

  it("shows for an issuer and a decider when the company has switched queries on", () => {
    expect(shown(["ISSUE_QUERIES"], { queries: true })).toContain(
      "/people/queries",
    );
    expect(shown(["DECIDE_QUERIES"], { queries: true })).toContain(
      "/people/queries",
    );
  });

  it("shows for a line manager given the drafting permission", () => {
    expect(shown(["DRAFT_QUERIES"], { queries: true })).toContain(
      "/people/queries",
    );
  });

  it("shows for an employee who holds no permission at all: the person a query is addressed to", () => {
    expect(shown([], { queries: true })).toContain("/people/queries");
  });

  it("shows for a manager who holds nothing about queries", () => {
    expect(
      shown(["EDIT_RECORDS_DEPARTMENT", "APPROVE_LEAVE"], { queries: true }),
    ).toContain("/people/queries");
  });

  it("is in the Core HR group, where an employee already finds their documents and equipment", () => {
    const groups = visibleNav(
      NAV,
      new Set() as never,
      {
        queries: true,
      } as never,
    );
    const holder = groups.find((group) =>
      group.items.some((item) => item.href === "/people/queries"),
    );
    expect(holder?.heading).toBe("Core HR");
  });

  it("is found by the sidebar's Find box under the words a person would use for a letter from HR", () => {
    const tree = buildSidebar(
      visibleNav(NAV, new Set() as never, { queries: true } as never),
    );
    for (const word of ["queries", "letter", "explain"]) {
      expect(
        findDestinations(tree, word).map(({ item }) => item.href),
      ).toContain("/people/queries");
    }
  });

  it("is hidden while the switch is off, for everybody", () => {
    expect(
      shown(["ISSUE_QUERIES", "DECIDE_QUERIES"], { queries: false }),
    ).not.toContain("/people/queries");
    expect(shown([], { queries: false })).not.toContain("/people/queries");
  });
});
