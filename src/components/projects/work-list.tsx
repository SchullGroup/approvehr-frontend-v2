"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FilterBar,
  LoadState,
  Select,
  Skeleton,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { StatusPill } from "@/components/projects/glyphs";
import { ApiError } from "@/lib/api/client";
import { dueLabel } from "@/lib/projects/due";
import type { WorkQuery, WorkRow } from "@/lib/projects/programs";
import { LIST_CAPPED, TASK } from "@/lib/projects/terms";
import {
  DUE_CHOICES,
  filterCount,
  queryFromParams,
  withParam,
  withoutFilters,
  type WorkParam,
} from "@/lib/projects/work-query";
import {
  CATEGORY_LABEL,
  STATUS_CATEGORIES,
  type StatusCategory,
} from "@/lib/projects/types";
import { useProgramList, useWorkList } from "@/lib/store/programs";
import { useProjectList } from "@/lib/store/projects";
import { useProgramProjects } from "@/lib/store/programs";
import { usePeople } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * A page of tasks across projects, with the filters that narrow it.
 *
 * One component for the Master view's **All tasks** and a program's **Tasks**:
 * the scope (a program, the projects in none, or everything) is fixed by the
 * caller, and the filters live in the address (`?program=&project=&assignee=
 * &stage=&bucket=&q=`) so a tile can open the list it counts and a link can be
 * shared. The rows are the API's, a page at a time, with its own total; nothing
 * is loaded "all" and filtered here, because a project holds up to 5,000 tasks
 * and a company holds many projects.
 *
 * The layout is one list that is a table from `md` up and a stack of cards below
 * it, so a phone never scrolls sideways. Opening a task goes to its project with
 * the task open (`?issue=KEY&from=work`); closing it comes back here.
 */

export type WorkScope = { programId?: string; unassigned?: true };

const GRID =
  "md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_7rem] md:items-center md:gap-4";
const GRID_WITH_PROGRAM =
  "md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_7rem] md:items-center md:gap-4";

/** Where a task opens: its project, with the task open and a way back here. */
export function taskHref(row: Pick<WorkRow, "projectId" | "key">): string {
  return `/projects/${row.projectId}?issue=${row.key}&from=work`;
}

export function WorkTasks({
  scope = {},
  showProgram,
}: {
  scope?: WorkScope;
  /** A column naming the program, and a filter for it: the Master view's. */
  showProgram: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const people = usePeople();
  const programs = useProgramList();
  const query = queryFromParams(params, scope);
  const list = useWorkList(query);

  const setParam = (name: WorkParam, value: string | null) => {
    const next = withParam(params, name, value);
    /* Choosing another program makes a project chosen in the last one meaningless. */
    if (name === "program") next.delete("project");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const clearAll = () => {
    const qs = withoutFilters(params).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const narrowed = filterCount(params) > 0;
  const programId = scope.programId ?? params.get("program") ?? "";
  const projectChoices = useProjectChoices(scope, programId);
  const programName = (id: string) =>
    programs.data?.programs.find((p) => p.id === id)?.name ?? "That program";
  const projectName = (id: string) =>
    projectChoices.find((p) => p.id === id)?.name ?? "That project";

  const applied = [
    ...(showProgram && params.get("program")
      ? [
          {
            label: "Program",
            value: programName(params.get("program")!),
            onClear: () => setParam("program", null),
          },
        ]
      : []),
    ...(params.get("project")
      ? [
          {
            label: "Project",
            value: projectName(params.get("project")!),
            onClear: () => setParam("project", null),
          },
        ]
      : []),
    ...(params.get("assignee")
      ? [
          {
            label: "Person",
            value:
              params.get("assignee") === "none"
                ? "Nobody"
                : people.nameOf(params.get("assignee")),
            onClear: () => setParam("assignee", null),
          },
        ]
      : []),
    ...(query.category?.[0]
      ? [
          {
            label: "Stage",
            value: CATEGORY_LABEL[query.category[0]],
            onClear: () => setParam("stage", null),
          },
        ]
      : []),
    ...(query.bucket
      ? [
          {
            label: "Due",
            value:
              DUE_CHOICES.find((c) => c.value === query.bucket)?.label ??
              query.bucket,
            onClear: () => setParam("bucket", null),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <FilterBar
        search={params.get("q") ?? ""}
        onSearchChange={(value) => setParam("q", value)}
        searchPlaceholder="Search tasks"
        searchLabel="Search tasks by key or title"
        count={list.total ?? undefined}
        noun={["task", "tasks"]}
        applied={applied}
        onClearAll={clearAll}
      >
        {showProgram && (
          <Field label="Program">
            <Select
              value={params.get("program") ?? ""}
              onChange={(event) => setParam("program", event.target.value)}
            >
              <option value="">All programs</option>
              {(programs.data?.programs ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Project">
          <Select
            value={params.get("project") ?? ""}
            onChange={(event) => setParam("project", event.target.value)}
          >
            <option value="">All projects</option>
            {projectChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Person">
          <Select
            value={params.get("assignee") ?? ""}
            onChange={(event) => setParam("assignee", event.target.value)}
          >
            <option value="">Anyone</option>
            <option value="none">Nobody</option>
            {[...people.people]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select
            value={query.category?.[0] ?? ""}
            onChange={(event) => setParam("stage", event.target.value)}
          >
            <option value="">Any stage</option>
            {STATUS_CATEGORIES.map((category: StatusCategory) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <Select
            value={query.bucket ?? ""}
            onChange={(event) => setParam("bucket", event.target.value)}
          >
            {DUE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <Results
        list={list}
        showProgram={showProgram}
        narrowed={narrowed}
        onClear={clearAll}
      />
    </div>
  );
}

/** The projects the Project filter offers: the program's own, or everything the person may read. */
function useProjectChoices(
  scope: WorkScope,
  chosenProgram: string,
): { id: string; name: string }[] {
  const target = scope.unassigned
    ? ({ unassigned: true } as const)
    : { programId: scope.programId ?? chosenProgram };
  const scoped = Boolean(scope.programId || scope.unassigned || chosenProgram);
  const inProgram = useProgramProjects(target, false, scoped);
  const everything = useProjectList("all");
  if (scoped) {
    return (inProgram.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  }
  return everything.projects
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function Results({
  list,
  showProgram,
  narrowed,
  onClear,
}: {
  list: ReturnType<typeof useWorkList>;
  showProgram: boolean;
  narrowed: boolean;
  onClear: () => void;
}) {
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const grid = showProgram ? GRID_WITH_PROGRAM : GRID;
  const hasRows = list.rows.length > 0;
  return (
    <LoadState
      loading={list.status === "loading"}
      error={list.status === "error" && !hasRows ? list.error : null}
      subject="the tasks"
      onRetry={list.reload}
      hasData={hasRows}
      skeleton={
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-14" />
          ))}
        </div>
      }
    >
      {!hasRows ? (
        <EmptyState
          icon={<ListChecks />}
          title={
            narrowed
              ? `No ${TASK.many} match these filters`
              : `No ${TASK.many} yet`
          }
          description={
            narrowed
              ? "Try another person or stage, or clear the filters to see everything you can open."
              : `${TASK.Many} you can open will be listed here.`
          }
          {...(narrowed
            ? {
                action: (
                  <Button variant="secondary" onClick={onClear}>
                    Clear filters
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-3">
          <div
            role="table"
            aria-label="Tasks"
            className="rounded-lg border border-line bg-surface"
          >
            <div
              role="row"
              className={`hidden border-b border-line px-4 py-2.5 text-meta font-semibold text-muted ${grid}`}
            >
              <span role="columnheader">Task</span>
              <span role="columnheader">Project</span>
              {showProgram && <span role="columnheader">Program</span>}
              <span role="columnheader">Stage</span>
              <span role="columnheader">Assignees</span>
              <span role="columnheader">Due</span>
            </div>
            <ul className="divide-y divide-line">
              {list.rows.map((row) => (
                <li
                  key={row.id}
                  role="row"
                  className={`flex flex-col gap-2 px-4 py-3 ${grid}`}
                >
                  <span role="cell" className="min-w-0">
                    <Link
                      href={taskHref(row)}
                      className="block min-w-0 text-body-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                    >
                      <span className="tabular mr-2 text-meta font-semibold text-muted">
                        {row.key}
                      </span>
                      <span className="break-words">{row.title}</span>
                    </Link>
                  </span>
                  <span
                    role="cell"
                    className="flex min-w-0 items-center gap-2 text-body-sm text-muted"
                  >
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: row.projectColor }}
                      className="inline-block size-2.5 shrink-0 rounded-sm"
                    />
                    <span className="truncate" title={row.projectName}>
                      {row.projectName}
                    </span>
                  </span>
                  {showProgram && (
                    <span
                      role="cell"
                      className="flex min-w-0 items-center gap-2 text-body-sm text-muted"
                    >
                      {row.programName ? (
                        <span className="truncate">{row.programName}</span>
                      ) : (
                        <span className="text-faint">Unassigned</span>
                      )}
                    </span>
                  )}
                  <span role="cell">
                    <StatusPill
                      status={{
                        name:
                          row.statusName || CATEGORY_LABEL[row.statusCategory],
                        category: row.statusCategory,
                      }}
                    />
                  </span>
                  <span
                    role="cell"
                    className="min-w-0 truncate text-body-sm text-muted"
                  >
                    {row.assignees.length === 0
                      ? "Nobody"
                      : row.assignees.length === 1
                        ? row.assignees[0]!.name
                        : `${row.assignees[0]!.name} and ${row.assignees.length - 1} more`}
                  </span>
                  <span role="cell" className="tabular text-body-sm">
                    {row.dueDate ? (
                      <span
                        className={
                          row.overdue ? "text-warning-text" : "text-muted"
                        }
                      >
                        {dueLabel(
                          { dueDate: row.dueDate, dueTime: row.dueTime },
                          today,
                          "card",
                        )}
                        {row.overdue && (
                          <Badge tone="neutral" size="sm" className="ml-1.5">
                            Overdue
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-faint">No date</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <LoadMore
            shown={list.rows.length}
            total={list.total}
            noun={["task", "tasks"]}
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.error instanceof ApiError ? list.error : null}
            onLoadMore={list.loadMore}
          />
          {list.capped && (
            <p role="note" className="mt-2 text-meta text-muted">
              {LIST_CAPPED(list.rows.length)}
            </p>
          )}
        </div>
      )}
    </LoadState>
  );
}

export type { WorkQuery };
