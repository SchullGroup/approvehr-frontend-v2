"use client";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressMeter,
} from "@/components/ui";
import {
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  useKpis,
  useMyTasks,
} from "@/lib/store/performance";
import type { ApiMyTask } from "@/lib/api/performance";

/**
 * What this person actually did, shown while they rate themselves.
 *
 * ## Why it is here at all
 *
 * The self-review asked somebody to put a number on their own period with
 * nothing on screen about that period. Every figure it needs already exists —
 * `useKpis` has the objectives and their progress, `useMyTasks` has the weekly
 * log and its grades — and the form read none of it, so the answer came out of
 * memory. A mark argued over months later is only defensible if the person
 * giving it could see what they were marking.
 *
 * ## Only ever the caller's own
 *
 * Both hooks are scoped to the signed-in person. Rendering them on a review
 * **about somebody else** would put the manager's own objectives and tasks
 * under the subject's name — a wrong claim, in the one place a wrong claim is
 * least recoverable. The caller gates on `kind === "SELF" && mine`; this
 * component takes no employee id precisely so it cannot be pointed elsewhere.
 *
 * ## Absent is not zero
 *
 * Nobody with no logged tasks has a 0% completion rate — they have no rate.
 * The three graded outcomes are counted separately from work that is logged
 * and **not yet graded**, because "not completed" and "nobody has looked at it
 * yet" are opposite facts and folding the second into the first understates
 * somebody's period in the direction that costs them. Same reason the rate is
 * taken over graded tasks and says so: a denominator that includes ungraded
 * work reports a fall in performance that is really a manager's backlog.
 */
export function SelfEvidence({
  periodStart,
  periodEnd,
}: {
  periodStart: string | null;
  periodEnd: string | null;
}) {
  const { goals, loading: goalsLoading } = useKpis("mine");
  const { tasks, loading: tasksLoading } = useMyTasks();

  /* Company-wide goals are not this person's objectives. They arrive in the
     same list because the KPI screen shows both; counting them here would
     credit somebody with a target nobody set them. */
  const mine = goals.filter((goal) => !goal.companyWide);

  /* Only the weeks this review is actually about, when the period says.
     A review with no dates — most of the older ones, nothing was back-filled —
     gets the whole log, and the heading below says which it is looking at. */
  const scoped = inPeriod(tasks, periodStart, periodEnd);

  const graded = scoped.filter((task) => task.grade !== null);
  const completed = scoped.filter((task) => task.grade === "COMPLETED").length;
  const partial = scoped.filter(
    (task) => task.grade === "PARTIALLY_COMPLETED",
  ).length;
  const notCompleted = scoped.filter(
    (task) => task.grade === "NOT_COMPLETED",
  ).length;
  const ungraded = scoped.length - graded.length;

  /* Null, not 0, with nothing graded to take it over. */
  const rate =
    graded.length === 0 ? null : Math.round((completed / graded.length) * 100);

  const nothingYet =
    !goalsLoading && !tasksLoading && mine.length === 0 && scoped.length === 0;
  if (nothingYet) return null;

  return (
    <Card>
      <CardHeader
        level={3}
        title="Your period, as recorded"
        description={
          periodStart && periodEnd
            ? "What is on file for the dates above. Marking yourself against it beats marking from memory."
            : "This period carries no dates, so this is your whole logged record."
        }
      />
      <CardBody className="grid gap-6 sm:grid-cols-2">
        <section>
          <h4 className="mb-3 text-body-sm font-semibold text-ink">
            Weekly tasks
          </h4>
          {scoped.length === 0 ? (
            <p className="text-body-sm text-muted">
              Nothing logged for this period.
            </p>
          ) : (
            <dl className="flex flex-col gap-2">
              <Line label="Logged" value={scoped.length} />
              {/* The three outcomes only once at least one exists.

                  With nothing graded they are all genuinely 0, and three
                  coloured noughts under "Completed", "Partially completed" and
                  "Not completed" read as judgements somebody has made — when in
                  fact nobody has looked yet. That is absent rendered as zero,
                  on the screen where it costs the person being marked. */}
              {graded.length > 0 && (
                <>
                  <Line
                    label="Completed"
                    value={completed}
                    tone="text-success-text"
                  />
                  <Line
                    label="Partially completed"
                    value={partial}
                    tone="text-warning-text"
                  />
                  <Line
                    label="Not completed"
                    value={notCompleted}
                    tone="text-danger-text"
                  />
                </>
              )}
              {/* Its own line, never folded into "not completed". */}
              {ungraded > 0 && (
                <Line
                  label="Not graded yet"
                  value={ungraded}
                  tone="text-muted"
                />
              )}
              {rate !== null && (
                <div className="mt-2 border-t border-line pt-3">
                  <ProgressMeter
                    value={rate}
                    label={`Completed, of ${String(graded.length)} graded`}
                    tone="accent"
                    size="sm"
                  />
                </div>
              )}
            </dl>
          )}
        </section>

        <section>
          <h4 className="mb-3 text-body-sm font-semibold text-ink">
            Your objectives
          </h4>
          {mine.length === 0 ? (
            <p className="text-body-sm text-muted">
              None of your own on file for this period.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {mine.map((goal) => (
                <li key={goal.id}>
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="text-body-sm font-medium text-ink">
                      {goal.title}
                    </span>
                    <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm">
                      {GOAL_STATUS_LABEL[goal.status]}
                    </Badge>
                  </div>
                  <ProgressMeter
                    value={goal.progress}
                    label={`${String(goal.progress)}% done`}
                    tone="accent"
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardBody>
    </Card>
  );
}

function Line({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-body-sm text-body">{label}</dt>
      <dd className={`text-body-sm font-semibold tabular-nums ${tone}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The tasks whose week overlaps the review period.
 *
 * Overlap rather than containment: a week that straddles the period boundary
 * is work partly done inside it, and dropping it would under-report the edges
 * of every period. Both dates absent means no filtering at all — see the
 * header.
 */
function inPeriod(
  tasks: ApiMyTask[],
  periodStart: string | null,
  periodEnd: string | null,
): ApiMyTask[] {
  if (!periodStart || !periodEnd) return tasks;
  return tasks.filter(
    (task) => task.weekEnd >= periodStart && task.weekStart <= periodEnd,
  );
}
