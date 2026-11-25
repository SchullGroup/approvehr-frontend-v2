"use client";

import { useState } from "react";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Switch,
  TextLink,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { PayrollSettingsForm } from "@/app/(app)/settings/payroll/form";
import { PensionSchemePanel } from "./pension-scheme-panel";

/**
 * Payroll settings: the Settings tab of Pay setup, and their one home (U80).
 *
 * The same forms used to render here and on /settings/payroll, and this tab
 * told people either page would do: two doors onto one value, and two pages
 * called Pay setup (PAY-26, NC-30). /settings/payroll now leads here, so there
 * is one door.
 *
 * Overtime is not repeated here any more. Its policy is a Time & Leave matter
 * (when overtime counts and at what rate) and keeps its own page; this tab links
 * to it. A bonus has no policy to speak of, so it keeps its single switch.
 *
 * The company's own payout account is who the money leaves from, not who or
 * how much it pays, so it stays a link to its own settings page.
 */

export function ExtrasPanel() {
  const canEdit = useCan("MANAGE_PAY_STRUCTURE");

  return (
    <div className="grid gap-4">
      <PayrollSettingsForm />
      <BonusSwitch canEdit={canEdit} />
      <WalletPayoutSwitch canEdit={canEdit} />
      <PensionSchemePanel canEdit={canEdit} />

      <Card>
        <CardHeader
          title="Overtime"
          description="When overtime counts and what it pays are set with the rest of Time & Leave."
          level={3}
        />
        <CardBody>
          <TextLink href="/settings/overtime" className="text-body-sm">
            Open overtime settings
          </TextLink>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payout account"
          description="Where the company's own payroll payments are sent from."
          level={3}
        />
        <CardBody>
          <TextLink href="/settings/bank-accounts" className="text-body-sm">
            Open bank accounts
          </TextLink>
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

function WalletPayoutSwitch({ canEdit }: { canEdit: boolean }) {
  const { settings, loading, available, saveDeduction } = usePayrollSettings();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true);
    setFailed(null);
    try {
      await saveDeduction("walletPayoutEnabled", next);
      toast.push({
        title: next
          ? "Payroll can be paid from the wallet"
          : "Payroll is paid from your bank account",
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
          label="Pay payroll from the wallet"
          description="Off, the payroll offers the bank payment schedule only: download it, upload it to your bank, and the money leaves your own bank account, so it is on your bank statement. Approving a payroll does not take anything out of the wallet."
          checked={settings.payout.wallet}
          disabled={!canEdit || !available || loading || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {!canEdit && (
          <p className="mt-3 text-body-sm text-muted">
            Changing this needs the “Manage pay structure” permission.
          </p>
        )}
        {failed && (
          <Callout tone="danger" className="mt-3">
            {failed}
          </Callout>
        )}
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
          description="A one-off payment for one person on one payroll, taxed, and never counted for pension. Off, the payroll run does not offer to add one and the Bonus column is not shown."
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
          A payment somebody gets every month is an allowance, not a bonus, add
          it on the Allowances tab so it lands on every payroll by itself.
        </p>
      </CardBody>
    </Card>
  );
}
