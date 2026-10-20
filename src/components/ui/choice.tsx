"use client";

import { forwardRef, useEffect, useId, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Checkbox, Radio and Switch. Each keeps a real native control underneath so
 * keyboard behaviour, form participation and screen reader semantics are the
 * browser's rather than something reimplemented here.
 */

type ChoiceProps = {
  label: React.ReactNode;
  description?: string;
  className?: string;
};

export type CheckboxProps = Omit<ChoiceProps, "label"> &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    /**
     * What it is for, in words. Leave it out and pass `hiddenLabel` for a tick that
     * stands alone in a row or a column heading, where the name is the row's.
     */
    label?: React.ReactNode;
    /**
     * The box's accessible name when there is no visible label. No `<label>` is
     * drawn: a list with a tick on every row used to carry one label per row, and
     * every one of them is something a test runner's accessibility queries have to
     * search again for each button on the page.
     */
    hiddenLabel?: string;
    indeterminate?: boolean;
  };

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      label,
      hiddenLabel,
      description,
      className,
      indeterminate,
      disabled,
      ...props
    },
    ref,
  ) {
    const id = useId();
    const descId = description ? `${id}-desc` : undefined;
    const own = useRef<HTMLInputElement | null>(null);

    /* `indeterminate` is a property of the element, not an attribute, so React
       cannot set it. The dash that stands for "some, not all" is shown by the CSS
       state this sets, and without it the box showed neither tick nor dash. */
    useEffect(() => {
      if (own.current) own.current.indeterminate = Boolean(indeterminate);
    }, [indeterminate]);

    return (
      <div className={cn("flex gap-2.5", className)}>
        <span
          className={cn(
            "relative flex items-center justify-center shrink-0 mt-px size-[18px]",
            /* A tick with no words beside it has nothing else to press, so on a
               touch screen it is the size of a finger's smallest target. */
            label === undefined && "[@media(pointer:coarse)]:size-6",
          )}
        >
          <input
            ref={(node) => {
              own.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={id}
            type="checkbox"
            disabled={disabled}
            aria-describedby={descId}
            {...(label === undefined && hiddenLabel
              ? { "aria-label": hiddenLabel }
              : {})}
            className={cn(
              "peer size-[18px] appearance-none rounded-xs border bg-surface",
              label === undefined && "[@media(pointer:coarse)]:size-6",
              "border-control-line cursor-pointer transition-colors duration-150",
              "hover:border-ink-soft",
              "checked:bg-fill-strong checked:border-fill-strong",
              "indeterminate:bg-fill-strong indeterminate:border-fill-strong",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              "disabled:cursor-not-allowed disabled:bg-sunken disabled:border-line-strong",
            )}
            {...props}
          />
          {indeterminate ? (
            <Minus
              aria-hidden="true"
              className="pointer-events-none absolute size-3 text-white opacity-0 peer-indeterminate:opacity-100"
            />
          ) : (
            <Check
              aria-hidden="true"
              strokeWidth={3}
              className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
            />
          )}
        </span>

        {label !== undefined && (
          <span className="min-w-0">
            <label
              htmlFor={id}
              className={cn(
                "block text-body-sm text-ink leading-snug",
                disabled ? "cursor-not-allowed text-muted" : "cursor-pointer",
              )}
            >
              {label}
            </label>
            {description && (
              <span
                id={descId}
                className="mt-0.5 block text-body-sm text-muted"
              >
                {description}
              </span>
            )}
          </span>
        )}
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */

export type RadioProps = ChoiceProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, disabled, ...props },
  ref,
) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className={cn("flex gap-2.5", className)}>
      <span className="relative flex items-center justify-center shrink-0 mt-px size-[18px]">
        <input
          ref={ref}
          id={id}
          type="radio"
          disabled={disabled}
          aria-describedby={descId}
          className={cn(
            "peer size-[18px] appearance-none rounded-full border bg-surface",
            "border-control-line cursor-pointer transition-colors duration-150",
            "hover:border-ink-soft checked:border-ink checked:border-[6px]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            "disabled:cursor-not-allowed disabled:bg-sunken disabled:border-line-strong",
          )}
          {...props}
        />
      </span>

      <span className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            "block text-body-sm text-ink leading-snug",
            disabled ? "cursor-not-allowed text-muted" : "cursor-pointer",
          )}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="mt-0.5 block text-body-sm text-muted">
            {description}
          </span>
        )}
      </span>
    </div>
  );
});

/* -------------------------------------------------------------------------- */

/**
 * A card shaped radio, used where the choice deserves more weight than a
 * plain list, for example rotation cycle or settlement currency.
 */
export function RadioCard({
  label,
  description,
  icon,
  className,
  disabled,
  ...props
}: RadioProps & { icon?: React.ReactNode }) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="radio"
        disabled={disabled}
        className="peer sr-only-focusable"
        {...props}
      />
      <label
        htmlFor={id}
        className={cn(
          "flex gap-3 rounded-lg border border-line bg-surface p-4 h-full",
          "transition-[border-color,box-shadow,background-color] duration-150",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-control-line hover:bg-canvas",
          "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:shadow-xs",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text",
        )}
      >
        {icon && (
          <span
            aria-hidden="true"
            className="shrink-0 text-accent-text [&>svg]:size-5"
          >
            {icon}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-body-sm font-medium text-ink">
            {label}
          </span>
          {description && (
            <span className="mt-1 block text-body-sm leading-relaxed text-body">
              {description}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export type SwitchProps = ChoiceProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, disabled, ...props },
  ref,
) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            "block text-body-sm font-medium text-ink leading-snug",
            disabled ? "cursor-not-allowed text-muted" : "cursor-pointer",
          )}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="mt-0.5 block text-body-sm text-muted">
            {description}
          </span>
        )}
      </span>

      <span className="relative shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          aria-describedby={descId}
          className={cn(
            "peer h-6 w-11 appearance-none rounded-full bg-line-strong",
            "cursor-pointer transition-colors duration-200",
            /* success-strong, not the light brand green: the white thumb
               needs 3:1 against the track to stay legible when on. */
            "checked:bg-success-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm",
            "transition-transform duration-200 ease-out-soft",
            "peer-checked:translate-x-5",
          )}
        />
      </span>
    </div>
  );
});
