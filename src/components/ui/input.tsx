"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

/*
 * Control borders use control-line at 4.3:1 rather than the decorative line
 * token, because an input boundary carries meaning and must clear 3:1.
 */

const CONTROL =
  "w-full bg-surface text-ink placeholder:text-muted " +
  "border border-control-line rounded-md " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-ink-soft " +
  "focus:border-accent-text focus:outline-none focus:ring-3 focus:ring-accent/25 " +
  "disabled:bg-sunken disabled:text-muted disabled:cursor-not-allowed disabled:hover:border-control-line " +
  "aria-[invalid=true]:border-danger-text aria-[invalid=true]:ring-danger/20";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Rendered inside the control on the leading edge. Decorative only. */
  icon?: React.ReactNode;
  /** Short unit or currency shown on the trailing edge, for example USD. */
  suffix?: string;
  /**
   * Exactly this many digits, and nothing else.
   *
   * A NUBAN account number is ten digits and a TIN is ten digits. Both fields
   * said so in their help text while accepting twelve — which is how an account
   * number that cannot be paid into gets saved, with the field that would have
   * caught it sitting right there reading "Ten digits."
   *
   * Set this and the input cannot hold a wrong-shaped value: non-digits are
   * dropped on the way in, the length is capped, and a counter sits on the
   * trailing edge so somebody pasting a number can see where they are without
   * counting characters on a screen.
   *
   * Capped in `onChange` rather than by `maxLength` alone. `maxLength` governs
   * typing but not every paste path, and a silently truncated paste is worse
   * than a visible refusal — so the value is filtered here and the counter is
   * what explains it.
   */
  digits?: number;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, suffix, digits, onChange, ...props },
  ref,
) {
  const field = useFieldControl();

  /* The counter reuses the suffix slot rather than inventing a second one. An
     explicit `suffix` still wins: a currency matters more than a count. */
  const shownSuffix =
    suffix ??
    (digits === undefined
      ? undefined
      : `${String(props.value ?? "").length}/${digits}`);

  const handleChange =
    digits === undefined
      ? onChange
      : (event: React.ChangeEvent<HTMLInputElement>) => {
          const cleaned = event.target.value.replace(/\D/g, "").slice(0, digits);
          /* Rewritten before the caller sees it, so a controlled parent never
             holds a value this field would refuse to render. */
          if (cleaned !== event.target.value) event.target.value = cleaned;
          onChange?.(event);
        };
  const control = (
    <input
      ref={ref}
      className={cn(
        CONTROL,
        "h-10 px-3 text-body-sm tabular",
        icon && "pl-9",
        shownSuffix && "pr-16",
        className,
      )}
      {...field}
      {...(digits === undefined
        ? {}
        : { inputMode: "numeric" as const, maxLength: digits })}
      {...props}
      onChange={handleChange}
    />
  );

  if (!icon && !shownSuffix) return control;

  return (
    <div className="relative">
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&>svg]:size-4"
        >
          {icon}
        </span>
      )}
      {control}
      {shownSuffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body-sm font-medium text-muted tabular"
        >
          {shownSuffix}
        </span>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  const field = useFieldControl();
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, "px-3 py-2.5 text-body-sm resize-y", className)}
      {...field}
      {...props}
    />
  );
});

/* -------------------------------------------------------------------------- */

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Shown as a disabled first option when the value is empty. */
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, children, placeholder, ...props }, ref) {
    const field = useFieldControl();
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            CONTROL,
            "h-10 pl-3 pr-9 text-body-sm appearance-none cursor-pointer",
            className,
          )}
          {...field}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>
    );
  },
);
