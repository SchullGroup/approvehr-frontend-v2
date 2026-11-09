"use client";

import { Select } from "@/components/ui";
import type {
  ObjectiveGroup,
  ObjectiveMeasure,
} from "@/lib/projects/objectives";

/**
 * A choice of objective, with "No link".
 *
 * Only draws what it is given. Which objectives are on offer is decided in
 * `lib/projects/objectives.ts` and passed in as `groups`; this never filters.
 * A native select, grouped Company, Department and Personal: it is a list of
 * titles, and a phone gives it a good picker for free.
 */
export function ObjectivePicker({
  groups,
  value,
  onChange,
  disabled = false,
  loading = false,
  id,
  label,
  compact = false,
}: {
  groups: readonly ObjectiveGroup[];
  /** The linked objective's id, or `null` for none. */
  value: string | null;
  /** `null` is "No link". */
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** The objectives have not arrived yet: the control is there but cannot be used. */
  loading?: boolean;
  id?: string;
  /** For a control with no visible label of its own. */
  label?: string;
  /** The drawer's row height, beside its other selects; settings uses the field default. */
  compact?: boolean;
}) {
  return (
    <Select
      {...(id ? { id } : {})}
      {...(label ? { "aria-label": label } : {})}
      value={value ?? ""}
      disabled={disabled || loading}
      onChange={(event) => onChange(event.target.value || null)}
      {...(compact ? { className: "h-9" } : {})}
    >
      <option value="">{loading ? "Loading objectives" : "No link"}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/**
 * Narrows a link to one measure of the objective, or leaves it on the whole
 * objective. Drawn only when the chosen objective has measures.
 */
export function MeasurePicker({
  measures,
  value,
  onChange,
  disabled = false,
  id,
  compact = false,
  labelled = false,
}: {
  measures: readonly ObjectiveMeasure[];
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  id?: string;
  compact?: boolean;
  /** A visible label already names it (a `Field`), so it carries no name of its own. */
  labelled?: boolean;
}) {
  return (
    <Select
      {...(id ? { id } : {})}
      {...(labelled ? {} : { "aria-label": "Measure (optional)" })}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      {...(compact ? { className: "h-9" } : {})}
    >
      <option value="">Whole objective</option>
      {measures.map((measure) => (
        <option key={measure.id} value={measure.id}>
          {measure.label}
        </option>
      ))}
    </Select>
  );
}
