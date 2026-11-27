"use client";

import { Skeleton } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  PROVIDER_NAME,
  type EvidenceRange,
  type ExternalTaskStatus,
} from "@/lib/api/work-trackers";
import { useOrgTimezone } from "@/lib/store/session";
import { useWorkEvidence } from "@/lib/store/work-trackers";
import { formatDateShort } from "@/lib/time";
import { WorkList } from "./work-list";
import { WorkRow } from "./work-row";

/**
 * Somebody's tickets from a connected work tracker, for one period.
 *
 * **Context, not score.** None of these figures enters the composite mark, and the tooltip says so,
 * because a number on an appraisal page reads as part of the mark unless told otherwise. Counting
 * tickets is a poor measure of effort; it is a good prompt for the conversation.
 *
 * One list with no heading, in the same shape as the work finished on the project boards: a small line
 * ("12 finished"), the rules behind one info mark, and a row per ticket (its key, its title, and when it
 * was finished, or where it stands if it was not). A ticket was once also graded on its own, in a column of its
 * own; that grade is gone, and so is the column.
 *
 * Renders nothing when there are no tickets at all, which is every company that has not connected a
 * tool: a card explaining an integration nobody set up is noise on a review.
 */

const STATUS: Record<ExternalTaskStatus, string> = {
  DONE: "Done",
  IN_PROGRESS: "In progress",
  TODO: "To do",
};

export function WorkEvidence({
  employeeId,
  range,
  title = "Work from connected tools",
}: {
  employeeId: string | null;
  range: EvidenceRange;
  /** What a screen reader calls the card. It is not drawn: the page around it says what it is. */
  title?: string;
}) {
  const { evidence, loading, error, reload } = useWorkEvidence(
    employeeId,
    range,
  );
  const timeZone = useOrgTimezone();

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

  return (
    <WorkList
      framed
      label={title}
      lead={
        summary.completed > 0
          ? `${String(summary.completed)} finished`
          : "None finished"
      }
      note={`Tickets from ${providers.join(" and ")}, ${formatDateShort(evidence.from, timeZone)} to ${formatDateShort(evidence.to, timeZone)}. Only what was tracked there is here, so a short list is not a short record of work. They are for your conversation and are not part of the score.`}
      rows={evidence.tasks.map((task) => (
        <WorkRow
          key={task.id}
          itemKey={task.key}
          title={task.title}
          href={task.url}
          newTab
          facts={[
            task.completedAt
              ? `Finished ${formatDateShort(task.completedAt, timeZone)}`
              : task.statusName || STATUS[task.status],
          ]}
        />
      ))}
    />
  );
}
