"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useOvertimePolicy } from "@/lib/store/overtime";

/**
 * What a payroll run carries besides salary — the Extras tab of Pay setup.
 *
 * ## Why this tab exists
 *
 * The two tabs beside it hold the **standing** things pay is made of: a
 * transport allowance somebody gets every month, a cooperative deduction that
 * comes off every month. Overtime and a bonus are the other half of the same
 * question and had no home at all: both were decided nowhere and offered to
 * everybody, as two columns on the payroll run's table, on every row, every
 * month, whether or not the company has ever paid either.
 *
 * On a payroll of five that is most of the table given over to two controls
 * nobody will press. The incumbent this product is sold against is precisely
 * the product that shows a five-person business everything it has, and
 * `PARITY.md` Rule 2 is the answer to it — so these are switches, here, once.
 *
 * ## The PAYE switch used to live inside the run's table
 *
 * In the header of the PAYE column, as a 28-pixel toggle writing
 * `PayrollSettings.payeEnabled` — the company's tax policy, for every payroll,
 * not just the one on screen. It was put there because a company that does not
 * operate PAYE had no way to reach the control from the screen where the
 * problem is noticed, which was a real gap and the wrong fix: a setting inside
 * a data table is a setting somebody changes while working a month up, and the
 * narrowest column on the screen was carrying the widest decision on it.
 *
 * It is not repeated here either. `/settings/payroll` has room for what
 * switching it off actually means — the notices, the rates, the bases — and
 * this tab links to it rather than growing a second copy of a switch. Two
 * places to change one field is how they come to disagree.
 *
 * ## Overtime's switch already existed
 *
 * `OvertimePolicy.enabled` — the "Pay overtime" switch on `/settings/overtime`,
 * which has always defaulted **off** and whose own description has always said
 * "nothing reaches payroll". The run's table ignored it and offered the column
 * anyway, so this is the same field, surfaced where the decision is made rather
 * than a second one invented beside it. Everything else about overtime — the
 * grace period, the multipliers, the hourly basis — stays on its own screen,
 * which is why that link is here too.
 */

export function ExtrasPanel() {
  const canEdit = useCan("MANAGE_PAY_STRUCTURE");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="What a payroll carries, besides salary"
          description="Switch off what this company never pays, and the payroll run stops asking about it. Nothing is deleted, and switching one back on brings the column back."
          level={3}
        />
      </Card>

      <OvertimeSwitch canEdit={canEdit} />
      <BonusSwitch canEdit={canEdit} />

      <Card>
        <CardHeader
          title="PAYE, pension and the housing fund"
          description="What this company deducts is a bigger decision than these two — switching PAYE off means the payslip carries no tax line at all — so it lives with the rates and the bases it belongs to."
          level={3}
        />
        <CardBody>
          <Link
            href="/settings/payroll"
            className="text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
          >
            Open payroll settings
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * A message under the switch that just moved, or nothing.
 *
 * Deliberately not a toast: a toast is gone in six seconds and the consequence
 * of switching overtime off is a column disappearing from a screen the reader
 * is not looking at yet.
 */
function Saved({ note }: { note: string | null }) {
  if (!note) return null;
  return <p className="mt-3 text-body-sm text-muted">{note}</p>;
}

function OvertimeSwitch({ canEdit }: { canEdit: boolean }) {
  const { policy, loading, saving, editable, source, save } =
    useOvertimePolicy();
  const toast = useToast();
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /* The store's own `editable` is `MANAGE_PAY_STRUCTURE` too, and is the one
     that matters — this second read only decides whether the control is
     offered, so that somebody who cannot save is not handed a switch that
     refuses. */
  const mayChange = canEdit && editable;

  async function toggle(next: boolean) {
    setFailed(null);
    try {
      await save({ enabled: next });
      setNote(
        next
          ? "The payroll run will show an Overtime column again."
          : "The Overtime column has gone from the payroll run. Overtime already approved is still paid, and the column comes back on any payroll that carries some.",
      );
      toast.push({
        title: next ? "Overtime switched on" : "Overtime switched off",
        tone: "success",
      });
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not save that.",
      );
    }
  }

  return (
    <Card>
      <CardBody>
        <Switch
          label="Pay overtime"
          description="Hours beyond a shift, worked out from the clock at the company's own multipliers. Off, the payroll run does not offer to add hours to anybody and the Overtime column is not shown."
          checked={policy.enabled}
          disabled={!mayChange || loading || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {loading && (
          <p className="mt-3 flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </p>
        )}
        {!canEdit && (
          <p className="mt-3 text-body-sm text-muted">
            Changing this needs the “Manage pay structure” permission.
          </p>
        )}
        {/* Guarded, not conditional-at-runtime: `source` cannot be "demo" in a
            production build, and `verify-demo` is about the **string** being
            in the bundle at all rather than about whether a branch can run. */}
        {DEMO_ENABLED && source === "demo" && (
          <p className="mt-3 text-body-sm text-muted">
            Saved in this browser only, like everything else in the demo.
          </p>
        )}
        <Saved note={note} />
        {failed && (
          <Callout tone="danger" className="mt-3">
            {failed}
          </Callout>
        )}
        <p className="mt-3 text-body-sm text-muted">
          The grace period, the weekday and weekend multipliers and the hourly
          basis are on{" "}
          <Link
            href="/settings/overtime"
            className="font-medium text-accent-text hover:underline underline-offset-4"
          >
            the overtime settings
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}

function BonusSwitch({ canEdit }: { canEdit: boolean }) {
  const { settings, loading, available, saveDeduction } = usePayrollSettings();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true);
    setFailed(null);
    try {
      await saveDeduction("bonusEnabled", next);
      setNote(
        next
          ? "The payroll run will show a Bonus column again."
          : "The Bonus column has gone from the payroll run. A bonus already on an open payroll can still be taken off it, and the column comes back on any payroll that carries one.",
      );
      toast.push({
        title: next ? "Bonuses switched on" : "Bonuses switched off",
        tone: "success",
      });
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not save that.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <Switch
          label="Award bonuses"
          description="A one-off payment for one person on one payroll — taxed, and never counted for pension. Off, the payroll run does not offer to add one and the Bonus column is not shown."
          checked={settings.bonus.enabled}
          disabled={!canEdit || !available || loading || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {loading && (
          <p className="mt-3 flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </p>
        )}
        {!canEdit && (
          <p className="mt-3 text-body-sm text-muted">
            Changing this needs the “Manage pay structure” permission.
          </p>
        )}
        {/* Refused offline for the reason every other switch on this row is:
            the demo's payslips are fixed illustrative rows generated once by
            the real engine, and a locally stored switch could move none of
            them. See `useDeductionSwitches`. */}
        {!available && (
          <p className="mt-3 text-body-sm text-muted">
            This one needs the API. It changes what a real payroll run offers,
            and the demo’s payslips are fixed figures a local switch could not
            move.
          </p>
        )}
        <Saved note={note} />
        {failed && (
          <Callout tone="danger" className="mt-3">
            {failed}
          </Callout>
        )}
        <p className="mt-3 text-body-sm text-muted">
          A payment somebody gets every month is an allowance, not a bonus —
          add it on the Allowances tab so it lands on every payroll by itself.
        </p>
      </CardBody>
    </Card>
  );
}
