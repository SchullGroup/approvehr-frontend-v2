"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

/**
 * A dropdown that is ours rather than the operating system's.
 *
 * ## Why not `<select>`
 *
 * A native `<select>` is the most accessible control on the web and it is free.
 * Replacing one is a cost, not a win, and it is worth being honest about what is
 * being given up: the browser's own keyboard handling, its screen-reader
 * semantics, its collision-free positioning, and on a phone the OS picker people
 * already know how to use.
 *
 * Two things make it worth paying anyway:
 *
 * 1. **A `<select>` cannot hold an action.** "Create new department" is not a
 *    value, and an `<option>` that is secretly a button is a trick — it reads as
 *    a choice to a screen reader and it cannot be styled apart from the real
 *    choices. Without somewhere to put that action, adding a department means
 *    abandoning the form, going to Settings, and coming back, which is where
 *    people give up.
 * 2. **On iOS a `<select>` opens a wheel docked to the bottom of the screen**,
 *    a long way from the field it belongs to, with no room for a hint and no way
 *    to show which option is already chosen in context.
 *
 * So this exists, and because it exists it has to earn the accessibility back
 * rather than assume it:
 *
 * - The trigger is `role="combobox"` with `aria-expanded`, `aria-controls` and
 *   `aria-haspopup="listbox"`, so it is announced as a collapsed dropdown.
 * - The list is `role="listbox"`; each row is `role="option"` with
 *   `aria-selected`. The chosen row is announced as chosen, not merely ticked in
 *   a colour.
 * - Focus stays on the trigger (or the filter box) and the active row is pointed
 *   at with `aria-activedescendant`. Moving DOM focus into the list instead is
 *   the common shortcut and it breaks type-ahead and Escape.
 * - Arrow keys, Home, End, Enter, Space, Escape and Tab all behave as the
 *   listbox pattern requires. Escape returns focus to the trigger, because
 *   losing focus to the page body strands a keyboard user.
 * - Rows are 44px tall. WCAG 2.5.5 asks for 44×44 and this product is sold to
 *   people who are frequently over fifty — the same reason the type scale has a
 *   floor. A dense 28px menu row is a miss for a thumb and a squint for an eye.
 * - Typing filters once the list is long enough to need it, and the count is
 *   announced politely so a screen-reader user knows the list shrank.
 *
 * ## What it deliberately does not do
 *
 * No portal, no floating-ui, no virtualisation. The list is absolutely
 * positioned inside a `relative` wrapper and scrolls at 320px. That is wrong
 * inside a container with `overflow: hidden` and right everywhere else in this
 * app, and adding a positioning library for the exception is a poor trade.
 * `MAX_UNFILTERED` keeps the DOM small without virtualising.
 */

export type PickerOption = {
  value: string;
  label: string;
  /** Second line. For an employee, their job title; for a bank, its code. */
  hint?: string;
  disabled?: boolean;
};

export type PickerProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly PickerOption[];
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /**
   * The action pinned to the bottom of the list.
   *
   * Always reachable: it sits outside the scrolling area, so it does not
   * disappear at the end of two hundred departments, and it survives a filter
   * that matches nothing — which is exactly when somebody needs it, because the
   * thing they are looking for does not exist yet.
   */
  onCreate?: { label: string; onSelect: () => void };
  /** Forced on or off. Left unset it appears once the list is worth filtering. */
  searchable?: boolean;
  disabled?: boolean;
  /** Announced with the list when the options are still loading. */
  loading?: boolean;
  className?: string;
  /** Falls back to the surrounding `Field`'s label. */
  "aria-label"?: string;
};

const CONTROL =
  "w-full bg-surface text-ink " +
  "border border-control-line rounded-md " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-ink-soft " +
  "focus:border-accent-text focus:outline-none focus:ring-3 focus:ring-accent/25 " +
  "disabled:bg-sunken disabled:text-muted disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-danger-text aria-[invalid=true]:ring-danger/20";

/** Past this a filter box appears on its own. */
const SEARCH_FROM = 8;

/** Rows rendered before filtering. Keeps the DOM small without virtualising. */
const MAX_UNFILTERED = 300;

export function Picker({
  value,
  onChange,
  options,
  placeholder = "Choose one",
  onCreate,
  searchable,
  disabled = false,
  loading = false,
  className,
  "aria-label": ariaLabel,
}: PickerProps) {
  const field = useFieldControl();
  const baseId = useId();
  const listId = `${baseId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Index into `shown`. -1 means the create row, when there is one. */
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtering = searchable ?? options.length > SEARCH_FROM;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(needle) ||
            (o.hint ?? "").toLowerCase().includes(needle),
        )
      : options;
    return matched.slice(0, MAX_UNFILTERED);
  }, [options, query]);

  const chosen = options.find((o) => o.value === value) ?? null;

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      setQuery("");
      if (refocus) triggerRef.current?.focus();
    },
    [],
  );

  const openList = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    /* Start on whatever is already chosen, so opening a long list does not
       scroll somebody back to the top of it. */
    const at = shown.findIndex((o) => o.value === value);
    setActive(at >= 0 ? at : 0);
  }, [disabled, shown, value]);

  const pick = useCallback(
    (option: PickerOption) => {
      if (option.disabled) return;
      onChange(option.value);
      close();
    },
    [onChange, close],
  );

  const create = useCallback(() => {
    /* Closed before the caller opens whatever it opens: a dialog appearing over
       a still-open menu leaves two things layered and the menu outliving the
       field it belongs to. No refocus — the caller is about to move focus. */
    setOpen(false);
    setQuery("");
    onCreate?.onSelect();
  }, [onCreate]);

  /** The create row is index -1, so it is reachable by keyboard like any row. */
  const lowest = onCreate ? -1 : 0;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        /* Tab commits nothing and closes. Trapping Tab in a dropdown is how a
           keyboard user gets stuck in one. */
        close(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i >= shown.length - 1 ? lowest : i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i <= lowest ? shown.length - 1 : i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(shown.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (active === -1) create();
        else {
          const option = shown[active];
          if (option) pick(option);
        }
        break;
      case " ":
        /* Space types a space in the filter box and picks when there isn't one. */
        if (!filtering) {
          event.preventDefault();
          const option = shown[active];
          if (option) pick(option);
        }
        break;
      default:
        break;
    }
  };

  /* Closing on outside pointerdown rather than on blur: blur fires when focus
     moves to the filter box, which would shut the list as it opened. */
  const onBlurCapture = (event: React.FocusEvent) => {
    if (!open) return;
    const next = event.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    setOpen(false);
    setQuery("");
  };

  const activeId =
    active === -1 ? `${baseId}-create` : shown[active] ? `${baseId}-o${active}` : undefined;

  return (
    <div ref={wrapRef} className={cn("relative", className)} onBlurCapture={onBlurCapture}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        {...(activeId && open ? { "aria-activedescendant": activeId } : {})}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          CONTROL,
          /* 44px, not the 40px of a text input: this is a menu trigger and the
             thing it opens is tapped with a thumb. */
          "flex h-11 w-full items-center gap-2 px-3 text-left text-body-sm",
          !chosen && "text-muted",
        )}
        {...field}
      >
        <span className="min-w-0 flex-1 truncate">
          {chosen ? chosen.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg",
            "border border-line bg-surface shadow-lg",
          )}
        >
          {filtering && (
            <div className="relative border-b border-line p-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                autoFocus
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Type to narrow this down"
                aria-label="Filter the list"
                aria-controls={listId}
                {...(activeId ? { "aria-activedescendant": activeId } : {})}
                className={cn(
                  "h-10 w-full rounded-md border border-control-line bg-surface",
                  "pl-9 pr-3 text-body-sm text-ink placeholder:text-muted",
                  "focus:border-accent-text focus:outline-none focus:ring-3 focus:ring-accent/25",
                )}
              />
            </div>
          )}

          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="max-h-80 overflow-y-auto py-1"
          >
            {loading && (
              <li className="px-3 py-3 text-body-sm text-muted">Loading…</li>
            )}

            {!loading && shown.length === 0 && (
              <li className="px-3 py-3 text-body-sm text-muted">
                {query.trim()
                  ? `Nothing matches "${query.trim()}".`
                  : "Nothing to choose from yet."}
              </li>
            )}

            {shown.map((option, index) => {
              const isChosen = option.value === value;
              return (
                <li key={option.value} role="none">
                  <button
                    id={`${baseId}-o${index}`}
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    aria-disabled={option.disabled ?? false}
                    tabIndex={-1}
                    /* pointerdown, not click: a click fires after blur, and the
                       blur handler has already closed the list by then. */
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pick(option);
                    }}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left",
                      "text-body-sm text-ink",
                      index === active && "bg-sunken",
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
                    {isChosen && (
                      <Check
                        aria-hidden="true"
                        className="size-4 shrink-0 text-accent-text"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {onCreate && (
            /* Outside the scroll area on purpose: it must be there at the bottom
               of two hundred departments, and there when a filter matches
               nothing — which is precisely when it is needed. */
            <div className="border-t border-line">
              <button
                id={`${baseId}-create`}
                type="button"
                tabIndex={-1}
                onPointerDown={(e) => {
                  e.preventDefault();
                  create();
                }}
                onMouseMove={() => setActive(-1)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left",
                  "text-body-sm font-medium text-accent-text",
                  active === -1 && "bg-sunken",
                )}
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                {onCreate.label}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Announced politely so a screen-reader user hears the list shrink as
          they type, which a visual user can simply see. */}
      <span aria-live="polite" className="sr-only">
        {open ? `${shown.length} ${shown.length === 1 ? "option" : "options"}` : ""}
      </span>
    </div>
  );
}
