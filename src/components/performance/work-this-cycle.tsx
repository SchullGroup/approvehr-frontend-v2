"use client";

import { LoadFailure, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { dayLabel } from "@/lib/api/performance";
import { useWorkThisCycle } from "@/lib/store/completions";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { CompletedItem } from "./completed-item";
import { useFlagging } from "./work-flags";
import { WORK_LEFT_OUT, WorkList } from "./work-list";

/**
 * The work done in a review's period, read inside the review and the answering form.
 *
 * What the person the review is about finished on the project boards over the period the review covers:
 * one list, with no heading, a small line that says how many, and every rule about it behind one info
 * mark. It is evidence for the reader to weigh beside the answers, and it is read-only.
 *
 * ## Not a score
 *
 * Every figure is a count of finished tasks, written as a count ("12 finished"), never as a rate or a
 * rating, and there is no total that could be read as a mark. It does not change the mark, and the
 * tooltip says so. Effort is never read. A task with no link is just as much a finished task as one with
 * a link.
 *
 * ## Who sees it
 *
 * The API answers only for the person, those who lead them, HR, and the people assigned to appraise them
 * in this cycle (a functional manager or project lead need not be on the reporting line, and the review
 * is open to them). For anybody else it answers as if the person were not there, and this draws nothing,
 * not a refusal.
 *
 * ## Not there without Projects
 *
 * A company that has not switched Projects on has no boards to read, and "no tasks finished" would be a
 * claim about work nobody tracks, read as low output. So the list is not offered at all, and draws nothing
 * while the company's switches are still on their way, so it never flashes up and goes.
 *
 * ## What it says it cannot show
 *
 * The list is only what was tracked in Projects. It does not show meetings, mentoring or anything done
 * outside Projects, and says so in the tooltip, so a short list is never read as a short record of work.
 * Nothing recorded is "Not recorded", with the same tooltip.
 *
 * That sentence has to be true against whichever server answers, so it says nothing the server alone
 * decides. Which tasks the list leaves out (a to-do the person made for themselves on their own list) is
 * the API's rule, and each row shows what is left to say: **Personal** for a task from somebody's own list
 * and **Set by** for one somebody else made.
 *
 * ## One request
 *
 * It asks once the review is in hand and the reader is somebody the API will answer, and again only when
 * the review's own period changes.
 *
 * ## "This is wrong"
 *
 * Where the company has switched on "Work in review answers", the person the work is about can flag an
 * item on the list as wrong, with a reason, from the row's menu, and whoever reads the list sees the flag
 * under the row and a count in the summary. A flag is a statement for the reader: it removes nothing from
 * the list and moves no mark.
 *
 * **A flag that was written is drawn whether or not the switch is still on**: turning it off stops
 * anything new and does not hide what somebody said, and the person can still take one back. Raising or
 * changing one needs the switch on. Nothing is drawn where the server said nothing about flags, and a list
 * with no flags is never read as "nothing was flagged" there. The state is shared with the record kept with
 * a rating (`useWorkFlags`), so a flag raised in one list is in the other at once.
 */
export function WorkThisCycle({
  subjectId,
  cycleId,
  periodStart,
  periodEnd,
  subjectName,
  own,
  enabled = true,
  framed = false,
  note,
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
  /** In a card of its own, for a page. A drawer has its own surface. */
  framed?: boolean;
  /** One more rule for the tooltip: why this list may differ from the one the appraiser read. */
  note?: string;
}) {
  const timeZone = useOrgTimezone();
  const projects = useProjectsGate();
  /* Not offered without Projects, and not asked for either (see above). */
  const active = enabled && projects.enabled;
  const read = useWorkThisCycle({
    subjectId,
    cycleId,
    periodStart,
    periodEnd,
    enabled: active,
  });
  const flagging = useFlagging({
    cycleId,
    subjectId,
    subjectName,
    own,
    enabled: active,
  });

  if (!active) return null;
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

  const period =
    periodStart && periodEnd
      ? `${dayLabel(periodStart)} to ${dayLabel(periodEnd)}`
      : "the last 90 days";
  const flagged = flagging.countIn(work.items.map((item) => item.id));
  const lead = [
    `${String(work.summary.finished)} finished`,
    work.capped ? `latest ${String(work.items.length)} shown` : null,
    flagged,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <WorkList
      framed={framed}
      lead={lead}
      note={[
        `Finished on the project boards, ${period}. For reading beside the answers; it does not change the score.`,
        WORK_LEFT_OUT,
        flagging.sentence,
        note,
      ]
        .filter((part) => part)
        .join(" ")}
      rows={work.items.map((item) => (
        <CompletedItem
          key={item.id}
          item={item}
          timeZone={timeZone}
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
