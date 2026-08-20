"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import {
  useEmployeeStore,
  validateEmployee,
  type FieldError,
} from "@/lib/store/employees";
import type { Employee } from "@/lib/types";

/*
 * Section-level editing.
 *
 * A record is edited one panel at a time rather than through a single form for
 * forty fields. It keeps the blast radius of a mistake small, means Save only
 * ever writes what the person was actually looking at, and lets the rest of
 * the record stay readable while one part is open.
 *
 * Cancel restores the values the section opened with, not the defaults — an
 * edit abandoned halfway should leave nothing behind.
 */

export type EditableField = {
  key: keyof Employee;
  label: string;
  type?: "text" | "email" | "tel" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  help?: string;
  required?: boolean;
  /** Rendered when the value is absent and the section is not being edited. */
  emptyLabel?: string;
  /** Formats the stored value for display. */
  format?: (v: unknown) => React.ReactNode;
};

export function EditableSection({
  title,
  description,
  employee,
  fields,
  columns = 2,
}: {
  title: string;
  description?: string;
  employee: Employee;
  fields: EditableField[];
  columns?: 1 | 2;
}) {
  const { update } = useEmployeeStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Employee>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);

  const errorFor = (k: keyof Employee) =>
    errors.find((e) => e.field === k)?.message;

  function open() {
    /* Seed the draft from the record so Cancel is a true revert. */
    const seed: Partial<Employee> = {};
    for (const f of fields) {
      seed[f.key] = employee[f.key] as never;
    }
    setDraft(seed);
    setErrors([]);
    setEditing(true);
  }

  function cancel() {
    setDraft({});
    setErrors([]);
    setEditing(false);
  }

  function save() {
    /* Only send what actually changed. */
    const patch: Partial<Employee> = {};
    for (const f of fields) {
      const next = draft[f.key];
      if (next !== employee[f.key]) patch[f.key] = next as never;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    const found = validateEmployee(patch);
    const missing = fields
      .filter((f) => f.required && !String(draft[f.key] ?? "").trim())
      .map((f) => ({
        field: f.key,
        message: `${f.label} is required.`,
      }));

    const all = [...found, ...missing];
    if (all.length > 0) {
      setErrors(all);
      return;
    }

    setBusy(true);
    setTimeout(() => {
      update(employee.id, patch);
      setBusy(false);
      setEditing(false);
      const count = Object.keys(patch).length;
      toast.push({
        title: `${title} updated`,
        tone: "success",
        detail: `${count} field${count > 1 ? "s" : ""} changed.`,
      });
    }, 350);
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          editing ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X aria-hidden="true" className="size-3.5" />
                Cancel
              </Button>
              <Button
                variant="approve"
                size="sm"
                onClick={save}
                loading={busy}
              >
                Save
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={open}>
              <Pencil aria-hidden="true" className="size-3.5" />
              Edit
            </Button>
          )
        }
      />
      <CardBody>
        <dl
          className={
            columns === 2
              ? "grid gap-x-8 gap-y-4 sm:grid-cols-2"
              : "flex flex-col gap-4"
          }
        >
          {fields.map((f) => {
            const value = employee[f.key];

            if (!editing) {
              return (
                <div key={String(f.key)}>
                  <dt className="text-[0.75rem] text-muted">{f.label}</dt>
                  <dd className="mt-0.5 text-[0.875rem] text-ink">
                    {value === null || value === undefined || value === "" ? (
                      <span className="font-medium text-danger-text">
                        {f.emptyLabel ?? "Not provided"}
                      </span>
                    ) : f.format ? (
                      f.format(value)
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              );
            }

            return (
              <Field
                key={String(f.key)}
                label={f.label}
                required={f.required}
                help={f.help}
                error={errorFor(f.key)}
              >
                {f.type === "select" ? (
                  <Select
                    value={String(draft[f.key] ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => ({ ...d, [f.key]: v }));
                      setErrors((x) => x.filter((y) => y.field !== f.key));
                    }}
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    value={String(draft[f.key] ?? "")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = f.type === "number" ? Number(raw) : raw;
                      setDraft((d) => ({ ...d, [f.key]: v }));
                      setErrors((x) => x.filter((y) => y.field !== f.key));
                    }}
                  />
                )}
              </Field>
            );
          })}
        </dl>
      </CardBody>
    </Card>
  );
}
