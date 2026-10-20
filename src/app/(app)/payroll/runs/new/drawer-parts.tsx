"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The few pieces every view of the adjust drawer shares.
 *
 * Kept apart from `adjust-drawer.tsx` so the lines editor can use the same
 * footer without importing the drawer that imports it.
 */

/** 44px on a phone, where a finger is the pointer. */
export const TOUCH = "max-sm:min-h-11";

/**
 * A way back to the payslip, at the top of every form view.
 *
 * Each figure is edited in its own view, and "Cancel" at the bottom is not the
 * only way out of one: the person who opened the wrong figure looks for the
 * arrow first.
 */
export function BackToPayslip({
  onBack,
  disabled,
}: {
  onBack: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onBack}
      className={`-ml-2 mb-4 ${TOUCH}`}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to the payslip
    </Button>
  );
}

/**
 * The footer of a form view: what saving will do on the left, the buttons on the
 * right.
 *
 * Lives inside the drawer's scrolling body, not in the drawer's own `footer`
 * slot, because what it says depends on what has been typed: a footer owned by
 * the drawer would need every form's draft lifted into the drawer to read it.
 * `sticky` keeps it at the bottom edge while a long form scrolls, and the
 * negative margins make it span the body's padding the way the real footer does.
 */
export function FormFooter({
  summary,
  children,
}: {
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas px-5 py-4 sm:-mx-6 sm:px-6">
      <div className="min-w-0 flex-1 text-body-sm text-muted">{summary}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
