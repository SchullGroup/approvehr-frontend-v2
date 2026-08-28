"use client";

import Link from "next/link";
import {
  Building2,
  CalendarPlus,
  DoorOpen,
  FileUp,
  Megaphone,
  PlayCircle,
  UserPlus,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui";
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

  /* While the flags are still loading, nothing is claimed either way — a tile
     that appears and then vanishes reads as a bug, and this section is never
     the thing somebody is waiting on. */
  if (features.loading) return null;

  const visible = ACTIONS.filter((action) => {
    if (action.feature !== undefined && features[action.feature] === false) {
      return false;
    }
    return (
      action.permission === undefined || permissions.has(action.permission)
    );
  });

  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Start something"
        description="The things people come here to do, without hunting for them."
        level={3}
      />
      <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text [&>svg]:size-4"
            >
              {action.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">
                {action.label}
              </span>
              <span className="block truncate text-meta text-muted">
                {action.detail}
              </span>
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
