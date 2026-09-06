"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useEmployeeMutations } from "@/lib/store/employees-api";
import { fullName, type Employee, type PayrollGap } from "@/lib/types";

/**
 * The same three fields `payrollGapsFor` can ever name, so this never has to
 * guess at a help sentence — it is `record.tsx`'s own copy for these fields,
 * kept in one place so the two cannot drift.
 */
const HELP: Record<PayrollGap["field"], string> = {
  bankAccount: "Ten digits. Payroll cannot pay without this.",
  pensionPin: "PEN followed by 9 to 12 digits.",
  tin: "Ten digits.",
};

const MAX_LENGTH: Partial<Record<PayrollGap["field"], number>> = {
  bankAccount: 10,
  tin: 10,
};

/**
 * The Directory's own quick-fill dialog for exactly the fields `payrollGapsFor`
 * flags on a row — never more. A record has a dozen other optional columns;
 * this is not a second, smaller record editor for all of them, only for what
 * is standing between somebody and their next payslip.
 *
 * Saves everything typed in one request, through the same
 * `useEmployeeMutations().update` the full record page uses, so a field-level
 * refusal (the wrong digit count, an already-claimed PIN) lands on the input
 * it belongs to rather than a toast the reader has to translate.
 */
export function MissingDetailsDialog({
  employee,
  gaps,
  onClose,
  onSaved,
}: {
  employee: Employee;
  gaps: PayrollGap[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutations = useEmployeeMutations();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const filled = gaps.filter((g) => (values[g.field] ?? "").trim() !== "");

  function setValue(field: string, value: string) {
    setValues((cur) => ({ ...cur, [field]: value }));
    setErrors((cur) => {
      if (!(field in cur)) return cur;
      const next = { ...cur };
      delete next[field];
      return next;
    });
  }

  async function save() {
    if (filled.length === 0) return;
    const patch = Object.fromEntries(
      filled.map((g) => [g.field, values[g.field]!.trim()]),
    );

    setBusy(true);
    setErrors({});
    try {
      await mutations.update(employee.id, patch);
      toast.push({
        title: `${fullName(employee)} updated`,
        tone: "success",
        detail: `${filled.length} field${filled.length > 1 ? "s" : ""} added.`,
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors: Record<string, string> = {};
        for (const g of gaps) {
          const message = error.messageFor(g.field);
          if (message !== undefined) fieldErrors[g.field] = message;
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          toast.push({ title: "That did not save", tone: "danger", detail: error.message });
        }
      } else {
        toast.push({
          title: "That did not save",
          tone: "danger",
          detail: "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Missing for ${fullName(employee)}`}
      description="Only what's needed to pay them: everything else stays on their full record."
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={filled.length === 0}
            onClick={() => void save()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {gaps.map((g) => (
          <Field key={g.field} label={g.label} help={HELP[g.field]} error={errors[g.field]}>
            <Input
              value={values[g.field] ?? ""}
              onChange={(e) => setValue(g.field, e.target.value)}
              maxLength={MAX_LENGTH[g.field]}
              placeholder={g.label}
              autoComplete="off"
            />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
