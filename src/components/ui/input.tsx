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
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, suffix, ...props },
  ref,
) {
  const field = useFieldControl();
  const control = (
    <input
      ref={ref}
      className={cn(
        CONTROL,
        "h-10 px-3 text-sm tabular",
        icon && "pl-9",
        suffix && "pr-14",
        className,
      )}
      {...field}
      {...props}
    />
  );

  if (!icon && !suffix) return control;

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
      {suffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.875rem] font-medium text-muted"
        >
          {suffix}
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
      className={cn(CONTROL, "px-3 py-2.5 text-sm resize-y", className)}
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
            "h-10 pl-3 pr-9 text-sm appearance-none cursor-pointer",
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
