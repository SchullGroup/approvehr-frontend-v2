"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { Can } from "@/lib/permissions";
import { FEATURE_COPY, useFeatureSettings } from "@/lib/store/features";
import { useProbation } from "@/lib/store/probation";
import type { ApiProbationRow } from "@/lib/api/endpoints";
import { ProbationDecisionDialog } from "./decision-dialog";

/**
 * Whose probation is ending, and who is on one nobody dated.
 *
 * The two tables answer the same question — "what does probation need from
 * me" — and the second one is the reason this screen exists at all. Anybody
 * imported as "probation" landed at `status: ONBOARDING` with no date, and
 * nothing in the product has ever told a manager their probation was ending.
 * Showing the queue without them would leave that exactly as it was.
 *
 * Overdue rows lead and are counted separately: a probation that ended four
 * months ago is a different problem from one ending on Friday, and a single
 * "12 due" would hide which kind you had.
 */
export function ProbationScreen() {
  const { due, needsADate, loading, error, readOnly, reload } = useProbation();
  const [deciding, setDeciding] = useState<ApiProbationRow | null>(null);

  const overdue = due.filter((row) => row.daysRemaining < 0);
  const upcoming = due.filter((row) => row.daysRemaining >= 0);

  if (error) {
    return (
      <LoadFailure
        subject="the probation list"
        error={error}
        onRetry={reload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {readOnly && (
        <Callout tone="info" title="Probation decisions need the API">
          This browser has no probation table behind it. The people below are
          the demo directory&apos;s own staff still marked as on probation —
          which is the state this screen exists to surface — but confirming
          somebody moves their employment status, and a status changed here
          would never reach a payroll run, a payslip or a letter.
        </Callout>
      )}

      {overdue.length > 0 && (
        <Callout
          tone="danger"
          title={`${overdue.length} ${overdue.length === 1 ? "probation has" : "probations have"} already ended`}
        >
          Somebody working past the end of their probation is, in practice,
          confirmed. The record saying otherwise is the part that causes trouble
          later.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Probations ending"
          description={
            due.length === 0
              ? undefined
              : `${due.length} in the next 30 days, or already past.`
          }
        />
        {loading ? (
          <CardBody className="text-body-sm text-muted">Loading…</CardBody>
        ) : due.length === 0 ? (
          <EmptyState
            icon={<CalendarClock aria-hidden="true" className="size-5" />}
            title="No probations ending"
            description="Nobody's probation ends in the next 30 days, and none have been missed."
          />
        ) : (
          <TableWrap caption="Probations ending in the next 30 days or already past">
            {/* No `<TR>` here: `THead` renders its own row. Wrapping one gave
                `<thead><tr><tr>`, which is a hydration error — the same family
                as the nested `<a>` this codebase already has a scar from. */}
            <THead>
              <TH>Employee</TH>
              <TH>Job title</TH>
              <TH>Probation ends</TH>
              <TH>Status</TH>
              <TH />
            </THead>
            <TBody>
              {[...overdue, ...upcoming].map((row) => (
                <TR key={row.employeeId}>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    }
                    subtitle={row.employeeNo}
                  />
                  <TD>{row.jobTitle}</TD>
                  <TD className="tabular-nums">{row.probationEndsAt}</TD>
                  <TD>
                    {row.daysRemaining < 0 ? (
                      <Badge tone="danger">
                        {Math.abs(row.daysRemaining)} days overdue
                      </Badge>
                    ) : row.daysRemaining <= 7 ? (
                      <Badge tone="warning">
                        {row.daysRemaining === 0
                          ? "Ends today"
                          : `In ${row.daysRemaining} days`}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">In {row.daysRemaining} days</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Can permission="EDIT_RECORDS">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={readOnly}
                        onClick={() => setDeciding(row)}
                      >
                        Decide
                      </Button>
                    </Can>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {needsADate.length > 0 && (
        <Card>
          <CardHeader
            title="On probation with no end date"
            level={3}
            description={
              `${needsADate.length} ${needsADate.length === 1 ? "person is" : "people are"} ` +
              "marked as on probation with nothing saying when it ends, so nothing " +
              "will ever prompt a decision about them. Set a date on the record."
            }
          />
          <TableWrap caption="People on probation with no end date recorded">
            <THead>
              <TH>Employee</TH>
              <TH>Job title</TH>
              <TH>Started</TH>
              <TH>On probation for</TH>
            </THead>
            <TBody>
              {needsADate.map((row) => (
                <TR key={row.employeeId}>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}?tab=employment`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    }
                    subtitle={row.employeeNo}
                  />
                  <TD>{row.jobTitle}</TD>
                  <TD className="tabular-nums">{row.startDate}</TD>
                  <TD className="tabular-nums">
                    {row.daysSinceStart >= 365 ? (
                      <Badge tone="danger">
                        {Math.floor(row.daysSinceStart / 30)} months
                      </Badge>
                    ) : (
                      `${row.daysSinceStart} days`
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}

      <ProbationPolicyCard undated={needsADate.length} demo={readOnly} />

      {deciding && (
        <ProbationDecisionDialog
          row={deciding}
          onClose={() => setDeciding(null)}
        />
      )}
    </div>
  );
}

/**
 * How probation works here — the module's settings, on the module's own screen.
 *
 * There is no `/settings/probation` and there should not be: this is the only
 * probation surface in the product, so it is also where the policy behind it
 * belongs. The same relationship `/settings/leave` has with
 * `leaveTwoStepApproval`, which `WORKFLOW_FEATURE_KEYS` argues for at length —
 * a switch put somewhere the reader is not is a switch nobody applies, and this
 * screen is exactly where somebody stands when they discover they have eleven
 * probations nobody dated.
 *
 * `MANAGE_SETTINGS`, not `EDIT_RECORDS`. Deciding one person's probation and
 * deciding the company's probation policy are different acts, and the tables
 * above are gated on the first.
 *
 * ## Demo mode refuses it, unlike every other feature flag
 *
 * `useFeatureSettings().setFeature` writes locally offline, and for the module
 * flags that is right: turning Departments on offline really does produce the
 * Departments screen. This one produces nothing. What `probationTracking` does
 * is make `employees/service.ts#create` put an end date on a new hire, which
 * happens on the API and nowhere else — so a demo company with the switch on
 * would read "Somebody joining is given an end date 6 months out" while no
 * person created in this browser ever got one. A switch that persists and
 * changes nothing is the green "Paid" over money nobody moved, one module
 * along.
 */
function ProbationPolicyCard({
  undated,
  demo,
}: {
  undated: number;
  demo: boolean;
}) {
  const features = useFeatureSettings();
  const toast = useToast();
  const tracking = features.flags.probationTracking;
  const locked = demo || !features.editable;

  const [months, setMonths] = useState<string | null>(null);
  const shown = months ?? String(features.probationMonths);
  const parsed = Number(shown);
  /* The API's own clamp. Refused here as well as there so somebody is told
     before they press rather than by a 422 afterwards. */
  const monthsProblem =
    !Number.isInteger(parsed) || parsed < 1 || parsed > 24
      ? "A probation runs between 1 and 24 months."
      : null;
  const dirty = months !== null && parsed !== features.probationMonths;

  async function set(next: boolean) {
    try {
      await features.setFeature("probationTracking", next);
      toast.push({
        tone: "success",
        title: next
          ? "New hires will be given a probation end date"
          : "New hires will not be given a probation end date",
      });
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "That was refused",
        ...(error instanceof Error ? { detail: error.message } : {}),
      });
    }
  }

  async function saveMonths() {
    if (monthsProblem) return;
    try {
      await features.setProbationMonths(parsed);
      setMonths(null);
      toast.push({
        tone: "success",
        title: `A probation here now runs ${parsed} months`,
        detail: "Nobody already on one has moved.",
      });
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "That was refused",
        ...(error instanceof Error ? { detail: error.message } : {}),
      });
    }
  }

  return (
    <Card>
      <CardHeader
        title="How probation works here"
        level={3}
        description={
          demo
            ? "Which end date a new hire gets is decided when the record is created, which happens on the API. There is nothing here to switch."
            : tracking
              ? `Somebody joining is given an end date ${features.probationMonths} months out, and it appears above as it approaches.`
              : "Nobody joining is given an end date, so nothing will prompt a decision about them later."
        }
      />
      <CardBody className="flex flex-col gap-4">
        {/* Stated where the switch is, because this is the question somebody
            asks the moment they read the list above and reach for the fix. */}
        {!demo && !tracking && undated > 0 && (
          <Callout
            tone="warning"
            title="Switching this on changes nothing above"
          >
            It decides what happens to the <strong>next</strong> person who
            joins. The {undated} {undated === 1 ? "person" : "people"} already
            on a probation with no date keep their record as it is — put a date
            on each from their own employment tab.
          </Callout>
        )}

        <Switch
          label={FEATURE_COPY.probationTracking.label}
          description={FEATURE_COPY.probationTracking.line}
          checked={tracking}
          disabled={
            locked ||
            features.loading ||
            features.saving === "probationTracking"
          }
          onChange={(event) => void set(event.target.checked)}
        />

        {tracking && !demo && (
          <div className="flex flex-col gap-2">
            <Field
              label="How long a probation runs"
              {...(monthsProblem
                ? { error: monthsProblem }
                : {
                    help: "Months. Changing it moves nobody already on a probation — their end date is on their own record from the day they were created.",
                  })}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  className="w-24"
                  value={shown}
                  disabled={locked}
                  onChange={(e) => setMonths(e.currentTarget.value)}
                />
                {dirty && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      monthsProblem !== null ||
                      features.saving === "probationTracking"
                    }
                    onClick={() => void saveMonths()}
                  >
                    Save
                  </Button>
                )}
              </div>
            </Field>
          </div>
        )}

        {!demo && !features.editable && (
          <p className="text-body-sm text-muted">
            Read-only: changing this needs the Manage settings permission.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
