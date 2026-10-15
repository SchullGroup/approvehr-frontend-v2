"use client";

import { Select } from "@/components/ui";
import type { ObjectiveOption } from "@/lib/projects/objectives";

/**
 * A choice of objective, with "None".
 *
 * Only draws what it is given. Which objectives are valid to offer is decided in
 * `lib/projects/objectives.ts` and passed in as `options`; this never filters,
 * so what a person can pick is exactly what the caller decided the API will take.
 * A native select, like the sprint and epic pickers beside it: it is a short list
 * of titles and a phone gives it a good one for free.
 */
export function ObjectivePicker({
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  id,
  label,
  compact = false,
}: {
  options: readonly ObjectiveOption[];
  /** The linked objective's id, or `null` for none. */
  value: string | null;
  /** `null` is "None". */
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
      <option value="">{loading ? "Loading objectives" : "None"}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
