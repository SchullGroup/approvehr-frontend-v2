"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
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
 *
 * `buttons` adds Save and Cancel under the field while it is being edited, and a
 * short "Saved" after. Leaving the field still saves; the buttons are there
 * because a field that saves itself with nothing on screen to say so reads as
 * one that has not been saved at all.
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
  const [saved, setSaved] = useState(false);
  /* Set by Cancel and Save, so the blur that follows them does not commit. */
  const skip = useRef(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  /* Adjusting state during render: the documented way to follow a prop without
     an effect. Only follows while the person is not typing. */
  if (value !== seen) {
    setSeen(value);
    if (!editing) setDraft(value);
  }

  const commit = () => {
    setEditing(false);
    if (skip.current) {
      skip.current = false;
      return;
    }
    const next = clean ? clean(draft) : draft;
    if (next === null) {
      setDraft(value);
      return;
    }
    if (next !== draft) setDraft(next);
    if (next !== value) {
      onCommit(next);
      setSaved(true);
    }
  };

  return {
    draft,
    setDraft,
    focus: () => {
      skip.current = false;
      setEditing(true);
    },
    commit,
    editing,
    saved,
    /** Save now; the blur that follows is then a no-op. */
    save: () => {
      commit();
      skip.current = true;
    },
    /** Put the saved text back without sending anything. */
    cancel: () => {
      setDraft(value);
      setEditing(false);
      skip.current = true;
    },
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
  buttons = false,
  ...props
}: CommonProps & {
  buttons?: boolean;
} & Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "onBlur" | "onFocus"
  >) {
  const field = useDraft(value, onCommit, clean);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <Textarea
        {...props}
        ref={ref}
        value={field.draft}
        onChange={(event) => field.setDraft(event.target.value)}
        onFocus={field.focus}
        onBlur={field.commit}
      />
      {buttons && <DraftButtons field={field} target={ref} />}
    </div>
  );
}

/**
 * Save and Cancel under a field being edited, and "Saved" once it is.
 *
 * A press on either would blur the field first and save it on the way; holding
 * the press (`preventDefault` on mouse down) keeps the field focused, so Cancel
 * really cancels.
 */
function DraftButtons({
  field,
  target,
}: {
  field: ReturnType<typeof useDraft>;
  target: React.RefObject<HTMLTextAreaElement | null>;
}) {
  if (field.editing) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            field.save();
            target.current?.blur();
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            field.cancel();
            target.current?.blur();
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }
  if (field.saved) {
    return (
      <p role="status" className="mt-1 text-meta text-success-text">
        Saved
      </p>
    );
  }
  return null;
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
  buttons = false,
}: CommonProps & {
  disabled?: boolean;
  "aria-label": string;
  className?: string;
  buttons?: boolean;
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
    <div>
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
      {buttons && <DraftButtons field={field} target={ref} />}
    </div>
  );
}
