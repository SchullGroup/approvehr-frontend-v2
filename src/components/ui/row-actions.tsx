"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * What can be done to one row — or one page header — behind one button.
 *
 * ## Why this exists
 *
 * A row in this product carried its actions as a line of icon-only buttons —
 * Departments had five per row — and an audit of the phone layout counted 38
 * tap targets under 44px on that screen alone, most of them these. Icons with a
 * `title` are a poor way to offer five different acts: the reader has to learn
 * five glyphs, hover (which a phone cannot) to read them, and aim at a 32px
 * square beside four others. The requisition screen counted 85.
 *
 * The rule this makes is: **a row has at most one or two actions worth showing as
 * buttons — the thing people come to do — and everything else is in here.** A
 * destructive act belongs in here too, apart from the commonest ones, so it is
 * never one mis-tap from a neighbour. A page header that carried "Cancel this
 * payroll" in the stepper row, beside the navigation, is the same problem.
 *
 * ## What it does
 *
 * - One 44px trigger on a phone (36px with a pointer), named for what it belongs
 *   to — "More actions for Engineering" — because a screen reader hears twenty
 *   identical "More" buttons otherwise.
 * - A real menu: opens on Enter, Space or the down arrow; arrows, Home and End
 *   move; Escape closes and gives focus back to the trigger; Tab closes it; a
 *   press outside closes it.
 * - **An item is an act or a place.** `onSelect` for an act; `href` for a page,
 *   which renders a real link so it can still be opened in a new tab, and
 *   `external` for a plain anchor (mailto, tel, another origin).
 * - **A refused action is still listed**, dimmed, with `hint` saying why.
 *   Hiding "Remove" because a stage is occupied leaves somebody wondering where
 *   it went; saying so is the rule the icon buttons' `title` was following.
 * - **Closes before it acts**, and hands focus back to the trigger first, so a
 *   dialog the item opens records a real element to return to.
 * - Rendered in a portal and positioned from the trigger, so a table or a card
 *   with `overflow: hidden` cannot clip it; kept inside the viewport, and flipped
 *   above the trigger when there is no room below.
 *
 * ## It follows the page; it does not close on scroll
 *
 * The first version closed on any scroll, so that a menu fixed to the viewport
 * could not be left pointing at a row that had moved. On a phone that made a menu
 * that had to be scrolled to reach vanish under a thumb, and the address bar
 * sliding away fires a resize that did the same. So it is **repositioned** on
 * scroll instead, and closed only when its trigger has left the screen or the
 * *width* changes (a rotation). A height-only resize is not an event.
 *
 * ## What it does not do
 *
 * It does not hide a permission. Hand it only the actions the reader may take;
 * an item the API would refuse is the dead control this product keeps recording.
 * An empty list renders nothing at all, not an empty button. It has no nested
 * menus, no checkable items and no type-ahead — a row with that many choices
 * wants a drawer.
 */

export type RowAction = {
  /** Accepted so a list already keyed by id can be passed unchanged; the label is the key otherwise. */
  key?: string;
  label: string;
  icon?: React.ReactNode;
  /** An act. Ignored when the item is `disabled`. */
  onSelect?: () => void;
  /** A place. Renders a link rather than a button. */
  href?: string;
  /** With `href`: a plain anchor (mailto, tel, another origin) instead of a router link. */
  external?: boolean;
  /** `danger` is for the act that cannot easily be undone, and sits last. */
  tone?: "default" | "danger";
  /** Listed but not offered. Say why in `hint`. */
  disabled?: boolean;
  /** One line under the label: why it is off, or what it will do. */
  hint?: string;
};

export type RowActionItem = RowAction | "separator";

const ITEM =
  "flex w-full min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-left text-body-sm " +
  "sm:min-h-9 sm:py-1.5 focus-visible:outline-none";

/** Focusable means listed and offered. */
const OFFERED = '[role="menuitem"]:not([aria-disabled="true"])';

const GUTTER = 8;

export function RowActions({
  label,
  items,
  className,
  triggerClassName,
  triggerText,
  triggerIcon,
  disabled = false,
}: {
  /** Names the trigger: "More actions for Engineering". */
  label: string;
  items: readonly RowActionItem[];
  className?: string;
  triggerClassName?: string;
  /**
   * A page-level menu has no row to belong to, and a bare ellipsis says
   * nothing about what is in it. With this the trigger is a named button — the
   * header's "Start something" — instead of the row's icon. The accessible name
   * is still `label`; this is only what is drawn.
   */
  triggerText?: string;
  /** With `triggerText`: the glyph before it. */
  triggerIcon?: React.ReactNode;
  /** The whole menu is unavailable; the trigger is shown, dimmed. */
  disabled?: boolean;
}) {
  const isClient = useIsClient();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Opened from a keyboard: the first choice takes focus. */
  const fromKeyboard = useRef(false);

  const actions = items.filter(
    (item): item is RowAction => item !== "separator",
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  /**
   * Placed from the trigger's own rectangle, by writing to the element.
   *
   * Written to the style rather than held in state because it changes on every
   * scroll event and nothing else on the screen cares; and it needs the panel's
   * own size, which only exists once it has been rendered.
   */
  const place = useCallback(() => {
    const panel = menu.current;
    const anchor = trigger.current?.getBoundingClientRect();
    if (!panel || !anchor) return;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.min(
      Math.max(anchor.right - width, GUTTER),
      Math.max(window.innerWidth - width - GUTTER, GUTTER),
    );
    const fitsBelow = anchor.bottom + height + GUTTER <= window.innerHeight;
    const fitsAbove = anchor.top - height - GUTTER >= 0;
    const top =
      fitsBelow || !fitsAbove
        ? Math.min(
            anchor.bottom + 4,
            Math.max(window.innerHeight - height - GUTTER, GUTTER),
          )
        : anchor.top - height - 4;
    panel.style.left = `${String(left)}px`;
    panel.style.top = `${String(top)}px`;
    panel.style.visibility = "visible";
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const panel = menu.current;
    const first = panel?.querySelector<HTMLElement>(OFFERED);
    if (fromKeyboard.current && first) first.focus({ preventScroll: true });
    else panel?.focus({ preventScroll: true });

    const outside = (target: EventTarget | null) =>
      !menu.current?.contains(target as Node) &&
      !trigger.current?.contains(target as Node);
    const onPointer = (event: PointerEvent) => {
      if (outside(event.target)) close(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (outside(event.target)) close(false);
    };

    const width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== width) close(false);
      else place();
    };
    const onScroll = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      /* The row it belongs to has left the screen, so there is nothing for the
         menu to point at. */
      if (!anchor || anchor.bottom < 0 || anchor.top > window.innerHeight) {
        close(false);
        return;
      }
      place();
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", onResize);
    /* Capture, so a scroll in any container — not only the window — is heard. */
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close, place]);

  if (actions.length === 0) return null;

  const move = (to: "next" | "previous" | "first" | "last") => {
    const entries = [
      ...(menu.current?.querySelectorAll<HTMLElement>(OFFERED) ?? []),
    ];
    if (entries.length === 0) return;
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next =
      to === "first"
        ? 0
        : to === "last"
          ? entries.length - 1
          : to === "next"
            ? (at + 1) % entries.length
            : (at <= 0 ? entries.length : at) - 1;
    entries[next]?.focus({ preventScroll: true });
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move("next");
        break;
      case "ArrowUp":
        event.preventDefault();
        move("previous");
        break;
      case "Home":
        event.preventDefault();
        move("first");
        break;
      case "End":
        event.preventDefault();
        move("last");
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        /* Let focus move on, and close behind it. */
        close(false);
        break;
    }
  };

  const choose = (item: RowAction) => {
    if (item.disabled) return;
    /* Before the act, so a dialog it opens records the trigger as the thing to
       give focus back to rather than a menu row that no longer exists. */
    close(true);
    item.onSelect?.();
  };

  return (
    <div className={cn("inline-flex", className)}>
      {/* The `Button` an `IconButton` wraps, dressed the same, so the trigger can
          carry the menu's own aria and size. */}
      <Button
        ref={trigger}
        aria-label={label}
        title={label}
        variant={triggerText ? "secondary" : "ghost"}
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={cn(
          triggerText ? "min-h-11 sm:min-h-9" : "size-11 px-0 sm:size-9",
          triggerClassName,
        )}
        onClick={(event) => {
          fromKeyboard.current = event.detail === 0;
          if (open) close(false);
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            fromKeyboard.current = true;
            setOpen(true);
          }
        }}
      >
        {triggerText ? (
          <>
            {triggerIcon}
            {triggerText}
            <ChevronDown aria-hidden="true" className="size-4" />
          </>
        ) : (
          <MoreHorizontal aria-hidden="true" className="size-4" />
        )}
      </Button>

      {isClient &&
        open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            /* Hidden until `place` has measured it, so it never flashes in the
               corner. */
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
            className="z-50 w-max min-w-52 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-1 shadow-lg focus:outline-none"
          >
            {items.map((item, index) => {
              if (item === "separator") {
                return (
                  <div
                    key={`separator-${String(index)}`}
                    role="separator"
                    className="my-1 h-px bg-line"
                  />
                );
              }
              const tone =
                item.tone === "danger"
                  ? "text-danger-text hover:bg-danger-soft focus-visible:bg-danger-soft"
                  : "text-body hover:bg-canvas hover:text-ink focus-visible:bg-canvas focus-visible:text-ink";
              const common = cn(
                ITEM,
                tone,
                item.disabled &&
                  "cursor-not-allowed opacity-60 hover:bg-transparent",
              );
              const content = (
                <>
                  {item.icon && (
                    <span
                      aria-hidden="true"
                      className="shrink-0 [&>svg]:size-4"
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.hint && (
                      <span className="block text-meta font-normal text-muted">
                        {item.hint}
                      </span>
                    )}
                  </span>
                </>
              );
              const key = item.key ?? item.label;

              if (item.href && !item.disabled) {
                return item.external ? (
                  <a
                    key={key}
                    role="menuitem"
                    tabIndex={-1}
                    href={item.href}
                    className={common}
                    onClick={() => close(false)}
                  >
                    {content}
                  </a>
                ) : (
                  <Link
                    key={key}
                    role="menuitem"
                    tabIndex={-1}
                    href={item.href}
                    className={common}
                    onClick={() => close(false)}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled ? true : undefined}
                  className={common}
                  onClick={() => choose(item)}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
