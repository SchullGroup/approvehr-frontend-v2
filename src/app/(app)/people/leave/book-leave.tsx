"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { CURRENT_USER } from "@/lib/mock/people";
import { useSession } from "@/lib/store/session";
import type { LeaveType } from "@/lib/mock/workflows";
import { useEmployeeStore } from "@/lib/store/employees";
import {
  daysBetween,
  useLeaveStore,
  validateLeave,
  type LeaveError,
  type NewLeaveRequest,
} from "@/lib/store/leave";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { remainingDays } from "@/lib/workflows/leave";
import { fullName } from "@/lib/types";

const TYPES: LeaveType[] = [
  "Annual",
  "Sick",
  "Compassionate",
  "Maternity",
  "Paternity",
];

type Draft = {
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
};

const BLANK: Draft = {
  employeeId: "",
  type: "Annual",
  from: "",
  to: "",
  reason: "",
};

/**
 * Book leave on someone's behalf.
 *
 * The employee list comes from the live employee store rather than the seed
 * array, so a starter created on `/people/new` can be booked off in the same
 * session — the same reason payroll reads `runPeopleFrom(store)`.
 *
 * The dialog shows the remaining balance and the day count as you type, because
 * the two questions a booking form has to answer are "how many days is this" and
 * "do they have them" — leaving both to a validation error after submit is what
 * makes leave forms annoying.
 */
export function BookLeaveDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const leave = useLeaveStore();
  const { directory } = useEmployeeStore();
  const session = useSession();
  const balances = useLeaveBalances();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<LeaveError[]>([]);

  const days = draft.from && draft.to ? daysBetween(draft.from, draft.to) : 0;

  const balance = useMemo(
    () =>
      draft.employeeId
        ? balances.forType(draft.employeeId, draft.type)
        : undefined,
    [draft.employeeId, draft.type, balances],
  );

  const remaining = balance ? remainingDays(balance) : undefined;
  const errorFor = (field: keyof NewLeaveRequest) =>
    errors.find((e) => e.field === field)?.message;

  function close() {
    setDraft(BLANK);
    setErrors([]);
    onClose();
  }

  function submit() {
    const input: NewLeaveRequest = {
      employeeId: draft.employeeId,
      type: draft.type,
      from: draft.from,
      to: draft.to,
      reason: draft.reason.trim() || undefined,
      /* Routed to whoever is signed in — they are the one looking at the inbox,
         so a request they raise lands back with them. `employeeId`, not
         `user.id`: an approver is an employee, and the account id would point
         at nothing. */
      approverId: session.employeeId ?? CURRENT_USER.id,
    };

    const found = validateLeave(input, leave.requests, remaining);
    setErrors(found);
    if (found.length > 0) return;

    const created = leave.create(input);
    const employee = directory.find((e) => e.id === created.employeeId);
    toast.push({
      title: "Leave request raised",
      tone: "success",
      detail: `${created.days} ${created.days === 1 ? "day" : "days"} for ${
        employee ? fullName(employee) : "them"
      }. It is now waiting in your approvals inbox.`,
    });
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Book leave"
      description="Raised as pending. It appears in the approvals inbox immediately."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit}>
            Raise request
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Employee" required error={errorFor("employeeId")}>
          <Select
            value={draft.employeeId}
            onChange={(e) => {
              const employeeId = e.target.value;
              setDraft((d) => ({ ...d, employeeId }));
            }}
          >
            <option value="">Choose someone…</option>
            {directory.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {fullName(employee)} · {employee.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Type"
          help={
            balance
              ? `${balance.taken} of ${balance.entitled} days used${
                  balance.pending > 0 ? `, ${balance.pending} pending` : ""
                }.`
              : undefined
          }
        >
          <Select
            value={draft.type}
            onChange={(e) => {
              /* Read the value before the updater runs — React nulls out
                 currentTarget once the synthetic event finishes dispatching. */
              const type = e.target.value as LeaveType;
              setDraft((d) => ({ ...d, type }));
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required error={errorFor("from")}>
            <Input
              type="date"
              value={draft.from}
              onChange={(e) => {
                const from = e.target.value;
                setDraft((d) => ({ ...d, from, to: d.to || from }));
              }}
            />
          </Field>
          <Field
            label="To"
            required
            error={errorFor("to")}
            help={days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : undefined}
          >
            <Input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => {
                const to = e.target.value;
                setDraft((d) => ({ ...d, to }));
              }}
            />
          </Field>
        </div>

        <Field label="Reason" help="Optional. Shown to the approver.">
          <Textarea
            rows={2}
            value={draft.reason}
            onChange={(e) => {
              const reason = e.target.value;
              setDraft((d) => ({ ...d, reason }));
            }}
          />
        </Field>

        {remaining !== undefined && days > 0 && days <= remaining && (
          <Callout tone="info" title={`${remaining - days} days left afterwards`}>
            Pending days are already held back from that figure, so approving
            this will not take them over their entitlement.
          </Callout>
        )}
      </div>
    </Modal>
  );
}
