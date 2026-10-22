"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";

/**
 * One overflow menu for the actions a row or a header carries.
 *
 * ## Why this is local
 *
 * The audit (section 9, requisition screen) counted 85 tap targets under 44px on
 * a phone, almost all of them the same four things repeated per row: an icon
 * button each for move up, move down, edit and remove, plus underlined links. A
 * shared row-actions menu is being built for the whole app by the foundation
 * track; this screen cannot wait for it and may not edit `components/ui`, so this
 * is a small local version with the same job. Swap the import when that lands: the
 * item shape below (a label, an action or a link, a danger tone, a reason it is
 * off) is the part worth keeping.
 *
 * ## What it does and does not do
 *
 * - **A trigger and a list of real controls.** Buttons for acts, anchors for
 *   places, so a link to a page can still be opened in a new tab.
 * - **44px on a phone.** The trigger and every row are `min-h-11` below the `sm`
 *   breakpoint, by viewport width rather than by pointer type, because a pointer
 *   query cannot be tested and a viewport can.
 * - **A refused action is still listed**, greyed, with the reason under it. Hiding
 *   "Remove" because the stage is occupied leaves somebody wondering where it went;
 *   saying why is the same rule the old icon buttons followed in their `title`.
 * - **Keyboard**: Enter, Space or ArrowDown on the trigger opens it; arrows, Home
 *   and End move; Escape closes and returns focus; Tab closes and moves on.
 * - **It closes before it acts.** An item that opens a dialog gets the dialog with
 *   no menu left underneath it, and focus is handed back to the trigger first so
 *   the dialog's own focus restore lands somewhere real.
 * - **No animation**, so there is nothing for reduced motion to switch off.
 */

export type RowMenuItem = {
  label: string;
  icon?: React.ReactNode;
  /** An act. Ignored when the item is `disabled`. */
  onSelect?: () => void;
  /** A place. `external` renders a plain anchor (mailto, tel, a new tab). */
  href?: string;
  external?: boolean;
  tone?: "danger";
  disabled?: boolean;
  /** One line under the label: why it is off, or what it will do. */
  hint?: string;
};

export type RowMenuEntry = RowMenuItem | "separator";

const ROW =
  "flex w-full min-h-11 items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-body-sm " +
  "sm:min-h-9 sm:py-1.5 " +
  "focus:outline-none focus-visible:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text";

export function RowMenu({
  label,
  items,
  className,
  triggerClassName,
  disabled = false,
}: {
  /** The trigger's accessible name: say whose actions these are. */
  label: string;
  items: readonly RowMenuEntry[];
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Opened from the keyboard: the first item takes focus. Pointer: the panel does. */
  const fromKeyboard = useRef(false);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  /* Placed by hand once it has a size. The trigger can sit anywhere on a wrapped
     header row, so a panel right-aligned to it can run off the left of a phone;
     this clamps it into the viewport and flips it above when there is no room
     below. Written to the element rather than held in state: a position is not
     something to render twice for. */
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const wrap = wrapRef.current;
    if (!panel || !wrap) return;
    const anchor = wrap.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gutter = 8;
    const left = Math.min(
      Math.max(anchor.right - width, gutter),
      Math.max(window.innerWidth - width - gutter, gutter),
    );
    const flip =
      anchor.bottom + height + gutter > window.innerHeight &&
      anchor.top - height - gutter > 0;
    panel.style.left = `${String(left - anchor.left)}px`;
    panel.style.top = flip
      ? `${String(-(height + 4))}px`
      : `${String(anchor.height + 4)}px`;
    panel.style.visibility = "visible";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[role="menuitem"]');
    if (fromKeyboard.current && first) first.focus();
    else panel?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    /* Closed when the width changes (a rotation) and not otherwise. The panel is
       positioned inside the page, so it scrolls with it and a scroll cannot
       strand it; closing on scroll is what made a menu that had to be scrolled
       to vanish under a thumb. The height changes whenever a phone's address
       bar slides away, so a resize that kept the width is not an event. */
    const width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== width) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const enabledItems = () =>
    Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const nodes = enabledItems();
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        nodes[at < 0 ? 0 : (at + 1) % nodes.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        nodes[at <= 0 ? nodes.length - 1 : at - 1]?.focus();
        break;
      case "Home":
        event.preventDefault();
        nodes[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        nodes[nodes.length - 1]?.focus();
        break;
      default:
        break;
    }
  };

  const choose = (item: RowMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    /* Before the act, so a dialog it opens records the trigger as the thing to
       give focus back to rather than a menu row that no longer exists. */
    triggerRef.current?.focus();
    item.onSelect?.();
  };

  return (
    <div ref={wrapRef} className={cn("relative inline-flex", className)}>
      {/* `IconButton` takes no ref and the trigger needs one to give focus back,
          so this is the `Button` it wraps, dressed the same. */}
      <Button
        ref={triggerRef}
        aria-label={label}
        title={label}
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-menu` : undefined}
        className={cn("size-8 px-0 max-sm:size-11", triggerClassName)}
        onClick={(event) => {
          fromKeyboard.current = event.detail === 0;
          setOpen((was) => !was);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            fromKeyboard.current = true;
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>

      {open && (
        <div
          ref={panelRef}
          id={`${baseId}-menu`}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          style={{ visibility: "hidden" }}
          className={cn(
            "absolute z-50 w-max min-w-52 max-w-[calc(100vw-1rem)] rounded-lg",
            "border border-line bg-surface p-1 shadow-lg focus:outline-none",
          )}
        >
          {items.map((entry, index) => {
            if (entry === "separator") {
              return (
                <div
                  key={`sep-${String(index)}`}
                  role="separator"
                  className="my-1 h-px bg-line"
                />
              );
            }
            const tone =
              entry.tone === "danger"
                ? "text-danger-text hover:bg-danger-soft"
                : "text-ink hover:bg-sunken";
            const content = (
              <>
                {entry.icon && (
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted [&>svg]:size-4"
                  >
                    {entry.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block">{entry.label}</span>
                  {entry.hint && (
                    <span className="block text-meta font-normal text-muted">
                      {entry.hint}
                    </span>
                  )}
                </span>
              </>
            );
            const common = cn(
              ROW,
              tone,
              entry.disabled &&
                "cursor-not-allowed opacity-60 hover:bg-transparent",
            );

            if (entry.href && !entry.disabled) {
              return entry.external ? (
                <a
                  key={entry.label}
                  role="menuitem"
                  href={entry.href}
                  className={common}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={entry.label}
                  role="menuitem"
                  href={entry.href}
                  className={common}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                aria-disabled={entry.disabled ? true : undefined}
                className={common}
                onClick={() => choose(entry)}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
