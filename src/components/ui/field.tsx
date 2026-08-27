"use client";

import { createContext, useContext, useId } from "react";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The label-line info icon that replaced help text sitting under every field.
 *
 * Two copies of `help`, doing two different jobs, is the point rather than
 * duplication to clean up:
 *
 * - A visually-hidden span, permanently in the DOM and named by `id` — this
 *   is what `aria-describedby` on the control actually points at, so a
 *   screen-reader user hears the guidance the moment they land on the field,
 *   exactly as before. Its visibility never depends on hover.
 * - A visible panel, `aria-hidden`, shown only on hover or focus. It exists
 *   for sighted mouse and keyboard users, and is hidden from assistive tech
 *   so the same sentence is not announced twice.
 *
 * `group-focus-within` is what makes the panel appear for a keyboard user —
 * tabbing to the trigger focuses it, which is also what happens when a touch
 * screen taps a button, so no separate touch handling was needed.
 */
function InfoTooltip({ id, text }: { id: string; text: string }) {
  return (
    <span className="group relative inline-flex">
      <span id={id} className="sr-only">
        {text}
      </span>
      <button
        type="button"
        aria-label="More about this field"
        className="text-muted hover:text-ink focus:text-ink focus:outline-none"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
      <span
        aria-hidden="true"
        role="presentation"
        className={cn(
          "invisible absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2",
          "rounded-md border border-line bg-surface p-2.5 text-body-sm leading-relaxed text-body shadow-lg",
          "opacity-0 transition-opacity duration-100",
          "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
        )}
      >
        {text}
      </span>
    </span>
  );
}

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
  /**
   * Says "(optional)" in the label.
   *
   * The house rule, replacing a hint sentence underneath. "Optional. Some bank
   * portals need it in the upload file." puts the one word somebody scans for
   * at the start of a paragraph they have to read to find it, and it reads as
   * an instruction rather than as a property of the field.
   *
   * A prop rather than text appended to `label`, for the same reason `required`
   * is one: one place decides how it renders, and a typo'd "(Optional)" cannot
   * happen. Setting both is a contradiction and is refused below.
   */
  optional?: boolean;
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
  optional = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const inputId = `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const hasError = Boolean(error);

  if (required && optional) {
    throw new Error(
      `Field "${label}" is marked both required and optional. One of the two is wrong, and the reader would have been shown both.`,
    );
  }

  const describedBy =
    [help ? helpId : null, hasError ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <FieldContext.Provider
      value={{ inputId, helpId, errorId, hasError, describedBy, required }}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <span
          className={cn(
            "flex items-center gap-1.5",
            hideLabel && "sr-only-focusable",
          )}
        >
          <label
            htmlFor={inputId}
            className="text-body-sm font-medium text-ink"
          >
            {label}
            {required && (
              <span className="text-danger-text ml-0.5" aria-hidden="true">
                *
              </span>
            )}
            {required && <span className="sr-only-focusable"> required</span>}
            {/* Part of the label, so a screen reader reads it with the field
                name rather than announcing it separately as guidance. Muted
                and at the same size: a qualifier, not a second heading. */}
            {optional && (
              <span className="font-normal text-muted"> (optional)</span>
            )}
          </label>
          {help && !hasError && !hideLabel && (
            <InfoTooltip id={helpId} text={help} />
          )}
        </span>

        {children}

        {/* The help text with nowhere to attach beside — a hidden label has no
            visible line for the icon to sit on, so guidance for a
            visually-hidden field stays as a plain, always-visible line rather
            than a tooltip nobody can see the trigger for. */}
        {help && !hasError && hideLabel && (
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
      <legend className="mb-1 flex items-center gap-1.5 text-body-sm font-medium text-ink">
        {legend}
        {help && !error && <InfoTooltip id={helpId} text={help} />}
      </legend>
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
