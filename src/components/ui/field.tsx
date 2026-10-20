"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { placeTooltip, TOOLTIP_MARGIN, type Box } from "@/lib/place-tooltip";

/**
 * What the help panel is doing.
 *
 * `peek` is the pointer resting on the icon or a keyboard having focused it: it
 * goes when the pointer or the focus does. `pinned` is a press or a tap: it
 * stays until something dismisses it. They are different states because they
 * end differently, and a press on an icon that is already being peeked at has
 * to mean "keep it", not "hide what I am looking at".
 */
type Showing = "closed" | "peek" | "pinned";

/** Whether a focus came from a keyboard. Chrome focuses a button when it is
    clicked, and that must not read as somebody having tabbed to it. An engine
    without `:focus-visible` throws on the selector, and gets the old answer:
    any focus shows the panel. */
function focusCameFromKeyboard(node: HTMLElement): boolean {
  try {
    return node.matches(":focus-visible");
  } catch {
    return true;
  }
}

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
 * - A visible panel, `aria-hidden`, which exists for sighted people and is
 *   hidden from assistive tech so the same sentence is not announced twice.
 *
 * ## It opens when it is pressed, because hovering and focusing are not enough
 *
 * This used to be shown by `group-hover` and `group-focus-within` alone, on the
 * reasoning that tapping a button focuses it, "so no separate touch handling
 * was needed". That is true in Chrome on Android and false in Safari, which
 * does not give a button focus when it is pressed — on a Mac or on an iPhone.
 * The one platform that cannot hover either was left with an icon that could
 * not be opened. A press is a `click` in every engine, so a press now sets
 * state.
 *
 * It is peeked at by a mouse or pen resting on the icon, or a keyboard
 * focusing it (`focus-visible`, so a click that happens to focus it does not
 * count), and **pinned** by a press, which keeps it open for somebody reading
 * it with their thumb. A touch pointer never peeks: a finger has no "over",
 * and the compatibility mouse events a browser fires after a tap would show
 * the panel for as long as the finger was down and then hide it again.
 *
 * It is dismissed the ways anyone expects: the icon again, Escape, a press
 * anywhere else, the panel itself, and the field losing focus. An icon
 * scrolled out of its scroller takes its panel with it and brings it back when
 * it scrolls in again. Escape is taken on `window` in the capture phase, which
 * runs before the dialog's own handler on `document` — so the first Escape
 * closes the hint and the second closes the dialog, instead of one keystroke
 * discarding the form somebody was filling in to dismiss a sentence.
 *
 * A press on the panel does not take focus off the icon. It would otherwise:
 * the icon closes the panel when it loses focus, which would unmount it before
 * the click that ends the press, and that click would land on whatever the
 * panel was covering.
 *
 * The target is 26px around a 14px icon, and the negative margin takes the
 * padding back out of the layout so no label row grew. The ring is the house
 * focus ring from `globals.css`: the colour change this used to rely on is not
 * a focus indicator.
 *
 * ## Why the panel is in a portal
 *
 * It was an absolutely positioned child of the icon, and inside a dialog that
 * is cut off by the dialog's scroll area. The first field in a dialog sits a
 * few pixels under the top of that area, the panel opened upward, and 55 of its
 * 71 pixels were hidden — on a laptop as much as on a phone.
 *
 * `position: fixed` alone would not escape it. `Modal` and `Drawer` animate in
 * with a transform that is left on afterwards (`animation-fill-mode: both`),
 * and a transformed element is the containing block for its fixed descendants:
 * the panel would be placed against the dialog and clipped by it all the same.
 * The body has neither problem, and it is where `Modal`, `Drawer`, the toasts
 * and the tour already put themselves. `z-[60]` is the tier `globals.css`
 * reserves for what has to sit above a dialog.
 *
 * ## Which side it opens on is measured, when it opens
 *
 * `placeTooltip` decides and this measures, in a layout effect: after the panel
 * is in the DOM and before the browser paints it, so there is no frame at the
 * wrong place. It writes `top` and `left` straight to the node rather than into
 * state, as `Spotlight` does for the same reason — nothing else reads a
 * measurement, and storing it would be a render per scroll frame.
 *
 * It used to measure once, at mount, because that was the only moment it could
 * do so without racing a CSS `:hover`: the panel could be painted in the same
 * frame the focus event fired in, before React had corrected it, and a panel
 * painted past the right edge made a phone widen its whole layout viewport to
 * fit. Visibility is state now, so there is no race, and the decision is made
 * with the page as it is at that moment — scrolled, with the keyboard up, with
 * the dialog animated into place. Nor can it overflow sideways any more: a
 * fixed panel is part of no scroller's overflow, and it is clamped inside the
 * margin besides.
 *
 * The region it is measured against is the visual viewport where there is one,
 * so with the keyboard up or the page zoomed in, the panel lands where the
 * person is looking and not behind their keyboard.
 */
function InfoTooltip({ id, text }: { id: string; text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [showing, setShowing] = useState<Showing>("closed");
  const close = useCallback(() => setShowing("closed"), []);

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <span id={id} className="sr-only">
        {text}
      </span>
      <button
        type="button"
        aria-label="More about this field"
        onClick={() =>
          setShowing((now) => (now === "pinned" ? "closed" : "pinned"))
        }
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          setShowing((now) => (now === "closed" ? "peek" : now));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          setShowing((now) => (now === "peek" ? "closed" : now));
        }}
        onFocus={(event) => {
          if (!focusCameFromKeyboard(event.currentTarget)) return;
          setShowing((now) => (now === "closed" ? "peek" : now));
        }}
        onBlur={close}
        className="-m-1.5 rounded-full p-1.5 text-muted hover:text-ink focus-visible:text-ink"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
      {showing !== "closed" && (
        <TooltipPanel anchorRef={anchorRef} text={text} onDismiss={close} />
      )}
    </span>
  );
}

function TooltipPanel({
  anchorRef,
  text,
  onDismiss,
}: {
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  text: string;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLSpanElement>(null);

  const place = useCallback(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const viewport = window.visualViewport;
    const bounds: Box = viewport
      ? {
          top: viewport.offsetTop,
          left: viewport.offsetLeft,
          right: viewport.offsetLeft + viewport.width,
          bottom: viewport.offsetTop + viewport.height,
        }
      : {
          top: 0,
          left: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
        };

    /* Read at its natural height and at the width it will have, so what an
       earlier call capped is put back before it is measured again. */
    panel.style.maxHeight = "";
    panel.style.maxWidth = `${Math.max(
      0,
      bounds.right - bounds.left - 2 * TOOLTIP_MARGIN,
    )}px`;
    const placed = placeTooltip({
      anchor: anchor.getBoundingClientRect(),
      panel: { width: panel.offsetWidth, height: panel.offsetHeight },
      bounds,
    });
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    if (placed.maxHeight !== undefined) {
      panel.style.maxHeight = `${placed.maxHeight}px`;
    }
  }, [anchorRef]);

  /* Layout, not effect: the panel is painted where it belongs rather than at
     the corner for one frame and then moved. */
  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const viewport = window.visualViewport;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    /* The panel counts as inside: it is dismissed by its own `onClick`, so a
       press on it is not unmounted from under the click that follows. */
    const dismissOnPressElsewhere = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchor?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onDismiss();
    };

    /* Not the panel's own: a capped panel scrolls, and measuring it again
       would put it back at the top every time it moved. */
    const followOnScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      place();
    };

    window.addEventListener("keydown", dismissOnEscape, true);
    document.addEventListener("pointerdown", dismissOnPressElsewhere, true);
    window.addEventListener("resize", place);
    /* Capture, so a scroll inside a dialog's body is seen and not only a
       scroll of the window. */
    window.addEventListener("scroll", followOnScroll, true);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);

    /* An icon scrolled out of its scroller takes its panel with it. The
       observer accounts for every clipping ancestor, which a rectangle against
       the window does not. */
    let observer: IntersectionObserver | undefined;
    if (anchor && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        ([entry]) => {
          const panel = panelRef.current;
          if (!panel || !entry) return;
          panel.style.visibility =
            entry.intersectionRatio < 0.5 ? "hidden" : "";
        },
        { threshold: [0, 0.5, 1] },
      );
      observer.observe(anchor);
    }

    return () => {
      window.removeEventListener("keydown", dismissOnEscape, true);
      document.removeEventListener(
        "pointerdown",
        dismissOnPressElsewhere,
        true,
      );
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", followOnScroll, true);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [anchorRef, onDismiss, place]);

  return createPortal(
    <span
      ref={panelRef}
      aria-hidden="true"
      role="presentation"
      /* A press on the panel is the first half of a click on it. Left alone it
         takes focus off the icon, the icon closes the panel when it loses
         focus, and the click that ends the press lands on whatever the panel
         was covering. */
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        /* A portal's events bubble through the React tree it was opened from,
           and the field it belongs to may sit inside something clickable. */
        event.stopPropagation();
        onDismiss();
      }}
      className={cn(
        "fixed left-0 top-0 z-[60] block w-64 overflow-y-auto",
        "rounded-md border border-line bg-surface p-2.5 text-body-sm leading-relaxed text-body shadow-lg",
        "animate-[ahr-fade_100ms_ease-out_both]",
      )}
    >
      {text}
    </span>,
    document.body,
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
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            hideLabel && "sr-only-focusable",
          )}
        >
          <label
            htmlFor={inputId}
            /* Only a visible label is allowed to shrink and wrap: a hidden one
               lives in a 1px box, and shrinking it there would wrap it a word
               to a line for nothing. */
            className={cn(
              "text-body-sm font-medium text-ink",
              !hideLabel && "min-w-0",
            )}
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

/**
 * How many columns a `FieldRow` has, and whether a phone gets them.
 *
 * Written out in full rather than assembled from the numbers: Tailwind finds
 * classes by reading the source, and `grid-cols-${n}` is not in it.
 */
const FIELD_ROW_COLUMNS = {
  stack: {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
  },
  pair: {
    2: "grid-cols-2",
    3: "grid-cols-3",
  },
} as const;

/**
 * Fields side by side, built so that neither can push the row off the screen.
 *
 * ## Why this exists rather than a `grid grid-cols-2` at each call site
 *
 * A grid item's automatic minimum width is its content's, and a control's
 * content is whatever the engine says it is. In iPhone Safari a time input in a
 * 161px column rendered 187px wide, so two of them overran a 375px sheet and
 * the second — "Clock out should be", on the attendance correction — could not
 * be reached at all. Every row written by hand has to remember
 * `min-w-0` on every cell, and none of the ones that forgot looked wrong on a
 * laptop. This one does it for the cells, so a row cannot be made wrong by
 * adding a field to it.
 *
 * ## `phone`: one per line, or still two across
 *
 * - `"stack"` (the default) is a single column below `sm` and `cols` columns
 *   from there. Use it for anything a thumb has to read inside: two native date
 *   pickers, two money figures, a select beside a date.
 * - `"pair"` keeps the columns on a phone. Only for short controls that fit at
 *   320px with room to spare — first and last name, two clock times, two small
 *   numbers. Half of a 320px sheet is about 134px, less its padding.
 *
 * Choosing is the point: a row nobody chose for is the row that overflows.
 */
export function FieldRow({
  cols = 2,
  phone = "stack",
  className,
  children,
}: {
  cols?: 2 | 3;
  phone?: "stack" | "pair";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 [&>*]:min-w-0",
        FIELD_ROW_COLUMNS[phone][cols],
        className,
      )}
    >
      {children}
    </div>
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
