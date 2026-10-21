import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * "Pay early" is there only while we allow the company to offer it.
 *
 * Whether a company may offer early pay at all is decided by ApproveHR from the
 * admin dashboard, not by the company — `GET /setup/features` reports it as
 * `earlyPay`. Switched off, the row disappears for everybody in the company,
 * HR included, rather than leading to a screen that always says no.
 */

const NOBODY = new Set<PermissionKey>([]);
const HR = new Set<PermissionKey>(["APPROVE_LOANS", "MANAGE_PAY_STRUCTURE"]);

const facts = (earlyPay: boolean): NavFacts => ({
  ...NOTHING_ANSWERED_YET,
  assistantWired: true,
  earlyPay,
});

const labels = (permissions: ReadonlySet<PermissionKey>, answered: NavFacts) =>
  visibleNav(NAV, permissions, {}, answered).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe("the Pay early row", () => {
  it("is there for an employee while early pay is allowed", () => {
    expect(labels(NOBODY, facts(true))).toContain("Pay early");
  });

  it("is gone for an employee once it is switched off", () => {
    expect(labels(NOBODY, facts(false))).not.toContain("Pay early");
  });

  it("is gone for HR too, because no permission buys it back", () => {
    expect(labels(HR, facts(false))).not.toContain("Pay early");
  });

  it("is absent until the answer has arrived, rather than vanishing under a pointer", () => {
    expect(NOTHING_ANSWERED_YET.earlyPay).toBe(false);
    expect(labels(NOBODY, NOTHING_ANSWERED_YET)).not.toContain("Pay early");
  });
});
