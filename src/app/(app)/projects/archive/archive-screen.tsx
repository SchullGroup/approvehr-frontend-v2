"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, FolderKanban, FolderTree } from "lucide-react";
import {
  EmptyState,
  FilterBar,
  LinkTabs,
  LoadState,
  Skeleton,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { ProgramDot } from "@/components/projects/program-parts";
import { WorkTasks } from "@/components/projects/work-list";
import { PROGRAM, TASK } from "@/lib/projects/terms";
import { useProgramList } from "@/lib/store/programs";
import { useArchivedProjects } from "@/lib/store/projects";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * `/projects/archive`: what has left the everyday lists, in one place.
 *
 * - **Tasks**: every task in an archived project or program, and every task that
 *   finished more than 14 days ago (a board and My tasks show 14 days of Done).
 *   The work list's filters, with "Why" in place of "Due".
 * - **Projects** and **Programs**: the archived ones, each opening its own page,
 *   where its lead or HR can restore it.
 *
 * Everything listed is only what the person may open; the API decides that.
 */
const VIEWS = ["tasks", "projects", "programs"] as const;
type ViewId = (typeof VIEWS)[number];
const LABEL: Record<ViewId, string> = {
  tasks: TASK.Many,
  projects: "Projects",
  programs: PROGRAM.Many,
};
const CRUMBS = [{ href: "/projects", label: "Projects" }];

export function ArchiveScreen() {
  const gate = useProjectsGate();
  if (gate.loading) return <Skeleton className="m-5 h-64" />;
  if (!gate.enabled) return <ProjectsOff />;
  return <ArchiveBody />;
}

function ArchiveBody() {
  const params = useSearchParams();
  const asked = params.get("view") ?? "tasks";
  const view = (VIEWS as readonly string[]).includes(asked)
    ? (asked as ViewId)
    : "tasks";
  const hrefFor = (id: ViewId) =>
    id === "tasks" ? "/projects/archive" : `/projects/archive?view=${id}`;

  return (
    <>
      <PageHeader
        title="Archive"
        breadcrumb={CRUMBS}
        description={`Archived ${PROGRAM.many} and projects, their ${TASK.many}, and ${TASK.many} finished more than 14 days ago. Nothing here is deleted.`}
        tabs={
          <LinkTabs
            label="Archive sections"
            items={VIEWS.map((id) => ({ href: hrefFor(id), label: LABEL[id] }))}
            activeHref={hrefFor(view)}
            className="-mb-5 border-b-0"
          />
        }
      />
      <PageBody className="space-y-6">
        {view === "tasks" && <WorkTasks showProgram archive />}
        {view === "projects" && <ArchivedProjects />}
        {view === "programs" && <ArchivedPrograms />}
      </PageBody>
    </>
  );
}

/** A name matches the words typed, in any case, by name or key. */
function matches(needle: string, ...haystack: (string | null | undefined)[]) {
  const words = needle.trim().toLowerCase();
  if (!words) return true;
  return haystack.some((text) => (text ?? "").toLowerCase().includes(words));
}

const LIST_SKELETON = (
  <div className="space-y-2">
    {[0, 1, 2].map((n) => (
      <Skeleton key={n} className="h-14" />
    ))}
  </div>
);

/* ---------------------------------------------------------------- projects -- */

function ArchivedProjects() {
  const archived = useArchivedProjects();
  const timeZone = useOrgTimezone();
  const [search, setSearch] = useState("");
  const shown = archived.projects.filter((p) =>
    matches(search, p.name, p.key, p.programName),
  );
  return (
    <div className="space-y-5">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search projects"
        searchLabel="Search archived projects by name, key or program"
        count={archived.status === "ready" ? shown.length : undefined}
        noun={["project", "projects"]}
      />
      <LoadState
        loading={archived.status === "loading"}
        error={archived.status === "error" ? archived.error : null}
        subject="the archived projects"
        onRetry={archived.reload}
        hasData={archived.projects.length > 0}
        skeleton={LIST_SKELETON}
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={<FolderKanban />}
            title={
              search.trim()
                ? "No archived projects match"
                : "No archived projects"
            }
            description={
              search.trim()
                ? "Try another name or key."
                : "A project its lead archives from its settings is listed here, and can be restored there."
            }
          />
        ) : (
          <ul
            aria-label="Archived projects"
            className="divide-y divide-line rounded-lg border border-line bg-surface"
          >
            {shown.map((project) => (
              <li
                key={project.id}
                className="relative flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: project.color }}
                    className="inline-block size-2.5 shrink-0 rounded-sm"
                  />
                  <Link
                    href={`/projects/${project.id}`}
                    className="min-w-0 truncate text-body-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text after:absolute after:inset-0 after:content-['']"
                  >
                    <span className="tabular mr-2 text-meta font-semibold text-muted">
                      {project.key}
                    </span>
                    {project.name}
                  </Link>
                </span>
                <span className="text-body-sm text-muted sm:w-48 sm:truncate">
                  {project.programName ?? "No program"}
                </span>
                <span className="tabular text-body-sm text-muted sm:w-40">
                  {project.archivedAt
                    ? `Archived ${formatDateShort(project.archivedAt, timeZone)}`
                    : "Archived"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </div>
  );
}

/* ---------------------------------------------------------------- programs -- */

function ArchivedPrograms() {
  const list = useProgramList(true);
  const timeZone = useOrgTimezone();
  const [search, setSearch] = useState("");
  const archived = (list.data?.programs ?? []).filter((p) => p.archived);
  const shown = archived.filter((p) =>
    matches(search, p.name, p.departmentName),
  );
  return (
    <div className="space-y-5">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${PROGRAM.many}`}
        searchLabel={`Search archived ${PROGRAM.many} by name or department`}
        count={list.status === "ready" ? shown.length : undefined}
        noun={[PROGRAM.one, PROGRAM.many]}
      />
      <LoadState
        loading={list.status === "loading"}
        error={list.status === "error" ? list.error : null}
        subject={`the archived ${PROGRAM.many}`}
        onRetry={list.reload}
        hasData={archived.length > 0}
        skeleton={LIST_SKELETON}
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={search.trim() ? <Archive /> : <FolderTree />}
            title={
              search.trim()
                ? `No archived ${PROGRAM.many} match`
                : `No archived ${PROGRAM.many}`
            }
            description={
              search.trim()
                ? "Try another name."
                : `A ${PROGRAM.one} its lead archives from its settings is listed here, and can be restored there.`
            }
          />
        ) : (
          <ul
            aria-label={`Archived ${PROGRAM.many}`}
            className="divide-y divide-line rounded-lg border border-line bg-surface"
          >
            {shown.map((program) => (
              <li
                key={program.id}
                className="relative flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <ProgramDot color={program.color} className="size-2.5" />
                  <Link
                    href={`/projects/programs/${program.id}`}
                    className="min-w-0 truncate text-body-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text after:absolute after:inset-0 after:content-['']"
                  >
                    {program.name}
                  </Link>
                </span>
                <span className="text-body-sm text-muted sm:w-48 sm:truncate">
                  {program.departmentName ?? "No department"}
                </span>
                <span className="tabular text-body-sm text-muted sm:w-40">
                  {program.archivedAt
                    ? `Archived ${formatDateShort(program.archivedAt, timeZone)}`
                    : "Archived"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </div>
  );
}
