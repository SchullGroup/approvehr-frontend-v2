"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Money,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { koboFromDecimal, naira } from "@/lib/api/payroll";
import { useCan } from "@/lib/permissions";
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
 *
 * ## Editing needs `EDIT_RECORDS`, so without it there is no Edit button
 *
 * `PATCH /employees/:id` requires it, and half the people who can *read* a
 * record cannot change it — a record opens for the person themselves, and almost
 * nobody may edit their own job title or salary. An Edit button that fills a
 * form, accepts a change and then answers 403 on Save has wasted somebody's
 * time and taught them the product is unreliable. The section stays fully
 * readable; only the control that cannot work is absent.
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
  type?: "text" | "email" | "tel" | "date" | "number" | "select" | "money";
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
  openOnField,
}: {
  title: string;
  description?: string;
  employee: Employee;
  fields: EditableField[];
  columns?: 1 | 2;
  /** Commits the changed fields. Rejecting with an `ApiError` is expected. */
  onSave: (patch: EmployeePatch) => Promise<unknown>;
  /**
   * Open in edit mode with this field focused.
   *
   * For arriving from somewhere that already knows what is wrong. A payroll
   * exception saying "Grace Effiong has no account number" offers **Add account
   * number**, and that link used to land on the record's first tab with nothing
   * in edit mode — so the fix was: find the right tab, find the section, press
   * Edit, find the field. Four steps after a button that named the field.
   */
  openOnField?: string | undefined;
}) {
  const toast = useToast();
  const canEdit = useCan("EDIT_RECORDS");
  /* Initial state rather than an effect: the section must render editable on
     its first paint, and setting it from an effect would flash the read-only
     view and trip `no-setState-in-effect`. */
  const [editing, setEditing] = useState(openOnField !== undefined);
  const [draft, setDraft] = useState<EmployeePatch>({});
  /* Money fields only: the naira text being typed, before it becomes kobo. */
  const [text, setText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<SectionError[]>([]);
  const [busy, setBusy] = useState(false);

  /* A DOM side effect, not state: put the caret where the caller pointed. The
     empty dependency list is deliberate — this fires on arrival and never
     again, so it cannot steal focus from somebody already typing. */
  useEffect(() => {
    if (openOnField === undefined) return;
    document
      .querySelector<HTMLElement>(`[data-section-field="${openOnField}"]`)
      ?.focus();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const errorFor = (k: keyof EmployeePatch) =>
    errors.find((e) => e.field === k)?.message;

  /** The value a field shows: the record's, or whatever the caller supplied. */
  const valueOf = (f: EditableField): unknown =>
    f.value !== undefined ? f.value : (employee as Record<string, unknown>)[f.key];

  function open() {
    /* Seed the draft from the record so Cancel is a true revert. */
    const seed: EmployeePatch = {};
    const seedText: Record<string, string> = {};
    for (const f of fields) {
      const value = valueOf(f);
      seed[f.key] = value as never;
      if (f.type === "money") {
        seedText[String(f.key)] =
          value === null || value === undefined
            ? ""
            : String(naira(Number(value)));
      }
    }
    setDraft(seed);
    setText(seedText);
    setErrors([]);
    setEditing(true);
  }

  function cancel() {
    setDraft({});
    setText({});
    setErrors([]);
    setEditing(false);
  }

  async function save() {
    /* Only send what actually changed. */
    const patch: EmployeePatch = {};
    const bad: SectionError[] = [];

    for (const f of fields) {
      if (f.type === "money") {
        const typed = (text[String(f.key)] ?? "").replace(/[^\d.]/g, "").trim();
        /* Emptied means withdrawn, which is `null` rather than `0`. */
        if (typed === "") {
          if (valueOf(f) !== null && valueOf(f) !== undefined) {
            patch[f.key] = null as never;
          }
          continue;
        }
        if (!Number.isFinite(Number(typed))) {
          bad.push({ field: f.key, message: `Enter ${f.label.toLowerCase()} as a number.` });
          continue;
        }
        /* Integer kobo, split on the point rather than multiplied. */
        const kobo = koboFromDecimal(typed);
        if (kobo !== Number(valueOf(f) ?? NaN)) patch[f.key] = kobo as never;
        continue;
      }
      const next = draft[f.key];
      if (next !== valueOf(f)) patch[f.key] = next as never;
    }

    if (bad.length > 0) {
      setErrors(bad);
      return;
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
          ) : canEdit ? (
            <Button variant="secondary" size="sm" onClick={open}>
              <Pencil aria-hidden="true" className="size-3.5" />
              Edit
            </Button>
          ) : null
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
                  <dt className="text-meta text-muted">{f.label}</dt>
                  <dd className="mt-0.5 text-body-sm text-ink">
                    {value === null || value === undefined || value === "" ? (
                      <span className="font-medium text-danger-text">
                        {f.emptyLabel ?? "Not provided"}
                      </span>
                    ) : f.type === "money" ? (
                      <Money amount={naira(Number(value))} />
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
                {f.type === "money" ? (
                  <Input
                    data-section-field={String(f.key)}
                    inputMode="numeric"
                    value={text[String(f.key)] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setText((t) => ({ ...t, [String(f.key)]: raw }));
                      setErrors((x) => x.filter((y) => y.field !== f.key));
                    }}
                  />
                ) : f.type === "select" ? (
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
                    data-section-field={String(f.key)}
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
