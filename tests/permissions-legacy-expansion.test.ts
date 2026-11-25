import { describe, expect, it } from "vitest";
import {
  NO_PERMISSIONS,
  toPermissionSet,
  withLegacyExpansion,
} from "@/lib/permissions";

/**
 * The expansion of EDIT_RECORDS into the two query permissions, mirrored from the server.
 *
 * What is proved: an HR manager's own permission list (which carries only EDIT_RECORDS) is read as
 * holding both, because the server reads it that way; nobody else gains anything; a permission
 * the person already holds is not duplicated; and the set keeps its identity when nothing is
 * added, so a memo downstream does not run again for nothing.
 */
describe("withLegacyExpansion", () => {
  it("reads somebody holding EDIT_RECORDS as holding both query permissions", () => {
    const set = withLegacyExpansion(
      toPermissionSet(["VIEW_SALARIES", "EDIT_RECORDS"]),
    );
    expect(set.has("ISSUE_QUERIES")).toBe(true);
    expect(set.has("DECIDE_QUERIES")).toBe(true);
    expect(set.has("EDIT_RECORDS")).toBe(true);
    expect(set.has("VIEW_SALARIES")).toBe(true);
  });

  it("gives nothing to anybody else", () => {
    const set = withLegacyExpansion(
      toPermissionSet([
        "MANAGE_HIRING",
        "APPROVE_LEAVE_ALL",
        "MANAGE_SETTINGS",
      ]),
    );
    expect(set.has("ISSUE_QUERIES")).toBe(false);
    expect(set.has("DECIDE_QUERIES")).toBe(false);
  });

  it("never gives the drafting permission: it is held by nobody on the day, so no old role implies it", () => {
    for (const held of [
      ["EDIT_RECORDS"],
      ["EDIT_RECORDS", "MANAGE_SETTINGS", "APPROVE_LEAVE_ALL"],
      ["ISSUE_QUERIES", "DECIDE_QUERIES"],
    ] as const) {
      expect(
        withLegacyExpansion(toPermissionSet([...held])).has("DRAFT_QUERIES"),
      ).toBe(false);
    }
  });

  it("does not widen the other direction", () => {
    const set = withLegacyExpansion(toPermissionSet(["ISSUE_QUERIES"]));
    expect(set.has("EDIT_RECORDS")).toBe(false);
    expect(set.has("DECIDE_QUERIES")).toBe(false);
  });

  it("keeps the same set when there is nothing to add", () => {
    const none = withLegacyExpansion(NO_PERMISSIONS);
    expect(none).toBe(NO_PERMISSIONS);
    const full = toPermissionSet([
      "EDIT_RECORDS",
      "ISSUE_QUERIES",
      "DECIDE_QUERIES",
    ]);
    expect(withLegacyExpansion(full)).toBe(full);
  });

  it("does not change the set it was given", () => {
    const given = toPermissionSet(["EDIT_RECORDS"]);
    withLegacyExpansion(given);
    expect(given.has("ISSUE_QUERIES")).toBe(false);
  });
});
