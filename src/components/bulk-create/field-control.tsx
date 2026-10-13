"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Draft } from "@/lib/bulk-create/model";
import {
  errorsOf,
  warningsOf,
  type ItemReport,
} from "@/lib/bulk-create/report";
import type {
  BulkSurface,
  FieldControl,
  FieldOption,
} from "@/lib/bulk-create/surface";

/**
 * One field, in the four places it appears: a labelled control on a card, the
 * same field read-only in the review, a bare cell in the table, and its value in
 * the table's read-only form.
 *
 * Every one of them reads the field's control from the surface, so a card, a
 * page and a table cell can never disagree about whether a column is a dropdown
 * or a box — which is the whole job of having three layouts of one list.
 */

/** What a field is, when the surface has not said. A dropdown if the dictionary has one. */
export function controlFor(surface: BulkSurface, field: string): FieldControl {
  const given = surface.controls[field];
  if (given) return given;
  const spec = surface.dictionary.byField.get(field);
  if (spec?.dropdown) {
    return {
      kind: "select",
      options: spec.dropdown.map((value) => ({ value, label: value })),
      blank: "—",
    };
  }
  return { kind: "text" };
}

/**
 * The choices for a dropdown, with the current value kept in them.
 *
 * A value that is not in the list — a department typed into a file somebody
 * loaded, a quarter written the long way — has to stay visible. A `<select>`
 * whose value matches no option shows its first option, which would silently
 * change what the item says; the check will name the value it does not know.
 */
export function optionsWith(
  options: readonly FieldOption[],
  value: string,
): readonly FieldOption[] {
  if (value === "" || options.some((option) => option.value === value)) {
    return options;
  }
  return [{ value, label: value }, ...options];
}

/** How a value reads when it is not being edited. */
export function displayValue(
  surface: BulkSurface,
  field: string,
  value: string,
): string {
  const control = controlFor(surface, field);
  if (value === "") return "";
  if (control.kind === "select") {
    return (
      control.options.find((option) => option.value === value)?.label ?? value
    );
  }
  if (control.kind === "text") {
    return (
      control.suggestions?.find((option) => option.value === value)?.label ??
      value
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- */

/** A labelled field on a card. */
export function CardField({
  surface,
  draft,
  field,
  report,
  readOnly,
  withHelp,
  listBase,
  onChange,
}: {
  surface: BulkSurface;
  draft: Draft;
  field: string;
  report: ItemReport | undefined;
  readOnly: boolean;
  /**
   * Whether this field carries its "what goes here" tooltip.
   *
   * Every card in a stacked list would carry the same twelve, and each one
   * measures the page when it mounts — so only the first card does. The
   * guidance is identical on all of them, which is what makes that enough.
   */
  withHelp: boolean;
  /** Where the shared suggestion lists are; see `SuggestionLists`. */
  listBase: string;
  onChange: (field: string, value: string) => void;
}) {
  const spec = surface.dictionary.byField.get(field);
  if (!spec) return null;
  const control = controlFor(surface, field);
  const value = draft.values[field] ?? "";
  const error = errorsOf(report).find((problem) => problem.field === field);
  const warning = warningsOf(report).find((problem) => problem.field === field);

  if (readOnly) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          control.kind === "longtext" && "sm:col-span-2",
        )}
      >
        <dt className="text-meta font-medium text-muted">{spec.column}</dt>
        <dd className="text-body-sm text-ink break-words whitespace-pre-line">
          {displayValue(surface, field, value) || (
            <span className="text-muted">Not set</span>
          )}
        </dd>
        {warning && <Warning>{warning.problem}</Warning>}
      </div>
    );
  }

  return (
    <div
      className={cn("min-w-0", control.kind === "longtext" && "sm:col-span-2")}
    >
      <Field
        label={spec.column}
        required={spec.required}
        {...(withHelp ? { help: spec.note } : {})}
        {...(error ? { error: error.problem } : {})}
      >
        <FieldEditor
          control={control}
          value={value}
          placeholder={spec.example}
          listId={suggestionListId(listBase, field)}
          onChange={(next) => onChange(field, next)}
        />
      </Field>
      {warning && !error && <Warning>{warning.problem}</Warning>}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-body-sm leading-relaxed text-warning-text">
      <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The control for a field. Inside a `Field` it inherits the field's id and aria;
 * outside one — the "same for everyone" bar — it is a plain control.
 */
export function FieldEditor({
  control,
  value,
  placeholder,
  listId,
  onChange,
}: {
  control: FieldControl;
  value: string;
  placeholder: string;
  /** The shared `<datalist>` this control's suggestions live in, if it has any. */
  listId?: string;
  onChange: (value: string) => void;
}) {
  if (control.kind === "select") {
    return (
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{control.blank}</option>
        {optionsWith(control.options, value).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }
  if (control.kind === "longtext") {
    return (
      <Textarea
        rows={3}
        value={value}
        placeholder={control.placeholder ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  const hasSuggestions = (control.suggestions?.length ?? 0) > 0;
  return (
    <Input
      value={value}
      type={control.type ?? "text"}
      {...(control.inputMode ? { inputMode: control.inputMode } : {})}
      placeholder={control.placeholder ?? placeholder}
      {...(hasSuggestions && listId ? { list: listId } : {})}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * The suggestions a text control offers, written **once** for the whole window.
 *
 * A `<datalist>` per control would put two hundred people's addresses into the
 * page once for every card, and a full window is fifty of them: ten thousand
 * options to be told the same two hundred names. Every control that has
 * suggestions points at one of these instead, by `suggestionListId`.
 *
 * Memoised: it depends on the surface and an id and on nothing a keystroke
 * changes, so re-writing two hundred `<option>`s per key would be waste.
 */
export const suggestionListId = (base: string, field: string): string =>
  `${base}-${field}`;

export const SuggestionLists = memo(function SuggestionLists({
  surface,
  base,
}: {
  surface: BulkSurface;
  base: string;
}) {
  return (
    <>
      {surface.dictionary.columns.map((spec) => {
        const control = controlFor(surface, spec.field);
        if (control.kind !== "text" || !control.suggestions?.length) {
          return null;
        }
        return (
          <datalist key={spec.field} id={suggestionListId(base, spec.field)}>
            {control.suggestions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </datalist>
        );
      })}
    </>
  );
});

/* -------------------------------------------------------------------------- */

const CELL =
  "h-10 w-full min-w-0 bg-transparent px-2.5 text-body-sm text-ink " +
  "placeholder:text-muted focus:bg-surface focus:outline-none " +
  "focus:ring-2 focus:ring-inset focus:ring-accent/40 " +
  "aria-[invalid=true]:bg-danger-soft aria-[invalid=true]:ring-1 " +
  "aria-[invalid=true]:ring-inset aria-[invalid=true]:ring-danger-line";

/**
 * A bare cell in the table. No label — the column heading is the label — so it
 * carries one for a screen reader instead.
 *
 * `listId` names a `<datalist>` the table renders **once per column**: fifty
 * rows each carrying their own copy of two hundred suggestions would be ten
 * thousand elements for no reason.
 *
 * `onPasteText` is offered only for a text cell, because a `<select>` cannot be
 * pasted into and a one-value paste must keep doing what a paste does — it
 * answers whether it took the paste over.
 */
export function GridCell({
  surface,
  field,
  value,
  invalid,
  label,
  position,
  listId,
  onChange,
  onPasteText,
}: {
  surface: BulkSurface;
  field: string;
  value: string;
  invalid: string | undefined;
  label: string;
  /** Where this cell is, for moving between cells with the keyboard. */
  position: { row: number; column: number };
  listId: string | undefined;
  onChange: (value: string) => void;
  onPasteText: (text: string) => boolean;
}) {
  const control = controlFor(surface, field);
  const common = {
    "aria-label": label,
    "aria-invalid": invalid ? true : undefined,
    ...(invalid ? { title: invalid } : {}),
    "data-cell": `${String(position.row)}:${String(position.column)}`,
  } as const;

  if (control.kind === "select") {
    return (
      <select
        {...common}
        className={cn(CELL, "cursor-pointer")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{control.blank}</option>
        {optionsWith(control.options, value).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      {...common}
      className={CELL}
      value={value}
      type={control.kind === "text" ? (control.type ?? "text") : "text"}
      {...(control.kind === "text" && control.inputMode
        ? { inputMode: control.inputMode }
        : {})}
      {...(listId ? { list: listId } : {})}
      onChange={(event) => onChange(event.target.value)}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain");
        if (onPasteText(text)) event.preventDefault();
      }}
    />
  );
}
