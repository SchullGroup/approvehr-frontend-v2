"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "./feedback";
import { Input } from "./input";
import type { PickerOption } from "./picker";

/**
 * A picker that asks somebody else for its options as you type.
 *
 * ## Why this is not `Picker`
 *
 * `Picker` filters a list it already holds, and that is right for two hundred
 * departments or banks. It is wrong for people: the directory is a page of the
 * company, not the company, and a picker built from the first two hundred rows
 * cannot reach colleague number 201. This one holds no list. It reports what
 * was typed (`onQueryChange`), shows whatever it is given (`options`), and says
 * whether what it is showing answers what was typed (`pending`). Where the
 * options come from, and how a name is turned into a search, is the caller's
 * business; `useEmployeeSearch` is the one for people.
 *
 * ## The three rules that make a type-ahead honest
 *
 * 1. **The chosen option belongs to the caller, not to the list.** `selected` is
 *    the whole option, held outside. A search changes `options` under the
 *    person's hands; if the chosen one were looked up in them it would vanish
 *    the moment they typed something else, and the form would hold an id with
 *    no name beside it.
 * 2. **A list that does not answer the box says so.** While `pending` the old
 *    rows stay (a list that empties on every keystroke flickers) but they are
 *    dimmed, nothing is highlighted, and Enter does nothing. Otherwise a fast
 *    typist presses Enter on the row for the *previous* letters and thanks the
 *    wrong person. A click is still taken: that is somebody choosing a row they
 *    are looking at.
 * 3. **Failure is not "nobody matches".** `failed` says the search did not
 *    work and offers a retry; an empty answer says nobody matches. They are
 *    different facts about the company and the screen must not mix them.
 *
 * ## Keyboard and screen readers
 *
 * The ARIA 1.2 combobox with a list popup: the input has `role="combobox"`,
 * `aria-expanded`, `aria-controls` and `aria-autocomplete="list"`, focus never
 * leaves it, and the highlighted row is named by `aria-activedescendant`. Down
 * and Up move (and wrap), Enter chooses, Escape closes the list and puts the
 * chosen name back, Tab leaves without choosing. Home and End stay with the
 * caret, because this is a text box first.
 *
 * The list opens on a click, on typing and on an arrow, **not on focus**. A
 * dialog moves focus to its first field when it opens, and a dropdown that
 * opened with it would cover the rest of the form before anybody had asked.
 *
 * Escape inside a dialog closes the list and not the dialog: the input marks
 * itself `data-escape-to-popup` while the list is open, which `useFocusTrap`
 * respects. The next Escape then closes the dialog as it always did.
 *
 * ## What it does not do
 *
 * No portal and no positioning library. The list sits **in the flow** under the
 * box and pushes what is below it down, rather than floating over it like
 * `Picker`'s: the dialogs this is used in clip anything that floats past the
 * edge of their body, and the first version showed four rows and a cut one above
 * the footer. A list that grows the form is a worse look and a better control.
 * No virtualisation either, since the caller shows a handful of rows. Rows are
 * 44px tall and are chosen on `click`, not `pointerdown`, so a thumb that starts a
 * scroll does not choose.
 */

export type SearchPickerProps = {
  /** The chosen option, held by the caller. Shown in the box when nothing is being typed. */
  selected: PickerOption | null;
  onSelect: (option: PickerOption) => void;
  /**
   * Every change of the typed text, as typed. The caller debounces; this does
   * not. Called with "" when the box is put back (a choice, Escape, leaving).
   */
  onQueryChange: (text: string) => void;
  options: readonly PickerOption[];
  /** What is listed does not answer what is typed: a search is due or on its way. */
  pending?: boolean;
  /** The last search did not work. Wins over an empty list. */
  failed?: boolean;
  onRetry?: () => void;
  /** There are more matches than are listed. */
  more?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Falls back to the surrounding `Field`'s label. */
  "aria-label"?: string;
};

export function SearchPicker({
  selected,
  onSelect,
  onQueryChange,
  options,
  pending = false,
  failed = false,
  onRetry,
  more = false,
  placeholder = "Search by name",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: SearchPickerProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-o${String(index)}`;

  const [open, setOpen] = useState(false);
  /* What is being typed, or null when the box shows the chosen name. Derived
     rather than synced: there is no effect that copies `selected` into state. */
  const [typing, setTyping] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);

  const text = typing ?? selected?.label ?? "";
  const typed = typing?.trim() ?? "";
  const settled = !pending && !failed;
  const last = options.length - 1;
  /* Nothing is highlighted while the list is out of date, so there is nothing
     for Enter to take by mistake. */
  const at = settled && last >= 0 ? Math.min(active, last) : -1;

  /* Keeps the highlighted row on screen as the arrows move it. */
  useEffect(() => {
    if (!open || at < 0) return;
    document
      .getElementById(`${baseId}-o${String(at)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, at, baseId]);

  /** Closes, and puts the chosen name back where a half-typed one was. */
  const close = () => {
    setOpen(false);
    if (typing !== null) {
      setTyping(null);
      onQueryChange("");
    }
  };

  const choose = (option: PickerOption) => {
    if (option.disabled) return;
    onSelect(option);
    setTyping(null);
    setOpen(false);
    onQueryChange("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else if (settled && last >= 0) setActive(at >= last ? 0 : at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else if (settled && last >= 0) setActive(at <= 0 ? last : at - 1);
        break;
      case "Enter":
        if (!open) return;
        /* Always swallowed while open: Enter in a dialog must not submit
           whatever is behind the list, and must not choose a stale row. */
        event.preventDefault();
        if (at >= 0) {
          const option = options[at];
          if (option) choose(option);
        }
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        /* Leaves without choosing, and is never trapped. */
        close();
        break;
      default:
        break;
    }
  };

  /* Closing when focus leaves the whole control, not on the input's own blur:
     a row, or the retry button, takes focus on some browsers and that must not
     shut the list under the press. */
  const onBlurCapture = (event: React.FocusEvent) => {
    if (!open) return;
    const next = event.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    close();
  };

  const announcement = !open
    ? ""
    : failed
      ? "The search did not work."
      : pending
        ? ""
        : options.length === 0
          ? "Nobody matches."
          : `${String(options.length)} ${options.length === 1 ? "match" : "matches"}${more ? ", and more" : ""}.`;

  const rule = options.length > 0 ? "border-t border-line" : "";

  return (
    <div ref={wrapRef} className={className} onBlurCapture={onBlurCapture}>
      <Input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        {...(open ? { "aria-controls": listId } : {})}
        {...(open && at >= 0 ? { "aria-activedescendant": optionId(at) } : {})}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        {...(open ? { "data-escape-to-popup": "true" } : {})}
        autoComplete="off"
        spellCheck={false}
        icon={<Search aria-hidden="true" />}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onFocus={(event) => {
          /* Selected, so typing replaces the chosen name rather than extending
             it. For a keyboard arrival; a mouse press puts the caret down on
             release and undoes this, which is what `onClick` is for. */
          if (typing === null) event.currentTarget.select();
        }}
        onClick={(event) => {
          setOpen(true);
          if (typing === null) event.currentTarget.select();
        }}
        onChange={(event) => {
          setTyping(event.target.value);
          setOpen(true);
          setActive(0);
          onQueryChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div
          className={cn(
            "mt-1 overflow-hidden rounded-lg",
            "border border-line bg-surface shadow-sm",
          )}
          /* Keeps focus in the box when a row is pressed with a mouse. */
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            aria-busy={pending}
            className={cn(
              "max-h-64 overflow-y-auto py-1 transition-opacity duration-150",
              options.length === 0 && "hidden",
              pending && "opacity-60",
            )}
          >
            {options.map((option, index) => (
              <li key={option.value} role="none">
                <button
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={option.value === selected?.value}
                  aria-disabled={option.disabled ?? false}
                  tabIndex={-1}
                  onClick={() => choose(option)}
                  onMouseMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left",
                    "text-body-sm text-ink",
                    index === at && "bg-sunken",
                    option.disabled && "cursor-not-allowed text-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-meta text-muted">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {failed ? (
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2 text-body-sm text-muted",
                rule,
              )}
            >
              <span>The search did not work.</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-11 shrink-0 rounded-md px-2 font-medium text-accent-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                >
                  Try again
                </button>
              )}
            </div>
          ) : pending ? (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-3 text-body-sm text-muted",
                rule,
              )}
            >
              <Spinner size="sm" label="Searching" />
              <span aria-hidden="true">Searching…</span>
            </div>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-body-sm text-muted">
              {typed
                ? `Nobody matches “${typed}”.`
                : "Nobody to choose from yet."}
            </p>
          ) : more ? (
            <p className={cn("px-3 py-2.5 text-meta text-muted", rule)}>
              Keep typing to narrow the list.
            </p>
          ) : null}
        </div>
      )}

      {/* Said politely, and only once there is an answer, so a screen-reader
          user is not told "searching" on every letter. */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
