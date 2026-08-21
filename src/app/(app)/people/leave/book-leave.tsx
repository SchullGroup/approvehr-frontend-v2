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
import { ApiError } from "@/lib/api/client";
import { daysLabel, type LeaveRow } from "@/lib/api/leave";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  useLeaveBalancesFor,
  useLeaveMutations,
  useLeaveTypes,
} from "@/lib/store/leave-api";
import {
  daysBetween,
  validateLeave,
  type LeaveError,
  type NewLeaveRequest,
} from "@/lib/store/leave";
import { useSession } from "@/lib/store/session";
import { fullName } from "@/lib/types";

type Draft = {
  employeeId: string;
  /** The type's name. Its id is looked up when connected, where one exists. */
  type: string;
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
 * Book leave on somebody's behalf.
 *
 * The employee list, the leave types and the balance all come from whichever
 * source is live — so connected this posts real uuids to `POST /leave/requests`,
 * and in demo mode it writes to this browser's store. The dialog does not know
 * which, and neither does the screen behind it.
 *
 * ## Checked twice, on purpose
 *
 * `validateLeave` runs before the request goes anywhere, because the two
 * mistakes people make — booking over leave they already have, and booking days
 * they do not have — are worth catching while the dates are still in front of
 * them. The API checks both again and its answer wins: an overlap comes back as
 * a 409 naming the request it clashes with, and that message is shown verbatim
 * because it names the fix.
 *
 * Going over an entitlement is **not** refused by either side. A company may
 * allow unpaid overdraw and maternity leave is statutory, so the API returns a
 * warning with the created request and the warning is what the approver sees.
 */
export function BookLeaveDialog({
  open,
  onClose,
  onCreated,
  requests,
}: {
  open: boolean;
  onClose: () => void;
  /** Reload the screen behind, so a new request appears without a refresh. */
  onCreated: () => void;
  /** What already exists, for the overlap check before submitting. */
  requests: readonly LeaveRow[];
}) {
  const session = useSession();
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const { types } = useLeaveTypes();
  const mutations = useLeaveMutations();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<LeaveError[]>([]);
  const [saving, setSaving] = useState(false);

  const days = draft.from && draft.to ? daysBetween(draft.from, draft.to) : 0;

  const chosenType = types.find((type) => type.name === draft.type);
  const balances = useLeaveBalancesFor(
    draft.employeeId ? [draft.employeeId] : [],
    draft.type,
  );
  const balance = draft.employeeId ? balances.of(draft.employeeId) : undefined;
  const remaining = balance?.remaining;

  const errorFor = (field: keyof NewLeaveRequest) =>
    errors.find((e) => e.field === field)?.message;

  const employeeOptions = useMemo(
    () =>
      [...employees].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      ),
    [employees],
  );

  function close() {
    setDraft(BLANK);
    setErrors([]);
    onClose();
  }

  async function submit() {
    const found = validateLeave(
      {
        employeeId: draft.employeeId,
        type: draft.type,
        from: draft.from,
        to: draft.to,
      },
      requests,
      remaining,
    );
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const result = await mutations.create({
        employeeId: draft.employeeId,
        leaveTypeId: chosenType?.id ?? null,
        leaveType: draft.type,
        from: draft.from,
        to: draft.to,
        ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
        /* Routed to whoever is signed in — they are the one looking at the
           inbox, so a request they raise lands back with them.
           `session.employeeId`, never `session.user.id`: an approver is a person
           on the payroll, and an account id would point at nobody. Both records
           carry `id`, `firstName` and `lastName`, so the compiler cannot tell
           the two apart.
           No session employee means no approver. The request is raised
           unrouted and reads as "Not routed" — which is true, and better than
           attributing it to a seeded person who is not the one signed in. */
        ...(session.employeeId ? { approverId: session.employeeId } : {}),
      });

      toast.push({
        title: "Leave request raised",
        tone: result.warnings.length > 0 ? "warning" : "success",
        detail:
          result.warnings.length > 0
            ? result.warnings.join(" ")
            : `${daysLabel(result.request.days)} for ${result.request.employeeName}. It is waiting in your approvals inbox.`,
      });
      onCreated();
      close();
    } catch (failure) {
      /* The API's own words. An overlap names the request it clashes with and
         the dates, which is exactly what the person needs to change. */
      setErrors([
        {
          field: "from",
          message:
            failure instanceof ApiError
              ? failure.message
              : "That did not save. Try again.",
        },
      ]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Book leave"
      description="Raised as waiting. It appears in the approvals inbox immediately."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} loading={saving}>
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
            {employeeOptions.map((employee) => (
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
                  balance.pending > 0 ? `, ${balance.pending} waiting` : ""
                }.`
              : chosenType
                ? `${chosenType.entitledDays} days a year.`
                : undefined
          }
        >
          <Select
            value={draft.type}
            onChange={(e) => {
              /* Read the value before the updater runs — React nulls out
                 currentTarget once the synthetic event finishes dispatching. */
              const type = e.target.value;
              setDraft((d) => ({ ...d, type }));
            }}
          >
            {types.map((type) => (
              <option key={type.name} value={type.name}>
                {type.name}
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
            help={days > 0 ? daysLabel(days) : undefined}
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

        {chosenType?.requiresEvidence && (
          <Callout tone="info" title={`${chosenType.name} leave needs evidence`}>
            Attach the note or certificate to their record after raising this.
            Documents are not part of a leave request yet.
          </Callout>
        )}

        {remaining !== undefined && days > 0 && days <= remaining && (
          <Callout tone="info" title={`${remaining - days} days left afterwards`}>
            Days already waiting on a decision are held back from that figure, so
            approving this will not take them over their entitlement.
          </Callout>
        )}
      </div>
    </Modal>
  );
}
