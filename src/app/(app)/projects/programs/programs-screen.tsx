"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderTree, Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  FilterBar,
  LoadState,
  Skeleton,
  Switch,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import {
  ProgramCard,
  UnassignedCard,
} from "@/components/projects/program-card";
import { useQueryParam } from "@/components/projects/use-query-param";
import { isModuleOff } from "@/lib/api/projects";
import { NEW_PROGRAM, PROGRAM, UNASSIGNED } from "@/lib/projects/terms";
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
