"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Field, FilterBar, LoadState, Select, Skeleton } from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { ProjectKeyChip, StatusPill } from "@/components/projects/glyphs";
import { useProgram } from "@/components/projects/program-context";
import { taskHref } from "@/components/projects/work-list";
import { ApiError } from "@/lib/api/client";
import { dueLabel } from "@/lib/projects/due";
import type { WorkQuery, WorkRow } from "@/lib/projects/programs";
import {
  CATEGORY_COLUMN_LABEL,
  LIST_CAPPED,
  TASK,
  count,
} from "@/lib/projects/terms";
import { STATUS_CATEGORIES, type StatusCategory } from "@/lib/projects/types";
import { withParam, type WorkParam } from "@/lib/projects/work-query";
import { useProgramProjects, useWorkList } from "@/lib/store/programs";
import { usePeople } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * A program's tasks as one board, in three columns that mean the same in every
 * project: Not started, In progress and Done.
 *
 * Projects name their stages as they like ("Drafting", "In review", "Scheduled")
 * and only the *category* of a stage compares across them, so that is what the
 * columns are, and each card still says its project's own stage. The board is for
 * seeing, not moving: there is no drag, because a move here would have to pick a
 * stage in a project the card does not belong to. Open a task to change its
 * stage in its own project, or use "Open in project".
 *
 * Each column is the API's page for that category, with its own count and its own
 * "Load more", so a column of thousands is never fetched at once.
 */
/** Cards a column asks for at a time. */
const COLUMN_PAGE = 25;

export function WorkBoardView() {
  const { program, unassigned } = useProgram();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const people = usePeople();
  const projects = useProgramProjects(
    unassigned ? { unassigned: true } : { programId: program.id },
  );

  const set = (name: WorkParam, value: string | null) => {
    const qs = withParam(params, name, value).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const person = params.get("assignee") ?? "";
  const project = params.get("project") ?? "";
  const q = params.get("q") ?? "";
  const filtering = person !== "" || project !== "" || q !== "";

  const base: WorkQuery = {
    ...(unassigned ? { unassigned: true } : { programId: program.id }),
    ...(project ? { projectId: project } : {}),
    ...(person ? { assigneeId: person } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    limit: COLUMN_PAGE,
  };

  return (
    <div className="space-y-5">
      <FilterBar
        search={q}
        onSearchChange={(value) => set("q", value)}
        searchPlaceholder="Search tasks"
        searchLabel="Search the board by key or title"
        applied={[
          ...(project
            ? [
                {
                  label: "Project",
                  value:
                    projects.data?.find((p) => p.id === project)?.name ??
                    "That project",
                  onClear: () => set("project", null),
                },
              ]
            : []),
          ...(person
            ? [
                {
                  label: "Person",
                  value: person === "none" ? "Nobody" : people.nameOf(person),
                  onClear: () => set("assignee", null),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          set("project", null);
          set("assignee", null);
          set("q", null);
        }}
      >
        <Field label="Project">
          <Select
            value={project}
            onChange={(e) => set("project", e.target.value)}
          >
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Person">
          <Select
            value={person}
            onChange={(e) => set("assignee", e.target.value)}
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
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-3">
        {STATUS_CATEGORIES.map((category) => (
          <Column
            key={category}
            category={category}
            base={base}
            filtering={filtering}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  category,
  base,
  filtering,
}: {
  category: StatusCategory;
  base: WorkQuery;
  filtering: boolean;
}) {
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const list = useWorkList({
    ...base,
    category: [category],
    /* What is still to do is ordered by when it is due; what is done, by when. */
    sort: category === "DONE" ? "done" : "due",
    order: category === "DONE" ? "desc" : "asc",
  });
  const label = CATEGORY_COLUMN_LABEL[category];
  return (
    <section
      aria-label={label}
      className="min-w-0 rounded-lg border border-line bg-canvas p-3"
    >
      <h2 className="mb-3 flex items-baseline justify-between gap-2 px-1 text-body-sm font-semibold text-ink">
        <span>{label}</span>
        <span className="tabular text-meta font-normal text-muted">
          {list.total === null ? "" : count(list.total, "task")}
        </span>
      </h2>
      <LoadState
        loading={list.status === "loading"}
        error={
          list.status === "error" && list.rows.length === 0 ? list.error : null
        }
        subject={`the ${label.toLowerCase()} ${TASK.many}`}
        onRetry={list.reload}
        hasData={list.rows.length > 0}
        skeleton={
          <div className="space-y-2">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-20" />
            ))}
          </div>
        }
      >
        {list.rows.length === 0 ? (
          <p className="px-1 py-6 text-center text-body-sm text-muted">
            {filtering ? `Nothing here matches` : `Nothing here yet`}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={`${label} ${TASK.many}`}>
            {list.rows.map((row) => (
              <li key={row.id}>
                <Card row={row} today={today} />
              </li>
            ))}
          </ul>
        )}
        {/* The same footer as every other list: it says how many are shown (read
            out when it changes), says when a page did not arrive, and tries again. */}
        {(list.hasMore ||
          list.error !== null ||
          list.rows.length > COLUMN_PAGE) && (
          <div className="mt-3">
            <LoadMore
              shown={list.rows.length}
              total={list.total}
              noun={["task", "tasks"]}
              hasMore={list.hasMore}
              loading={list.loadingMore}
              error={list.error instanceof ApiError ? list.error : null}
              onLoadMore={list.loadMore}
            />
          </div>
        )}
        {list.capped && (
          <p role="note" className="mt-2 text-meta text-muted">
            {LIST_CAPPED(list.rows.length)}
          </p>
        )}
      </LoadState>
    </section>
  );
}

function Card({ row, today }: { row: WorkRow; today: string }) {
  return (
    <article className="min-w-0 rounded-md border border-line bg-surface p-3 shadow-xs">
      <div className="flex items-center gap-2">
        <ProjectKeyChip
          project={{ key: row.projectKey, color: row.projectColor }}
        />
        <span className="tabular truncate text-meta text-muted">{row.key}</span>
      </div>
      <Link
        href={taskHref(row)}
        className="mt-1.5 block break-words text-body-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        {row.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
        <StatusPill
          status={{
            name: row.statusName || CATEGORY_COLUMN_LABEL[row.statusCategory],
            category: row.statusCategory,
          }}
        />
        <span className="truncate">
          {row.assignees.length === 0
            ? "Nobody"
            : row.assignees.length === 1
              ? row.assignees[0]!.name
              : `${row.assignees[0]!.name} and ${row.assignees.length - 1} more`}
        </span>
        {row.dueDate && (
          <span className={row.overdue ? "text-warning-text" : undefined}>
            {dueLabel(
              { dueDate: row.dueDate, dueTime: row.dueTime },
              today,
              "card",
            )}
            {row.overdue ? ", overdue" : ""}
          </span>
        )}
      </div>
      <Link
        href={`/projects/${row.projectId}`}
        className="mt-2 inline-flex items-center gap-1 text-meta font-medium text-accent-text underline-offset-2 hover:underline"
      >
        Open in project
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Link>
    </article>
  );
}
