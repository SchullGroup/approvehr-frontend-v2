"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Input,
  Skeleton,
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
import { ExportButton } from "@/components/portal/export-button";
import { ApiError } from "@/lib/api/client";
import { formatKobo, periodLabel } from "@/lib/api/payroll";
import { KIND_LABEL, dueIn, statutory } from "@/lib/api/statutory";
import { useStatutorySchedules } from "@/lib/store/statutory";
import { useCan } from "@/lib/permissions";

/**
 * What the last approved payroll owes, to whom, and by when.
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
 */
export function SchedulesTable() {
  const state = useStatutorySchedules();
  const mayFile = useCan("APPROVE_PAYROLL");

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

  if (state.loading) return <Skeleton className="h-64 w-full" />;
  if (state.error) {
    return (
      <LoadFailure
        subject="the remittance schedules"
        error={state.error}
        onRetry={state.reload}
      />
    );
  }

  if (state.schedules.length === 0) {
    return (
      <Card>
        <CardHeader title="Remittance schedules" />
        <CardBody>
          <EmptyState
            title="Nothing to file yet"
            description={
              state.runId
                ? "The last approved payroll produced no schedules — this company deducts nothing statutory and has no employer contribution to make."
                : "Schedules are written when a payroll is approved. None has been yet."
            }
          />
        </CardBody>
      </Card>
    );
  }

  const unconfirmed = state.schedules.filter((row) => !row.dueDateConfirmed);

  return (
    <Card>
      <CardHeader
        title="Remittance schedules"
        description={
          state.period
            ? `From the ${periodLabel(state.period)} payroll, computed from its own payslips.`
            : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        {unconfirmed.length > 0 && (
          /* Named rather than quietly shown as settled. A wrong band is a wrong
             figure; a wrong deadline is a penalty. */
          <Callout tone="warning" title="One deadline here is not confirmed">
            {unconfirmed.map((row) => KIND_LABEL[row.kind]).join(", ")}:{" "}
            {unconfirmed[0]?.dueDateBasis}
          </Callout>
        )}

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
                <TDPrimary title={KIND_LABEL[row.kind]} />
                <TD>{row.recipient}</TD>
                <TD align="right" className="tabular">
                  {row.employeeCount}
                </TD>
                <TD align="right" className="tabular">
                  {formatKobo(row.amountKobo)}
                </TD>
                <TD>
                  <span className="flex flex-col gap-0.5">
                    {/* The statute is a title rather than a paragraph per row:
                        it is what somebody checks the date against, and eight
                        citations down a table is a wall nobody reads. */}
                    <span title={row.dueDateBasis}>{row.dueDate}</span>
                    {row.filedAt === null && (
                      <span className="text-meta text-faint">
                        {dueIn(row.dueDate)}
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
      </CardBody>
    </Card>
  );
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
