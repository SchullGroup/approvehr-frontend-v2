"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  SortableTH,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  rowClick,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  IssueKey,
  PriorityIcon,
  StatusPill,
  TypeIcon,
} from "@/components/projects/glyphs";
import { IssueFilterBar } from "@/components/projects/issue-filter-bar";
import { PersonName } from "@/components/projects/person";
import { useProject } from "@/components/projects/project-context";
import { isBefore } from "@/lib/projects/dates";
import { applyFilter, isFiltering } from "@/lib/projects/filters";
import {
  DEFAULT_SORT,
  nextSort,
  sortIssues,
  type SortKey,
} from "@/lib/projects/sort";
import { PRIORITY_LABEL } from "@/lib/projects/types";
import { effectiveStatus, isDone } from "@/lib/projects/workflow";
import { formatDateShort } from "@/lib/time";
import { shortDate } from "@/lib/today";

/**
 * All issues: every issue of the project in one sortable table, epics and
 * sub-tasks included. Click a row (or its summary) to open the drawer.
 */
export function IssuesView() {
  const {
    project,
    issues,
    sprints,
    filter,
    meId,
    people,
    canWork,
    today,
    timeZone,
    openIssue,
    openCreate,
  } = useProject();
  const [sort, setSort] = useState(DEFAULT_SORT);

  const rows = useMemo(
    () =>
      sortIssues(applyFilter(issues, filter, meId), sort, {
        statuses: project.statuses,
        sprints,
        nameOf: people.nameOf,
      }),
    [issues, filter, meId, sort, project.statuses, sprints, people.nameOf],
  );

  const onSort = (column: string) => setSort(nextSort(sort, column as SortKey));
  const order = sort.dir === 1 ? "asc" : "desc";
  const th = (key: SortKey, label: string, align?: "right") => (
    <SortableTH
      column={key}
      active={sort.key}
      order={order}
      onSort={onSort}
      {...(align ? { align } : {})}
    >
      {label}
    </SortableTH>
  );

  if (issues.length === 0) {
    return (
      <EmptyState
        title="No issues yet"
        description="Issues are the work in a project: stories, tasks, bugs and epics. Create the first one and it shows up here and on the board."
        {...(canWork
          ? {
              action: (
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus aria-hidden="true" className="size-4" />
                  Create an issue
                </Button>
              ),
            }
          : {})}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h4 text-ink">All issues</h2>
        <p className="tabular mt-1 text-body-sm text-muted">
          {rows.length} of {issues.length}{" "}
          {issues.length === 1 ? "issue" : "issues"}
        </p>
      </div>

      <IssueFilterBar />

      <TableWrap caption="All issues in this project">
        <THead>
          <TH className="w-10">
            <span className="sr-only">Type</span>
          </TH>
          {th("key", "Key")}
          {th("title", "Summary")}
          {th("status", "Status")}
          {th("assignee", "Assignee")}
          {th("priority", "Priority")}
          {th("points", "Points", "right")}
          {th("sprint", "Sprint")}
          {th("due", "Due")}
          {th("updated", "Updated")}
        </THead>
        <TBody>
          {rows.map((issue) => {
            const status = effectiveStatus(project.statuses, issue.statusId);
            const done = isDone(project.statuses, issue);
            const overdue = !done && isBefore(issue.dueDate, today);
            const sprint = sprints.find((s) => s.id === issue.sprintId);
            return (
              <TR
                key={issue.id}
                interactive
                onClick={rowClick(() => openIssue(issue))}
              >
                <TD className="pr-0">
                  <TypeIcon type={issue.type} />
                </TD>
                <TD>
                  <IssueKey issueKey={issue.key} done={done} />
                </TD>
                <TD className="max-w-md">
                  <button
                    type="button"
                    onClick={() => openIssue(issue)}
                    className="block max-w-full truncate rounded-sm text-left font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                  >
                    {issue.title}
                  </button>
                </TD>
                <TD>
                  <StatusPill status={status} />
                </TD>
                <TD>
                  <PersonName
                    people={people}
                    id={issue.assigneeId}
                    className="whitespace-nowrap"
                  />
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <PriorityIcon priority={issue.priority} />
                    {PRIORITY_LABEL[issue.priority]}
                  </span>
                </TD>
                <TD align="right" className="tabular">
                  {issue.points ?? ""}
                </TD>
                <TD className="whitespace-nowrap text-muted">
                  {sprint?.name ?? ""}
                </TD>
                <TD
                  className={cn(
                    "tabular whitespace-nowrap",
                    overdue ? "font-medium text-warning-text" : "text-muted",
                  )}
                >
                  {issue.dueDate ? shortDate(issue.dueDate) : ""}
                </TD>
                <TD className="tabular whitespace-nowrap text-muted">
                  {formatDateShort(issue.updatedAt, timeZone)}
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={10} className="py-8 text-center text-muted">
                {isFiltering(filter)
                  ? "No issues match these filters."
                  : "No issues."}
              </TD>
            </TR>
          )}
        </TBody>
      </TableWrap>
    </div>
  );
}
