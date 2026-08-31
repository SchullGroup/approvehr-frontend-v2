"use client";

import { useState } from "react";
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
              <TH>Logged</TH>
              <TH align="right">Grade</TH>
            </THead>
            <TBody>
              {tasks.map((task) => (
                <TR key={task.id}>
                  <TDPrimary title={task.employeeName} />
                  <TD>{task.goalTitle}</TD>
                  <TD className="max-w-xs">{task.description}</TD>
                  <TD>{dayLabel(task.createdAt)}</TD>
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
            </TBody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
