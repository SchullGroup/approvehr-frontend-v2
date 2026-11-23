"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import type { EmployeePatch } from "@/lib/store/employees-api";
import type { Employee } from "@/lib/types";

/**
 * Whether somebody is paid through payroll, and the one place to say they are not.
 *
 * The company's own administrator, a director who draws nothing and a consultant paid elsewhere are
 * real people with real records and no salary. Without this they were a missing-bank-account blocker
 * on every payroll run, a line in "N people cannot be paid yet" every month, and one more on the staff
 * count. Switching it on is **permanent and set by hand**: nothing flags anybody automatically, not
 * even the account a company was created with.
 *
 * What it changes, said once here and in the card: payroll leaves them out of every run with no
 * warning, and they stop counting in "On the payroll", in missing-details counts and in the setup
 * checklist. What it does not change: they stay in the directory with a tag, can still sign in, and
 * keep their leave, attendance and performance.
 *
 * Shown to anybody who may edit records, and to anybody it is true of (so the person themselves, and
 * people who can only read the record, see why nothing is asked of them). A person paid through
 * payroll who cannot edit records sees nothing: there is nothing to say and nothing to press.
 *
 * `onSave` is the caller's, for the same reason as `EditableSection`'s: whether the write goes to the
 * API or to the demo's local store is a decision the page holds. It may reject, and the message is
 * shown.
 */
export function PayrollStatusCard({
  employee,
  onSave,
  self = false,
}: {
  employee: Employee;
  onSave: (patch: EmployeePatch) => Promise<unknown>;
  /** The reader is looking at their own record, so the sentences say "you" and not "they". */
  self?: boolean;
}) {
  const canEdit = useCan("EDIT_RECORDS");
  const toast = useToast();
  const notPaid = employee.notOnPayroll === true;
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(employee.notOnPayrollReason ?? "");
  const [busy, setBusy] = useState(false);

  if (!canEdit && !notPaid) return null;

  const they = self ? "you" : "they";
  const them = self ? "you" : "them";
  const their = self ? "your" : "their";

  const save = async (patch: EmployeePatch, done: string) => {
    setBusy(true);
    try {
      await onSave(patch);
      setEditing(false);
      toast.push({ title: done, tone: "success" });
    } catch (error) {
      toast.push({
        title: "That was not saved",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    setReason(employee.notOnPayrollReason ?? "");
    setEditing(true);
  };

  return (
    <Card>
      <CardHeader title="Payroll" />
      <CardBody className="flex flex-col gap-4">
        {editing ? (
          <>
            <Field
              label={`Why ${self ? "are you" : "are they"} not paid through payroll?`}
              optional
              help={`For example: Company administrator. Payroll leaves ${them} out of every run, and ${they} stop counting as staff on the payroll and as missing details.`}
            >
              <Input
                value={reason}
                maxLength={200}
                placeholder="Company administrator"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="accent"
                disabled={busy}
                onClick={() =>
                  void save(
                    { notOnPayroll: true, notOnPayrollReason: reason.trim() },
                    notPaid ? "Reason updated" : "Not paid through payroll",
                  )
                }
              >
                {notPaid ? "Save" : "Leave off payroll"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : notPaid ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral" size="sm">
                  Not paid through payroll
                </Badge>
                {employee.notOnPayrollReason && (
                  <span className="text-body-sm text-ink">
                    {employee.notOnPayrollReason}
                  </span>
                )}
              </div>
              <p className="text-body-sm text-body">
                {`Payroll leaves ${them} out of every run. ${self ? "You are" : "They are"} not counted as staff on the payroll, or as missing details.`}
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={open}>
                  Edit reason
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      { notOnPayroll: false, notOnPayrollReason: "" },
                      "Paid through payroll again",
                    )
                  }
                >
                  Pay through payroll again
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-body-sm text-body">
              {`Paid through payroll. Payroll needs ${their} bank account, and ${they} count in the staff total.`}
            </p>
            <div>
              <Button size="sm" variant="secondary" onClick={open}>
                Not paid through payroll
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
