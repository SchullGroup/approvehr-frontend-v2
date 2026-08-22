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
  Picker,
  Select,
  useToast,
  type PickerOption,
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

/** The value a field shows: the record's, or whatever the caller supplied. */
function currentValue(f: EditableField, employee: Employee): unknown {
  return f.value !== undefined
    ? f.value
    : (employee as Record<string, unknown>)[f.key];
}

/**
 * The draft a section opens with: the record's own values, so Cancel is a true
 * revert and Save only ever sends what somebody actually changed.
 *
 * A free function rather than a method on the component because it is needed in
 * two places that cannot share one — `open()`, and the `useState` initialiser
 * for the case where the section arrives already open. Those two drifting apart
 * is what caused the blank-editor bug documented on `draft` below.
 */
function seedFrom(
  fields: EditableField[],
  employee: Employee,
): { draft: EmployeePatch; text: Record<string, string> } {
  const draft: EmployeePatch = {};
  const text: Record<string, string> = {};
  for (const f of fields) {
    const value = currentValue(f, employee);
    draft[f.key] = value as never;
    if (f.type === "money") {
      text[String(f.key)] =
        value === null || value === undefined ? "" : String(naira(Number(value)));
    }
  }
  return { draft, text };
}

export type EditableField = {
  key: keyof EmployeePatch;
  label: string;
  type?:
    | "text"
    | "email"
    | "tel"
    | "date"
    | "number"
    | "select"
    | "picker"
    | "money";
  /**
   * The choices, for `select` and `picker`.
   *
   * `hint` is a second line and only a `picker` renders it. It exists for the
   * bank list, where the NIBSS code is what the bank's own portal asks for: a
   * name on its own is not enough to check a payment file against.
   */
  options?: PickerOption[];
  /** `picker` only. What the trigger reads when nothing is chosen. */
  placeholder?: string;
  help?: string;
  /** Exactly this many digits. Caps the input and shows a counter. */
  digits?: number;
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
  /**
   * Seeded on the first render when we arrive already editing.
   *
   * This used to start `{}` unconditionally, and `openOnField` set `editing`
   * true without ever calling `open()` — so the single most-used way into this
   * editor, the "Add account number" link a payroll exception offers, rendered
   * **every field blank over a record that was full**. Saving from there wrote
   * those blanks back: `draft[key]` was `undefined`, `undefined !== "0114204471"`,
   * so the patch cleared the account number, pension PIN, TIN, NHF number and
   * tax state of anybody whose blocker somebody went to fix.
   *
   * A lazy initialiser rather than an effect, for the reason above it: the first
   * paint has to be right, not corrected afterwards.
   */
  const [draft, setDraft] = useState<EmployeePatch>(() =>
    openOnField === undefined ? {} : seedFrom(fields, employee).draft,
  );
  /* Money fields only: the naira text being typed, before it becomes kobo.
     Seeds from the same function as `draft` above — it runs twice on the one
     render that needs it, over a handful of fields, which is cheaper than the
     restructuring needed to share the result between two initialisers. */
  const [text, setText] = useState<Record<string, string>>(() =>
    openOnField === undefined ? {} : seedFrom(fields, employee).text,
  );
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

  const valueOf = (f: EditableField): unknown => currentValue(f, employee);

  function open() {
    const seed = seedFrom(fields, employee);
    setDraft(seed.draft);
    setText(seed.text);
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
      /* `undefined` is not a change, it is a draft that was never seeded. It
         cannot arrive from an input — clearing a field types `""` — so treating
         it as "set this field to nothing" only ever destroyed data. Belt and
         braces beside the seeding fix above, because this is the branch that
         did the damage. */
      if (next === undefined) continue;
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
                /* Blue: Save is the primary action of this section. It read
                   as pale green while `approve` was the green secondary,
                   which made the most-used button on the record the hardest
                   one to see. `approve` is for approving, not for saving. */
                variant="accent"
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
                    {...(f.digits === undefined ? {} : { digits: f.digits })}
                    inputMode="numeric"
                    value={text[String(f.key)] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setText((t) => ({ ...t, [String(f.key)]: raw }));
                      setErrors((x) => x.filter((y) => y.field !== f.key));
                    }}
                  />
                ) : f.type === "picker" ? (
                  <Picker
                    value={String(draft[f.key] ?? "")}
                    onChange={(v) => {
                      setDraft((d) => ({ ...d, [f.key]: v }));
                      setErrors((x) => x.filter((y) => y.field !== f.key));
                    }}
                    options={f.options ?? []}
                    {...(f.placeholder === undefined
                      ? {}
                      : { placeholder: f.placeholder })}
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
                    {...(f.digits === undefined ? {} : { digits: f.digits })}
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
