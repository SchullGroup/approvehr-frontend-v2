"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useIsClient } from "@/hooks/use-is-client";
import { IconButton } from "./button";

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

export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  width = "max-w-lg",
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "right" | "left";
  width?: string;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const isClient = useIsClient();
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const id = useId();

  if (!isClient || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
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
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 flex w-full flex-col bg-surface shadow-xl",
          side === "right"
            ? "right-0 animate-[enrich-rise_0.25s_var(--ease-out-soft)_both]"
            : "left-0 animate-[enrich-rise_0.25s_var(--ease-out-soft)_both]",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-h4 text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-body-sm text-muted">{description}</p>
            )}
          </div>
          <IconButton label="Close panel" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-line bg-canvas px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
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
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-control-line bg-surface px-4 text-body-sm font-medium text-ink hover:bg-canvas"
          >
            Cancel
          </button>
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
