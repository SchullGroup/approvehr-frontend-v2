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
import { withPrograms } from "@/components/portal/programs-nav";
import { sampleBook } from "@/lib/projects/demo-book";
import {
  programsFor,
  visibleProjects,
  type Scene,
  type Viewer,
} from "@/lib/projects/programs";
import { NO_PROGRAMS, type ProgramsNav } from "@/lib/store/programs";

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
  /**
   * The programs the sidebar was told about. Absent is a company with none, which
   * is every persona from before programs existed: their rows are what they were.
   */
  programs?: ProgramsNav;
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

/* ---- the people the programs rules are about ----------------------------- */

const SCENE_BOOK = sampleBook({
  today: "2026-10-15",
  now: "2026-10-15T12:00:00.000Z",
  people: ["p-01", "p-03", "p-09", "p-04"],
});
const SCENE: Scene = {
  programs: SCENE_BOOK.programs,
  access: SCENE_BOOK.programAccess,
  projects: Object.values(SCENE_BOOK.projects),
};

/**
 * What the sidebar is told for one person, worked out by the same engine the demo
 * uses. The tests then compare it to a table written by hand, so the engine and
 * the table have to agree for a persona to pass.
 */
function programsNavFor(
  employeeId: string,
  actor: Partial<Viewer["actor"]> = {},
): ProgramsNav {
  const viewer: Viewer = {
    actor: {
      employeeId,
      editRecords: false,
      leadsPeople: false,
      headsDepartment: false,
      ...actor,
    },
    today: "2026-10-15",
    dayOf: (instant) => instant.slice(0, 10),
    nameOf: (id) => id ?? "",
  };
  const programs = programsFor(SCENE, viewer);
  return {
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      openTaskCount: p.openTaskCount,
    })),
    canCreate: viewer.actor.editRecords || viewer.actor.seesAll === true,
    seesAll: viewer.actor.seesAll === true,
    unassigned:
      programs.length > 0 &&
      visibleProjects(SCENE, viewer).some(
        (d) => !d.project.programId && d.project.canManage === true,
      ),
    loaded: true,
  };
}

const employeePermissions = new Set(rolePermissions("role-employee"));

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
  {
    name: "Master-grant holder",
    permissions: new Set<PermissionKey>(["SEE_ALL_WORK"]),
    features: everythingOn,
    facts: facts({ "master-view": true }),
    programs: programsNavFor("p-06", { seesAll: true }),
  },
  {
    name: "program lead",
    permissions: employeePermissions,
    features: everythingOn,
    facts: facts({ "team-tasks": true }),
    programs: programsNavFor("p-10"),
  },
  {
    name: "program read",
    permissions: employeePermissions,
    features: everythingOn,
    facts: facts({}),
    programs: programsNavFor("p-07"),
  },
  {
    name: "program write",
    permissions: employeePermissions,
    features: everythingOn,
    facts: facts({}),
    programs: programsNavFor("p-08"),
  },
  {
    name: "project-only member",
    permissions: employeePermissions,
    features: everythingOn,
    facts: facts({}),
    programs: programsNavFor("p-09"),
  },
  {
    name: "HR with programs",
    permissions: new Set(rolePermissions("role-hr-manager")),
    features: everythingOn,
    facts: facts({ "one-on-ones": true, signatures: true }),
    programs: programsNavFor("p-05", { editRecords: true }),
  },
];

export function groupsFor(
  persona: Persona,
  where: {
    programId: string | null;
    hint: { programId: string; path: string } | null;
  } = {
    programId: null,
    hint: null,
  },
): NavGroup[] {
  return visibleNav(
    withPrograms(NAV, persona.programs ?? NO_PROGRAMS, where),
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
    group.items
      /* A program past the cap is found by name, not listed in its level. */
      .filter((item) => item.findOnly !== true)
      .map((item) => `${item.href}|${item.label}`),
  );
}
