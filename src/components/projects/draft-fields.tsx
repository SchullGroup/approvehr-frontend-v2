"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Text that is saved when you leave it, not on every keystroke.
 *
 * Each keeps what is being typed in a draft and sends it on blur (or Enter, for a
 * single line). The `value` prop is the saved one, and it wins whenever the field
 * is not being edited: a refresh that brings in somebody else's change appears,
 * a refusal that rolls the value back puts the old text back, and an edit in
 * progress is never overwritten under the cursor.
 *
 * `clean` normalises what was typed before it is compared and sent; returning
 * `null` rejects it and puts the saved value back (an empty title, for instance).
 */

type CommonProps = {
  value: string;
  onCommit: (next: string) => void;
  clean?: (draft: string) => string | null;
};

function useDraft(
  value: string,
  onCommit: (next: string) => void,
  clean?: (draft: string) => string | null,
) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [editing, setEditing] = useState(false);

  /* Adjusting state during render: the documented way to follow a prop without
     an effect. Only follows while the person is not typing. */
  if (value !== seen) {
    setSeen(value);
    if (!editing) setDraft(value);
  }

  const commit = () => {
    setEditing(false);
    const next = clean ? clean(draft) : draft;
    if (next === null) {
      setDraft(value);
      return;
    }
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };

  return {
    draft,
    setDraft,
    focus: () => setEditing(true),
    commit,
  };
}

export function DraftInput({
  value,
  onCommit,
  clean,
  ...props
}: CommonProps &
  Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onBlur" | "onFocus"
  >) {
  const field = useDraft(value, onCommit, clean);
  return (
    <Input
      {...props}
      value={field.draft}
      onChange={(event) => field.setDraft(event.target.value)}
      onFocus={field.focus}
      onBlur={field.commit}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.key === "Enter" && !event.defaultPrevented) {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function DraftTextarea({
  value,
  onCommit,
  clean,
  ...props
}: CommonProps &
  Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "onBlur" | "onFocus"
  >) {
  const field = useDraft(value, onCommit, clean);
  return (
    <Textarea
      {...props}
      value={field.draft}
      onChange={(event) => field.setDraft(event.target.value)}
      onFocus={field.focus}
      onBlur={field.commit}
    />
  );
}

/**
 * A heading you can edit in place: looks like text until you hover or focus it,
 * grows with what is typed, and Enter saves rather than adding a line.
 */
export function DraftHeading({
  value,
  onCommit,
  clean,
  disabled,
  "aria-label": ariaLabel,
  className,
}: CommonProps & {
  disabled?: boolean;
  "aria-label": string;
  className?: string;
}) {
  const field = useDraft(value, onCommit, clean);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [field.draft]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={field.draft}
      disabled={disabled}
      aria-label={ariaLabel}
      maxLength={240}
      onChange={(event) => field.setDraft(event.target.value)}
      onFocus={field.focus}
      onBlur={field.commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 -mx-2 text-h4 text-ink",
        "hover:bg-canvas focus:border-accent-text focus:bg-surface focus:outline-none focus:ring-3 focus:ring-accent/25",
        "disabled:hover:bg-transparent",
        className,
      )}
    />
  );
}
