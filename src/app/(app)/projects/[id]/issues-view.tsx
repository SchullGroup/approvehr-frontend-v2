"use client";

import { dueLabel, isPastDue, nowHHMMIn } from "@/lib/projects/due";
import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  Button,
  Checkbox,
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
import { BulkLinkDialog } from "@/components/projects/bulk-link-dialog";
import { IssueFilterBar } from "@/components/projects/issue-filter-bar";
import { useMayLinkIssue } from "@/components/projects/objective-link";
import { BULK_LINK_LIMIT } from "@/lib/projects/bulk-link";
import { useBulkLink } from "@/lib/store/completions";
import { PersonName } from "@/components/projects/person";
import { assigneesOf } from "@/lib/projects/assignees";
import { useProject } from "@/components/projects/project-context";
import {
  applyFilter,
  filterContext,
  isFiltering,
} from "@/lib/projects/filters";
import {
  DEFAULT_SORT,
  nextSort,
  sortIssues,
  type SortKey,
} from "@/lib/projects/sort";
import {
  CYCLE,
  EFFORT,
  EMPTY,
  INITIATIVE,
  NEW_TASK,
  PROBLEM,
  STAGE,
  TAB_LABEL,
  TASK,
  count as countNoun,
} from "@/lib/projects/terms";
import { PRIORITY_LABEL } from "@/lib/projects/types";
import { effectiveStatus, isDone } from "@/lib/projects/workflow";
import { formatDateShort } from "@/lib/time";

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
    actions,
  } = useProject();
  const [sort, setSort] = useState(DEFAULT_SORT);
  const mayLink = useMayLinkIssue();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [linking, setLinking] = useState(false);
  /* Something was changed, so the project is read again when the dialog closes. */
  const [stale, setStale] = useState(false);
  const bulkLink = useBulkLink();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const searchContext = useMemo(
    () => filterContext(issues, people.nameOf),
    [issues, people.nameOf],
  );
  const rows = useMemo(
    () =>
      sortIssues(
        applyFilter(
          issues,
          filter,
          meId,
          project.statuses,
          project.memberDepartments,
          searchContext,
        ),
        sort,
        {
          statuses: project.statuses,
          sprints,
          nameOf: people.nameOf,
        },
      ),
    [
      issues,
      filter,
      meId,
      sort,
      project.statuses,
      project.memberDepartments,
      sprints,
      people.nameOf,
      searchContext,
    ],
  );

  /* Linking is optional, and offered only for the tasks this person may link: a
     member sees a tick on their own, the lead and HR on every one. Nobody who may
     link none of them is drawn a column of nothing. */
  const linkable = useMemo(
    () => rows.filter((i) => mayLink(i)),
    [rows, mayLink],
  );
  const selectable = linkable.length > 0;
  const chosen = useMemo(
    () => linkable.filter((i) => picked.has(i.id)),
    [linkable, picked],
  );
  const atLimit = chosen.length >= BULK_LINK_LIMIT;
  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShown = linkable.slice(0, BULK_LINK_LIMIT);
  const allChosen =
    allShown.length > 0 && allShown.every((i) => picked.has(i.id));

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
        title={EMPTY.noTasks}
        description={`${TASK.Many} are the work in a project: plain ${TASK.many}, ${PROBLEM.many} and ${INITIATIVE.many}. Create the first one and it shows up here and on the board.`}
        {...(canWork
          ? {
              action: (
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus aria-hidden="true" className="size-4" />
                  {NEW_TASK}
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
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-h4 text-ink focus:outline-none"
        >
          {TAB_LABEL.issues}
        </h2>
        <p className="tabular mt-1 text-body-sm text-muted">
          {rows.length} of {countNoun(issues.length, "task")}
        </p>
      </div>

      <IssueFilterBar />

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="text-ink">
            {chosen.length === 1
              ? "1 chosen"
              : `${String(chosen.length)} chosen`}
          </span>
          <Button size="sm" onClick={() => setLinking(true)}>
            Link to an objective
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicked(new Set())}
          >
            Clear choice
          </Button>
          {atLimit && (
            <span className="text-meta text-muted">
              Up to {String(BULK_LINK_LIMIT)} at a time.
            </span>
          )}
        </div>
      )}

      <TableWrap caption={`${TASK.Many} in this project`}>
        <THead>
          {selectable && (
            <TH className="w-10 pr-0">
              <Checkbox
                hiddenLabel="Choose every task shown that you can link"
                checked={allChosen}
                indeterminate={chosen.length > 0 && !allChosen}
                onChange={() =>
                  setPicked(
                    allChosen ? new Set() : new Set(allShown.map((i) => i.id)),
                  )
                }
              />
            </TH>
          )}
          <TH className="w-10">
            <span className="sr-only">Type</span>
          </TH>
          {th("key", "Key")}
          {th("title", "Summary")}
          {th("status", STAGE.One)}
          {th("assignee", "Assignee")}
          {th("priority", "Priority")}
          {th("points", EFFORT.One, "right")}
          {th("sprint", CYCLE.One)}
          {th("due", "Due")}
          {th("updated", "Updated")}
        </THead>
        <TBody>
          {rows.map((issue) => {
            const status = effectiveStatus(project.statuses, issue.statusId);
            const done = isDone(project.statuses, issue);
            const overdue =
              !done && isPastDue(issue, today, nowHHMMIn(timeZone));
            const sprint = sprints.find((s) => s.id === issue.sprintId);
            return (
              <TR
                key={issue.id}
                interactive
                onClick={rowClick(() => openIssue(issue))}
              >
                {selectable && (
                  <TD className="pr-0" onClick={(e) => e.stopPropagation()}>
                    {mayLink(issue) && (
                      <Checkbox
                        hiddenLabel={`Choose ${issue.key} ${issue.title}`}
                        checked={picked.has(issue.id)}
                        disabled={atLimit && !picked.has(issue.id)}
                        onChange={() => toggle(issue.id)}
                      />
                    )}
                  </TD>
                )}
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
                  {assigneesOf(issue).length > 1 && (
                    <span className="ml-1 text-meta text-muted">
                      +{assigneesOf(issue).length - 1}
                    </span>
                  )}
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
                  {issue.dueDate ? dueLabel(issue, today, "card") : ""}
                </TD>
                <TD className="tabular whitespace-nowrap text-muted">
                  {formatDateShort(issue.updatedAt, timeZone)}
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD
                colSpan={selectable ? 11 : 10}
                className="py-8 text-center text-muted"
              >
                {isFiltering(filter)
                  ? `No ${TASK.many} match these filters.`
                  : `No ${TASK.many}.`}
              </TD>
            </TR>
          )}
        </TBody>
      </TableWrap>

      <BulkLinkDialog
        open={linking}
        onClose={() => {
          setLinking(false);
          /* The list is read again once the answer has been read and closed,
             not behind it. */
          if (stale) {
            setStale(false);
            actions.refreshProject();
          }
        }}
        tasks={chosen}
        focusAfter={() => headingRef.current}
        run={(target) =>
          bulkLink(
            chosen.map((issue) => ({
              id: issue.id,
              key: issue.key,
              personId: issue.assigneeId ?? null,
            })),
            target,
          )
        }
        onDone={(result) => {
          setPicked(new Set());
          if (result.changed > 0) setStale(true);
        }}
      />
    </div>
  );
}
