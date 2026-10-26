import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
  type NavGroup,
} from "@/components/portal/nav";
import type { BadgeSource } from "@/components/portal/nav";
import type { FeatureKey } from "@/lib/api/setup";
import type { ApiBilling } from "@/lib/api/endpoints";
import { SEED_ROLES } from "@/lib/mock/roles";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * The people the sidebar has to be right for.
 *
 * Shared by the parity proof and the behaviour tests so both ask the same
 * question of the same eight readers. Each is the *input* to `visibleNav` —
 * permissions, the company's flags, the row facts, the plan — never a list of
 * expected rows, so nothing here can drift away from the gating it is testing.
 */

export type Persona = {
  name: string;
  permissions: ReadonlySet<PermissionKey>;
  features: Partial<Record<FeatureKey, boolean>>;
  facts: NavFacts;
  billing?: ApiBilling | null;
};

const rolePermissions = (id: string): PermissionKey[] => {
  const role = SEED_ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`no seed role ${id}`);
  return role.permissions;
};

const facts = (
  rows: Partial<NavFacts["rows"]>,
  assistantWired = true,
): NavFacts => ({
  assistantWired,
  earlyPay: true,
  rows: { ...NOTHING_ANSWERED_YET.rows, ...rows },
});

const everythingOn: Partial<Record<FeatureKey, boolean>> = {};

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

const owner = new Set<PermissionKey>(rolePermissions("role-owner"));

export const PERSONAS: Persona[] = [
  {
    name: "employee",
    permissions: new Set(rolePermissions("role-employee")),
    features: everythingOn,
    facts: facts({ signatures: true }),
  },
  {
    name: "line manager",
    permissions: new Set<PermissionKey>([
      "MANAGE_HIRING",
      "APPROVE_LEAVE_DEPARTMENT",
      "VIEW_EQUIPMENT_DEPARTMENT",
    ]),
    features: everythingOn,
    facts: facts({ "one-on-ones": true }),
  },
  {
    name: "HR manager",
    permissions: new Set(rolePermissions("role-hr-manager")),
    features: everythingOn,
    facts: facts({ "one-on-ones": true, signatures: true }),
  },
  {
    name: "administrator",
    permissions: owner,
    features: everythingOn,
    facts: facts({ "one-on-ones": true, signatures: true }),
  },
  {
    name: "panelist",
    permissions: new Set<PermissionKey>(),
    features: everythingOn,
    facts: facts({ interviews: true }, false),
  },
  {
    name: "company with modules off",
    permissions: owner,
    features: {
      hiring: false,
      loans: false,
      expenses: false,
      shifts: false,
      departments: false,
      appraisals: false,
      multiAppraiser: false,
      surveys: false,
      projects: false,
    },
    facts: facts({ "one-on-ones": true, signatures: true }),
  },
  {
    name: "billing-locked company",
    permissions: owner,
    features: everythingOn,
    facts: facts({ "one-on-ones": true, signatures: true, interviews: true }),
    billing: billingBase,
  },
  {
    name: "no staff record",
    permissions: new Set<PermissionKey>(["MANAGE_SETTINGS", "MANAGE_ROLES"]),
    features: everythingOn,
    facts: facts({}, false),
  },
];

export function groupsFor(persona: Persona): NavGroup[] {
  return visibleNav(
    NAV,
    persona.permissions,
    persona.features,
    persona.facts,
    persona.billing ?? null,
  );
}

export const NO_BADGES: Record<BadgeSource, number> = {
  approvals: 0,
  pendingLeave: 0,
  notClockedIn: 0,
  unreadNotifications: 0,
};

/** The set of doors the long list showed: every visible item, as `href|label`. */
export function doorsBefore(groups: NavGroup[]): string[] {
  return groups.flatMap((group) =>
    group.items.map((item) => `${item.href}|${item.label}`),
  );
}
