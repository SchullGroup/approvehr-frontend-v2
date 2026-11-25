"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useIsClient } from "@/hooks/use-is-client";

/**
 * One question to a screen, full width, in large type.
 *
 * The shell for the setup wizard and the new-period wizard: a progress bar on
 * top, the question in the middle, Back and Continue underneath. It knows
 * nothing about what is asked. Enter continues, Escape closes, and focus moves
 * to the question each time it changes so a keyboard never has to hunt for it.
 *
 * The page scrolls and the question is centred with `m-auto`, not
 * `justify-center`: a long step on a phone (a target has five fields) would
 * otherwise be cut off at the top, where centring pushes what does not fit.
 */
export function WizardShell({
  open,
  onClose,
  step,
  total,
  title,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  canNext = true,
  busy = false,
  error,
  hideNext = false,
  extra,
  links,
  done,
}: {
  open: boolean;
  onClose: () => void;
  /** Zero-based. */
  step: number;
  total: number;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  canNext?: boolean;
  busy?: boolean;
  error?: string | null;
  /** The screen answers itself (a pair of large choices) and moves on when one is chosen. */
  hideNext?: boolean;
  /** A second way on from the last screen, beside the main one ("Save as a draft"). */
  extra?: React.ReactNode;
  /**
   * Further actions as quiet text links below the buttons (`WizardLink`).
   * A step has two buttons at most; anything more is a link, never a third
   * button (owner, 24 Nov 2026).
   */
  links?: React.ReactNode;
  /**
   * What happened, in place of the questions, once the last one is answered.
   * The bar shows the whole way done and the X still closes; there is no other
   * way out to draw.
   */
  done?: React.ReactNode;
}) {
  const isClient = useIsClient();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open && !done) heading.current?.focus();
  }, [open, step, done]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!isClient || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas"
    >
      <div className="sticky top-0 z-10 flex items-center gap-4 bg-canvas px-4 py-3 sm:px-8">
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={done ? total : step + 1}
          className="h-1 flex-1 overflow-hidden rounded-full bg-sunken"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${String(((done ? total : step + 1) / total) * 100)}%`,
            }}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {done ? (
        <div className="m-auto flex w-full max-w-2xl flex-col px-4 py-8 sm:px-8">
          {done}
        </div>
      ) : (
        <form
          className="m-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (canNext && !busy && onNext) onNext();
          }}
        >
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-h2 font-semibold text-ink outline-none"
          >
            {title}
          </h1>
          <div className="flex flex-col gap-4">{children}</div>
          {error && (
            <p role="alert" className="text-body-sm text-danger-text">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {onBack && step > 0 && (
              <Button type="button" variant="ghost" onClick={onBack}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back
              </Button>
            )}
            {!hideNext && (
              <Button
                type="submit"
                variant="accent"
                disabled={!canNext}
                loading={busy}
              >
                {nextLabel}
              </Button>
            )}
            {extra}
          </div>
          {links && (
            <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
              {links}
            </div>
          )}
        </form>
      )}
    </div>,
    document.body,
  );
}

/** A large tappable answer, for yes/no and pick-one screens. */
export function BigChoice({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "flex min-h-16 flex-1 items-center justify-center rounded-xl border px-6 py-4 text-h4 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
        (selected
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-line bg-surface text-ink hover:border-accent")
      }
    >
      {children}
    </button>
  );
}

/** A quiet text link-style action under a step's two buttons. */
export function WizardLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? false}
      className="cursor-pointer text-body-sm text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
