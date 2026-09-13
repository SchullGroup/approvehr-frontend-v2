"use client";

import { History } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import type {
  ApiEmploymentChange,
  ApiEmploymentChangeKind,
  ApiFieldSnapshot,
} from "@/lib/api/endpoints";
import { useEmploymentChanges } from "@/lib/store/probation";
import { useDepartments } from "@/lib/store/departments";
/* Two decimals, always — a pay change is a figure somebody reconciles
   against a bank statement. The same formatter the payslip uses. */
import { money } from "@/lib/pay/flags";

/**
 * Why somebody is on the grade they are on.
 *
 * This panel **is** the promotion feature, and the rest of it is plumbing to
 * fill this in. `Employee` holds what is true now and cannot answer "who
 * confirmed him", "when did this department change and on whose say-so" or
 * "why is she on Grade 5" — which are the three questions an employment record
 * is actually kept for, and the three a dispute is decided on years later.
 *
 * Every row on it is a decision, including the ones nobody routed through an
 * approval: a salary edited straight on the Pay tab writes a row here naming
 * whoever edited it with no approver against it, because that is what happened
 * and a trail that only records the polite path has a hole in it the shape of
 * everything anybody wanted to hide.
 *
 * ## Absent is not "moved to nothing"
 *
 * `fromValue` / `toValue` carry only the fields a change touched. A key that is
 * not there is a field this change did not move; `null` is a field moved to
 * nothing. `describe` below renders the second and says nothing about the
 * first, because "we did not change their department" and "we took them out of
 * their department" are opposite facts.
 */
export function EmploymentHistoryPanel({ employeeId }: { employeeId: string }) {
  const { changes, loading, error, reload } = useEmploymentChanges(employeeId);
  /* Names, not ids. A timeline reading "departmentId moved to
     8f3c…-b21a" answers nothing anybody asked it. Archived included, because a
     department somebody was moved into in 2024 may well be gone. */
  const departments = useDepartments(true);

  if (error) {
    return (
      <LoadFailure
        subject="this person's employment history"
        error={error}
        onRetry={reload}
      />
    );
  }

  const departmentName = (id: string | null | undefined) =>
    id === null || id === undefined
      ? null
      : (departments.flat.find((d) => d.id === id)?.name ??
        "another department");

  return (
    <Card>
      <CardHeader
        title="Employment history"
        level={3}
        description="Every confirmation, promotion, transfer and pay change on this record, and who decided each one."
      />
      {loading ? (
        <CardBody className="text-body-sm text-muted">Loading…</CardBody>
      ) : changes.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden="true" className="size-5" />}
          title="Nothing recorded yet"
          description="Confirmations, promotions, transfers and pay changes appear here as they happen — including ones made straight on this record."
        />
      ) : (
        <CardBody className="flex flex-col gap-0 p-0">
          <ol className="flex flex-col">
            {changes.map((change, index) => (
              <li
                key={change.id}
                className={
                  index === 0 ? "px-5 py-4" : "border-t border-line px-5 py-4"
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[change.kind]}>{LABEL[change.kind]}</Badge>
                  <span className="text-body-sm text-muted tabular-nums">
                    {change.effectiveOn}
                  </span>
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  {describe(change, departmentName).map((line) => (
                    <p key={line} className="text-body-sm text-body">
                      {line}
                    </p>
                  ))}
                </div>

                {change.note && (
                  <p className="mt-2 text-body-sm text-muted">{change.note}</p>
                )}
              </li>
            ))}
          </ol>
        </CardBody>
      )}
    </Card>
  );
}

const LABEL: Record<ApiEmploymentChangeKind, string> = {
  CONFIRMATION: "Confirmed",
  PROBATION_EXTENDED: "Probation extended",
  PROBATION_FAILED: "Probation not passed",
  PROMOTION: "Promotion",
  TRANSFER: "Transfer",
  GRADE_CHANGE: "Grade change",
  PAY_CHANGE: "Pay change",
};

/**
 * Colour is a second cue, never the cue — the kind is spelt out beside it.
 *
 * `PROBATION_FAILED` is a **warning**, not a danger: it records a decision and
 * ends nothing, and painting it as a termination on a timeline would make the
 * record say something the decision did not.
 */
const TONE: Record<
  ApiEmploymentChangeKind,
  "success" | "warning" | "accent" | "neutral"
> = {
  CONFIRMATION: "success",
  PROBATION_EXTENDED: "warning",
  PROBATION_FAILED: "warning",
  PROMOTION: "accent",
  TRANSFER: "neutral",
  GRADE_CHANGE: "neutral",
  PAY_CHANGE: "accent",
};

/**
 * One line per field that actually moved, with both sides of it.
 *
 * Reads `toValue`'s own keys rather than a fixed list, so a field added to the
 * API's tracked set appears here without a change — as an unlabelled line
 * rather than not at all, which is the right way round for a record.
 */
function describe(
  change: ApiEmploymentChange,
  departmentName: (id: string | null | undefined) => string | null,
): string[] {
  const to = change.toValue;
  const from = change.fromValue ?? {};
  if (!to) return [];

  const lines: string[] = [];
  const pair = (label: string, before: string | null, after: string | null) => {
    lines.push(
      before === null
        ? `${label}: ${after ?? "nothing"}`
        : `${label}: ${before} → ${after ?? "nothing"}`,
    );
  };

  for (const key of Object.keys(to) as (keyof ApiFieldSnapshot)[]) {
    switch (key) {
      case "jobTitle":
        pair("Job title", from.jobTitle ?? null, to.jobTitle ?? null);
        break;
      case "grossMonthlyKobo":
        pair(
          "Monthly pay",
          from.grossMonthlyKobo == null ? null : money(from.grossMonthlyKobo),
          to.grossMonthlyKobo == null ? null : money(to.grossMonthlyKobo),
        );
        break;
      case "departmentId":
        pair(
          "Department",
          departmentName(from.departmentId),
          departmentName(to.departmentId),
        );
        break;
      case "salaryGradeId":
        /* Ids, deliberately not resolved: grades are a separate read this panel
           does not make, and fetching a whole catalogue to name one row would
           cost every record page a request it does not otherwise need. The
           label says a grade moved, which is the fact. */
        lines.push(
          to.salaryGradeId === null ? "Grade: removed" : "Grade: changed",
        );
        break;
      case "managerId":
        lines.push(
          to.managerId === null ? "Manager: removed" : "Manager: changed",
        );
        break;
      case "workLocationId":
        lines.push(
          to.workLocationId === null ? "Office: removed" : "Office: changed",
        );
        break;
    }
  }

  return lines;
}
