import {
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  ChartNoAxesColumn,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  DoorOpen,
  FileCheck,
  FileText,
  FileUp,
  FolderOpen,
  GraduationCap,
  History,
  Inbox,
  Wallet,
  Laptop,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Network,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/api/setup";
import { MODULES, type ModuleId } from "@/lib/marketing/modules";

/**
 * Badges that are computed from a live store rather than typed in here.
 *
 * The approvals badge said "4" for a long time while the inbox actually held
 * nine items, because the number was a literal in this file and the queue is
 * derived. Anything that can move at runtime has to be a key, not a number.
 */
export type BadgeSource =
  | "approvals"
  | "pendingLeave"
  | "notClockedIn"
  | "unreadNotifications";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A fixed count, for modules with no store behind them yet. */
  badge?: number;
  /** Computed in the shell from a store. Takes precedence over `badge`. */
  badgeSource?: BadgeSource;
  /** Marks a route that exists in the nav but is not built yet. */
  soon?: boolean;

  /**
   * Hidden unless the signed-in person holds this.
   *
   * Not security. The API is the only thing that decides what a request may
   * do; this decides what is worth showing. A staff member who guesses the
   * URL of the payroll screen gets a screen that cannot load anything, which
   * is the right outcome — but they should not have had to guess, and they
   * should not have been shown a door they cannot open.
   */
  permission?: PermissionKey;

  /**
   * Hidden unless the signed-in person holds at least one of these.
   *
   * For the rare item two different permissions each independently justify
   * seeing — approving hiring is not managing it, but both need to reach the
   * same screens to have anything to approve. `permission` stays the field
   * for the ordinary case of exactly one gate; add this one rather than
   * making `permission` accept an array; a call site that means "any of
   * these" should read differently from one that means "this one."
   */
  anyPermission?: PermissionKey[];

  /**
   * Hidden unless the company has this capability switched on.
   *
   * This is Rule 2 from PARITY.md, and it is the whole usability argument
   * against the incumbent: their product shows ~120 routes to a five-person
   * business. Turning a flag off never deletes anything — see the OrgFeatures
   * doc comment in the schema.
   */
  feature?: FeatureKey;

  /**
   * Hidden unless an assistant is actually answering.
   *
   * A third question, and separate from the two above because it is about
   * neither the person nor the company: it is whether a credential is set on the
   * server. `OrgFeatures` has no flag for it and adding one would be a migration
   * plus a setup-wizard decision, so this reads `useAssistantAvailable()` in the
   * shell instead.
   *
   * It exists for one item, and it exists because of the rule the rest of this
   * feature follows — **absent, not disabled**. A permanent "Assistant" row
   * leading to a page that says "not switched on" is a control that is present
   * and always refuses, which is what teaches people the product is broken.
   * `/settings/ai` is where somebody finds out the capability exists; that is a
   * different job and a different screen.
   */
  assistant?: true;

  /**
   * Always visible, whatever the flags say.
   *
   * For the handful of items a company cannot function without. Kept explicit
   * so that "why is this still here" has an answer in the file rather than in
   * somebody's memory.
   *
   * Opts out of the **permission** check only. A `feature` still hides an item,
   * and so does `assistant` — neither is a question about the reader.
   */
  always?: boolean;
};

export type NavGroup = {
  heading?: string;
  items: NavItem[];
};

/* -------------------------------------------------------------------------- */

/**
 * Yours: the day, the queue, and your own record.
 *
 * Ungrouped and unheaded because none of it belongs to a module — a staff
 * member with no permissions at all still needs every one of these, and
 * filing "My profile" under Core HR would make the person the subject of a
 * module rather than the owner of a record.
 */
const PERSONAL: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: <LayoutDashboard aria-hidden="true" />,
    always: true,
  },
  {
    href: "/approvals",
    label: "My approvals",
    icon: <ClipboardCheck aria-hidden="true" />,
    badgeSource: "approvals",
    always: true,
  },
  {
    /* Here rather than under a module, and rather than beside Settings, for the
       reason this block exists: it belongs to no module and it is not
       configuration. Every lookup it makes runs as the person asking, with their
       permissions, so a staff member asking how much leave they have left and an
       administrator asking who has no bank account are the same screen — which
       is why it carries no `permission` either.
       `assistant: true` is what keeps it out of the sidebar of a company with no
       key set; see the field on `NavItem`. */
    href: "/assistant",
    label: "Assistant",
    icon: <Sparkles aria-hidden="true" />,
    assistant: true,
    always: true,
  },
  /*
   * Notifications, My profile and My documents used to sit here, above the
   * modules, and they were the three most prominent things in the sidebar
   * while being the three a person opens least.
   *
   * They live in the account menu now. Nothing is lost: the notification
   * count still shows on the bell in the header, `/documents` is still where
   * the "send us your work permit" notification lands, and every one of the
   * three routes still exists and is still reachable — see `shell.tsx`.
   *
   * PARITY.md Rule 2. The sidebar is for the work, not for the account.
   */
];

/**
 * One entry per module the marketing site sells, keyed by its id.
 *
 * **The headings are not written here.** They come from `MODULES` in
 * `lib/marketing/modules.ts` — the same array the website's product dropdown,
 * the module grid and `/product/[module]` render from — so the sidebar can only
 * ever say "Time & Leave" if that is what the customer was sold. It used to say
 * Hiring / People / Pay / Grow, four headings against the site's six names, and
 * somebody who bought "Time & Leave" signed in to find no such thing.
 *
 * `Record<ModuleId, …>` is the guard that keeps them in step: add a seventh
 * module to the marketing site and this file stops compiling until somebody
 * decides which screens live in it. A missing group would otherwise be
 * invisible — `visibleNav` drops empty groups by design, so an unfiled module
 * would look exactly like one the company has switched off.
 *
 * Order comes from `MODULES` too, so the sidebar reads down in the same order
 * the dropdown reads down.
 *
 * Two rules for anything added here:
 *
 * - **Every href appears once.** `resolveActiveHref` in `shell.tsx` picks the
 *   longest match and the row compares `item.href === activeHref`, so listing
 *   one route in two groups highlights both — the multi-active bug HANDOVER
 *   records, re-introduced by duplication rather than by prefixes.
 * - **A `permission` or `feature` moves with its item.** Dropping one turns a
 *   hidden door into a visible one.
 */
const MODULE_ITEMS: Record<ModuleId, NavItem[]> = {
  /* "Every employee record, contract and document in one system" — plus the
     org structure and the leaving process, which are the same record's first
     and last day. */
  "core-hr": [
    {
      href: "/people",
      label: "Employees",
      icon: <Users aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      /* The screen is titled "Departments and teams" and is being reworked;
         the route is not moving. */
      href: "/people/departments",
      label: "Departments",
      icon: <Building2 aria-hidden="true" />,
      permission: "EDIT_RECORDS",
      feature: "departments",
    },
    {
      /* Restored alongside the status field on the create form (see
         `people/new/form.tsx`) so a new hire can actually be put into
         ONBOARDING and this tab has something to show. */
      href: "/people/onboarding",
      label: "Onboarding",
      icon: <UserRoundPlus aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      /* Was reachable only from a notification. `EDIT_RECORDS` matches the
         Directory beside it: a leavers list is the directory read backwards,
         and the screen's own actions are already gated on it. */
      href: "/people/offboarding",
      label: "Exit management",
      icon: <DoorOpen aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      /* The HR register — what is on file and what is outstanding. The
         personal view is "My documents" in the block above. */
      href: "/people/documents",
      label: "Documents",
      icon: <FolderOpen aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      /* Laptops, phones and SIM cards. Gated to the register's audience
         because a staff member's own kit already renders on `/profile`, and
         the point of this nav is that a five-person company is not shown
         thirty rows. */
      href: "/people/assets",
      label: "Equipment",
      icon: <Laptop aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      href: "/people/import",
      label: "Import",
      icon: <FileUp aria-hidden="true" />,
      permission: "IMPORT_DATA",
    },
  ],

  payroll: [
    {
      /* The screen itself gates on `VIEW_SALARIES` (`payroll-screen.tsx`),
         not `RUN_PAYROLL` — a viewer without RUN_PAYROLL is a deliberate
         role (see the router's own docstring), and needs to find this. */
      href: "/payroll",
      label: "Monthly payroll",
      icon: <Banknote aria-hidden="true" />,
      permission: "VIEW_SALARIES",
    },
    {
      /* `pay-setup-screen.tsx` gates on `VIEW_SALARIES` too, not
         `MANAGE_PAY_STRUCTURE` — the screen has its own read/write split
         inside it; the nav only needs to decide who can open the door. */
      href: "/payroll/pay-setup",
      label: "Pay setup",
      icon: <SlidersHorizontal aria-hidden="true" />,
      permission: "VIEW_SALARIES",
    },
    {
      href: "/payroll/payslips",
      label: "Payslips",
      icon: <Receipt aria-hidden="true" />,
      always: true,
    },
    {
      href: "/payroll/loans",
      label: "Loans",
      icon: <CreditCard aria-hidden="true" />,
      feature: "loans",
    },
    {
      href: "/payroll/expenses",
      label: "Expenses",
      icon: <ReceiptText aria-hidden="true" />,
      feature: "expenses",
    },
    {
      /* "Wallet", not "Payments", and the rename is the feature.
         ------------------------------------------------------------------
         This used to be a batch console — build a payment, check it, approve
         it, download a file — and it was four acts of bookkeeping standing
         between an approved payroll and the people it pays. Approving a run
         builds its payment now and the run offers both ways out, so what is
         left here is the thing that genuinely has no other home: what the
         company holds, where money goes in, and what has moved. */
      href: "/payroll/payments",
      label: "Wallet",
      icon: <Wallet aria-hidden="true" />,
      permission: "RUN_PAYROLL",
    },
    {
      /* Money, not paperwork — "Payslips" above is the other half and the two
         answer different questions. Sits under the wallet because it reads that
         module's own rows; `resolveActiveHref` picks the longest match, so a
         payment page still lights up Wallet and this only lights itself. */
      href: "/payroll/payments/history",
      label: "Payment history",
      icon: <History aria-hidden="true" />,
      permission: "RUN_PAYROLL",
    },
    {
      /* `statutory-screen.tsx` gates on `VIEW_SALARIES`, same reasoning as
         "Monthly payroll" above. */
      href: "/payroll/statutory",
      label: "Statutory filings",
      icon: <FileText aria-hidden="true" />,
      permission: "VIEW_SALARIES",
    },
  ],

  /* The site calls this "Recruitment"; the routes are `/hiring/*` and the
     module id is `hiring`. The heading follows the site, the URLs do not
     move — a live job advert's link is not worth a rename.
     One item, not four: pipeline, job adverts, interviews and offers used
     to be separate links, and every one of them opened onto the same
     `ComingSoon` wall (`app/(app)/hiring/layout.tsx`) — four doors into one
     room. `/hiring` now opens the room itself: a walkthrough of what each
     of those four will do, built from the same copy the marketing site
     already makes about this module. */
  hiring: [
    {
      href: "/hiring",
      label: "Overview",
      icon: <BriefcaseBusiness aria-hidden="true" />,
      anyPermission: ["MANAGE_HIRING", "APPROVE_HIRING"],
      feature: "hiring",
    },
    {
      href: "/hiring/requisitions/new",
      label: "New role",
      icon: <UserRoundPlus aria-hidden="true" />,
      permission: "MANAGE_HIRING",
      feature: "hiring",
    },
    {
      href: "/hiring/postings",
      label: "Job adverts",
      icon: <Megaphone aria-hidden="true" />,
      permission: "MANAGE_HIRING",
      feature: "hiring",
    },
    {
      href: "/hiring/postings/applications",
      label: "Applications",
      icon: <Inbox aria-hidden="true" />,
      permission: "MANAGE_HIRING",
      feature: "hiring",
    },
    {
      href: "/hiring/interviews",
      label: "Interviews",
      icon: <CalendarClock aria-hidden="true" />,
      anyPermission: ["MANAGE_HIRING", "APPROVE_HIRING"],
      feature: "hiring",
    },
    {
      href: "/hiring/offers",
      label: "Offers",
      icon: <FileCheck aria-hidden="true" />,
      anyPermission: ["MANAGE_HIRING", "APPROVE_HIRING"],
      feature: "hiring",
    },
  ],

  /* Attendance, shifts, leave and overtime were split across "People" and
     nowhere. The site sells them as one module and the product computes them
     from one clock, so they are one group. */
  time: [
    {
      href: "/people/attendance",
      label: "Attendance",
      icon: <Clock aria-hidden="true" />,
      badgeSource: "notClockedIn",
      always: true,
    },
    {
      /* A month at a glance and any past day's roster. Its own route rather
         than a third tab on Attendance: that screen opens with a clock-in
         button, which is the wrong control to sit above a day in March, and a
         day somebody wants to send a colleague has to be linkable.
         `/payroll/payments/history` is the same split for the same reason.

         Unlike Attendance above it, there is no personal reading of this
         screen — it is a company-wide who-came-in calendar, never "my own
         attendance", so it needs a gate `always` would skip. `EDIT_RECORDS`
         is the nearest static permission to the page's own
         `useIsManager() || useCan("EDIT_RECORDS")` check (see
         `history-screen.tsx`); a manager with no `EDIT_RECORDS` still reaches
         the screen by URL, because a nav item is a visibility hint only and
         the page enforces the real rule. */
      href: "/people/attendance/history",
      label: "Attendance history",
      icon: <CalendarSearch aria-hidden="true" />,
      permission: "EDIT_RECORDS",
    },
    {
      /* Was reachable only from a link on the attendance screen. `shifts` is
         the flag the screen itself reads, so the nav asks the same question
         rather than a second one. */
      href: "/people/shifts",
      label: "Shifts",
      icon: <CalendarRange aria-hidden="true" />,
      feature: "shifts",
    },
    {
      href: "/people/leave",
      label: "Leave",
      icon: <CalendarDays aria-hidden="true" />,
      badgeSource: "pendingLeave",
      always: true,
    },
    {
      href: "/people/overtime",
      label: "Overtime",
      icon: <Timer aria-hidden="true" />,
      /* No feature flag: overtime has its own on/off in its policy, and
         OrgFeatures has no key for it. Gating on the permission alone means
         a company that has not switched it on still sees an empty screen
         explaining how to, rather than nothing at all. */
      permission: "VIEW_SALARIES",
    },
  ],

  /* Seven real routes, not one page with a tab strip inside it — the same
     move made for hiring above, and for the same reason: a tab strip is
     invisible to anybody who has not already opened the page, and "where do
     I manage a section, a competency, a cycle" was a discoverability
     complaint about exactly that invisibility. Each item below used to be a
     `?tab=` value on `/performance`; the ids are unchanged; only the door is
     new. */
  performance: [
    {
      href: "/performance",
      label: "Overview",
      icon: <Target aria-hidden="true" />,
      always: true,
    },
    {
      href: "/performance/kpis",
      label: "KPIs",
      icon: <TrendingUp aria-hidden="true" />,
      always: true,
    },
    {
      href: "/performance/review-tasks",
      label: "Review tasks",
      icon: <ClipboardList aria-hidden="true" />,
      always: true,
    },
    {
      /* `SkillsTab` itself decides mine/team/company; the nav only asks
         whether the company scores competencies at all. */
      href: "/performance/skills",
      label: "Competency ratings",
      icon: <GraduationCap aria-hidden="true" />,
      feature: "appraisals",
    },
    {
      /* Matches the old tab's own gate exactly: appraisals on, and either
         runs a period (`MANAGE_SETTINGS`) or reads across the company
         (`EDIT_RECORDS`). Staff with neither never had this tab either. */
      href: "/performance/periods",
      label: "Appraisal periods",
      icon: <CalendarRange aria-hidden="true" />,
      feature: "appraisals",
      anyPermission: ["MANAGE_SETTINGS", "EDIT_RECORDS"],
    },
    {
      /* Was reachable only from a notification. It is a queue with one job,
         same shape as Hiring's Applications, and it deserves the same
         permanent door. */
      href: "/performance/approvals",
      label: "Objectives to agree",
      icon: <CheckCheck aria-hidden="true" />,
      feature: "appraisals",
    },
    {
      /* `multiAppraiser` cannot be on while `appraisals` is off — the setup
         module refuses that combination — so one feature flag is enough to
         carry both. */
      href: "/performance/appraisers",
      label: "Who appraises whom",
      icon: <Network aria-hidden="true" />,
      feature: "multiAppraiser",
      permission: "EDIT_RECORDS",
    },
  ],

  /* The help desk *is* Employee Support: a queue of HR requests with owners
     and response targets, and the knowledge base the answers become. Both
     used to sit in the bottom block next to Settings, which read as "help
     with the software" and hid a module the site sells by name. */
  desk: [
    {
      href: "/help",
      label: "Help desk",
      icon: <LifeBuoy aria-hidden="true" />,
      always: true,
    },
    {
      href: "/help/kb",
      label: "Help articles",
      icon: <BookOpen aria-hidden="true" />,
    },
  ],
};

/**
 * Company-wide, and genuinely no module's.
 *
 * Reports reads across all six; Settings and Roles configure all six. Nothing
 * here would be true of one heading and false of the others, which is the test
 * for belonging in this block rather than in a module.
 */
const COMPANY_WIDE: NavItem[] = [
  {
    href: "/reports",
    label: "Reports",
    icon: <ChartNoAxesColumn aria-hidden="true" />,
    permission: "EXPORT_DATA",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings aria-hidden="true" />,
    permission: "MANAGE_SETTINGS",
  },
  {
    href: "/settings/roles",
    label: "Roles",
    icon: <ShieldCheck aria-hidden="true" />,
    permission: "MANAGE_ROLES",
  },
];

/**
 * Yours, then the six modules the site sells, then the company's.
 *
 * Assembled rather than written out so the headings and their order come from
 * one place — see `MODULE_ITEMS` above.
 *
 * ## A module nobody can use yet sorts to the bottom
 *
 * `MODULES` is the site's own running order and is the right order for a page
 * arguing the product's shape. It is the wrong order for a sidebar somebody
 * works in all day: Recruitment sits third there and is the one group that
 * opens onto a "Coming soon" wall, so the nav put a door that goes nowhere
 * above four that go somewhere.
 *
 * A group sinks when **every** item in it is `soon`. That is a rule rather
 * than a hardcoded "hiring last", and the difference matters in both
 * directions: the day the module ships, deleting `soon: true` puts it back in
 * the site's order with no change here, and a different module that starts as
 * a preview sinks without anybody remembering to add it.
 *
 * A group with a mix — one unbuilt screen among four real ones — does not
 * sink. Sorting on "some" would drop a group people use for the sake of one
 * item in it, which is the opposite of the point.
 *
 * `sort` is stable in every engine this runs on, so the groups that stay keep
 * the site's order exactly.
 */
const comingSoon = (group: { items: readonly NavItem[] }): boolean =>
  group.items.length > 0 && group.items.every((item) => item.soon === true);

export const NAV: NavGroup[] = [
  { items: PERSONAL },
  ...MODULES.map((module) => ({
    heading: module.label,
    items: MODULE_ITEMS[module.id],
  })).sort((a, b) => Number(comingSoon(a)) - Number(comingSoon(b))),
  { items: COMPANY_WIDE },
];

/* -------------------------------------------------------------------------- */

/**
 * Drops what this person cannot use, and what this company has not turned on.
 *
 * Two separate questions, deliberately kept separate:
 *
 * - **Permission** is about the person. A staff member does not see the payroll
 *   screens because they are not theirs to open.
 * - **Feature** is about the company. Nobody sees Loans until somebody answers
 *   "yes" to the loans question, because a business that does not lend to staff
 *   should not carry the concept around.
 *
 * - **Assistant** is about the server. Nobody sees the assistant until a
 *   credential is set on the API, because until then there is nothing behind the
 *   door. `assistantWired` is `useAssistantAvailable().available`, read from a
 *   cache the shell already holds — see `lib/store/ai.ts`.
 *
 * An item needs to pass all three. `always: true` opts out of the permission
 * check only — a feature flag still hides an item, because a capability the
 * company has switched off has no screen to show, and neither of the other two
 * questions is about the reader.
 *
 * A group whose every item is filtered out disappears with its heading. A
 * heading over nothing is worse than no heading, and with the groups now named
 * after the modules it is also the mechanism that keeps the promise: a company
 * with hiring switched off has no "Recruitment" heading rather than an empty
 * one, and a five-person business sees four or five headings, not six.
 *
 * While permissions are still loading, `permissions` is the token's claim set,
 * which is the same answer in all but the rarest case (a role edited in another
 * tab mid-session). Rendering the fuller nav and settling is better than
 * flashing an empty sidebar at everybody on every load.
 */
export function visibleNav(
  groups: readonly NavGroup[],
  permissions: ReadonlySet<PermissionKey>,
  features: Partial<Record<FeatureKey, boolean>>,
  /**
   * Whether an assistant is answering. **Defaults to false**, deliberately: the
   * status arrives a moment after the sidebar does, and an item that appears
   * late is better than one that appears and then vanishes under somebody's
   * pointer. Same reasoning `useAssistantAvailable` gives for returning `false`
   * while it is still loading.
   */
  assistantWired = false,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature !== undefined && features[item.feature] === false) {
          return false;
        }
        if (item.assistant && !assistantWired) return false;
        if (item.always) return true;
        if (item.anyPermission) {
          return item.anyPermission.some((p) => permissions.has(p));
        }
        if (item.permission === undefined) return true;
        return permissions.has(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}
