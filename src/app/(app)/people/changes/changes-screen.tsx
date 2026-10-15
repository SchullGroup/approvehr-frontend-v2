"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { Can, useCan } from "@/lib/permissions";
import type { ApiEmploymentChangeRow } from "@/lib/api/endpoints";
import {
  DEMO_CHANGE_HEADING,
  DEMO_CHANGE_REASON,
  useEmploymentChanges,
} from "@/lib/store/employment-changes";
import { money } from "@/lib/pay/flags";
import { ProposeChangeDialog } from "./propose-dialog";
import { DecideChangeDialog } from "./decide-dialog";

/**
 * Promotions, transfers, regrades and pay changes in flight.
 *
 * Two tables, and the split is the feature rather than a layout choice:
 *
 * - **Waiting on somebody.** Proposed and undecided. A queue.
 * - **Agreed, not yet in effect.** Approved and `SCHEDULED`. **Nothing on any
 *   record has moved for these**, and that is the sentence the section carries,
 *   because the obvious reading of "approved" is "done" and here it is not.
 *   A payroll prepared before one of these dates pays the old figure, which is
 *   correct and surprising, so it is said here as well as on the run.
 *
 * Applied changes are not on this screen at all. They are history, and history
 * belongs on the person's own record where somebody reading it has the rest of
 * the context — see the History tab on `/people/[id]`.
 */
export function ChangesScreen() {
  const { rows, loading, error, unavailable, reload } = useEmploymentChanges();
  const [proposing, setProposing] = useState(false);
  const [deciding, setDeciding] = useState<ApiEmploymentChangeRow | null>(null);

  /* Two separate calls rather than `canEdit && canApprove`: `&&`
     short-circuits, which makes the second a conditional hook and changes the
     hook order on any render where the first is false. `attendance-screen.tsx`
     carries the same warning. */
  const canApprove = useCan("APPROVE_EMPLOYMENT_CHANGE");

  if (error) {
    return (
      <LoadFailure
        subject="promotions and transfers"
        error={error}
        onRetry={reload}
      />
    );
  }

  const waiting = rows.filter((row) => row.status === "PENDING_APPROVAL");
  const agreed = rows.filter((row) => row.status === "SCHEDULED");
  /* A scheduled change whose date has passed means the sweep has not run. Worth
     seeing, because the alternative is inferring it from two timestamps. */
  const overdueToApply = agreed.filter((row) => row.daysUntilEffective < 0);

  return (
    <div className="flex flex-col gap-6">
      {unavailable && (
        <Callout tone="info" title={DEMO_CHANGE_HEADING}>
          {DEMO_CHANGE_REASON}
        </Callout>
      )}

      {overdueToApply.length > 0 && (
        <Callout
          tone="warning"
          title={`${overdueToApply.length} agreed ${overdueToApply.length === 1 ? "change has" : "changes have"} passed their date and not been written`}
        >
          These should have taken effect by now. The job that writes them runs
          daily — if this is still here tomorrow, the worker is not running, and
          the people below are being paid on their old terms.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Waiting on a decision"
          description={
            waiting.length === 0
              ? undefined
              : `${waiting.length} proposed and not yet decided.`
          }
          action={
            <Can permission="EDIT_RECORDS">
              <Button
                size="sm"
                variant="accent"
                disabled={unavailable}
                onClick={() => setProposing(true)}
              >
                Propose a change
              </Button>
            </Can>
          }
        />
        {loading ? (
          <CardBody className="text-body-sm text-muted">Loading…</CardBody>
        ) : waiting.length === 0 ? (
          <EmptyState
            icon={<TrendingUp aria-hidden="true" className="size-5" />}
            title="Nothing waiting"
            description={
              unavailable
                ? "This browser cannot answer whether anything is waiting, so it does not say."
                : "No promotion, transfer or pay change is waiting for a decision."
            }
          />
        ) : (
          <TableWrap caption="Employment changes waiting for a decision">
            <THead>
              <TH>Employee</TH>
              <TH>Change</TH>
              <TH>Takes effect</TH>
              <TH>Reason</TH>
              <TH />
            </THead>
            <TBody>
              {waiting.map((row) => (
                <TR key={row.id}>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    }
                    subtitle={row.employeeNo ?? undefined}
                  />
                  <TD>
                    <div className="flex flex-col gap-1">
                      <Badge tone="neutral">{row.kindLabel}</Badge>
                      <span className="text-body-sm text-muted">
                        {summarise(row)}
                      </span>
                    </div>
                  </TD>
                  <TD className="tabular-nums">{row.effectiveOn}</TD>
                  <TD className="text-body-sm text-muted">{row.note}</TD>
                  <TD className="text-right">
                    {canApprove && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={unavailable}
                        onClick={() => setDeciding(row)}
                      >
                        Decide
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {agreed.length > 0 && (
        <Card>
          <CardHeader
            title="Agreed, not yet in effect"
            level={3}
            /* The sentence this section exists for. "Approved" reads as "done",
               and here nothing has moved — a payroll prepared before one of
               these dates pays the old figure, correctly. */
            description="Nothing on these records has changed yet. Each one is written on its own date, and a payroll prepared before then pays the current figure."
          />
          <TableWrap caption="Employment changes agreed and awaiting their effective date">
            <THead>
              <TH>Employee</TH>
              <TH>Change</TH>
              <TH>Takes effect</TH>
              <TH />
            </THead>
            <TBody>
              {agreed.map((row) => (
                <TR key={row.id}>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    }
                    subtitle={row.employeeNo ?? undefined}
                  />
                  <TD>
                    <div className="flex flex-col gap-1">
                      <Badge tone="neutral">{row.kindLabel}</Badge>
                      <span className="text-body-sm text-muted">
                        {summarise(row)}
                      </span>
                    </div>
                  </TD>
                  <TD className="tabular-nums">
                    {row.daysUntilEffective < 0 ? (
                      <Badge tone="warning">{row.effectiveOn} — overdue</Badge>
                    ) : (
                      <span>
                        {row.effectiveOn}
                        <span className="text-muted">
                          {row.daysUntilEffective === 0
                            ? " (today)"
                            : ` (in ${row.daysUntilEffective} days)`}
                        </span>
                      </span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Can permission="EDIT_RECORDS">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={unavailable}
                        onClick={() => setDeciding(row)}
                      >
                        Withdraw
                      </Button>
                    </Can>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}

      {proposing && <ProposeChangeDialog onClose={() => setProposing(false)} />}
      {deciding && (
        <DecideChangeDialog row={deciding} onClose={() => setDeciding(null)} />
      )}
    </div>
  );
}

/**
 * One line saying what the change actually does, for a table cell.
 *
 * The money is spelt out, because it is the part that commits the company and
 * a row reading "jobTitle, grossMonthly" tells an approver which columns move
 * and nothing about what they are agreeing to. Ids are not resolved here —
 * naming a department would cost this screen a second read, and the kind badge
 * beside it already says which sort of move it is.
 */
export function summarise(row: ApiEmploymentChangeRow): string {
  const to = row.toValue;
  if (!to) return "";
  const parts: string[] = [];
  if (to.jobTitle !== undefined && to.jobTitle !== null) {
    parts.push(`to ${to.jobTitle}`);
  }
  if (to.grossMonthlyKobo !== undefined && to.grossMonthlyKobo !== null) {
    parts.push(`${money(to.grossMonthlyKobo)} a month`);
  }
  if (to.departmentId !== undefined) parts.push("new department");
  if (to.salaryGradeId !== undefined) parts.push("new grade");
  if (to.managerId !== undefined) parts.push("new manager");
  if (to.workLocationId !== undefined) parts.push("new office");
  return parts.join(" · ");
}
