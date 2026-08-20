import {
  Banknote,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChartNoAxesColumn,
  Clock,
  CreditCard,
  FileText,
  FileUp,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/api/setup";

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
   * Hidden unless the company has this capability switched on.
   *
   * This is Rule 2 from PARITY.md, and it is the whole usability argument
   * against the incumbent: their product shows ~120 routes to a five-person
   * business. Turning a flag off never deletes anything — see the OrgFeatures
   * doc comment in the schema.
   */
  feature?: FeatureKey;

  /**
   * Always visible, whatever the flags say.
   *
   * For the handful of items a company cannot function without. Kept explicit
   * so that "why is this still here" has an answer in the file rather than in
   * somebody's memory.
   */
  always?: boolean;
};

export type NavGroup = {
  heading?: string;
  items: NavItem[];
};

/*
 * Grouped by what someone is trying to do, not by which team owns the module.
 * "Hiring" sits above "Payroll" because a recruiter opens this product far
 * more often than a finance lead does.
 */
export const NAV: NavGroup[] = [
  {
    items: [
      {
        href: "/dashboard",
        label: "Home",
        icon: <LayoutDashboard aria-hidden="true" />,
        always: true,
      },
      {
        href: "/approvals",
        label: "My approvals",
        icon: <Target aria-hidden="true" />,
        badgeSource: "approvals",
        always: true,
      },
      {
        href: "/notifications",
        label: "Notifications",
        icon: <Bell aria-hidden="true" />,
        badgeSource: "unreadNotifications",
        always: true,
      },
      {
        /* Everybody's own record. The one screen a staff member with no
           permissions at all still needs, which is why it has no gate. */
        href: "/profile",
        label: "My profile",
        icon: <UserRound aria-hidden="true" />,
        always: true,
      },
    ],
  },
  {
    heading: "Hiring",
    items: [
      {
        href: "/hiring",
        label: "Pipeline",
        icon: <BriefcaseBusiness aria-hidden="true" />,
        permission: "MANAGE_HIRING",
        feature: "hiring",
      },
      {
        href: "/hiring/interviews",
        label: "Interviews",
        icon: <CalendarClock aria-hidden="true" />,
        permission: "MANAGE_HIRING",
        feature: "hiring",
      },
      {
        href: "/hiring/offers",
        label: "Offers",
        icon: <FileText aria-hidden="true" />,
        permission: "MANAGE_HIRING",
        feature: "hiring",
      },
    ],
  },
  {
    heading: "People",
    items: [
      {
        href: "/people",
        label: "Directory",
        icon: <Users aria-hidden="true" />,
        permission: "EDIT_RECORDS",
      },
      {
        href: "/people/onboarding",
        label: "Onboarding",
        icon: <UserRoundPlus aria-hidden="true" />,
        permission: "EDIT_RECORDS",
      },
      {
        href: "/people/import",
        label: "Import",
        icon: <FileUp aria-hidden="true" />,
        permission: "IMPORT_DATA",
      },
      {
        href: "/people/departments",
        label: "Departments",
        icon: <Building2 aria-hidden="true" />,
        permission: "EDIT_RECORDS",
        feature: "departments",
      },
      {
        href: "/people/attendance",
        label: "Attendance",
        icon: <Clock aria-hidden="true" />,
        badgeSource: "notClockedIn",
        always: true,
      },
      {
        href: "/people/leave",
        label: "Time off",
        icon: <CalendarClock aria-hidden="true" />,
        badgeSource: "pendingLeave",
        always: true,
      },
    ],
  },
  {
    heading: "Pay",
    items: [
      {
        href: "/payroll",
        label: "Payroll runs",
        icon: <Banknote aria-hidden="true" />,
        permission: "RUN_PAYROLL",
      },
      {
        href: "/payroll/pay-setup",
        label: "Pay setup",
        icon: <Landmark aria-hidden="true" />,
        permission: "MANAGE_PAY_STRUCTURE",
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
        href: "/payroll/statutory",
        label: "Statutory filings",
        icon: <FileText aria-hidden="true" />,
        permission: "RUN_PAYROLL",
      },
    ],
  },
  {
    heading: "Grow",
    items: [
      {
        href: "/performance",
        label: "Performance",
        icon: <Target aria-hidden="true" />,
        always: true,
      },
      {
        href: "/reports",
        label: "Reports",
        icon: <ChartNoAxesColumn aria-hidden="true" />,
        permission: "EXPORT_DATA",
      },
    ],
  },
  {
    items: [
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
      {
        href: "/help",
        label: "Help",
        icon: <LifeBuoy aria-hidden="true" />,
        always: true,
      },
    ],
  },
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
 * An item needs to pass both. `always: true` opts out of the permission check
 * only — a feature flag still hides an item, because a capability the company
 * has switched off has no screen to show.
 *
 * A group whose every item is filtered out disappears with its heading. A
 * heading over nothing is worse than no heading.
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
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature !== undefined && features[item.feature] === false) {
          return false;
        }
        if (item.always) return true;
        if (item.permission === undefined) return true;
        return permissions.has(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}
