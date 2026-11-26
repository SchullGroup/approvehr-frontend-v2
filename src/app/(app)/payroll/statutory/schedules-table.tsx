"use client";

import { useState, type ReactNode } from "react";
import { Landmark } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Input,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  LoadState,
} from "@/components/ui";
import { ExportButton } from "@/components/portal/export-button";
import { ApiError } from "@/lib/api/client";
import { formatKobo, periodLabel } from "@/lib/api/payroll";
import { formatDay } from "@/lib/time";
import {
  KIND_LABEL,
  dueIn,
  statutory,
  type ApiStatutorySchedule,
} from "@/lib/api/statutory";
import { useApprovedRuns, useStatutorySchedules } from "@/lib/store/statutory";
import { useOrgTimezone } from "@/lib/store/session";
import { useCan } from "@/lib/permissions";
import { PeoplePanel } from "./people-panel";
import { RunPicker } from "./run-picker";

/**
 * What an approved payroll owes, to whom, and by when, for the payroll the
 * picker is on.
 *
 * ## The screen this replaces said the truth and had nothing to show
 *
 * `StatutorySchedule` was a complete model that nothing wrote, so this page
 * listed *which bodies* a company files for and said the figures would appear
 * once a run was approved. Approval writes them now.
 *
 * Before that it carried a hardcoded `Lagos State IRS, ₦14,203,880, 198 staff,
 * **Filed**`. Everything here is generated from the run's own payslips, and the
 * **Filed** badge is set by somebody recording a real filing with a real
 * reference — because a green badge against a return nobody made is a
 * regulatory penalty.
 *
 * ## An unconfirmed deadline says so
 *
 * `dueDateConfirmed` is false where the API's rule is a reading rather than a
 * section number — NSITF today. A date presented as settled when it is not is
 * how somebody misses one, so the row is marked and the statute behind every
 * date is one hover away.
 *
 * ## Choosing the payroll
 *
 * The picker narrows approved runs by year, then month, then run. The newest
 * run in the chosen scope is shown first, so the default is still the last
 * payroll that went out. Only approved or paid runs appear: a draft has no
 * schedules, by design.
 */
export function SchedulesTable() {
  const timeZone = useOrgTimezone();
  const mayFile = useCan("APPROVE_PAYROLL");

  const allRuns = useApprovedRuns();
  const [pick, setPick] = useState<{
    year?: number | undefined;
    month?: number | "all" | undefined;
    runId?: string | undefined;
  }>({});
  const [viewing, setViewing] = useState<ApiStatutorySchedule | null>(null);

  const years = uniqueSorted(
    allRuns.runs.map((run) => Number(run.period.slice(0, 4))),
  );
  const year =
    pick.year !== undefined && years.includes(pick.year)
      ? pick.year
      : (years[0] ?? null);
  const months = uniqueSorted(
    allRuns.runs
      .filter((run) => Number(run.period.slice(0, 4)) === year)
      .map((run) => Number(run.period.slice(5, 7))),
  );
  const month: number | "all" =
    typeof pick.month === "number" && months.includes(pick.month)
      ? pick.month
      : "all";

  const scoped = useApprovedRuns({
    ...(year !== null ? { year } : {}),
    ...(month !== "all" ? { month } : {}),
  });
  const selectedRun =
    scoped.runs.find((run) => run.id === pick.runId) ?? scoped.runs[0] ?? null;

  const state = useStatutorySchedules(
    selectedRun ? { runId: selectedRun.id, period: selectedRun.period } : null,
  );

  const picker =
    allRuns.runs.length > 0 ? (
      <RunPicker
        years={years}
        year={year}
        onYear={(next) => setPick({ year: next })}
        months={months}
        month={month}
        onMonth={(next) => setPick({ year: year ?? undefined, month: next })}
        runs={scoped.runs}
        runId={selectedRun?.id ?? null}
        onRun={(runId) => setPick({ year: year ?? undefined, month, runId })}
        loading={scoped.loading}
      />
    ) : null;

  const frame = (body: ReactNode) => (
    <Card>
      <CardHeader
        title="Remittance schedules"
        description={
          state.period
            ? `From the ${periodLabel(state.period)} payroll, computed from its own payslips${anyEarlier ? ", and earlier payrolls' schedules not filed yet" : ""}.`
            : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        {picker}
        {body}
      </CardBody>
    </Card>
  );

  if (!state.available) {
    return (
      <Card>
        <CardHeader title="Remittance schedules" />
        <CardBody>
          <p className="text-body-sm leading-relaxed text-body">
            A schedule is a statement about a real payroll&rsquo;s real figures,
            so there is nothing to show without the server. One assembled here
            would describe a payroll that never happened.
          </p>
        </CardBody>
      </Card>
    );
  }

  /* The one loading and failure rule, as a gate. */
  if (state.loading || state.error) {
    return frame(
      <LoadState
        loading={state.loading}
        error={state.error}
        subject="the remittance schedules"
        onRetry={state.reload}
        skeleton="table"
      >
        {null}
      </LoadState>,
    );
  }

  if (state.schedules.length === 0) {
    return frame(
      <EmptyState
        plain
        icon={<Landmark aria-hidden="true" />}
        title="Nothing to file yet"
        description={
          state.runId
            ? "The payroll chosen above produced no schedules: this company deducts nothing statutory and has no employer contribution to make."
            : "Schedules are written when a payroll is approved. None has been yet."
        }
      />,
    );
  }

  const unconfirmed = state.schedules.filter((row) => !row.dueDateConfirmed);
  /* An earlier month's schedule still not filed is listed too, and says which
     month it is for (U33). */
  const earlier = (row: { period: string }) =>
    state.period !== null && row.period !== state.period;
  const anyEarlier = state.schedules.some(earlier);

  return frame(
    <>
      {unconfirmed.length > 0 && (
        /* Named rather than quietly shown as settled. A wrong band is a wrong
           figure; a wrong deadline is a penalty. */
        <Callout tone="warning" title="One deadline here is not confirmed">
          {`${unconfirmed.map((row) => KIND_LABEL[row.kind]).join(", ")}: ${unconfirmed[0]?.dueDateBasis ?? ""}`}
        </Callout>
      )}

      <div className="hidden sm:block">
        <TableWrap>
          <THead>
            <TH>Body</TH>
            <TH>Goes to</TH>
            <TH align="right">People</TH>
            <TH align="right">Amount</TH>
            <TH>Due</TH>
            <TH>
              <span className="sr-only-focusable">Actions</span>
            </TH>
          </THead>
          <TBody>
            {state.schedules.map((row) => (
              <TR key={row.id}>
                <TDPrimary
                  title={KIND_LABEL[row.kind]}
                  {...(earlier(row)
                    ? { subtitle: periodLabel(row.period) }
                    : {})}
                />
                <TD>{row.recipient}</TD>
                <TD align="right" className="tabular">
                  {row.employeeCount}
                </TD>
                <TD align="right" className="tabular">
                  {formatKobo(row.amountKobo)}
                </TD>
                <TD>
                  <span className="flex flex-col gap-0.5">
                    {/* The statute is a title rather than a paragraph per
                        row: it is what somebody checks the date against,
                        and eight citations down a table is a wall nobody
                        reads. */}
                    <span title={row.dueDateBasis}>
                      {formatDay(row.dueDate)}
                    </span>
                    {row.filedAt === null && (
                      <span className="text-meta text-faint">
                        {dueIn(row.dueDate, timeZone)}
                      </span>
                    )}
                  </span>
                </TD>
                <TD>
                  <span className="flex flex-wrap items-center gap-2">
                    {row.filedAt ? (
                      <Badge tone="success" size="sm">
                        Filed · {row.reference}
                      </Badge>
                    ) : (
                      mayFile && (
                        <FileButton id={row.id} onFiled={state.reload} />
                      )
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setViewing(row)}
                    >
                      View people
                    </Button>
                    <ExportButton
                      label="Schedule"
                      download={() => statutory.file(row.id)}
                    />
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line sm:hidden">
        {state.schedules.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 p-4">
            <div>
              <p className="text-body-sm font-medium text-ink">
                {KIND_LABEL[row.kind]}
                {earlier(row) ? `, ${periodLabel(row.period)}` : ""}
              </p>
              <p className="mt-0.5 text-meta text-muted">{row.recipient}</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-muted">People</span>
              <span className="tabular text-body-sm text-ink">
                {row.employeeCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-muted">Amount</span>
              <span className="tabular text-body-sm font-medium text-ink">
                {formatKobo(row.amountKobo)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-body-sm text-muted">Due</span>
              <span className="text-right text-body-sm text-ink">
                <span title={row.dueDateBasis}>{formatDay(row.dueDate)}</span>
                {row.filedAt === null && (
                  <span className="block text-meta text-faint">
                    {dueIn(row.dueDate, timeZone)}
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {row.filedAt ? (
                <Badge tone="success" size="sm">
                  Filed · {row.reference}
                </Badge>
              ) : (
                mayFile && <FileButton id={row.id} onFiled={state.reload} />
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewing(row)}
              >
                View people
              </Button>
              <ExportButton
                label="Schedule"
                download={() => statutory.file(row.id)}
              />
            </div>
          </li>
        ))}
      </ul>

      {viewing && (
        <PeoplePanel schedule={viewing} open onClose={() => setViewing(null)} />
      )}
    </>,
  );
}

/** Newest first, without repeats. Years and months are both sorted this way. */
function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => b - a);
}

/**
 * Record that a remittance was actually filed.
 *
 * The reference is required, by the API and here. "Filed" with nothing to quote
 * is exactly the badge this screen used to carry hardcoded, and a receipt number
 * is what somebody needs when a regulator asks.
 */
function FileButton({ id, onFiled }: { id: string; onFiled: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Record as filed
      </Button>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await statutory.markFiled(id, reference.trim());
      toast.push({ title: "Recorded as filed", tone: "success" });
      onFiled();
    } catch (caught) {
      toast.push({
        title: "Not recorded",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="flex items-center gap-1.5">
      <Input
        value={reference}
        placeholder="Receipt or reference"
        aria-label="Filing reference"
        onChange={(event) => setReference(event.target.value)}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={reference.trim() === "" || saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </span>
  );
}
