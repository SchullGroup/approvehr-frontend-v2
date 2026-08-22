"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Badge, Disclosure, Skeleton } from "@/components/ui";
import { usePermissions } from "@/lib/permissions";
import { useRecordTimeline } from "@/lib/store/audit";
import { TrailEntry } from "./entry";

/**
 * What happened to one record, as a panel a record page can drop in.
 *
 * ```tsx
 * <RecordHistory entityType="employees" entityId={employee.id} />
 * ```
 *
 * The same rows and the same sentences as the full log, so a change reads
 * identically wherever it is seen. Two things this component does that a naive
 * version would not:
 *
 * ## It renders nothing at all without `VIEW_AUDIT`
 *
 * Not a locked panel, not an explanation — nothing. This is a section of
 * somebody else's page, and a card telling a reader about a thing they cannot
 * see is worse than the absence of the card. The API enforces the same rule; the
 * check here is so the interface never offers what will fail.
 *
 * ## It is closed by default — `PARITY.md` Rule 5
 *
 * An audit trail is reference-shaped: it answers "what happened to this record",
 * which is never the question the page it sits on is answering. So it collapses,
 * and the summary carries the count — including "None yet", which is the whole
 * answer for most records and saves the click entirely. Nothing in here needs
 * action now, which is the only reason it may be closed at all.
 *
 * ## It says when it cannot answer, rather than showing an empty timeline
 *
 * An empty timeline means "nothing has ever happened to this record", and there
 * is one case where that is false: a module whose `subjectType` the audit API
 * cannot be asked about. `payroll` writes `PayrollRun` — PascalCase, where every
 * other module writes `snake_case` — and the audit API's entity-type validator
 * only accepts lower case, so the run's own events cannot be looked up by id.
 *
 * That is a real gap, and the honest thing is one short line saying so.
 *
 * TODO(payroll): the fix is in the API, not here. Change the three
 * `auditor(req)(…, "PayrollRun", …)` calls in
 * `approvehr-api/src/modules/payroll/router.ts` (lines 68, 89 and 104) to
 * `"payroll_runs"`, and add a `payroll_runs` entry to `KINDS` in
 * `src/modules/audit/labels.ts` so a run resolves to its period instead of to a
 * short id. This component then needs no change: pass `entityType="payroll_runs"`.
 */
export type RecordHistoryProps = {
  entityType: string;
  entityId: string;
  /** How many rows before the link to the full log. */
  limit?: number;
  /** Overrides the heading. Defaults to "History". */
  title?: string;
  className?: string;
};

/**
 * The permission gate is its own component so the hook below it never runs
 * without `VIEW_AUDIT` — a check inside `Panel` would return null *after*
 * asking the API a question it is going to refuse, once per record page.
 * `usePermissions().loading` keeps a legitimate reader from seeing the panel
 * appear late, by not rendering anything until the session has resolved.
 */
export function RecordHistory(props: RecordHistoryProps) {
  const { can, loading } = usePermissions();
  if (loading || !can("VIEW_AUDIT")) return null;
  return <Panel {...props} />;
}

function Panel({
  entityType,
  entityId,
  limit = 6,
  title = "History",
  className,
}: RecordHistoryProps) {
  const timeline = useRecordTimeline(entityType, entityId, { limit });

  const href = `/settings/audit?entityType=${encodeURIComponent(
    entityType,
  )}&entityId=${encodeURIComponent(entityId)}`;

  /*
   * The count, or nothing.
   *
   * Absent is not zero: while the request is in flight, or when it failed, or
   * when this kind of record cannot be looked up at all, there is no number to
   * state and the badge does not appear. "None yet" is a different claim and is
   * only made once the answer is actually in.
   */
  const counted =
    timeline.queryable &&
    timeline.error === null &&
    !(timeline.loading && timeline.entries.length === 0);

  return (
    <Disclosure
      className={className}
      title={title}
      meta={
        counted ? (
          <Badge tone="neutral" size="sm">
            {timeline.total === 0
              ? "None yet"
              : timeline.total === 1
                ? "1 change"
                : `${timeline.total} changes`}
          </Badge>
        ) : null
      }
      hint={
        timeline.queryable
          ? "Who changed what, and when."
          : "The audit trail cannot look this kind of record up yet."
      }
      panelClassName="p-5"
    >
      {!timeline.queryable ? (
        <p className="text-body-sm leading-relaxed text-muted">
          The audit trail cannot look this kind of record up yet.
        </p>
      ) : timeline.loading && timeline.entries.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <span className="sr-only">Loading this record’s history</span>
        </div>
      ) : timeline.error ? (
        <p className="text-body-sm leading-relaxed text-body">
          {timeline.error.message}
        </p>
      ) : timeline.entries.length === 0 ? (
        <p className="flex items-center gap-2 text-body-sm text-muted">
          <History aria-hidden="true" className="size-4 shrink-0 text-faint" />
          Nothing recorded against this record yet.
        </p>
      ) : (
        <>
          <ol role="list" className="flex flex-col">
            {timeline.entries.map((entry, index) => (
              <TrailEntry
                key={entry.id}
                entry={entry}
                now={timeline.now}
                rail={index < timeline.entries.length - 1}
              />
            ))}
          </ol>
          {/* Moved out of the header: a summary button cannot contain a link. */}
          {timeline.total > timeline.entries.length && (
            <Link
              href={href}
              className="mt-3 inline-block text-body-sm font-medium text-accent-text hover:underline"
            >
              All {timeline.total}
            </Link>
          )}
        </>
      )}
    </Disclosure>
  );
}
