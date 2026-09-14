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
import { OvertimePolicyFields } from "@/app/(app)/settings/overtime/form";
import { PayrollSettingsForm } from "@/app/(app)/settings/payroll/form";

/**
 * What a payroll run carries besides salary — the Extras tab of Pay setup.
 *
 * ## Why this tab exists
 *
 * The two tabs beside it hold the **standing** things pay is made of: a
 * transport allowance somebody gets every month, a cooperative deduction that
 * comes off every month. Overtime, the payroll rates and bases, and a bonus
 * are the rest of what decides a payslip, and each used to live only on its
 * own standalone settings page — a detour away from the module a company
 * actually works pay up in.
 *
 * ## Comprehensive on purpose, and how the risk in that is held
 *
 * This tab now renders the same forms `/settings/overtime` and
 * `/settings/payroll` render — `OvertimePolicyFields` and
 * `PayrollSettingsForm`, imported rather than rebuilt, and neither standalone
 * page is removed. Two doors onto one value is a deliberate trade, accepted
 * knowingly rather than by accident: the alternative was a second copy of the
 * same fields that could come to say something different from the one
 * somebody last saved. What actually closes that risk is architectural, not a
 * policy — every field here reads and writes through the identical hook
 * (`useOvertimePolicy()`, `usePayrollSettings()`) its standalone page already
 * uses, so there is one underlying value with two doors onto it, never two
 * copies that can drift apart in the data.
 *
 * A bonus has no policy to speak of — it is a one-off, decided per person on
 * one payroll rather than a standing rate — so it keeps its own single switch
 * here instead of growing a form with nothing to hold.
 *
 * The company's own payout account is a different entity from anything above
 * — who the money leaves from, not who or how much it pays — so it stays a
 * link to its own settings page rather than a field on this one.
 */

export function ExtrasPanel() {
  const canEdit = useCan("MANAGE_PAY_STRUCTURE");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="What a payroll carries, besides salary"
          description="Everything below reads and writes through the same settings as the standalone pages — change it here or there, it's one value either way."
          level={3}
        />
      </Card>

      <OvertimePolicyFields />
      <BonusSwitch canEdit={canEdit} />
      <PayrollSettingsForm />

      <Card>
        <CardHeader
          title="Payout account"
          description="Where the company's own payroll payments are sent from — a different setting from anything above, so it stays on its own page."
          level={3}
        />
        <CardBody>
          <Link
            href="/settings/bank-accounts"
            className="text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
          >
            Open bank accounts
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
 * of switching bonuses off is a column disappearing from a screen the reader
 * is not looking at yet.
 */
function Saved({ note }: { note: string | null }) {
  if (!note) return null;
  return <p className="mt-3 text-body-sm text-muted">{note}</p>;
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
          A payment somebody gets every month is an allowance, not a bonus — add
          it on the Allowances tab so it lands on every payroll by itself.
        </p>
      </CardBody>
    </Card>
  );
}
