"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  PROVIDER_NAME,
  type ApiEvidenceTask,
  type EvidenceRange,
  type ExternalTaskStatus,
} from "@/lib/api/work-trackers";
import {
  TASK_GRADE_LABEL,
  TASK_GRADE_TONE,
} from "@/lib/performance/task-grade";
import { useOrgTimezone } from "@/lib/store/session";
import { useWorkEvidence } from "@/lib/store/work-trackers";
import { formatDateShort } from "@/lib/time";

/**
 * Somebody's tickets from a connected work tracker, for one period.
 *
 * **Context, not score.** None of these figures enters the composite mark —
 * only weekly tasks a manager has graded do — and the card says so, because a
 * number on an appraisal page reads as part of the mark unless told otherwise.
 * Counting tickets is a poor measure of effort; it is a good prompt for the
 * conversation.
 *
 * Renders nothing when there are no tickets at all, which is every company
 * that has not connected a tool: a card explaining an integration nobody set
 * up is noise on a review.
 */

const STATUS: Record<ExternalTaskStatus, { label: string; tone: BadgeTone }> = {
  DONE: { label: "Done", tone: "success" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  TODO: { label: "To do", tone: "neutral" },
};

const SHOWN = 8;

export function WorkEvidence({
  employeeId,
  range,
  title = "Work from connected tools",
}: {
  employeeId: string | null;
  range: EvidenceRange;
  title?: string;
}) {
  const { evidence, loading, error, reload } = useWorkEvidence(
    employeeId,
    range,
  );
  const timeZone = useOrgTimezone();
  const [all, setAll] = useState(false);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    /* A 403 is "not yours to see", which the page around this already
       handles; it is not a failure to show. */
    if (error.status === 403) return null;
    return (
      <LoadFailure
        subject="work from connected tools"
        error={error}
        onRetry={reload}
      />
    );
  }
  if (!evidence || evidence.tasks.length === 0) return null;

  const { summary } = evidence;
  const providers = [
    ...new Set(evidence.tasks.map((t) => PROVIDER_NAME[t.provider])),
  ];
  const shown = all ? evidence.tasks : evidence.tasks.slice(0, SHOWN);

  return (
    <Card>
      <CardHeader
        title={title}
        level={3}
        description={`Tickets from ${providers.join(" and ")}, ${formatDateShort(evidence.from, timeZone)} to ${formatDateShort(evidence.to, timeZone)}. These figures are for your conversation and are not part of the score.`}
      />
      <CardBody className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Finished" value={summary.completed} />
          <Stat
            label="On time"
            value={summary.onTimeRate === null ? "—" : `${summary.onTimeRate}%`}
            hint={
              summary.completedWithDueDate === 0
                ? "None had a due date"
                : `${summary.completedOnTime} of ${summary.completedWithDueDate} with a due date`
            }
          />
          <Stat label="Open and overdue" value={summary.openOverdue} />
          <Stat
            label="Median days to finish"
            value={summary.medianDaysToClose ?? "—"}
          />
        </div>

        <TableWrap>
          <THead>
            <TH>Ticket</TH>
            <TH>Status</TH>
            <TH>Finished</TH>
            <TH>Weekly task</TH>
          </THead>
          <TBody>
            {shown.map((task) => (
              <TR key={task.id}>
                <TD className="max-w-sm">
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-ink hover:underline"
                  >
                    {task.key}
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                  <span className="block truncate text-body-sm text-body">
                    {task.title}
                  </span>
                </TD>
                <TD>
                  <Badge size="sm" tone={STATUS[task.status].tone}>
                    {task.statusName || STATUS[task.status].label}
                  </Badge>
                </TD>
                <TD>
                  {task.completedAt
                    ? formatDateShort(task.completedAt, timeZone)
                    : "—"}
                </TD>
                <TD>
                  <WeeklyTaskState task={task} />
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>

        {evidence.tasks.length > SHOWN && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setAll((v) => !v)}
          >
            {all ? "Show fewer" : `Show all ${evidence.tasks.length}`}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function WeeklyTaskState({ task }: { task: ApiEvidenceTask }) {
  if (!task.objectiveTask) {
    return <span className="text-body-sm text-muted">Not counted</span>;
  }
  if (task.objectiveTask.grade === null) {
    return (
      <Badge size="sm" tone="warning">
        Waiting on a grade
      </Badge>
    );
  }
  return (
    <Badge size="sm" tone={TASK_GRADE_TONE[task.objectiveTask.grade]}>
      {TASK_GRADE_LABEL[task.objectiveTask.grade]}
    </Badge>
  );
}
