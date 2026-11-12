"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { ProgramDot } from "@/components/projects/program-parts";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import type { Project } from "@/lib/projects/types";

/**
 * A project as a card: its key, name, what it is for, who leads it and how much
 * is open. Not its board type: that is a setting, and on a card it only read as
 * jargon. Used by the Projects list and by every program screen, so a project
 * looks the same wherever it is listed.
 *
 * `showProgram` adds the program it sits in as a small chip, for lists that mix
 * programs (All projects). Inside a program page it would say what the page
 * already says.
 */
export function ProjectCard({
  project,
  leadName,
  showProgram = false,
}: {
  project: Project;
  leadName: string;
  showProgram?: boolean;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <span className="flex flex-wrap items-center gap-2">
        <ProjectKeyChip project={project} />
        {project.departmentName && (
          <Badge tone="neutral" size="sm">
            {project.departmentName}
          </Badge>
        )}
        {showProgram && project.programName && (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-meta text-muted">
            <ProgramDot color={project.programColor ?? "#6B7280"} />
            <span className="truncate">{project.programName}</span>
          </span>
        )}
      </span>
      <span className="text-body-md font-semibold text-ink">
        {project.name}
      </span>
      <span className="line-clamp-2 text-body-sm text-muted">
        {project.description || "No description yet."}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-meta text-muted">
        <span>
          Lead <strong className="font-semibold text-ink">{leadName}</strong>
        </span>
        <span className="tabular">
          <strong className="font-semibold text-ink">
            {project.memberIds.length}
          </strong>{" "}
          {project.memberIds.length === 1 ? "member" : "members"}
        </span>
        {project.openIssueCount !== null && (
          <span className="tabular">
            <strong className="font-semibold text-ink">
              {project.openIssueCount}
            </strong>{" "}
            open
          </span>
        )}
      </span>
    </Link>
  );
}
