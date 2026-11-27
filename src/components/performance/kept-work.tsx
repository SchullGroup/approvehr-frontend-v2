"use client";

import { Skeleton } from "@/components/ui";
import { dayLabel } from "@/lib/api/performance";
import type { KeptWorkRecord } from "@/lib/api/kept-work";
import { workFacts } from "@/lib/performance/work-in-answers";
import { workIssueHref } from "@/lib/projects/objectives";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { useKeptWork } from "@/lib/store/kept-work";
import { formatDateShort } from "@/lib/time";
import { useFlagging } from "./work-flags";
import { WORK_LEFT_OUT, WorkList } from "./work-list";
import { WorkRow } from "./work-row";
import { WorkThisCycle } from "./work-this-cycle";

/**
 * The work behind a rating, on a review.
 *
 * A review is read beside a list of what the person finished in the cycle (`WorkThisCycle`), and that list
 * is **live**: reopening, relinking or deleting a task later changes what an old review shows. For a
 * company that has chosen a retention period, the list as it stood on the day the rating was made final is
 * kept with it, and this is where it is read. Everything else about the list is as it was: evidence to
 * read, never a number.
 *
 * ## One list, never two
 *
 * Two lists on one page, each saying a different thing about the same person, is the failure. So this
 * draws **one**: the record when there is one, because it is what the appraiser could read, and the live
 * list when there is not. What is different about the live list is said in its tooltip, not above it.
 *
 * ## What this draws, by what the server said
 *
 * - **The rating is not final, or it is not a manager's:** the live list.
 * - **`NOT_KEPT`:** the live list. Its tooltip says nothing was kept from the day the rating was made
 *   final, so it may differ from what the appraiser read. True of every rating made final before a
 *   company chose a period.
 * - **`REMOVED`:** the live list, and its tooltip says a record was kept and when its period ended.
 * - **`KEPT`:** the record, and nothing else.
 * - **Anything the server could not answer** (the reader may not see it, a server one deploy behind, a
 *   failed request): the live list and nothing about a record. A server that does not say makes no claim,
 *   and `null` is never read as "none was kept".
 *
 * ## What it never shows
 *
 * A task title. The record does not hold one (a title can carry health or trade-union details), so a row
 * is the task's key, which opens the task as it is now. The tooltip says so.
 *
 * ## Not there without Projects
 *
 * Like the live list, nothing is drawn while the company has Projects off or its switches are still on
 * their way. Nothing is deleted when Projects goes off, and it is all there when it comes back.
 *
 * ## "This is wrong"
 *
 * A row of the record carries the person's flag, and the person's menu for it, exactly as a row of the
 * live list does (`WorkThisCycle`), and from the same shared state: a flag that was written is drawn
 * whether or not the switch is still on, and raising or changing one needs it on. A flag is the person's
 * word that an item is not right. It does not remove the item from the record or change the mark.
 */
export function WorkBehindTheMark({
  reviewId,
  kind,
  final,
  disputed,
  subjectId,
  cycleId,
  periodStart,
  periodEnd,
  subjectName,
  own,
}: {
  reviewId: string;
  kind: "SELF" | "MANAGER" | "PEER";
  /** The rating is final: only then is there a record to read. */
  final: boolean;
  /** A formal dispute is on the rating, which is why a record can be kept longer. */
  disputed: boolean;
  subjectId: string;
  cycleId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subjectName: string;
  /** The review is about the reader, so it speaks to "you". */
  own: boolean;
}) {
  const projects = useProjectsGate();
  const timeZone = useOrgTimezone();
  /* A cycle with no dates has no stretch to read, so there is no list for a note to be about. */
  const dated = periodStart !== null && periodEnd !== null;
  const asks = kind === "MANAGER" && final && dated && projects.enabled;
  const evidence = useKeptWork(reviewId, asks);

  const live = (note?: string) => (
    <WorkThisCycle
      framed
      subjectId={subjectId}
      cycleId={cycleId}
      periodStart={periodStart}
      periodEnd={periodEnd}
      subjectName={subjectName}
      own={own}
      enabled={kind !== "PEER"}
      {...(note ? { note } : {})}
    />
  );

  if (!asks) return live();
  if (evidence.loading) {
    return (
      <Skeleton
        className="h-16 w-full"
        aria-label="Loading the work behind this rating"
      />
    );
  }
  const record = evidence.data;
  if (!record || record.state === "NOT_FINAL") return live();

  if (record.state === "NOT_KEPT") {
    return live(
      "Nothing was kept of this list when the rating was made final, so it is read as it stands now and may differ from what the appraiser read.",
    );
  }

  if (record.state === "REMOVED") {
    return live(
      `The work behind this rating was kept when it was made final, and was removed on ${formatDateShort(record.endedAt, timeZone)}, when its retention period ended. This list is read as it stands now and may differ from what the appraiser read.`,
    );
  }

  return (
    <KeptRecord
      record={record}
      disputed={disputed}
      timeZone={timeZone}
      cycleId={cycleId}
      subjectId={subjectId}
      subjectName={subjectName}
      own={own}
    />
  );
}

/** One sentence for how long the record is kept, with the dispute's part said when it applies. */
export function keptUntilLine(
  retainUntil: string,
  timeZone: string,
  disputed: boolean,
): string {
  const until = `Kept until ${formatDateShort(retainUntil, timeZone)}, then removed.`;
  return disputed
    ? `${until} The rating was disputed, so it is kept for a full period from then.`
    : until;
}

function KeptRecord({
  record,
  disputed,
  timeZone,
  cycleId,
  subjectId,
  subjectName,
  own,
}: {
  record: KeptWorkRecord;
  disputed: boolean;
  timeZone: string;
  cycleId: string | null;
  subjectId: string;
  subjectName: string;
  own: boolean;
}) {
  const flagging = useFlagging({
    cycleId,
    subjectId,
    subjectName,
    own,
    enabled: true,
  });
  const { summary, items } = record;
  const period = `${dayLabel(record.period.start)} to ${dayLabel(record.period.end)}`;
  const flagged = flagging.countIn(items.map((item) => item.id));
  const lead = [
    `${String(summary.finished)} finished`,
    record.truncated ? `newest ${String(items.length)} kept` : null,
    flagged,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <WorkList
      framed
      lead={lead}
      note={[
        `Finished on the project boards, ${period}, as it stood on ${formatDateShort(record.frozenAt, timeZone)}, when the rating was made final. It does not change if tasks are reopened or removed later, and it does not change the score.`,
        "Task titles are not kept in this record. Open a task to read it as it is now.",
        keptUntilLine(record.retainUntil, timeZone, disputed),
        WORK_LEFT_OUT,
        flagging.sentence,
      ]
        .filter((part) => part)
        .join(" ")}
      rows={items.map((item) => (
        <WorkRow
          key={item.id}
          itemKey={item.key}
          href={workIssueHref(item)}
          facts={workFacts(item, timeZone)}
          extra={flagging.lineFor(item.id)}
          action={flagging.menuFor(item.id, item.key)}
        />
      ))}
      problem={flagging.problem}
    >
      {flagging.dialog}
    </WorkList>
  );
}
