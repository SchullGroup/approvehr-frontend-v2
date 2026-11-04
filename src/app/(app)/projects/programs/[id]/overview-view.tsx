"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadState,
  ProgressMeter,
  Skeleton,
} from "@/components/ui";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import { useProgram } from "@/components/projects/program-context";
import { MetricTiles, WorkloadBars } from "@/components/projects/program-parts";
import { ProjectCard } from "@/components/projects/project-card";
import type { ProjectRollupRow } from "@/lib/projects/programs";
import { PROGRAM, count } from "@/lib/projects/terms";
import {
  useProgramProjects,
  useProgramRollup,
  useWorkRollup,
} from "@/lib/store/programs";

/**
 * A program at a glance: how much is open, overdue, due and done, each project
 * with its progress, and who is carrying the load.
 *
 * Every figure is the API's count over the projects *this person* can open, so a
 * person on one project of the program sees that project and nothing of its
 * siblings. The tiles and the lists they open use the same words, so they agree.
 */
export function OverviewView() {
  const { unassigned } = useProgram();
  return unassigned ? <UnassignedOverview /> : <ProgramOverview />;
}

function Placeholder() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

function ProgramOverview() {
  const { program } = useProgram();
  const rollup = useProgramRollup(program.id);
  const data = rollup.data;
  return (
    <LoadState
      loading={rollup.status === "loading"}
      error={rollup.status === "error" ? rollup.error : null}
      subject="the overview"
      onRetry={rollup.reload}
      skeleton={<Placeholder />}
    >
      {data && (
        <div className="space-y-6">
          <MetricTiles metrics={data.totals} />

          <section className="space-y-3" aria-labelledby="program-projects">
            <h2
              id="program-projects"
              className="text-body-md font-semibold text-ink"
            >
              Projects
            </h2>
            {data.projects.length === 0 ? (
              <EmptyState
                compact
                icon={<FolderKanban />}
                title={`No projects in this ${PROGRAM.one} yet`}
                description={
                  program.canCreateProject
                    ? "Start one with New project, and the people you have given access to will see it."
                    : "Nothing has been started here, or none of it is yours to open."
                }
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.projects.map((row) => (
                  <li key={row.id} className="min-w-0">
                    <ProjectProgress row={row} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.workload.totalPeople > 0 && (
            <Card>
              <CardHeader
                title="Workload"
                description="Open tasks by person, the busiest first."
              />
              <CardBody>
                <WorkloadBars
                  people={data.workload.people}
                  limit={5}
                  unassigned={data.workload.unassigned}
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </LoadState>
  );
}

function ProjectProgress({ row }: { row: ProjectRollupRow }) {
  const done = row.byCategory.DONE;
  return (
    <Link
      href={`/projects/${row.id}`}
      className="group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <span className="flex items-center gap-2">
        <ProjectKeyChip project={row} />
        <span className="min-w-0 truncate text-body-md font-semibold text-ink">
          {row.name}
        </span>
      </span>
      <ProgressMeter
        value={done}
        max={Math.max(row.total, 1)}
        label="Done"
        valueLabel={`${done} of ${count(row.total, "task")}`}
        size="sm"
      />
      <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted">
        <span className="tabular">
          <strong className="font-semibold text-ink">{row.open}</strong> open
        </span>
        <span className="tabular">
          <strong
            className={
              row.overdue > 0
                ? "font-semibold text-warning-text"
                : "font-semibold text-ink"
            }
          >
            {row.overdue}
          </strong>{" "}
          overdue
        </span>
        {row.leadName && <span>Lead {row.leadName}</span>}
      </span>
    </Link>
  );
}

function UnassignedOverview() {
  const { reach, people } = useProgram();
  const rollup = useWorkRollup();
  const projects = useProgramProjects({ unassigned: true }, reach === "all");
  const metrics = rollup.data?.unassigned;
  return (
    <LoadState
      loading={rollup.status === "loading" || projects.status === "loading"}
      error={
        rollup.status === "error"
          ? rollup.error
          : projects.status === "error"
            ? projects.error
            : null
      }
      subject="the overview"
      onRetry={() => {
        rollup.reload();
        projects.reload();
      }}
      skeleton={<Placeholder />}
    >
      <div className="space-y-6">
        {metrics && <MetricTiles metrics={metrics} />}
        <section className="space-y-3" aria-labelledby="loose-projects">
          <h2
            id="loose-projects"
            className="text-body-md font-semibold text-ink"
          >
            Projects in no {PROGRAM.one}
          </h2>
          {(projects.data ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={<FolderKanban />}
              title="Every project you can see has a program"
              description="A project that is not in one shows up here, with a way to put it in the right place from its settings."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(projects.data ?? []).map((project) => (
                <li key={project.id} className="min-w-0">
                  <ProjectCard
                    project={project}
                    leadName={
                      people.byId.get(project.leadId)?.name ??
                      project.leadName ??
                      people.nameOf(project.leadId)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </LoadState>
  );
}
