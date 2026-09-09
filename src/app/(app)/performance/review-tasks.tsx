"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
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
import { dayOf } from "@/lib/api/performance";
import { useTaskActions, useTasksForGrading } from "@/lib/store/performance";

/**
 * What still needs a grade.
 *
 * Company-wide for HR, otherwise a person's line reports **and the
 * departments they head** — decided in the service, not here, the same shape
 * every scoped read in this module uses.
 *
 * ## Renders nothing when there is nothing
 *
 * Most people in a company review nobody, and this used to greet them with a
 * card and an empty state explaining a queue they will never have. That is a
 * whole screen spent saying "not for you". The page it sits on has their own
 * week on it now, so an empty queue is simply absent: for a reviewer with
 * nothing waiting, the absence says the same thing the empty state did, in no
 * space at all.
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
   * Sorted on the raw `createdAt` rather than on the label: the label is for
   * reading ("2 Sep"), and sorting strings like that puts April before
   * January. The label only names a group once the timestamp has decided the
   * ordering.
   *
   * `dayOf`, not `dayLabel`. `dayLabel` takes a bare calendar date and splits
   * it on `-`; handed a full timestamp it read the day as `08T17:45:00.000Z`
   * and every heading on this queue said **"NaN Sep 2026"**. The bucket key
   * below was already slicing the date out correctly, which is why the
   * grouping was right and only the heading was wrong.
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
          day: dayOf(task.createdAt),
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

  /* Nothing waiting and nothing loading is not a state worth a card — see
     the note on the component. The load failure still renders: a queue that
     failed to load is not an empty one. */
  if (!loading && tasks.length === 0) {
    return (
      <LoadFailure
        subject="tasks waiting on a grade"
        error={error}
        onRetry={reload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LoadFailure
        subject="tasks waiting on a grade"
        error={error}
        onRetry={reload}
      />

      <Card>
        <CardHeader title={`Waiting on a grade (${tasks.length})`} />
        {loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
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
