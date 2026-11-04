"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui";
import { ProgramDot } from "@/components/projects/program-parts";
import type { Program } from "@/lib/projects/programs";
import { PROGRAM, UNASSIGNED, UNASSIGNED_ID } from "@/lib/projects/terms";

/**
 * A program as a card, and the bucket of projects in none as another.
 *
 * Used by the Programs index and by the Master view's Programs tab, so a program
 * looks the same wherever it is listed. The people count is shown only where the
 * API gave one (to the people who see the list); open and overdue are of what the
 * person asking can open.
 */

const cardClass =
  "group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

function Figure({
  value,
  label,
  tone,
}: {
  value: number | null;
  label: string;
  tone?: "warning";
}) {
  if (value === null) return null;
  return (
    <span className="tabular">
      <strong
        className={
          tone === "warning" && value > 0
            ? "font-semibold text-warning-text"
            : "font-semibold text-ink"
        }
      >
        {value}
      </strong>{" "}
      {label}
    </span>
  );
}

export function ProgramCard({
  program,
  overdue,
}: {
  program: Program;
  overdue: number | null;
}) {
  return (
    <Link href={`/projects/programs/${program.id}`} className={cardClass}>
      <span className="flex items-center gap-2">
        <ProgramDot color={program.color} className="size-3" />
        <span className="min-w-0 truncate text-body-md font-semibold text-ink">
          {program.name}
        </span>
        {program.archived && (
          <Badge tone="neutral" size="sm">
            Archived
          </Badge>
        )}
      </span>
      <span className="line-clamp-2 text-body-sm text-muted">
        {program.description || "No description yet."}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-meta text-muted">
        <span>
          Lead{" "}
          <strong className="font-semibold text-ink">
            {program.leadName ?? "Someone"}
          </strong>
        </span>
        <span className="tabular">
          <strong className="font-semibold text-ink">
            {program.projectCount}
          </strong>{" "}
          {program.projectCount === 1 ? "project" : "projects"}
        </span>
        {program.accessCount !== null && (
          <span className="tabular">
            <strong className="font-semibold text-ink">
              {program.accessCount + 1}
            </strong>{" "}
            {program.accessCount + 1 === 1 ? "person" : "people"}
          </span>
        )}
        <Figure value={program.openTaskCount} label="open" />
        <Figure value={overdue} label="overdue" tone="warning" />
      </span>
    </Link>
  );
}

export function UnassignedCard({
  projects,
  open,
  overdue,
}: {
  projects: number;
  open: number | null;
  overdue: number | null;
}) {
  return (
    <Link href={`/projects/programs/${UNASSIGNED_ID}`} className={cardClass}>
      <span className="flex items-center gap-2">
        <Inbox aria-hidden="true" className="size-4 text-muted" />
        <span className="text-body-md font-semibold text-ink">
          {UNASSIGNED}
        </span>
      </span>
      <span className="line-clamp-2 text-body-sm text-muted">
        Projects that are not in a {PROGRAM.one} yet. Open one to put it in the
        right place.
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-meta text-muted">
        <span className="tabular">
          <strong className="font-semibold text-ink">{projects}</strong>{" "}
          {projects === 1 ? "project" : "projects"}
        </span>
        <Figure value={open} label="open" />
        <Figure value={overdue} label="overdue" tone="warning" />
      </span>
    </Link>
  );
}
