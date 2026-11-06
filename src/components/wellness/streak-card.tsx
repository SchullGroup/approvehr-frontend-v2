import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Streak, WeekDot } from "@/lib/wellness/streak";
import { WellnessArt } from "./art";

/**
 * Your streak: a flame, the day count and the week as seven dots.
 *
 * ## Yours alone, and never a debt
 *
 * A streak is derived from the person's own log and shown only to them: there
 * is no board of streaks, no share button and no comparison with anybody. The
 * words encourage and never threaten. A run that has ended is a run you had; the
 * card says a new one can start today, and nothing about what was lost. This is
 * a health-adjacent feature, not a loyalty scheme.
 *
 * The week's dots are a calendar week, Monday to Sunday. A day after today is
 * drawn as not yet, which is not the same as missed.
 */

export function WeekDots({
  dots,
  className,
}: {
  dots: readonly WeekDot[];
  className?: string;
}) {
  return (
    <ol
      aria-label="This week"
      className={cn("flex items-end justify-between gap-1.5", className)}
    >
      {dots.map((dot) => (
        <li key={dot.day} className="flex flex-1 flex-col items-center gap-1.5">
          <span aria-hidden="true" className="text-meta text-muted">
            {dot.initial}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              dot.logged
                ? "bg-well-green text-well-ink"
                : dot.upcoming
                  ? "border border-dashed border-line-strong"
                  : "bg-sunken",
              dot.isToday &&
                "ring-2 ring-well-peri-text ring-offset-2 ring-offset-surface",
            )}
          >
            {dot.logged && <Check className="size-4" strokeWidth={3} />}
          </span>
          <span className="sr-only">
            {dot.name}
            {dot.isToday ? " (today)" : ""}:{" "}
            {dot.logged
              ? "you logged something"
              : dot.upcoming
                ? "not yet"
                : "nothing logged"}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function StreakCard({
  streak,
  last,
  dots,
  lastRunText,
  className,
}: {
  streak: Streak;
  /** The run before, when there is no current one. */
  last: { days: number } | null;
  dots: readonly WeekDot[];
  /** When the last run ended, worded: `3 days ago`. */
  lastRunText?: string;
  className?: string;
}) {
  const running = streak.days > 0;
  const mood = streak.days >= 3 ? "cheering" : running ? "happy" : "sleepy";
  const count = streak.capped ? `${String(streak.days)}+` : String(streak.days);

  const line = running
    ? streak.includesToday
      ? "You have logged today. Nicely done."
      : "Log something today and the run grows by a day."
    : last
      ? `Your last run was ${String(last.days)} ${last.days === 1 ? "day" : "days"}${lastRunText ? `, ending ${lastRunText}` : ""}. A new one can start today.`
      : "Log something and your first run starts today.";

  return (
    <section
      aria-label="Your streak"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <WellnessArt
          name={streak.days >= 3 ? "avocado" : "flame"}
          mood={mood}
          size={88}
        />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="tabular text-h1 text-ink">
              {running ? count : "Today"}
            </span>
            <span className="text-body-md text-body">
              {running
                ? streak.days === 1
                  ? "day in a row"
                  : "days in a row"
                : "starts a new run"}
            </span>
          </p>
          <p className="mt-1 text-body-sm text-muted">{line}</p>
        </div>
      </div>
      <WeekDots dots={dots} />
      <p className="text-meta text-muted">
        Only you can see this. A day counts when you log water or steps.
      </p>
    </section>
  );
}
