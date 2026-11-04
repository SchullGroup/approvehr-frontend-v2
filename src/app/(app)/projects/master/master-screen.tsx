"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FolderTree, Users } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkTabs,
  LoadState,
  Skeleton,
  Stat,
  StatGrid,
} from "@/components/ui";
import { RequirePermission } from "@/components/portal/require-permission";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import {
  ProgramCard,
  UnassignedCard,
} from "@/components/projects/program-card";
import {
  MetricTiles,
  ProgramDot,
  WorkloadBars,
} from "@/components/projects/program-parts";
import { WorkTasks } from "@/components/projects/work-list";
import { isModuleOff } from "@/lib/api/projects";
import type { ProgramSummary, WorkloadPerson } from "@/lib/projects/programs";
import {
  MASTER_DESCRIPTION,
  MASTER_NAME,
  MASTER_TAB_LABEL,
  PROGRAM,
  UNASSIGNED,
  UNASSIGNED_ID,
  count,
  type MasterViewId,
} from "@/lib/projects/terms";
import {
  useProgramList,
  useProgramRollups,
  useWorkRollup,
} from "@/lib/store/programs";
import { useProjectsGate } from "@/lib/store/project-session";

/**
 * `/projects/master`: everything the person is allowed to see, across programs.
 *
 * Only for holders of the Master grant (`SEE_ALL_WORK`, which the Owner role
 * holds). Everybody else gets the app's calm "not part of your access" page, and
 * **nothing is asked of the API until the grant is known**: the data hooks live
 * in the views, which are not mounted until the gate lets them be, so there is
 * never a flash of figures for somebody who may not see them. The view reads
 * everything and changes nothing.
 */
export function MasterScreen() {
  const gate = useProjectsGate();
  if (gate.loading) return <Skeleton className="m-5 h-64" />;
  if (!gate.enabled) return <ProjectsOff />;
  return (
    <RequirePermission
      permission="SEE_ALL_WORK"
      title="This is not part of your access"
      what="The company-wide overview"
      pageTitle={MASTER_NAME}
    >
      <Master />
    </RequirePermission>
  );
}

const VIEWS: MasterViewId[] = ["overview", "programs", "tasks", "workload"];
const CRUMBS = [{ href: "/projects", label: "Projects" }];

function Master() {
  const params = useSearchParams();
  const asked = params.get("view") ?? "overview";
  const view = (VIEWS as string[]).includes(asked)
    ? (asked as MasterViewId)
    : "overview";
  const hrefFor = (id: MasterViewId) =>
    id === "overview" ? "/projects/master" : `/projects/master?view=${id}`;

  return (
    <>
      <PageHeader
        title={MASTER_NAME}
        breadcrumb={CRUMBS}
        description={MASTER_DESCRIPTION}
        tabs={
          <LinkTabs
            label="Overview sections"
            items={VIEWS.map((id) => ({
              href: hrefFor(id),
              label: MASTER_TAB_LABEL[id],
            }))}
            activeHref={hrefFor(view)}
            className="-mb-5 border-b-0"
          />
        }
      />
      <PageBody className="space-y-6">
        {view === "overview" && <OverviewTab />}
        {view === "programs" && <ProgramsTab />}
        {view === "tasks" && <WorkTasks showProgram />}
        {view === "workload" && <WorkloadTab />}
      </PageBody>
    </>
  );
}

/* ---------------------------------------------------------------- overview -- */

function OverviewTab() {
  const rollup = useWorkRollup();
  const data = rollup.data;
  if (rollup.status === "error" && isModuleOff(rollup.error)) {
    return <ProjectsOff />;
  }
  return (
    <LoadState
      loading={rollup.status === "loading"}
      error={rollup.status === "error" ? rollup.error : null}
      subject="the overview"
      onRetry={rollup.reload}
      skeleton={
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-48" />
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          <MetricTiles
            metrics={data.totals}
            hrefFor={(bucket) => `/projects/master?view=tasks&bucket=${bucket}`}
          />
          <section className="space-y-3" aria-labelledby="by-program">
            <h2 id="by-program" className="text-body-md font-semibold text-ink">
              By {PROGRAM.one}
            </h2>
            {data.programs.length === 0 && data.unassigned.projects === 0 ? (
              <EmptyState
                compact
                icon={<FolderTree />}
                title="Nothing to show yet"
                description={`No ${PROGRAM.many} or projects have been started.`}
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.programs.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <ProgramTile program={p} />
                  </li>
                ))}
                {data.unassigned.projects > 0 && (
                  <li className="min-w-0">
                    <UnassignedTile
                      projects={data.unassigned.projects}
                      open={data.unassigned.open}
                      overdue={data.unassigned.overdue}
                      done={data.unassigned.doneThisWeek}
                    />
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      )}
    </LoadState>
  );
}

const tileClass =
  "group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

function Figures({
  open,
  overdue,
  done,
}: {
  open: number;
  overdue: number;
  done: number;
}) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        ["Open", open, false],
        ["Overdue", overdue, overdue > 0],
        ["Done this week", done, false],
      ].map(([label, value, warn]) => (
        <div key={label as string} className="min-w-0">
          <dd
            className={
              warn
                ? "tabular text-title-sm font-semibold text-warning-text"
                : "tabular text-title-sm font-semibold text-ink"
            }
          >
            {value as number}
          </dd>
          <dt className="text-meta text-muted">{label as string}</dt>
        </div>
      ))}
    </dl>
  );
}

function ProgramTile({ program }: { program: ProgramSummary }) {
  return (
    <Link href={`/projects/programs/${program.id}`} className={tileClass}>
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
      <Figures
        open={program.open}
        overdue={program.overdue}
        done={program.doneThisWeek}
      />
      <span className="mt-auto text-meta text-muted">
        {count(program.projects, "project")}
        {program.leadName ? `, led by ${program.leadName}` : ""}
      </span>
    </Link>
  );
}

function UnassignedTile({
  projects,
  open,
  overdue,
  done,
}: {
  projects: number;
  open: number;
  overdue: number;
  done: number;
}) {
  return (
    <Link href={`/projects/programs/${UNASSIGNED_ID}`} className={tileClass}>
      <span className="text-body-md font-semibold text-ink">{UNASSIGNED}</span>
      <Figures open={open} overdue={overdue} done={done} />
      <span className="mt-auto text-meta text-muted">
        {count(projects, "project")} in no {PROGRAM.one}
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------------- programs -- */

function ProgramsTab() {
  const list = useProgramList(true);
  const rollup = useWorkRollup();
  const programs = list.data?.programs ?? [];
  const overdueOf = new Map(
    (rollup.data?.programs ?? []).map((p) => [p.id, p.overdue]),
  );
  return (
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
      {programs.length === 0 ? (
        <EmptyState
          icon={<FolderTree />}
          title={`No ${PROGRAM.many} yet`}
          description="Programs group projects by department or team. None has been started."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <li key={program.id} className="min-w-0">
              <ProgramCard
                program={program}
                overdue={overdueOf.get(program.id) ?? null}
              />
            </li>
          ))}
          {(rollup.data?.unassigned.projects ?? 0) > 0 && (
            <li className="min-w-0">
              <UnassignedCard
                projects={rollup.data!.unassigned.projects}
                open={rollup.data!.unassigned.open}
                overdue={rollup.data!.unassigned.overdue}
              />
            </li>
          )}
        </ul>
      )}
    </LoadState>
  );
}

/* ---------------------------------------------------------------- workload -- */

function WorkloadTab() {
  const list = useProgramList();
  const ids = (list.data?.programs ?? []).map((p) => p.id);
  const rollups = useProgramRollups(ids);
  const rollup = useWorkRollup();

  /* People merged across programs: each program's busiest ten, summed. */
  const merged = new Map<string, WorkloadPerson>();
  let unassigned = 0;
  for (const r of rollups.data) {
    unassigned += r.workload.unassigned;
    for (const p of r.workload.people) {
      const held = merged.get(p.employeeId);
      merged.set(
        p.employeeId,
        held
          ? {
              ...held,
              open: held.open + p.open,
              overdue: held.overdue + p.overdue,
            }
          : { ...p },
      );
    }
  }
  const people = [...merged.values()].sort(
    (a, b) => b.open - a.open || a.name.localeCompare(b.name),
  );
  const loading = list.status === "loading" || rollups.status === "loading";
  const error =
    list.status === "error"
      ? list.error
      : rollups.status === "error"
        ? rollups.error
        : null;

  return (
    <LoadState
      loading={loading}
      error={error}
      subject="the workload"
      onRetry={() => {
        list.reload();
        rollups.reload();
      }}
      skeleton={<Skeleton className="h-64" />}
    >
      <div className="space-y-6">
        {rollup.data && (
          <StatGrid columns={3}>
            <Stat
              label="People with open tasks"
              value={<span className="tabular">{people.length}</span>}
            />
            <Stat
              label="Open"
              value={<span className="tabular">{rollup.data.totals.open}</span>}
            />
            <Stat
              label="Overdue"
              value={
                <span className="tabular">{rollup.data.totals.overdue}</span>
              }
            />
          </StatGrid>
        )}
        <Card>
          <CardHeader
            title="Workload"
            description="Open tasks by person across every program, the busiest first. A name opens that person's tasks."
          />
          <CardBody>
            {people.length === 0 ? (
              <EmptyState
                compact
                icon={<Users />}
                title="Nothing open"
                description="Nobody has open tasks in the programs you can see."
              />
            ) : (
              <>
                <WorkloadBars
                  people={people}
                  unassigned={unassigned}
                  hrefFor={(id) => `/projects/master?view=tasks&assignee=${id}`}
                />
                <p className="mt-4 text-meta text-muted">
                  Each program counts its ten busiest people, so somebody who is
                  not among a program&apos;s ten busiest is left out of that
                  program&apos;s share here. Their tasks are all in All tasks.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </LoadState>
  );
}
