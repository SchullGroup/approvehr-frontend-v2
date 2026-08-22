"use client";

import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { useMoneyPrivacy } from "@/lib/store/money-privacy";

/**
 * The eye button that hides every money figure on screen.
 *
 * Drop it into a table or card header wherever money appears. Every instance
 * drives **one** shared preference, so a directory of two hundred salaries goes
 * private in a single click rather than two hundred — and there is no row
 * somebody forgot. See `lib/store/money-privacy.ts`.
 *
 * It hides; it does not protect. What decides whether somebody may *know* a
 * salary is `VIEW_SALARIES` on the server, which does not send the number at
 * all. The label says "Hide amounts" and never anything about access, so this is
 * not mistaken for a permission.
 */
export function MoneyPrivacyToggle({
  className,
  /** Shows the words beside the icon. Off in a dense table header. */
  labelled = false,
}: {
  className?: string;
  labelled?: boolean;
}) {
  const { hidden, toggle } = useMoneyPrivacy();
  const Icon = hidden ? EyeOff : Eye;
  const label = hidden ? "Show amounts" : "Hide amounts";

  return (
    <button
      type="button"
      onClick={toggle}
      /* The pressed state is the honest ARIA for a toggle, and it is what a
         screen reader announces instead of the reader having to infer it from
         which of two icons is showing. */
      aria-pressed={hidden}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-meta text-muted",
        "transition-colors hover:bg-canvas hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {labelled ? label : <span className="sr-only">{label}</span>}
    </button>
  );
}
