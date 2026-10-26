"use client";

import { cn } from "@/lib/cn";

/**
 * Board or table, as the shared `SegmentedControl` draws it, 44px tall on a phone.
 *
 * The shared control's buttons are 35px (`py-1.5` around a 20px line) and it lives in
 * `components/ui`, which this screen may not edit. Same radio-group semantics, same
 * look, the height changed below the `sm` breakpoint and nowhere else.
 */
export function ViewSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-canvas p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-150 max-sm:min-h-11 max-sm:px-4",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text",
              selected
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
