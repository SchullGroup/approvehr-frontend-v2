"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The time beside a due date.
 *
 * Off until there is a date ("Add a date first"), with a clear button, and an
 * empty value meaning "by the end of the day". The browser's own time control
 * shows 12- or 24-hour as the reader's locale does; the value is always `HH:MM`.
 */
export function DueTimeInput({
  id,
  date,
  value,
  onChange,
  disabled = false,
  className,
  label = "Due time",
}: {
  id?: string;
  /** The due date it belongs to; without one the time cannot be set. */
  date: string | null | undefined;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const noDate = !date;
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <Input
        id={id}
        type="time"
        step={60}
        value={noDate ? "" : (value ?? "")}
        disabled={disabled || noDate}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={label}
        title={noDate ? "Add a date first" : "No time (due by end of day)"}
        placeholder={
          noDate ? "Add a date first" : "No time (due by end of day)"
        }
        className="h-9 w-auto pr-8"
      />
      {!noDate && !disabled && value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear the due time"
          className="absolute right-1.5 rounded-sm p-0.5 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </span>
  );
}
