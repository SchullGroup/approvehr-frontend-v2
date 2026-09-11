"use client";

import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

/** The panel's own width — `w-64` below, kept as a number so the placement
    check can do the same arithmetic the browser is about to. */
const TOOLTIP_PANEL_WIDTH = 256;

/** Clear of the true screen edge on either side, so the panel never lands
    flush against it. */
const TOOLTIP_SAFE_MARGIN = 16;

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
 *
 * ## Which side it opens on is measured, not fixed
 *
 * This used to always anchor its own left edge to the icon's, on the
 * reasoning that "a label's icon is never the last thing in a line running
 * off the right of its container" — true of a full-width page, and false of
 * a field inside a narrow `size="sm"` modal, where an icon can sit close
 * enough to the dialog's own right edge that a fixed-rightward 256px panel
 * has nowhere to grow into.
 *
 * That was not a cosmetic miss: on a phone, the panel's own right edge
 * landing past the true viewport width is genuine overflowing content, and
 * this app's mobile layout responds to genuine overflow by widening the
 * whole page's layout viewport to fit it — which then re-resolves every
 * percentage-sized box on the page, including an unrelated `size="sm"`
 * `Modal` sitting at `width:100%`, against that wider viewport. The dialog
 * measurably grew from 375px to its 448px cap while the tooltip was open,
 * on a page with nothing else acting on it — traced to exactly this.
 *
 * `offset` is a pixel `left` value, in the panel's own positioning space
 * (relative to the trigger's wrapper span), rather than a plain `left-0` /
 * `right-0` choice. A binary side flip is not enough: a trigger sitting
 * anywhere near the *middle* of a narrow viewport has room for the panel on
 * neither pure side — growing right overflows the right edge, growing left
 * overflows the left just as the original bug did. `offset` instead starts
 * from "grow rightward from the icon" (the original, still-correct default
 * for most triggers) and is clamped so the panel's own edges never cross
 * `TOOLTIP_SAFE_MARGIN` in from the true screen edges, on either side —
 * correct for a trigger anywhere, not only the two ends.
 *
 * ## Measured once at mount, in a layout effect — not on hover or focus
 *
 * The first version measured when the pointer entered or the trigger gained
 * focus, in a plain event handler. That reopened the exact bug it was
 * fixing, intermittently: `group-focus-within` is a CSS pseudo-class, so the
 * browser can make the panel visible in the *same* paint the focus event
 * fires in, while the event handler's `setState` is a React update that is
 * not guaranteed to land before that paint. On a freshly mounted field the
 * race was frequently lost — the panel painted once at its default offset,
 * wide enough to overflow, and the viewport had already widened to fit it
 * by the time React caught up and corrected it. `useLayoutEffect` runs
 * synchronously after the DOM commits and before the browser paints, so the
 * correct offset is already settled — with the panel still `hidden`, since
 * nothing has been hovered or focused yet — long before a user could reach
 * it. There is nothing left to race.
 */
function InfoTooltip({ id, text }: { id: string; text: string }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    /* Where the panel's left edge would land, viewport-relative, if it grew
       rightward from the trigger as it always used to — then pulled back
       just far enough that neither of its own edges crosses the safe
       margin, whichever edge that turns out to be. */
    const desired = wrapperRect.left;
    const clamped = Math.min(
      Math.max(desired, TOOLTIP_SAFE_MARGIN),
      window.innerWidth - TOOLTIP_PANEL_WIDTH - TOOLTIP_SAFE_MARGIN,
    );
    /* Back into the panel's own coordinate space: `position: absolute`
       resolves `left` against `wrapperRef`, not the viewport. */
    setOffset(clamped - wrapperRect.left);
  }, []);

  return (
    <span ref={wrapperRef} className="group relative inline-flex">
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
        style={{ left: `${offset}px` }}
        className={cn(
          /* `hidden`, not `invisible`: a `visibility:hidden` panel still
             occupies its absolutely-positioned box, and a 256px-wide one
             anchored near the right end of a field's label row pushed the
             whole row's (and its ancestors') scrollWidth out with it — on a
             narrow card this read as horizontal overflow with nothing
             visible causing it. `display:none` removes it from layout
             entirely until it is actually shown. */
          "hidden absolute bottom-full z-50 mb-2 w-64",
          "rounded-md border border-line bg-surface p-2.5 text-body-sm leading-relaxed text-body shadow-lg",
          "opacity-0 transition-opacity duration-100",
          "group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100",
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
