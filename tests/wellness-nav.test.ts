import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import { MODULE_FEATURE_KEYS } from "@/lib/api/setup";
import type { PermissionKey } from "@/lib/permission-keys";
import { FEATURE_COPY } from "@/lib/store/features";

/**
 * The Wellness row is the company's choice, and everybody's once it is made.
 *
 * It is hidden until the company switches the module on, and then it is shown to
 * every employee: logging your own water and giving kudos need no permission, and
 * a permission gate would hide the screen from the audience it is for. What a
 * role adds (creating challenges, the floor) is inside the screens and the API.
 */

/** The character, built rather than typed, so this file carries none. */
const EM_DASH = String.fromCharCode(0x2014);

const NOBODY = new Set<PermissionKey>([]);
const HR = new Set<PermissionKey>(["MANAGE_SETTINGS", "EDIT_RECORDS"]);

const facts: NavFacts = { ...NOTHING_ANSWERED_YET, assistantWired: true };

const rows = (
  permissions: ReadonlySet<PermissionKey>,
  features: Parameters<typeof visibleNav>[2],
  answered: NavFacts = facts,
) =>
  visibleNav(NAV, permissions, features, answered).flatMap((group) =>
    group.items.filter((item) => item.label === "Wellness"),
  );

describe("the Wellness row", () => {
  it("is shown to an employee once the company has switched it on", () => {
    const [row] = rows(NOBODY, { wellness: true });
    expect(row?.href).toBe("/wellness");
  });

  it("is shown to HR in the same place, not as a second row", () => {
    expect(rows(HR, { wellness: true })).toHaveLength(1);
  });

  it("is gone while the company has it off, whoever is looking", () => {
    expect(rows(NOBODY, { wellness: false })).toHaveLength(0);
    expect(rows(HR, { wellness: false })).toHaveLength(0);
  });

  it("is not shown to somebody invited only to help hire", () => {
    expect(
      rows(NOBODY, { wellness: true }, { ...facts, collaborator: true }),
    ).toHaveLength(0);
  });

  it("is the only door, so the tabs do not each need a row", () => {
    const hrefs = NAV.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs.filter((href) => href.startsWith("/wellness"))).toEqual([
      "/wellness",
    ]);
  });
});

describe("the switch", () => {
  it("is one of the modules on Settings, with a line to say what it is", () => {
    expect(MODULE_FEATURE_KEYS).toContain("wellness");
    expect(FEATURE_COPY.wellness.label).toBe("Wellness");
    expect(FEATURE_COPY.wellness.line).not.toContain(EM_DASH);
  });
});
