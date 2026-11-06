"use client";

import { useOrgTimezone } from "@/lib/store/session";
import { nowHHMMIn } from "@/lib/projects/due";
import { useMemo } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Select,
  Stat,
  StackedBar,
  type Segment,
} from "@/components/ui";
import {
  BurndownChart,
  VelocityChart,
  WorkloadList,
} from "@/components/projects/report-charts";
import { useProject } from "@/components/projects/project-context";
import { useQueryParam } from "@/components/projects/use-query-param";
import { daysLeft } from "@/lib/projects/dates";
import {
  burndown,
  burndownSprints,
  defaultBurndownSprint,
  reportTiles,
  statusBreakdown,
  typeBreakdown,
  velocity,
  workload,
  type Burndown,
} from "@/lib/projects/reports";
import {
  CATEGORY_LABEL,
  CYCLE,
  EFFORT,
  INITIATIVE,
  REPORT_TITLE,
  STAGE,
  TAB_LABEL,
  TASK,
  TYPE_LABEL,
  count as countNoun,
} from "@/lib/projects/terms";
import type { IssueType, StatusCategory } from "@/lib/projects/types";

/**
 * Reports: how the project is going, worked out from its own issues and sprints.
 *
 * Nothing here is fetched. The four tiles, the sprint burndown, the velocity
 * history, the workload and the breakdowns are all computed from what the project
 * screen already holds (`lib/projects/reports.ts`), so they are never a refresh
 * behind the board. The filter bar does not apply: a report of a filtered
 * project would quietly be a report of something else.
 */

const CATEGORY_COLOR: Record<StatusCategory, string> = {
  TODO: "var(--color-faint)",
  IN_PROGRESS: "var(--color-cat-1)",
  DONE: "var(--color-cat-2)",
};

const TYPE_COLOR: Partial<Record<IssueType, string>> = {
  TASK: "var(--color-info)",
  BUG: "var(--color-cat-4)",
  SUBTASK: "var(--color-faint)",
};

function Tone({ bad, children }: { bad: boolean; children: React.ReactNode }) {
  return (
    <span className={bad ? "text-warning-text" : undefined}>{children}</span>
  );
}

/** "5 effort". The word does not take an s. */
function effort(n: number): string {
  return `${n} ${EFFORT.one}`;
}

export function ReportsView() {
  const { project, issues, people, today, dayOf } = useProject();
  const timeZone = useOrgTimezone();
  const { statuses } = project;

  const tiles = useMemo(
    () =>
      reportTiles({
        statuses,
        issues,
        today,
        dayOf,
        nowHHMM: nowHHMMIn(timeZone),
      }),
    [statuses, issues, today, dayOf, timeZone],
  );
  const load = useMemo(
    () => workload({ statuses, issues, nameOf: people.nameOf }),
    [statuses, issues, people.nameOf],
  );
  const byStatus = useMemo(
    () => statusBreakdown({ statuses, issues }),
    [statuses, issues],
  );
  const byType = useMemo(() => typeBreakdown(issues), [issues]);

  const scrum = project.type === "SCRUM";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h4 text-ink">{TAB_LABEL.reports}</h2>
        <p className="mt-1 text-body-sm text-muted">
          Progress and load for {project.name}. Every figure comes from the
          project&rsquo;s own tasks.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label={`Open ${TASK.many}`}
          value={tiles.open.issues}
          hint={`${effort(tiles.open.points)} left`}
        />
        <Stat
          label="Done in 7 days"
          value={tiles.doneInWeek.issues}
          hint={`${effort(tiles.doneInWeek.points)} finished`}
        />
        <Stat
          label="Overdue"
          value={<Tone bad={tiles.overdue > 0}>{tiles.overdue}</Tone>}
          hint="Past the due date"
        />
      </div>

      {scrum ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BurndownPanel />
          <VelocityPanel />
        </div>
      ) : (
        <p className="text-body-sm text-muted">
          Cycle progress and pace measure {CYCLE.many}, and a Kanban project has
          none.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={REPORT_TITLE.workload}
            description={
              load.measure === "points"
                ? `Open ${EFFORT.one} by person`
                : `Open ${TASK.many} by person. None has ${EFFORT.one} yet.`
            }
          />
          <CardBody>
            {load.rows.length === 0 ? (
              <p className="text-body-sm text-muted">
                Nothing is open, so nobody has any work on.
              </p>
            ) : (
              <WorkloadList data={load} people={people} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={REPORT_TITLE.breakdown}
            description={
              byStatus.total === 0
                ? "No tasks yet"
                : `${countNoun(byStatus.total, "task")} in this project, ${INITIATIVE.many} not counted`
            }
          />
          <CardBody className="space-y-6">
            {byStatus.total === 0 ? (
              <p className="text-body-sm text-muted">
                Create a {TASK.one} and its {STAGE.one} and type are counted
                here.
              </p>
            ) : (
              <>
                <div>
                  <h4 className="mb-2 text-body-sm font-semibold text-ink">
                    By {STAGE.one}
                  </h4>
                  <StackedBar
                    caption={`${TASK.Many} by ${STAGE.one}`}
                    total={byStatus.total}
                    segments={byStatus.counts.map(
                      ({ category, count }): Segment => ({
                        label: CATEGORY_LABEL[category],
                        value: count,
                        color: CATEGORY_COLOR[category],
                      }),
                    )}
                  />
                </div>
                <div>
                  <h4 className="mb-2 text-body-sm font-semibold text-ink">
                    By type
                  </h4>
                  <StackedBar
                    caption={`${TASK.Many} by type`}
                    total={byType.total}
                    segments={byType.counts.map(({ type, count }): Segment => ({
                      label: TYPE_LABEL[type],
                      value: count,
                      ...(TYPE_COLOR[type] ? { color: TYPE_COLOR[type] } : {}),
                    }))}
                  />
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- burndown -- */

function BurndownPanel() {
  const { project, issues, sprints, today, dayOf } = useProject();
  const list = useMemo(() => burndownSprints(sprints), [sprints]);
  const fallback = useMemo(() => defaultBurndownSprint(sprints), [sprints]);
  const [chosen, setChosen] = useQueryParam("sprint", fallback?.id ?? "");
  const sprint = list.find((s) => s.id === chosen) ?? fallback;

  const clock = sprint ? sprintClock(sprint.endDate, today) : null;

  const result: Burndown | null = useMemo(
    () =>
      sprint
        ? burndown({
            sprint,
            issues,
            statuses: project.statuses,
            dayOf,
            today,
          })
        : null,
    [sprint, issues, project.statuses, dayOf, today],
  );

  return (
    <Card>
      <CardHeader
        title={REPORT_TITLE.cycleProgress}
        description={`${EFFORT.One} left against an even pace`}
        action={
          list.length > 1 ? (
            <div className="w-full sm:w-56">
              <Select
                aria-label={CYCLE.One}
                value={sprint?.id ?? ""}
                onChange={(event) => setChosen(event.target.value, "replace")}
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.state === "ACTIVE" ? " (active)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />
      <CardBody>
        {!sprint || !result ? (
          <p className="text-body-sm text-muted">
            Start a {CYCLE.one} to see its progress.
          </p>
        ) : result.kind === "no-dates" ? (
          <p className="text-body-sm text-muted">
            {sprint.name} has no start and end dates, so there is no pace to
            measure against. Add them on the {TAB_LABEL.backlog} tab and the
            progress line appears.
          </p>
        ) : result.kind === "not-started" ? (
          <p className="text-body-sm text-muted">
            {sprint.name} has not started yet.
          </p>
        ) : result.total === 0 ? (
          <p className="text-body-sm text-muted">
            The {TASK.many} in {sprint.name} have no {EFFORT.one} yet. Give them{" "}
            {EFFORT.one} and the line starts to move.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="tabular text-body-sm text-body">
              <span className="font-semibold text-ink">
                {result.remaining} of {effort(result.total)}
              </span>{" "}
              {sprint.state === "CLOSED"
                ? result.basis === "committed"
                  ? "committed were left when it closed."
                  : "were left when it closed."
                : "left."}
              {sprint.state === "ACTIVE" && clock ? ` ${clock}` : ""}
            </p>
            <BurndownChart data={result} sprintName={sprint.name} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** How the running cycle stands against its end date, in a sentence. Null with no end date. */
function sprintClock(endDate: string | null, today: string): string | null {
  const left = daysLeft(endDate, today);
  if (left === null) return null;
  if (left > 0)
    return `${left} ${left === 1 ? "day" : "days"} left in the ${CYCLE.one}.`;
  if (left === 0) return "It ends today.";
  return `It ran ${-left} ${left === -1 ? "day" : "days"} over.`;
}

/* --------------------------------------------------------------- velocity -- */

function VelocityPanel() {
  const { project, sprints } = useProject();
  const { rows, average } = useMemo(() => velocity(sprints), [sprints]);
  return (
    <Card>
      <CardHeader
        title={REPORT_TITLE.pace}
        description={`${EFFORT.One} completed of what was committed, last 6 ${CYCLE.many}`}
      />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-body-sm text-muted">
            Complete a {CYCLE.one} to start tracking pace.
          </p>
        ) : (
          <VelocityChart
            rows={rows}
            average={average}
            projectKey={project.key}
          />
        )}
      </CardBody>
    </Card>
  );
}
