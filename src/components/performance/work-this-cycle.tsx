"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Disclosure, LoadFailure, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { usePhone } from "@/app/(app)/hiring/requisitions/[id]/use-phone";
import { dayLabel } from "@/lib/api/performance";
import {
  objectiveCountLabel,
  type WorkThisCycle as Work,
} from "@/lib/projects/completions";
import { count } from "@/lib/projects/terms";
import { useWorkThisCycle } from "@/lib/store/completions";
import { useOrgTimezone } from "@/lib/store/session";
import { CompletedItem } from "./completed-item";

/**
 * "Work this cycle", inside a review.
 *
 * What the person the review is about finished on the project boards over the
 * period the review covers: how many tasks, how many by their due date, how many
 * are linked to an objective, which projects they were in, and the list. It is
 * evidence for the reader to weigh beside the answers, and it is read-only.
 *
 * ## Not a score
 *
 * Every figure is a count of finished tasks, written as a count ("9 of 12"),
 * never as a rate or a rating, and there is no total that could be read as a
 * mark. It does not change the mark, and the panel says so. Effort is never read.
 * A task with no link is just as much a finished task as one with a link, so the
 * share that is linked is a plain fact and never a shortfall.
 *
 * ## Who sees it
 *
 * The API answers only for the person and those who lead them, or HR. For anybody
 * else it answers as if the person were not there, and this draws nothing, not a
 * refusal. It is collapsed on a phone, where a review is already long, and open
 * beside the answers on a wider screen.
 *
 * ## One request
 *
 * It asks once the review is in hand and the reader is somebody the API will
 * answer, and again only when the review's own period changes.
 */
export function WorkThisCycle({
  subjectId,
  cycleId,
  periodStart,
  periodEnd,
  subjectName,
  own,
  enabled = true,
  startOpen,
}: {
  /** Whose work: the person the review is about, always. */
  subjectId: string;
  cycleId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subjectName: string;
  /** The review is about the reader, so it speaks to "you". */
  own: boolean;
  enabled?: boolean;
  /**
   * Open on arrival, whatever the screen. Left out, it is open on a wide screen
   * and closed on a phone; a drawer that was opened to see the work asks for it
   * open.
   */
  startOpen?: boolean;
}) {
  const timeZone = useOrgTimezone();
  const phone = usePhone();
  const [choice, setChoice] = useState<boolean | null>(null);
  const read = useWorkThisCycle({
    subjectId,
    cycleId,
    periodStart,
    periodEnd,
    enabled,
  });

  if (!enabled) return null;
  if (read.loading) {
    return <Skeleton className="h-16 w-full" aria-label="Loading work" />;
  }
  if (read.error) {
    /* Not the reader's to see, or not there to see: as if there were nothing. */
    if (
      read.error instanceof ApiError &&
      (read.error.status === 403 || read.error.status === 404)
    ) {
      return null;
    }
    return (
      <LoadFailure
        subject="the work done in this period"
        error={read.error}
        onRetry={read.reload}
      />
    );
  }
  const work = read.data;
  if (!work) return null;

  const open = choice ?? startOpen ?? !phone;
  const who = own ? "You" : subjectName;
  const period =
    periodStart && periodEnd
      ? `${dayLabel(periodStart)} to ${dayLabel(periodEnd)}`
      : "the last 90 days";

  return (
    <Disclosure
      level={3}
      title="Work this cycle"
      meta={
        work.summary.finished > 0 ? (
          <span className="text-body-sm font-normal text-muted">
            {count(work.summary.finished, "task")} finished
          </span>
        ) : undefined
      }
      hint={`Finished on the project boards, ${period}. For reading beside the answers; it does not change the mark.`}
      open={open}
      onToggle={() => setChoice(!open)}
    >
      <div className="flex flex-col gap-5">
        {work.summary.finished === 0 ? (
          <p className="text-body-sm text-muted">
            {who === "You"
              ? "You finished no tasks on the project boards in this period."
              : `${who} finished no tasks on the project boards in this period.`}
          </p>
        ) : (
          <Body
            work={work}
            timeZone={timeZone}
            seeAll={
              own
                ? "/performance/work-record"
                : `/performance/history/${subjectId}`
            }
          />
        )}
      </div>
    </Disclosure>
  );
}

const SHOWN = 10;

function Body({
  work,
  timeZone,
  seeAll,
}: {
  work: Work;
  timeZone: string;
  seeAll: string;
}) {
  const [all, setAll] = useState(false);
  const { summary } = work;
  const rows = all ? work.items : work.items.slice(0, SHOWN);

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
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
        <Fact label="Projects" value={String(work.byProject.length)} />
      </dl>

      <section aria-labelledby="work-by-project">
        <h4
          id="work-by-project"
          className="mb-1.5 text-body-sm font-medium text-ink"
        >
          By project
        </h4>
        <ul className="flex flex-col gap-1 text-body-sm text-body">
          {work.byProject.map((p) => (
            <li key={p.projectId} className="flex justify-between gap-4">
              <span className="min-w-0 break-words">{p.projectName}</span>
              <span className="tabular shrink-0 text-muted">
                {p.finished === 1
                  ? "1 finished"
                  : `${String(p.finished)} finished`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Only worth a section when some of it is linked: a list that says
          "not linked" and nothing else would be a heading over a blank. */}
      {work.byObjective.some((o) => !o.unlinked) && (
        <section aria-labelledby="work-by-objective">
          <h4
            id="work-by-objective"
            className="mb-1.5 text-body-sm font-medium text-ink"
          >
            By objective
          </h4>
          <ul className="flex flex-col gap-1 text-body-sm text-body">
            {work.byObjective.map((o) => (
              <li
                key={`${o.goalId ?? (o.unlinked ? "none" : "hidden")}|${o.keyResultTitle ?? ""}`}
                className="flex justify-between gap-4"
              >
                <span className="min-w-0 break-words">
                  {objectiveCountLabel(o)}
                </span>
                <span className="tabular shrink-0 text-muted">
                  {o.finished === 1
                    ? "1 finished"
                    : `${String(o.finished)} finished`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="work-items">
        <h4 id="work-items" className="mb-2 text-body-sm font-medium text-ink">
          Finished tasks
        </h4>
        <ul className="divide-y divide-line">
          {rows.map((item) => (
            <CompletedItem key={item.id} item={item} timeZone={timeZone} />
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted">
          {work.items.length > SHOWN && (
            <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${String(work.items.length)}`}
            </Button>
          )}
          {work.capped && (
            <span>
              Showing the latest {String(work.items.length)} of{" "}
              {String(work.total)}.{" "}
              <Link
                href={seeAll}
                className="font-medium text-accent hover:underline"
              >
                Open the work record
              </Link>{" "}
              for all of it.
            </span>
          )}
        </div>
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="tabular text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
