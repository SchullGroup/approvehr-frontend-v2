"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Disclosure, Skeleton } from "@/components/ui";
import { usePhone } from "@/app/(app)/hiring/requisitions/[id]/use-phone";
import { dayLabel } from "@/lib/api/performance";
import type { KeptWorkRecord, KeptWorkItem } from "@/lib/api/kept-work";
import { workIssueHref } from "@/lib/projects/objectives";
import { count } from "@/lib/projects/terms";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { useKeptWork } from "@/lib/store/kept-work";
import { formatDateShort } from "@/lib/time";
import { Fact, LeftOut, WorkThisCycle } from "./work-this-cycle";

/**
 * The work behind a rating, on a review.
 *
 * A review is read beside a list of what the person finished in the cycle (`WorkThisCycle`), and
 * that list is **live**: reopening, relinking or deleting a task later changes what an old review
 * shows. For a company that has chosen a retention period, the list as it stood on the day the
 * rating was made final is kept with it, and this is where it is read. Everything else about the
 * list is as it was: evidence to read, never a number, and the panel says so.
 *
 * ## What this draws, by what the server said
 *
 * - **The rating is not final, or it is not a manager's:** only the live list, exactly as before.
 * - **`NOT_KEPT`:** the live list, with one plain line above it saying nothing was kept from the
 *   day the rating was made final, so that list may differ from what the appraiser read. True of
 *   every rating made final before a company chose a period.
 * - **`REMOVED`:** the same, saying a record was kept and when its period ended.
 * - **`KEPT`:** the record, and the live list one click away. Two lists on one page, each saying a
 *   different thing about the same person, is the failure; the record is what the appraiser could
 *   read, so it leads, and the list as it stands now is asked for only if somebody wants it.
 * - **Anything the server could not answer** (the reader may not see it, a server one deploy
 *   behind, a failed request): the live list and nothing about a record. A server that does not
 *   say makes no claim, and `null` is never read as "none was kept".
 *
 * ## What it never shows
 *
 * A task title. The record does not hold one (a title can carry health or trade-union details), so
 * a row is the task's key, which opens the task as it is now. The panel says so beside the list.
 *
 * ## Not there without Projects
 *
 * Like the live list, nothing is drawn while the company has Projects off or its switches are
 * still on their way. Nothing is deleted when Projects goes off, and it is all there when it
 * comes back.
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

  const live = (
    <WorkThisCycle
      subjectId={subjectId}
      cycleId={cycleId}
      periodStart={periodStart}
      periodEnd={periodEnd}
      subjectName={subjectName}
      own={own}
      enabled={kind !== "PEER"}
    />
  );

  if (!asks) return live;
  if (evidence.loading) {
    return (
      <Skeleton
        className="h-16 w-full"
        aria-label="Loading the work behind this rating"
      />
    );
  }
  const record = evidence.data;
  if (!record || record.state === "NOT_FINAL") return live;

  if (record.state === "NOT_KEPT") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-muted">
          Nothing was kept of this list when the rating was made final, so the
          list below is read as it stands now and may differ from what the
          appraiser read.
        </p>
        {live}
      </div>
    );
  }

  if (record.state === "REMOVED") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-muted">
          The work behind this rating was kept when it was made final, and was
          removed on {formatDateShort(record.endedAt, timeZone)}, when its
          retention period ended. The list below is read as it stands now and
          may differ from what the appraiser read.
        </p>
        {live}
      </div>
    );
  }

  return (
    <KeptBesideLive
      record={record}
      disputed={disputed}
      timeZone={timeZone}
      who={own ? "you" : subjectName}
      live={live}
    />
  );
}

function KeptBesideLive({
  record,
  disputed,
  timeZone,
  who,
  live,
}: {
  record: KeptWorkRecord;
  disputed: boolean;
  timeZone: string;
  who: string;
  live: React.ReactNode;
}) {
  const [showLive, setShowLive] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <KeptRecord
        record={record}
        disputed={disputed}
        timeZone={timeZone}
        who={who}
      />
      {showLive ? (
        live
      ) : (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setShowLive(true)}>
            Show the list as it stands now
          </Button>
        </div>
      )}
    </div>
  );
}

const SHOWN = 10;

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
  who,
}: {
  record: KeptWorkRecord;
  disputed: boolean;
  timeZone: string;
  who: string;
}) {
  const phone = usePhone();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [all, setAll] = useState(false);
  const open = choice ?? !phone;
  const { summary, items } = record;
  const rows = all ? items : items.slice(0, SHOWN);
  const period = `${dayLabel(record.period.start)} to ${dayLabel(record.period.end)}`;

  return (
    <Disclosure
      level={3}
      title="Work when the rating was made final"
      meta={
        summary.finished > 0 ? (
          <span className="text-body-sm font-normal text-muted">
            {count(summary.finished, "task")} finished
          </span>
        ) : undefined
      }
      hint={`Finished on the project boards, ${period}, as it stood on ${formatDateShort(record.frozenAt, timeZone)}, when the rating was made final. It does not change if tasks are reopened or removed later, and it does not change the mark.`}
      open={open}
      onToggle={() => setChoice(!open)}
    >
      <div className="flex flex-col gap-5">
        {summary.finished === 0 ? (
          /* Nothing recorded, which says nothing about the work itself. */
          <p className="text-body-sm text-muted">
            {who === "you"
              ? "No finished tasks were recorded for you on the project boards in this period when the rating was made final."
              : `No finished tasks were recorded for ${who} on the project boards in this period when the rating was made final.`}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="Finished" value={String(summary.finished)} />
              <Fact
                label="By the due date"
                value={
                  summary.withDueDate === 0
                    ? "None had one"
                    : `${String(summary.onTime)} of ${String(summary.withDueDate)}`
                }
              />
              <Fact
                label="Linked to an objective"
                value={`${String(summary.linked)} of ${String(summary.finished)}`}
              />
            </dl>

            <section aria-labelledby="kept-work-items">
              <h4
                id="kept-work-items"
                className="mb-2 text-body-sm font-medium text-ink"
              >
                Finished tasks
              </h4>
              <ul className="divide-y divide-line">
                {rows.map((item) => (
                  <KeptRow key={item.id} item={item} timeZone={timeZone} />
                ))}
              </ul>
              {items.length > SHOWN && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAll((v) => !v)}
                  >
                    {all ? "Show fewer" : `Show all ${String(items.length)}`}
                  </Button>
                </div>
              )}
              {record.truncated && (
                <p className="mt-3 text-meta text-muted">
                  This record holds the newest {String(items.length)} of{" "}
                  {String(record.total)} tasks.
                </p>
              )}
            </section>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-meta text-muted">
            Task titles are not kept in this record. Open a task to read it as
            it is now.
          </p>
          <p className="text-meta text-muted">
            {keptUntilLine(record.retainUntil, timeZone, disputed)}
          </p>
          <LeftOut />
        </div>
      </div>
    </Disclosure>
  );
}

function KeptRow({ item, timeZone }: { item: KeptWorkItem; timeZone: string }) {
  const facts: string[] = [
    ...(item.personal ? ["Personal"] : []),
    `Finished ${formatDateShort(item.doneAt, timeZone)}`,
    ...(item.timing === "ON_TIME"
      ? ["On time"]
      : item.timing === "LATE"
        ? ["Late"]
        : []),
    /* Only when somebody else set it, as on the live list. */
    ...(item.setBy ? [`Set by ${item.setBy.name}`] : []),
    ...(item.linked ? ["Under an objective"] : []),
  ];
  return (
    <li className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
      <p>
        <Link
          href={workIssueHref(item)}
          className="tabular text-body-sm font-medium text-accent-text hover:underline"
        >
          {item.key}
        </Link>
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-muted">
        {facts.map((fact, index) => (
          <span key={index}>{fact}</span>
        ))}
      </p>
    </li>
  );
}
