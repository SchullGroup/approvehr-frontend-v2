import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PeepName } from "@/lib/peeps";
import { Illustration } from "./illustration";

/* Empty, loading and pending states. */

/**
 * What an empty screen is saying, which decides the Open Peeps figure drawn above the words.
 *
 * One pose per mood, and the same pose wherever the mood is used, so a figure comes to mean something:
 *
 * | mood        | figure         | the words say                                                        |
 * | ----------- | -------------- | -------------------------------------------------------------------- |
 * | `nothing`   | `shrug`        | nothing here, and nothing to do about it (the default without action) |
 * | `start`     | `welcome`      | nothing yet, and here is how to add the first (the default with one)  |
 * | `caught-up` | `coffee-break` | you have dealt with everything that was waiting on you                |
 * | `all-clear` | `hand-on-hip`  | nothing is wrong, missing, late or flagged                            |
 * | `waiting`   | `on-phone`     | it will appear once somebody else has done something                  |
 * | `documents` | `paper-b`      | forms, claims, policies and records                                   |
 * | `search`    | `arms-crossed` | the search or the filters matched nothing                             |
 *
 * `docs/illustrations.md` says which screens get a figure and which never do.
 */
export type EmptyMood =
  | "nothing"
  | "start"
  | "caught-up"
  | "all-clear"
  | "waiting"
  | "documents"
  | "search";

export const MOOD_FIGURE: Record<EmptyMood, PeepName> = {
  nothing: "shrug",
  start: "welcome",
  "caught-up": "coffee-break",
  "all-clear": "hand-on-hip",
  waiting: "on-phone",
  documents: "paper-b",
  search: "arms-crossed",
};

/** Drawn height of the figure, in pixels: quiet, not a banner. The compact kind is for an area that asked. */
const FIGURE_HEIGHT = { full: 136, compact: 104 } as const;

/**
 * An empty list, tab or screen: a few plain words, and a way onward when there is one.
 *
 * ## What is drawn above the words
 *
 * - **A full-size state gets a figure** (`mood`, or `start` when it has an `action` and `nothing` when it has not).
 * - **A `compact` one keeps its small icon**: it sits in a card, a drawer or a table cell, which is no place
 *   for a person. Pass `mood` to a compact state only when its area really is the screen's own.
 * - **`plain` keeps the icon** on a full-size one. That is for the states a person must never smile at: no
 *   permission, an error, a record that is not there, a module that is switched off or needs the API, and a
 *   section of a record page that is only one of several (`tests/empty-state-call-sites.test.ts` fails when one of
 *   the first kind is left without it).
 * - **`art` wins over all of it**: Wellness's own mascots, or a figure picked by hand. `art={null}` is `plain`.
 *
 * A figure is decorative: it is hidden from assistive tech, and the title and description say everything.
 */
export function EmptyState({
  icon,
  art,
  mood,
  plain = false,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  /**
   * A drawing in place of the grey icon circle, at the size it should be drawn (Wellness's mascots). Beats
   * `mood`, `plain` and the default; `null` means no drawing at all.
   */
  art?: React.ReactNode;
  /** Which figure to draw. See `EmptyMood`. Left out, it follows `action`. */
  mood?: EmptyMood;
  /**
   * Keep the icon circle and draw no figure. For permission, error, not-found, "switched off" and
   * "needs the API" states, and for a state that is one small section of a page.
   */
  plain?: boolean;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const drawing =
    art !== undefined ? (
      art
    ) : plain || (compact && mood === undefined) ? null : (
      <Illustration
        name={MOOD_FIGURE[mood ?? (action ? "start" : "nothing")]}
        height={compact ? FIGURE_HEIGHT.compact : FIGURE_HEIGHT.full}
      />
    );
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-5 py-10" : "px-5 py-16",
        className,
      )}
    >
      {drawing && (
        <div aria-hidden="true" className="mb-3">
          {drawing}
        </div>
      )}
      {!drawing && icon && (
        <span
          aria-hidden="true"
          className="mb-5 flex size-16 items-center justify-center rounded-full bg-sunken text-faint [&>svg]:size-7"
        >
          {icon}
        </span>
      )}
      <h3 className="font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-body-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-sm",
        "bg-[linear-gradient(90deg,var(--color-sunken)_25%,var(--color-line)_50%,var(--color-sunken)_75%)]",
        className,
      )}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const sizes = { sm: "size-4", md: "size-5", lg: "size-7" } as const;
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Loader2
        aria-hidden="true"
        className={cn(
          "animate-spin text-accent-text motion-reduce:animate-none",
          sizes[size],
        )}
      />
      <span className="sr-only-focusable">{label}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Shown while an AI surface is working. The label is specific to the task so
 * the wait is legible rather than a generic spinner.
 */
export function ThinkingState({
  label,
  detail,
  className,
}: {
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3.5",
        className,
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex size-5 rounded-full bg-accent/30 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
      </span>
      <span className="min-w-0">
        <span className="block text-body-sm font-medium text-ink">{label}</span>
        {detail && <span className="block text-meta text-body">{detail}</span>}
      </span>
    </div>
  );
}
