"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadState,
  SegmentedControl,
  Stat,
  type BadgeTone,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { isPersonalSource, workIssueHref } from "@/lib/projects/objectives";
import {
  dayLabel,
  performanceApi,
  type ApiTaskGrade,
  type ApiWorkRecord,
  type ApiWorkRecordIssue,
  type ApiWorkRecordPeriod,
} from "@/lib/api/performance";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * What somebody finished on the project boards, a day, week, month or quarter
 * at a time.
 *
 * ## Nothing here is computed
 *
 * The tiles, the completion rates and the period label are the API's figures
 * and the API's words. The completion rate is the same one the appraisal uses
 * (`rateFromGradedTasks`); a second implementation here is how this screen
 * would end up disagreeing with the mark it sits beside.
 *
 * ## Stepping between periods
 *
 * The API takes a `date` anywhere inside the period it should answer for, so
 * "previous" and "next" send a date half a day outside the current one: noon
 * of the last day before `start`, noon of the first day from `end` (`end` is
 * exclusive). Noon, not midnight, because both ends are the company's
 * midnight as an instant, and the UTC date of an instant a minute either side
 * of it can be the wrong calendar day for a company east of Greenwich.
 *
 * ## An issue with no weekly task has no grade text
 *
 * "Waiting for a grade" is said only where a weekly task of theirs is attached
 * and ungraded. An issue that never fed a weekly task has nothing to wait for.
 */

const PERIODS: { value: ApiWorkRecordPeriod; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

const GRADE_WORDS: Record<ApiTaskGrade, { label: string; tone: BadgeTone }> = {
  COMPLETED: { label: "Completed", tone: "success" },
  PARTIALLY_COMPLETED: { label: "Partly completed", tone: "warning" },
  NOT_COMPLETED: { label: "Not completed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the instant `offsetMs` from `iso`. */
const dateAround = (iso: string, offsetMs: number): string =>
  new Date(new Date(iso).getTime() + offsetMs).toISOString().slice(0, 10);

export function WorkRecordPanel({ employeeId }: { employeeId?: string }) {
  const { isConnected } = useSession();
  const [period, setPeriod] = useState<ApiWorkRecordPeriod>("week");
  /* `undefined` is "today", which the API works out in the company's zone. */
  const [date, setDate] = useState<string | undefined>(undefined);

  const load = useCallback(
    (signal: AbortSignal) =>
      employeeId
        ? performanceApi.workRecord(employeeId, { period, date }, signal)
        : performanceApi.myWorkRecord({ period, date }, signal),
    [employeeId, period, date],
  );
  const fetched = useFetched<ApiWorkRecord>(
    `work-record|${employeeId ?? "mine"}|${period}|${date ?? "today"}`,
    isConnected,
    load,
  );
  const record = fetched.data;
  const notAvailable =
    fetched.error instanceof ApiError && fetched.error.status === 404;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Period"
          options={PERIODS}
          value={period}
          onChange={(next) => {
            setPeriod(next);
            setDate(undefined);
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous period"
            disabled={!record}
            onClick={() =>
              record && setDate(dateAround(record.period.start, -HALF_DAY_MS))
            }
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-body-sm font-medium text-ink">
            {record?.period.label ?? " "}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next period"
            disabled={!record}
            onClick={() =>
              record && setDate(dateAround(record.period.end, HALF_DAY_MS))
            }
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {notAvailable ? (
        <Card>
          <EmptyState
            compact
            icon={<ListChecks aria-hidden="true" />}
            title={
              employeeId
                ? "You can't open this person's work record."
                : "This sign-in has no staff record, so there is no work record to show."
            }
          />
        </Card>
      ) : (
        /* Loading, failure and the answer are one decision (`LoadState`): the
           record, and its "nothing finished" empty state inside it, are drawn
           only once the read has answered, and a failed read draws the failure
           card and nothing under it. */
        <LoadState
          loading={fetched.loading}
          error={fetched.error}
          subject="this work record"
          onRetry={fetched.reload}
          hasData={record !== null}
          skeleton="list"
        >
          {record && <Record record={record} />}
        </LoadState>
      )}
    </div>
  );
}

function Record({ record }: { record: ApiWorkRecord }) {
  const { summary } = record;

  if (summary.finished === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<ListChecks aria-hidden="true" />}
          title={`Nothing finished on the board in this ${record.period.kind}.`}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tasks finished" value={summary.finished} />
        {/* "0 of 0" would be a claim about due dates when none were set, so the
            tile says so instead of dividing nothing by nothing. */}
        <Stat
          label="Done by due date"
          value={
            summary.withDueDate === 0 ? (
              <span className="text-faint">—</span>
            ) : (
              `${summary.onTime} of ${summary.withDueDate}`
            )
          }
          {...(summary.withDueDate === 0
            ? { hint: "None of these had a due date" }
            : {})}
        />
        <Stat
          label="Completion rate"
          value={
            summary.completionRate === null ? (
              <span className="text-faint">—</span>
            ) : (
              `${summary.completionRate}%`
            )
          }
        />
        <Stat
          label="Count toward an objective"
          value={`${summary.linkedToObjective} of ${summary.finished}`}
        />
      </div>

      <Card>
        <CardHeader level={3} title="By objective" />
        <CardBody>
          <ul className="divide-y divide-line">
            {record.byObjective.map((row) => (
              <li
                key={`${row.goalId ?? "none"}|${row.keyResultTitle ?? ""}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
              >
                <p className="text-body-sm text-ink">
                  {row.goalId === null
                    ? "Not linked to an objective"
                    : row.keyResultTitle
                      ? `${row.title} · KPI: ${row.keyResultTitle}`
                      : row.title}
                </p>
                <p className="tabular text-body-sm text-muted">
                  {row.finished} finished
                  {row.completionRate !== null &&
                    ` · ${row.completionRate}% complete`}
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {record.days.map((day) => (
        <Card key={day.date}>
          <CardHeader level={3} title={dayLabel(day.date)} />
          <CardBody>
            <ul className="divide-y divide-line">
              {day.issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </>
  );
}

function IssueRow({ issue }: { issue: ApiWorkRecordIssue }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* A `MY-n` task opens on its own page by id; a board issue on its
            board. The viewer may not be allowed in; the page then says so in
            the app's usual not-found, which is acceptable. */}
        <Link
          href={workIssueHref(issue)}
          className="tabular text-body-sm font-medium text-accent hover:underline"
        >
          {issue.key}
        </Link>
        <span className="text-body-sm text-ink">{issue.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
        <span>
          {isPersonalSource({ key: issue.key, projectId: issue.projectId })
            ? "Personal"
            : issue.projectName}
        </span>
        {issue.labels.map((label) => (
          <Badge key={label} tone="neutral" size="sm">
            {label}
          </Badge>
        ))}
        {issue.grade ? (
          <Badge tone={GRADE_WORDS[issue.grade].tone} size="sm">
            {GRADE_WORDS[issue.grade].label}
          </Badge>
        ) : issue.waitingForGrade ? (
          <Badge tone="neutral" size="sm">
            Waiting for a grade
          </Badge>
        ) : null}
      </div>
      {issue.links.map((link, n) => (
        <p key={n} className="text-meta text-muted">
          {link.otherKey
            ? `${link.label} ${link.otherKey}`
            : `${link.label} a task you can't open`}
        </p>
      ))}
    </li>
  );
}
