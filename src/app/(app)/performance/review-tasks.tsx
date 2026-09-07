"use client";

import { Fragment, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { dayLabel } from "@/lib/api/performance";
import { useTaskActions, useTasksForGrading } from "@/lib/store/performance";

/**
 * What still needs a grade.
 *
 * Company-wide for HR, a manager's own reports otherwise — decided in the
 * service, not here, the same shape every scoped read in this module uses.
 * Somebody who manages nobody and holds no company-wide permission sees an
 * honest empty state rather than a screen explaining why they can't have one:
 * an ungraded queue of zero is not a refusal, it is the answer.
 *
 * ## Logging a task lives with the objective it's against
 *
 * There is deliberately no "add a task" control here — a task is logged
 * against one specific objective, and the objective is where that context
 * already lives. This tab is the other half: what somebody logged, waiting
 * for a manager to say whether it happened.
 */
export function ReviewTasksTab() {
  const { tasks, loading, error, reload } = useTasksForGrading();
  const actions = useTaskActions();
  const toast = useToast();
  const [grading, setGrading] = useState<string | null>(null);

  /**
   * Tasks by the day they were logged, oldest day first.
   *
   * Sorted on the raw `createdAt` rather than on `dayLabel`'s output: the
   * label is for reading ("2 Sep"), and sorting strings like that puts April
   * before January. The label is only used to name a group once the ordering
   * has already been decided by the timestamp.
   */
  const grouped = useMemo(() => {
    const byDay = new Map<
      string,
      { day: string; at: number; tasks: typeof tasks }
    >();
    for (const task of tasks) {
      const at = new Date(task.createdAt).getTime();
      /* Bucket on the calendar day, not the instant. */
      const key = task.createdAt.slice(0, 10);
      const seen = byDay.get(key);
      if (seen) {
        seen.tasks.push(task);
        seen.at = Math.min(seen.at, Number.isNaN(at) ? seen.at : at);
      } else {
        byDay.set(key, {
          day: dayLabel(task.createdAt),
          at: Number.isNaN(at) ? 0 : at,
          tasks: [task],
        });
      }
    }
    return [...byDay.values()].sort((a, b) => a.at - b.at);
  }, [tasks]);

  const grade = async (
    id: string,
    value: "COMPLETED" | "PARTIALLY_COMPLETED" | "NOT_COMPLETED",
  ) => {
    setGrading(id);
    try {
      await actions.gradeTask(id, value);
      toast.push({ title: "Graded", tone: "success" });
      reload();
    } catch (err) {
      toast.push({
        title: "Could not grade that",
        detail: err instanceof ApiError ? err.message : undefined,
        tone: "danger",
      });
    } finally {
      setGrading(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <LoadFailure
        subject="tasks waiting on a grade"
        error={error}
        onRetry={reload}
      />

      <Card>
        <CardHeader
          title={
            tasks.length > 0
              ? `Waiting on a grade (${tasks.length})`
              : "Waiting on a grade"
          }
        />
        {loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : tasks.length === 0 ? (
          <EmptyState
            compact
            icon={<ClipboardCheck aria-hidden="true" />}
            title="Nothing waiting"
            description="Every task logged against your reports' objectives has a grade."
          />
        ) : (
          <TableWrap>
            <THead>
              <TH>Person</TH>
              <TH>Objective</TH>
              <TH>What they logged</TH>
              <TH align="right">Grade</TH>
            </THead>
            <TBody>
              {grouped.map((group) => (
                <Fragment key={group.day}>
                  {/* The day is a heading rather than a column.
                      ---------------------------------------------------
                      It was a cell on every row, which put the one thing
                      that orders this queue — how long somebody has been
                      waiting for a grade — in the fourth column, repeated,
                      where a reader had to compare fifteen dates to find the
                      oldest. Oldest group first, because a task logged nine
                      days ago is the one that has been ignored. */}
                  <TR>
                    <TD
                      colSpan={4}
                      className="bg-sunken py-2 text-meta font-semibold text-muted"
                    >
                      {group.day}
                      <span className="ml-2 font-normal">
                        {group.tasks.length === 1
                          ? "1 task"
                          : `${group.tasks.length} tasks`}
                      </span>
                    </TD>
                  </TR>
                  {group.tasks.map((task) => (
                    <TR key={task.id}>
                      <TDPrimary title={task.employeeName} />
                      <TD>{task.goalTitle}</TD>
                      <TD className="max-w-xs">{task.description}</TD>
                      <TD align="right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={grading === task.id}
                            onClick={() => void grade(task.id, "NOT_COMPLETED")}
                          >
                            Not done
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={grading === task.id}
                            onClick={() =>
                              void grade(task.id, "PARTIALLY_COMPLETED")
                            }
                          >
                            Partly
                          </Button>
                          <Button
                            size="sm"
                            variant="accent"
                            loading={grading === task.id}
                            onClick={() => void grade(task.id, "COMPLETED")}
                          >
                            Done
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </Fragment>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
