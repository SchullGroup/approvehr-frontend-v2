"use client";

import { createContext, useContext, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Field owns the accessible wiring so individual inputs never have to.
 * It generates the ids and exposes them through context, so the control
 * gets aria-describedby and aria-invalid set correctly every time.
 */

type FieldContextValue = {
  inputId: string;
  helpId: string;
  errorId: string;
  hasError: boolean;
  describedBy: string | undefined;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext() {
  return useContext(FieldContext);
}

/** Spread onto any control to inherit the field's accessible wiring. */
export function useFieldControl() {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  return {
    id: ctx.inputId,
    "aria-describedby": ctx.describedBy,
    "aria-invalid": ctx.hasError || undefined,
    "aria-required": ctx.required || undefined,
  };
}

export type FieldProps = {
  label: string;
  /** Guidance shown under the control. Always rendered before the error. */
  help?: string;
  error?: string;
  required?: boolean;
  /** Hides the label visually but keeps it for assistive technology. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({
  label,
  help,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const inputId = `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const hasError = Boolean(error);

  const describedBy =
    [help ? helpId : null, hasError ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <FieldContext.Provider
      value={{ inputId, helpId, errorId, hasError, describedBy, required }}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={inputId}
          className={cn(
            "text-body-sm font-medium text-ink",
            hideLabel && "sr-only-focusable",
          )}
        >
          {label}
          {required && (
            <span className="text-danger-text ml-0.5" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only-focusable"> required</span>}
        </label>

        {children}

        {help && !hasError && (
          <p id={helpId} className="text-body-sm leading-relaxed text-muted">
            {help}
          </p>
        )}

        {hasError && (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-body-sm leading-relaxed text-danger-text"
          >
            <AlertCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 mt-px"
            />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */

/** Groups related controls. Use for radio and checkbox sets. */
export function FieldSet({
  legend,
  help,
  error,
  className,
  children,
}: {
  legend: string;
  help?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;

  return (
    <fieldset
      className={cn("flex flex-col gap-2 min-w-0", className)}
      aria-describedby={
        [help ? helpId : null, error ? errorId : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="text-body-sm font-medium text-ink mb-1">{legend}</legend>
      {help && !error && (
        <p id={helpId} className="text-body-sm text-muted -mt-1">
          {help}
        </p>
      )}
      {children}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-body-sm text-danger-text"
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
