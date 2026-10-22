"use client";

import { FilterBar } from "./filter-bar";
import { Switch } from "./choice";

/**
 * A single "also show..." choice, behind the same filter icon every table
 * uses, instead of a loose checkbox beside a heading. When it is on, a chip
 * under the icon says so and takes it off again.
 */
export function ToggleFilter({
  label,
  checked,
  onChange,
  className,
}: {
  /** Reads as a sentence: "Show archived", "Exceptions only". */
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <FilterBar
      {...(className ? { className } : {})}
      applied={
        checked
          ? [{ label: "Filter", value: label, onClear: () => onChange(false) }]
          : []
      }
    >
      <Switch
        label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </FilterBar>
  );
}
