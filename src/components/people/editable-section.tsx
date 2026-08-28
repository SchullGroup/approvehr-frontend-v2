"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Field,
  Input,
  Money,
  Picker,
  Select,
  type PickerOption,
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

/** The value a field shows: the record's, or whatever the caller supplied. */
function currentValue(f: EditableField, employee: Employee): unknown {
  return f.value !== undefined
    ? f.value
    : (employee as Record<string, unknown>)[f.key];
}

/**
 * The `<option>` a `select` field's picker offers for "not one of these".
 *
 * Never itself a stored value — chosen, it reveals a free-text field, and
 * whatever gets typed there is what actually ends up on the patch.
 */
const OTHER_OPTION_VALUE = "__other__";

/**
 * Whether a `select` field with `allowOther` is showing a value its own
 * options list does not carry — a record holding a name typed before this
 * existed, or one this company added that the shared list hasn't caught up
 * with.
 */
function isCustomValue(f: EditableField, value: unknown): boolean {
  if (!f.allowOther) return false;
  if (value === null || value === undefined || value === "") return false;
  return !f.options?.some((o) => o.value === String(value));
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

export type EditableGroup = {
  id: string;
  title: string;
  /** A small lucide icon, rendered before the title on the closed line. */
  icon?: React.ReactNode;
  /** One line under the title, when the group needs explaining. */
  hint?: string;
};

export type EditableField = {
  key: keyof EmployeePatch;
  label: string;
  /**
   * Which group this field belongs to, by id. Only meaningful when the section
   * is given `groups`. A field with no group renders above the first one —
   * which is the right place for the one or two things somebody always wants in
   * front of them.
   */
  group?: string;
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
  /**
   * `select` only. Appends an "Other (specify)" choice that reveals a
   * free-text input in its place — for a fixed list that is a starting point
   * rather than a closed register, where the value on file may genuinely not
   * be one of the options offered.
   */
  allowOther?: boolean;
  /** Label for the appended choice. Defaults to "Other (specify)". */
  otherLabel?: string;
  /** Says "(optional)" in the label, styled lighter than the rest of it. */
  optional?: boolean;
  help?: string;
  /** Exactly this many digits. Caps the input and shows a counter. */
  digits?: number;
  required?: boolean;
  /** Rendered when the value is absent and the section is not being edited. */
  emptyLabel?: string;
  /**
   * The empty state is ordinary, not a gap worth flagging red.
   *
   * The reporting line is the case this exists for: the one person with no
   * manager is usually the head of the company, not a record missing
   * something the way an unset bank account or pension PIN is.
   */
  emptyIsNormal?: boolean;
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
  groups,
  onSave,
  openOnField,
}: {
  title: string;
  description?: string;
  employee: Employee;
  fields: EditableField[];
  columns?: 1 | 2;
  /**
   * Collapsible groups for the fields, in the order they should appear.
   *
   * ## Why a record page needs these and a form does not
   *
   * The employee record carries thirty-odd fields across its tabs, and the
   * incumbent this product is sold against shows all of them at once — which is
   * why nobody can find anything on it. Tabs were the first cut. Inside a tab,
   * "Payment and statutory" alone is eight fields, most of which are fine, and
   * the reader is looking for the one that is not.
   *
   * So each group's closed line carries its own state, and names what is
   * missing rather than counting it: "2 missing" makes somebody open the group
   * to find out which, which is the click this exists to save.
   *
   * ## Every group opens while editing
   *
   * `Disclosure` unmounts what it hides. A collapsed group during an edit means
   * a validation error on a field nobody can see, and a Save that refuses with
   * the reason off screen — the exact dead end this codebase has a rule
   * against. Collapsing earns its place while reading, not while writing.
   */
  groups?: EditableGroup[];
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
     view and trip `no-setState-in-effect`.

     `&& canEdit` because this used to be `openOnField !== undefined` alone,
     and `openOnField` comes off a URL — `?tab=pay&field=bankAccount`. So the
     Edit button was correctly hidden from anybody without `EDIT_RECORDS`, and
     one link handed the same person the whole editor anyway, Save included, for
     the API to refuse with a 403 after they had typed. An employee reaches it
     from their own record's advisory list. The permission is the rule; a
     deep link is not an exception to it. */
  const [editing, setEditing] = useState(openOnField !== undefined && canEdit);
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
  /**
   * `draft`'s starting point, frozen for the life of this edit — what "did
   * this field change" is measured against in `save()`.
   *
   * Not the same thing as reading `employee`/`fields` live there. `currentDepartment`
   * and `currentLocation` in `record.tsx` resolve from `useDepartments()` /
   * `useWorkLocations()`, both of which start empty and fill in from the API a
   * moment after the record itself has already rendered. Open this section
   * before that fetch lands and `departmentId`'s seed is `""` — but if the API
   * response arrives *while the section is still open*, the field's live value
   * flips to the real id underneath an input the person never touched. Diffing
   * against that live value made an untouched "Not assigned" look like a
   * deliberate clear, and sent `""` where the API wanted a UUID or nothing.
   * Diffing against this frozen snapshot instead means only an actual edit —
   * one that lands in `draft` via an `onChange` — can produce a patch entry. */
  const [baseline, setBaseline] = useState<EmployeePatch>(() =>
    openOnField === undefined ? {} : seedFrom(fields, employee).draft,
  );
  const [errors, setErrors] = useState<SectionError[]>([]);
  const [busy, setBusy] = useState(false);
  /* Which `allowOther` fields are explicitly showing their free-text input,
     by key. Kept apart from `isCustomValue`: picking "Other (specify)" clears
     the draft value ready for typing, and if that were the only signal the
     field would read as unset the instant it was chosen and the select would
     flip straight back to itself. */
  const [otherFields, setOtherFields] = useState<Record<string, boolean>>({});

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
    setBaseline(seed.draft);
    setErrors([]);
    /* Reset rather than seeded: a custom value already on the record shows
       its free-text input anyway, via `isCustomValue` below, with no explicit
       toggle needed. */
    setOtherFields({});
    setEditing(true);
  }

  function cancel() {
    setDraft({});
    setText({});
    setBaseline({});
    setErrors([]);
    setOtherFields({});
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
          if (baseline[f.key] !== null && baseline[f.key] !== undefined) {
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
        if (kobo !== Number(baseline[f.key] ?? NaN)) patch[f.key] = kobo as never;
        continue;
      }
      const next = draft[f.key];
      /* `undefined` is not a change, it is a draft that was never seeded. It
         cannot arrive from an input — clearing a field types `""` — so treating
         it as "set this field to nothing" only ever destroyed data. Belt and
         braces beside the seeding fix above, because this is the branch that
         did the damage. */
      if (next === undefined) continue;
      /* Against `baseline`, not `valueOf(f)` — see the comment on `baseline`
         above. `valueOf` still backs the read-only view below, where live is
         correct; here it would compare a field the person may never have
         touched against a value that moved out from under it. */
      if (next !== baseline[f.key]) patch[f.key] = next as never;
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

  /* One renderer, used flat and inside a group — so a field looks and behaves
     the same either way, and adding a group cannot quietly change how a value
     is displayed or edited. */
  const renderField = (f: EditableField) => {
            const value = valueOf(f);

    if (!editing) {
      return (
        <div key={String(f.key)}>
  <dt className="text-meta text-muted">{f.label}</dt>
  <dd className="mt-0.5 text-body-sm text-ink">
    {value === null || value === undefined || value === "" ? (
      <span
        className={
          f.emptyIsNormal ? "text-muted" : "font-medium text-danger-text"
        }
      >
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
        optional={f.optional}
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
        ) : f.type === "select" &&
  (otherFields[String(f.key)] ||
    isCustomValue(f, draft[f.key])) ? (
  <div className="flex flex-col gap-1.5">
    <Input
      data-section-field={String(f.key)}
      value={String(draft[f.key] ?? "")}
      onChange={(e) => {
        const v = e.target.value;
        setDraft((d) => ({ ...d, [f.key]: v }));
        setErrors((x) => x.filter((y) => y.field !== f.key));
      }}
    />
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      onClick={() => {
        setOtherFields((o) => ({ ...o, [String(f.key)]: false }));
        setDraft((d) => ({ ...d, [f.key]: "" as never }));
        setErrors((x) => x.filter((y) => y.field !== f.key));
      }}
    >
      Choose from the list instead
    </Button>
  </div>
        ) : f.type === "select" ? (
  <Select
    value={String(draft[f.key] ?? "")}
    onChange={(e) => {
      const v = e.target.value;
      if (f.allowOther && v === OTHER_OPTION_VALUE) {
        setOtherFields((o) => ({ ...o, [String(f.key)]: true }));
        setDraft((d) => ({ ...d, [f.key]: "" as never }));
      } else {
        setDraft((d) => ({ ...d, [f.key]: v }));
      }
      setErrors((x) => x.filter((y) => y.field !== f.key));
    }}
  >
    {f.options?.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
    {f.allowOther && (
      <option value={OTHER_OPTION_VALUE}>
        {f.otherLabel ?? "Other (specify)"}
      </option>
    )}
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
  };

  const listClass =
    columns === 2
      ? "grid gap-x-8 gap-y-4 sm:grid-cols-2"
      : "flex flex-col gap-4";

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
        {groups && groups.length > 0 ? (
          <div className="flex flex-col gap-2">
            {fields.some((f) => !f.group) && (
              <dl className={listClass}>
                {fields.filter((f) => !f.group).map(renderField)}
              </dl>
            )}
            {groups.map((group, index) => {
              const own = fields.filter((f) => f.group === group.id);
              if (own.length === 0) return null;
              const empty = own.filter((f) => {
                const value = valueOf(f);
                return value === null || value === undefined || value === "";
              });
              return (
                <Disclosure
                  key={group.id}
                  {...(editing ? { open: true } : {})}
                  defaultOpen={index === 0}
                  level={4}
                  title={
                    <span className="flex items-center gap-2">
                      {group.icon ? (
                        <span className="text-accent-text">{group.icon}</span>
                      ) : null}
                      {group.title}
                    </span>
                  }
                  meta={
                    empty.length > 0 ? (
                      <Badge tone="warning" size="sm">
                        {empty.map((f) => f.label).join(", ")}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        {own.length === 1
                          ? "On file"
                          : `All ${String(own.length)} on file`}
                      </Badge>
                    )
                  }
                  {...(group.hint ? { hint: group.hint } : {})}
                >
                  <dl className={listClass}>{own.map(renderField)}</dl>
                </Disclosure>
              );
            })}
          </div>
        ) : (
          <dl className={listClass}>{fields.map(renderField)}</dl>
        )}
      </CardBody>
    </Card>
  );
}
