"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useIsClient } from "@/hooks/use-is-client";
import { Button, IconButton } from "./button";

/*
 * Modal and Drawer share the same overlay behaviour: focus trap, Escape to
 * close, focus restored on unmount, scroll lock, and a labelled dialog role.
 */

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  /** Hides the close control. Use for flows that must be completed. */
  dismissible = true,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  footer?: React.ReactNode;
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const isClient = useIsClient();
  const ref = useFocusTrap<HTMLDivElement>(open, dismissible ? onClose : undefined);
  const id = useId();

  if (!isClient || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex w-full flex-col bg-surface shadow-xl animate-scale-in",
          "max-h-[92dvh] sm:max-h-[88dvh]",
          "rounded-t-xl sm:rounded-xl",
          SIZES[size],
          "sm:mx-5",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-h4 text-ink">
              {title}
            </h2>
            {description && (
              <p
                id={`${id}-desc`}
                className="mt-1 text-body-sm leading-relaxed text-muted"
              >
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label="Close dialog" size="sm" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-line bg-canvas px-5 py-4 sm:px-6 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */

export type DrawerSize = "sm" | "md" | "lg" | "xl";

/*
 * A narrower scale than `ModalSize`, deliberately, and the two are not
 * interchangeable: a modal is centred and owns the screen, so it can afford to
 * be wide, whereas a drawer sits beside the page it was opened from and stays
 * readable only while the page behind it is still legible as context. The
 * drawer scale therefore tops out roughly where the modal scale is halfway.
 *
 *   sm   a decision: a handful of facts and the buttons that act on them
 *   md   a record: a few titled sections
 *   lg   a list of people, or anything with rows
 *   xl   an editor, a thread, a document
 *
 * Every step is `sm:` prefixed, so below 640px a drawer is always a full-width
 * sheet rather than a column squeezed against one edge.
 */
const DRAWER_SIZES: Record<DrawerSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
};

/**
 * A side panel.
 *
 * ## Height follows the content
 *
 * This used to be `inset-y-0` — pinned to the top and bottom of the viewport,
 * whatever it held. With a footer that meant the buttons were pinned to the
 * bottom of the *screen* rather than to the end of the thing being decided, and
 * a short panel put an inch of empty white between the two. On the leave
 * approval panel the gap between the request and the Approve button was larger
 * than the request itself.
 *
 * So the panel is sized by its content and capped at the viewport, exactly as
 * `Modal` already was. The footer is an ordinary flex sibling: with short
 * content it sits directly under it, and once the content is tall enough to hit
 * the cap the body becomes the scroller and the footer comes to rest on the
 * bottom edge. No measurement, no observer, and one code path for both.
 *
 * Note the body has no `flex-1`. Growing to fill is what produced the void; the
 * body only ever needs to *shrink*, which `overflow-y-auto` plus `min-h-0`
 * allows.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  size = "md",
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "right" | "left";
  size?: DrawerSize;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const isClient = useIsClient();
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const id = useId();

  if (!isClient || !open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start",
        side === "right" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex w-full flex-col bg-surface shadow-xl",
          "max-h-dvh sm:m-4 sm:max-h-[calc(100dvh-2rem)]",
          /* Mirrors Modal, which rounds the edge it is not flush against.
             Clipped, because a panel with no footer ends on the scroller and
             scrolled text would otherwise paint into the rounded corners. */
          "overflow-hidden rounded-b-xl sm:rounded-xl",
          DRAWER_SIZES[size],
          side === "right"
            ? "animate-slide-from-right"
            : "animate-slide-from-left",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-h4 text-ink">
              {title}
            </h2>
            {description && (
              <p
                id={`${id}-desc`}
                className="mt-1 text-body-sm leading-relaxed text-muted"
              >
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close panel" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-line bg-canvas px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A titled block inside a Drawer.
 *
 * The heading token was copied by hand into twenty-odd screens, and panels had
 * started to drift — some sections led with a `<p>`, which puts a heading in the
 * outline of no document and gives a screen reader nothing to jump between.
 * One component, one token, one gap under the title.
 */
export function DrawerSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  /** A control that belongs to this section rather than to the panel. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-meta font-semibold tracking-wide text-muted">
          {title}
        </h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** Destructive confirmation. Always states the consequence in the body. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-10 rounded-md px-4 text-body-sm font-medium text-white disabled:opacity-50",
              tone === "danger"
                ? "bg-danger-text hover:brightness-110"
                : "bg-ink hover:bg-ink-soft",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-body-sm leading-relaxed text-body">{body}</div>
    </Modal>
  );
}
