"use client";

import { cn } from "@/lib/cn";

/**
 * The small pieces every field on the apply form is made of.
 *
 * One label, one line of help, one line of refusal, wired together with `id`s so a
 * screen reader reads them in that order when the box takes focus. Kept apart from
 * the form so the three kinds of thing that need them — a text box, a group of
 * choices, a file — look and sound alike.
 */

export const inputClass = (error: boolean) =>
  cn(
    "mt-2 w-full rounded-xl border bg-white px-4 text-slate",
    "placeholder:text-slate-muted/60 focus:outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
    error ? "border-danger" : "border-sand-line",
  );

export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger-text">
        *
      </span>
      <span className="sr-only-focusable"> required</span>
    </>
  );
}

export function OptionalMark() {
  return (
    <span className="ml-0.5 text-meta font-normal text-slate-muted">
      {" "}
      Optional
    </span>
  );
}

export function Help({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-1.5 text-meta leading-relaxed text-slate-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-1.5 text-meta text-danger-text">
      {children}
    </p>
  );
}

/** Ids joined for `aria-describedby`, skipping the ones that are not on the page. */
export const describedBy = (
  ...ids: (string | false | null | undefined)[]
): string | undefined => {
  const kept = ids.filter((id): id is string => Boolean(id));
  return kept.length > 0 ? kept.join(" ") : undefined;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  help,
  required,
  optional,
  type = "text",
  inputMode,
  placeholder,
  maxLength,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string | undefined;
  required?: boolean;
  optional?: boolean;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "url" | "tel" | "email";
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-body-sm font-medium text-slate">
        {label}
        {required && <RequiredMark />}
        {optional && <OptionalMark />}
      </label>
      {help && <Help id={`${id}-help`}>{help}</Help>}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(
          help && `${id}-help`,
          error && `${id}-error`,
        )}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(inputClass(Boolean(error)), "h-11")}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

/**
 * The live count under a long answer.
 *
 * Two things, because they have different jobs. The visible figure changes with
 * every keystroke and is hidden from assistive technology — a screen reader
 * announcing "41, 42, 43" as somebody types is not help, it is noise. The
 * `status` region beside it changes **only when the situation does**: when the
 * writer gets close to the limit, reaches it, goes over it, or comes back under.
 */
export function WordCounter({
  id,
  count,
  limit,
}: {
  id: string;
  count: number;
  limit: number | null;
}) {
  const over = limit !== null && count > limit;
  const near = limit !== null && !over && count >= Math.ceil(limit * 0.8);
  const announcement =
    limit === null
      ? ""
      : over
        ? `${count - limit} ${count - limit === 1 ? "word" : "words"} over the limit.`
        : near
          ? `${limit - count} ${limit - count === 1 ? "word" : "words"} left.`
          : "";

  return (
    <div className="mt-1.5 flex justify-end">
      <span
        id={`${id}-count`}
        data-testid={`${id}-count`}
        aria-hidden="true"
        className={cn(
          "tabular text-meta",
          over ? "font-medium text-danger-text" : "text-slate-muted",
        )}
      >
        {limit === null
          ? `${count} ${count === 1 ? "word" : "words"}`
          : `${count} of ${limit} words`}
      </span>
      <span role="status" aria-live="polite" className="sr-only-focusable">
        {announcement}
      </span>
    </div>
  );
}
