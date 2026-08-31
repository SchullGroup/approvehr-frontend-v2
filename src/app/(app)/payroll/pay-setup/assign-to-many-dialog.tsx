"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";
import {
  AssignPeopleDialog,
  type AssignCandidate,
} from "@/app/(app)/people/departments/assign-people-dialog";
import {
  kobo,
  rateFraction,
  ratePercent,
  type ApiPayComponent,
} from "@/lib/api/pay-components";
import { basisOf, money } from "@/lib/pay/flags";

/**
 * "Assign specific people" from the Allowances or Deductions tab itself.
 *
 * The picker is `AssignPeopleDialog`, unchanged — search, tick, confirm is
 * one thing and this is not a second copy of it. `extraContent` is the seam
 * that lets a figure and a start date sit above that picker without either
 * screen knowing about the other's concerns.
 *
 * One amount, one rate, one window, for the whole batch — never a form per
 * person. That is the actual shape of the request this exists for: a
 * housing top-up at the same figure for four directors, not four people who
 * happen to need the same button pressed. Somebody who wants different
 * figures per person still has "Add a line" on the person's own record.
 */
export function AssignComponentToManyDialog({
  component,
  candidates,
  busy = false,
  failed,
  onClose,
  onAssign,
}: {
  component: ApiPayComponent;
  candidates: AssignCandidate[];
  busy?: boolean;
  failed?: string | null;
  onClose: () => void;
  onAssign: (
    employeeIds: string[],
    figures: {
      amountKobo?: number;
      rate?: number;
      effectiveFrom?: string;
      effectiveTo?: string;
      note?: string;
    },
  ) => void;
}) {
  const fixed = component.basis === "FIXED";
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  const amountKobo =
    fixed && amount.trim() !== "" && Number(amount) > 0
      ? kobo(Number(amount))
      : undefined;
  const rateValue =
    !fixed && rate.trim() !== "" && Number(rate) > 0
      ? rateFraction(Number(rate))
      : undefined;

  const figure = fixed
    ? amountKobo !== undefined
      ? money(amountKobo)
      : component.defaultAmountKobo !== null
        ? `${money(component.defaultAmountKobo)} (the default)`
        : null
    : rateValue !== undefined
      ? `${(rateValue * 100).toFixed(2)}% of ${basisOf(component.basis)}`
      : component.defaultRate !== null
        ? `${ratePercent(component.defaultRate).toFixed(2)}% of ${basisOf(component.basis)} (the default)`
        : null;

  return (
    <AssignPeopleDialog
      title={`Assign ${component.name} to specific people`}
      description="Pick who gets it. Everyone chosen gets the same figure and the same start date."
      effect={
        figure
          ? `Everybody chosen gets ${figure}${to ? `, until ${to}` : ""}. It shows on their next payslip that covers ${from || "this month"}.`
          : `This component has no default ${fixed ? "amount" : "rate"}, so set one below — leaving it blank would ask to add ₦0.00 to every payslip, which is refused.`
      }
      countLabel={(count) =>
        count === 1 ? "1 person will be assigned" : `${count} people will be assigned`
      }
      extraContent={
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fixed ? (
              <Field
                label="Amount"
                help={
                  component.defaultAmountKobo !== null
                    ? `Leave blank to use the default, ${money(component.defaultAmountKobo)}.`
                    : "This component has no default — required."
                }
              >
                <Input
                  inputMode="decimal"
                  value={amount}
                  placeholder="0.00"
                  disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label="Rate (%)"
                help={
                  component.defaultRate !== null
                    ? `Leave blank to use the default, ${ratePercent(component.defaultRate).toFixed(2)}% of ${basisOf(component.basis)}.`
                    : "This component has no default — required."
                }
              >
                <Input
                  inputMode="decimal"
                  value={rate}
                  placeholder="0.00"
                  disabled={busy}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
            )}
            <Field label="Starts" help="Leave blank to start this month.">
              <Input
                type="date"
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Ends" optional help="Leave blank for open-ended.">
              <Input
                type="date"
                value={to}
                disabled={busy}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Note" optional>
              <Input
                value={note}
                placeholder="Why, or where this came from"
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </div>
      }
      candidates={candidates}
      confirmLabel="Assign"
      busy={busy}
      {...(failed !== undefined && failed !== null ? { failed } : {})}
      onClose={onClose}
      onAssign={(employeeIds) =>
        onAssign(employeeIds, {
          ...(amountKobo !== undefined ? { amountKobo } : {}),
          ...(rateValue !== undefined ? { rate: rateValue } : {}),
          ...(from ? { effectiveFrom: from } : {}),
          ...(to ? { effectiveTo: to } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
    />
  );
}
