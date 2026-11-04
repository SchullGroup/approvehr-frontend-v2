"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderTree, Inbox, Plus } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  FilterBar,
  LoadState,
  Skeleton,
  Switch,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { ProgramDot } from "@/components/projects/program-parts";
import { useQueryParam } from "@/components/projects/use-query-param";
import { isModuleOff } from "@/lib/api/projects";
import {
  ALL_PROGRAMS,
  NEW_PROGRAM,
  PROGRAM,
  UNASSIGNED,
  UNASSIGNED_ID,
  count,
} from "@/lib/projects/terms";
import type { Program } from "@/lib/projects/programs";
import {
  useProgramList,
  useProgramProjects,
  useWorkRollup,
} from "@/lib/store/programs";
import { useProjectActor, useProjectsGate } from "@/lib/store/project-session";
import { NewProgramDialog } from "./new-program-dialog";

/**
 * `/projects/programs`: the programs you can see, as cards.
 *
 * A card says what the program is and how it stands: its lead, how many projects
 * and people it has (people only where the person may see the list), and the open
 * and overdue tasks of what *they* can open. People who manage projects that sit
 * in no program also get an **Unassigned** card, so those projects have a door.
 * Starting a program is for the people the API says may; everybody else is not
 * shown a button that would be refused.
 */
export function ProgramsScreen() {
  const gate = useProjectsGate();
  if (gate.loading) return <Skeletons />;
  if (!gate.enabled) return <ProjectsOff />;
  return <Index />;
}

function Skeletons() {
  return (
    <>
      <PageHeader title="Programs" />
      <PageBody>
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading programs"
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-44" />
          ))}
        </div>
      </PageBody>
    </>
  );
}

function Index() {
  const actor = useProjectActor();
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useQueryParam("q", "");
  const [creating, setCreating] = useState(false);
  const list = useProgramList(archived);
  const rollup = useWorkRollup();
  const wide = actor.editRecords || list.data?.seesAll === true;
  const loose = useProgramProjects({ unassigned: true }, wide);

  if (list.status === "error" && isModuleOff(list.error))
    return <ProjectsOff />;

  const canCreate = list.data?.canCreate === true;
  const programs = [...(list.data?.programs ?? [])];
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? programs.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.leadName ?? "").toLowerCase().includes(needle),
      )
    : programs;
  const byId = new Map((rollup.data?.programs ?? []).map((p) => [p.id, p]));
  const looseManaged = (loose.data ?? []).some((p) => p.canManage === true);
  const showLoose =
    looseManaged &&
    programs.length > 0 &&
    (!needle || UNASSIGNED.toLowerCase().includes(needle));
  const anyArchived = programs.some((p) => p.archived);

  return (
    <>
      <PageHeader
        title="Programs"
        breadcrumb={[{ href: "/projects", label: "Projects" }]}
        description={`A ${PROGRAM.one} holds the projects of a department or team, and who can see them.`}
        {...(canCreate
          ? {
              action: (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  {NEW_PROGRAM}
                </Button>
              ),
            }
          : {})}
      />
      <PageBody className="space-y-6">
        {list.status === "ready" && programs.length > 0 && (
          <FilterBar
            search={query}
            onSearchChange={(value) => setQuery(value === "" ? null : value)}
            searchPlaceholder="Search programs"
            searchLabel="Search programs by name or lead"
            count={shown.length}
            noun={["program", "programs"]}
            onClearAll={() => {
              setQuery(null);
              setArchived(false);
            }}
            {...(archived
              ? {
                  applied: [
                    {
                      label: "Show",
                      value: "Archived too",
                      onClear: () => setArchived(false),
                    },
                  ],
                }
              : {})}
          >
            {(canCreate || anyArchived || archived) && (
              <Switch
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
                label="Show archived programs"
              />
            )}
          </FilterBar>
        )}

        <LoadState
          loading={list.status === "loading"}
          error={list.status === "error" ? list.error : null}
          subject="the programs"
          onRetry={list.reload}
          skeleton={
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} className="h-44" />
              ))}
            </div>
          }
        >
          {programs.length === 0 && (
            <EmptyState
              icon={<FolderTree />}
              title={
                canCreate
                  ? `Start your first ${PROGRAM.one}`
                  : `No ${PROGRAM.many} yet`
              }
              description={
                canCreate
                  ? `A ${PROGRAM.one} groups the projects of a department or team, like Operations or Technology, and lets you give people read or read and write access to all of them at once.`
                  : `Programs group projects by department or team. You will see the ones you have access to. Your projects are still under All projects.`
              }
              action={
                canCreate ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    {NEW_PROGRAM}
                  </Button>
                ) : (
                  <Link
                    href="/projects"
                    className="text-body-sm font-medium text-accent-text underline underline-offset-2"
                  >
                    Go to all projects
                  </Link>
                )
              }
            />
          )}

          {programs.length > 0 && shown.length === 0 && !showLoose && (
            <EmptyState
              icon={<FolderTree />}
              title="No programs match"
              description="Try another name, or clear the search."
              action={
                <Button variant="secondary" onClick={() => setQuery(null)}>
                  Clear search
                </Button>
              }
            />
          )}

          {(shown.length > 0 || showLoose) && (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((program) => (
                <li key={program.id} className="min-w-0">
                  <ProgramCard
                    program={program}
                    overdue={byId.get(program.id)?.overdue ?? null}
                  />
                </li>
              ))}
              {showLoose && (
                <li className="min-w-0">
                  <UnassignedCard
                    projects={
                      rollup.data?.unassigned.projects ??
                      loose.data?.length ??
                      0
                    }
                    open={rollup.data?.unassigned.open ?? null}
                    overdue={rollup.data?.unassigned.overdue ?? null}
                  />
                </li>
              )}
            </ul>
          )}
        </LoadState>

        {list.status === "ready" && programs.length > 0 && !canCreate && (
          <p className="text-body-sm text-muted">
            Projects you are on that sit in no {PROGRAM.one} are under{" "}
            <Link
              href="/projects"
              className="font-medium text-accent-text underline underline-offset-2"
            >
              All projects
            </Link>
            .
          </p>
        )}
      </PageBody>

      <NewProgramDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

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

function ProgramCard({
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

function UnassignedCard({
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

export { ALL_PROGRAMS, count };
