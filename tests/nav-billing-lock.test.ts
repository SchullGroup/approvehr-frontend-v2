import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavGroup,
} from "@/components/portal/nav";
import { isNavItemActive } from "@/components/portal/shell";
import { MODULES, type ModuleId } from "@/lib/marketing/modules";
import type { BillingModule } from "@/lib/billing";
import type { ApiBilling } from "@/lib/api/endpoints";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * Locking a nav group whose module is outside the plan.
 *
 * `moduleLocked` itself — the enforced/entitled/modules matrix — is already
 * covered in `billing-helpers.test.ts`. This suite is about the wiring:
 * which items `visibleNav` touches when a group locks, which it leaves
 * alone, and that the existing visibility rules (permission, feature, rows,
 * assistant) still run *first* — a lock never reveals a door the reader
 * could not already see.
 */

const NO_PERMISSIONS: ReadonlySet<PermissionKey> = new Set();

const billingBase: ApiBilling = {
  status: "ACTIVE",
  entitled: true,
  enforced: true,
  reason: null,
  plan: { name: "Growth", priceKobo: 5_000_000 },
  modules: ["CORE_HR", "PAYROLL"],
  trialEndsAt: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: null,
  unappliedKobo: 0,
};

const fixture: NavGroup[] = [
  {
    heading: "Recruitment",
    billingModule: "RECRUITMENT",
    items: [{ href: "/hiring", label: "Overview", icon: null, always: true }],
  },
  {
    heading: "Core HR",
    items: [{ href: "/people", label: "Employees", icon: null, always: true }],
  },
];

describe("visibleNav: locking a group outside the plan", () => {
  it("locks nothing when billing is undefined", () => {
    const groups = visibleNav(
      fixture,
      NO_PERMISSIONS,
      {},
      NOTHING_ANSWERED_YET,
    );
    const hiring = groups[0].items[0];
    expect(hiring.locked).toBeUndefined();
    expect(hiring.href).toBe("/hiring");
  });

  it("locks the group's items, and only that group's, when enforced and the module is missing from the plan", () => {
    const groups = visibleNav(
      fixture,
      NO_PERMISSIONS,
      {},
      NOTHING_ANSWERED_YET,
      billingBase,
    );
    const [recruitment, coreHr] = groups;
    expect(recruitment.items[0]).toMatchObject({
      href: "/billing/pay",
      locked: true,
    });
    expect(coreHr.items[0]).toEqual({
      href: "/people",
      label: "Employees",
      icon: null,
      always: true,
    });
  });

  it("locks nothing while the paywall is off", () => {
    const groups = visibleNav(
      fixture,
      NO_PERMISSIONS,
      {},
      NOTHING_ANSWERED_YET,
      { ...billingBase, enforced: false },
    );
    expect(groups[0].items[0].locked).toBeUndefined();
    expect(groups[0].items[0].href).toBe("/hiring");
  });
});

describe("NAV: every module group carries its billing module", () => {
  /* Restates the brief's own map rather than importing an internal constant
     from nav.tsx — the point of the test is that the *assembled* `NAV`
     carries the right answer, not that nav.tsx's private table equals
     itself. */
  const BILLING_MODULE_OF: Record<ModuleId, BillingModule> = {
    "core-hr": "CORE_HR",
    payroll: "PAYROLL",
    time: "TIME_AND_LEAVE",
    hiring: "RECRUITMENT",
    performance: "PERFORMANCE",
    desk: "HELPDESK",
  };

  it("maps each of the six modules by heading", () => {
    expect(MODULES.length).toBe(6);
    for (const mod of MODULES) {
      const group = NAV.find((g) => g.heading === mod.label);
      expect(group?.billingModule).toBe(BILLING_MODULE_OF[mod.id]);
    }
  });
});

/**
 * Fix round 1: a locked item is never the active row.
 *
 * `SidebarNav` (shell.tsx) computes `active` with `isNavItemActive`, tested
 * directly here rather than by rendering `SidebarNav` — that component is
 * only reachable through `AppShell`, which wires in a dozen hooks
 * (permissions, features, the assistant, the roster, the session, billing…)
 * that would all need mocking to render one `<li>`. The function this suite
 * calls is the whole of what changed: a pure `(item, activeHref) => boolean`.
 *
 * The bug: `visibleNav` maps every surviving item in a locked group to the
 * identical href `/billing/pay` (see the describe block above). Before this
 * fix, `SidebarNav` compared each item's href to `activeHref` with no
 * `locked` check, so standing on `/billing/pay` made every locked item in
 * every locked group compare equal at once — the same multi-active symptom
 * `resolveActiveHref`'s own doc comment warns a duplicated href causes,
 * reached here through a shared href instead of a duplicated one.
 */
describe("isNavItemActive: a locked item is never active", () => {
  it("is false for a locked item even though its href is the current page", () => {
    expect(
      isNavItemActive({ href: "/billing/pay", locked: true }, "/billing/pay"),
    ).toBe(false);
  });

  it("is true for an ordinary item whose href is the current page", () => {
    /* The regression guard: the fix must not turn off highlighting in
       general, only for locked items. */
    expect(
      isNavItemActive({ href: "/people", locked: undefined }, "/people"),
    ).toBe(true);
    expect(isNavItemActive({ href: "/people" }, "/hiring")).toBe(false);
  });

  it("is false for every item in a locked group while standing on /billing/pay", () => {
    const group: NavGroup = {
      heading: "Recruitment",
      billingModule: "RECRUITMENT",
      items: [
        { href: "/hiring", label: "Overview", icon: null, always: true },
        {
          href: "/hiring/postings",
          label: "Job adverts",
          icon: null,
          always: true,
        },
      ],
    };

    const [locked] = visibleNav(
      [group],
      NO_PERMISSIONS,
      {},
      NOTHING_ANSWERED_YET,
      billingBase,
    );

    /* Both items now share one href — the setup that reproduces the bug. */
    expect(locked.items.map((item) => item.href)).toEqual([
      "/billing/pay",
      "/billing/pay",
    ]);

    for (const item of locked.items) {
      expect(isNavItemActive(item, "/billing/pay")).toBe(false);
    }
  });
});
