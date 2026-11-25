/**
 * L37 (NC-39): fixing a typo in an invited email took a cancel and a re-send,
 * five clicks, and the login stayed on the wrong address until then. When the
 * record's address differs from the invitation's, one press cancels it and
 * sends a new one to the record's address, with the same access.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { roleIdsByName } from "@/app/(app)/people/[id]/invite-to-sign-in";

const roles = [
  { id: "r-emp", name: "Employee" },
  { id: "r-hr", name: "HR manager" },
];

describe("the access a corrected invitation carries", () => {
  it("is the roles the old one had, by name", () => {
    expect(roleIdsByName(["HR manager"], roles, "r-emp")).toEqual(["r-hr"]);
  });
  it("falls back to the chosen role when none can be matched", () => {
    expect(roleIdsByName(["Gone"], roles, "r-emp")).toEqual(["r-emp"]);
    expect(roleIdsByName([], roles, "r-emp")).toEqual(["r-emp"]);
  });
});

describe("the dialog", () => {
  it("offers to send to the record's address instead", () => {
    const dialog = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../src/app/(app)/people/[id]/invite-to-sign-in.tsx",
      ),
      "utf8",
    );
    expect(dialog).toMatch(/Send to \{email\} instead/);
    expect(dialog).toContain("sendToRecordAddress");
  });
});
