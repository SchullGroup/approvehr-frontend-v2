"use client";

import {
  Building2,
  CalendarPlus,
  DoorOpen,
  FileUp,
  LogOut,
  Megaphone,
  Plus,
  PlayCircle,
  UserPlus,
} from "lucide-react";
import { RowActions, type RowActionItem } from "@/components/ui";
import { usePermissions } from "@/lib/permissions";
import type { PermissionKey } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import type { FeatureKey } from "@/lib/api/setup";

/**
 * The handful of things somebody opens this product to *start*.
 *
 * ## Why a starting place and not a second navigation
 *
 * The sidebar answers "where is X". This answers "what do I do now", which is
 * a different question and the one the dashboard is for. Everything above it
 * on this screen reports — headcount, what is waiting, what payroll is doing —
 * and reading is not the same as acting. Without this, the only route from
 * "I have a new hire" to the form was to know that adding a person lives
 * under Directory.
 *
 * ## Gated exactly the way the sidebar is
 *
 * Every tile carries the same two questions `visibleNav` asks: a **permission**
 * the person holds, and a **feature** the company turned on. A tile failing
 * either is absent rather than disabled — this codebase's standing rule, and
 * the reason is the same as always: a control that cannot work is worse
 * present than absent, because somebody finds out by clicking.
 *
 * That also keeps the promise the whole product is sold on. A five-person
 * business that said no to departments and hiring during setup sees three
 * tiles here, not seven with four of them dead.
 *
 * ## One menu in the page header, not eight tiles
 *
 * It was a card of eight bordered tiles, which on a phone was most of a screen
 * of things nobody had come to start, and on a desktop was the widest block on
 * the page for the least-used job. It is a **menu in the header** now — the
 * same list, the same gates, the same links — so the page is the report and
 * "Start something" is one button away from anywhere on it. Nothing was added
 * or removed from the list; only where it lives.
 *
 * ## Why duplicating the nav is the point rather than the problem
 *
 * The product owner's own rule: *"there should always be multiple buttons
 * leading to the same action to ensure users aren't looking for stuff."*
 * `StartPeriodButton` already follows it across five screens. What is
 * deliberately **not** here is anything already on this page — starting an
 * appraisal period is the header's own action three inches above, and a second
 * door to it in the same viewport is not discoverability, it is noise.
 */

type Action = {
  href: string;
  label: string;
  /** What it does, in the words somebody would use for the job. */
  detail: string;
  icon: React.ReactNode;
  /** Absent means everybody. */
  permission?: PermissionKey;
  /** Absent means the company always has it. */
  feature?: FeatureKey;
  /** Same meaning as the sidebar's own `soon` — see `nav.tsx`. */
  soon?: boolean;
};

const ACTIONS: readonly Action[] = [
  {
    href: "/people/new",
    label: "Add an employee",
    detail: "One person, on the payroll in a minute",
    icon: <UserPlus aria-hidden="true" />,
    permission: "EDIT_RECORDS",
  },
  {
    /* The single highest-value door in the product for a company in its first
       week, and it was reachable only from the Directory's own header. */
    href: "/people/import",
    label: "Import a staff list",
    detail: "A spreadsheet you already keep",
    icon: <FileUp aria-hidden="true" />,
    permission: "IMPORT_DATA",
  },
  {
    href: "/payroll",
    label: "Run this month's payroll",
    detail: "Prepare it, read the exceptions, approve",
    icon: <PlayCircle aria-hidden="true" />,
    permission: "RUN_PAYROLL",
  },
  {
    href: "/people/leave",
    label: "Book time off",
    detail: "Yours, or somebody else's",
    icon: <CalendarPlus aria-hidden="true" />,
    /* No permission: everybody has leave, including an account with no staff
       record behind it, which simply sees an empty list rather than a refusal. */
  },
  {
    /* The self-service door: `Resign` on `/profile` needs no permission at
       all and was reachable only by finding a closed disclosure there —
       "Record an exit" below is HR starting somebody else's; this is
       everybody's own, and it was the door people kept not finding. */
    href: "/profile",
    label: "Resignation request",
    detail: "Your own resignation or retirement",
    icon: <LogOut aria-hidden="true" />,
  },
  {
    href: "/hiring/postings",
    label: "Post a job advert",
    detail: "Open a role and take applications",
    icon: <Megaphone aria-hidden="true" />,
    permission: "MANAGE_HIRING",
    feature: "hiring",
  },
  {
    href: "/people/departments",
    label: "Add a department",
    detail: "A cost centre payroll reports against",
    icon: <Building2 aria-hidden="true" />,
    permission: "MANAGE_SETTINGS",
    feature: "departments",
  },
  {
    /* Last, and it belongs here despite being nobody's good day: an exit that
       is never recorded is somebody still on the payroll. */
    href: "/people/offboarding",
    label: "Record an exit",
    detail: "Somebody leaving, and what has to come back",
    icon: <DoorOpen aria-hidden="true" />,
    permission: "EDIT_RECORDS",
  },
];

export function QuickActions() {
  const { permissions } = usePermissions();
  const features = useFeatures();

  /* While the flags are still loading, nothing is claimed either way — a menu
     that appears and then loses entries reads as a bug, and this is never the
     thing somebody is waiting on. */
  if (features.loading) return null;

  const items: RowActionItem[] = ACTIONS.filter((action) => {
    if (action.feature !== undefined && features[action.feature] === false) {
      return false;
    }
    return (
      action.permission === undefined || permissions.has(action.permission)
    );
  }).map((action) => ({
    key: action.href,
    label: action.label,
    hint: action.soon ? "Coming soon" : action.detail,
    ...(action.soon ? { disabled: true } : { href: action.href }),
    icon: action.icon,
  }));

  /* `RowActions` draws nothing for an empty list, which is the right answer
     for somebody who may start none of these. */
  return (
    <RowActions
      label="Start something"
      triggerText="Start something"
      triggerIcon={<Plus aria-hidden="true" className="size-4" />}
      items={items}
    />
  );
}
