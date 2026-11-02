"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  isPersonalSource,
  projectSourceHref,
  readProjectSource,
  type ProjectSource,
} from "@/lib/projects/objectives";
import { useProjectsGate, useProjectActor } from "@/lib/store/project-session";
import { useProjectList } from "@/lib/store/projects";

/**
 * "From project CHK-2", on a weekly task a finished issue filed.
 *
 * A small neutral badge, the same size as the grade badges beside it, in My
 * tasks, an objective's task log and the grading queue. It says where the work
 * came from; the grade is still a person's.
 *
 * ## When it is a link
 *
 * The API says which project and issue a task came from, and says nothing about
 * whether the person reading it may open that project. Projects are visible to
 * their members and to people who hold `EDIT_RECORDS`; anybody else gets a
 * not-found, and a reviewer who grades someone's work is not necessarily on the
 * project it came from. So the tag links only when it will open:
 *
 * - the module is on for the company, and the project still exists (`projectId`
 *   is `null` once it or the issue is deleted), and
 * - the reader holds `EDIT_RECORDS`, or the project is in **their own** project
 *   list (they lead it or are a member).
 *
 * Otherwise it is the same badge as plain text. While the list is still loading
 * it is text, and becomes a link when the list arrives. The list is fetched only
 * when there is a project to ask about, so a screen with no project-sourced task
 * makes no request.
 */
export function ProjectSourceTag({
  source,
  className,
}: {
  /** The task's `projectSource`, as the API sent it: `{ key, projectId }`, `null`, or absent. */
  source: unknown;
  className?: string;
}) {
  const parsed = readProjectSource(source);
  if (!parsed) return null;
  /* A task on somebody's own list has no project page: say so, and do not ask
     for the project list. */
  if (parsed.projectId === null || isPersonalSource(parsed)) {
    return <Tag source={parsed} {...(className ? { className } : {})} />;
  }
  return <Gated source={parsed} {...(className ? { className } : {})} />;
}

type Props = { source: ProjectSource; className?: string };

function Gated({ source, className }: Props) {
  const gate = useProjectsGate();
  if (gate.loading || !gate.enabled) {
    return <Tag source={source} {...(className ? { className } : {})} />;
  }
  return <Resolved source={source} {...(className ? { className } : {})} />;
}

function Resolved({ source, className }: Props) {
  const actor = useProjectActor();
  const { projects } = useProjectList("mine");
  const mayOpen =
    actor.editRecords || projects.some((p) => p.id === source.projectId);
  return (
    <Tag
      source={source}
      href={mayOpen ? projectSourceHref(source) : null}
      {...(className ? { className } : {})}
    />
  );
}

function Tag({
  source,
  href = null,
  className,
}: {
  source: ProjectSource;
  href?: string | null;
  className?: string;
}) {
  const badge = (
    <Badge
      size="sm"
      icon={<FolderKanban />}
      className={cn(
        "font-normal",
        href && "hover:border-line-strong",
        className,
      )}
    >
      {isPersonalSource(source) ? "Personal" : `From project ${source.key}`}
    </Badge>
  );
  if (!href) return badge;
  return (
    <Link
      href={href}
      className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      {badge}
    </Link>
  );
}
