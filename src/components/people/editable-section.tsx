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
import { ApiError } from "@/lib/api/client";
import { validateEmployee } from "@/lib/store/employees";
import type { EmployeePatch } from "@/lib/store/employees-api";
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
 *
 * ## Saving is the caller's job
 *
 * `onSave` is required rather than defaulted to the local store. Whether an edit
 * goes to the API or to localStorage is a decision the *page* holds — it knows
 * which mode it is in — and a default here would silently write to the browser
 * on a screen that believed it was connected. It returns a promise, and a
 * rejection is expected: field errors from the API land on the right inputs.
 */

/**
 * A message against one field.
 *
 * Wider than `FieldError` from the employee store by exactly the id fields, so
 * a department picker's error has somewhere to land.
 */
type SectionError = { field: keyof EmployeePatch; message: string };

export type EditableField = {
  key: keyof EmployeePatch;
  label: string;
  type?: "text" | "email" | "tel" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  help?: string;
  required?: boolean;
  /** Rendered when the value is absent and the section is not being edited. */
  emptyLabel?: string;
  /** Formats the stored value for display. */
  format?: (v: unknown) => React.ReactNode;
  /**
   * The current value, when it is not simply `employee[key]`.
   *
   * `departmentId` is the case this exists for: the select's options are ids,
   * and the id is not on `Employee` — only the department's name is.
   */
  value?: unknown;
};

export function EditableSection({
  title,
  description,
  employee,
  fields,
  columns = 2,
  onSave,
}: {
  title: string;
  description?: string;
  employee: Employee;
  fields: EditableField[];
  columns?: 1 | 2;
  /** Commits the changed fields. Rejecting with an `ApiError` is expected. */
  onSave: (patch: EmployeePatch) => Promise<unknown>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmployeePatch>({});
  const [errors, setErrors] = useState<SectionError[]>([]);
  const [busy, setBusy] = useState(false);

  const errorFor = (k: keyof EmployeePatch) =>
    errors.find((e) => e.field === k)?.message;

  /** The value a field shows: the record's, or whatever the caller supplied. */
  const valueOf = (f: EditableField): unknown =>
    f.value !== undefined ? f.value : (employee as Record<string, unknown>)[f.key];

  function open() {
    /* Seed the draft from the record so Cancel is a true revert. */
    const seed: EmployeePatch = {};
    for (const f of fields) {
      seed[f.key] = valueOf(f) as never;
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

  async function save() {
    /* Only send what actually changed. */
    const patch: EmployeePatch = {};
    for (const f of fields) {
      const next = draft[f.key];
      if (next !== valueOf(f)) patch[f.key] = next as never;
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

    const count = Object.keys(patch).length;
    setBusy(true);
    try {
      await onSave(patch);
      setEditing(false);
      toast.push({
        title: `${title} updated`,
        tone: "success",
        detail: `${count} field${count > 1 ? "s" : ""} changed.`,
      });
    } catch (error) {
      /* The API answers with the field and the sentence. Put both where the
         person is looking rather than in a toast they have to translate. */
      const fieldErrors =
        error instanceof ApiError
          ? error.fieldErrors
              .filter((d) => fields.some((f) => f.key === d.field))
              .map((d) => ({
                field: d.field as keyof EmployeePatch,
                message: d.message,
              }))
          : [];

      if (fieldErrors.length > 0) setErrors(fieldErrors);
      else {
        toast.push({
          title: "That did not save",
          tone: "danger",
          detail:
            error instanceof ApiError
              ? error.message
              : "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
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
                onClick={() => void save()}
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
            const value = valueOf(f);

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
