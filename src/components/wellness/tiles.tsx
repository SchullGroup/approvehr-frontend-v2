import { cn } from "@/lib/cn";

/**
 * Small friendly cards: a stat tile and the mascot promo card.
 *
 * `Stat` in the shared library is a quiet figure for dense HR screens. These are
 * the warmer versions Wellness uses where a number is the point: a wash of one
 * accent hue, a round icon, the figure large.
 */

export type WellTone = "green" | "peri" | "pink" | "sun";

export const TONE_WASH: Record<WellTone, string> = {
  green: "bg-well-green-soft",
  peri: "bg-well-peri-soft",
  pink: "bg-well-pink-soft",
  sun: "bg-well-sun-soft",
};

export const TONE_FILL: Record<WellTone, string> = {
  green: "bg-well-green",
  peri: "bg-well-peri",
  pink: "bg-well-pink",
  sun: "bg-well-sun",
};

export const TONE_TEXT: Record<WellTone, string> = {
  green: "text-well-green-text",
  peri: "text-well-peri-text",
  pink: "text-well-pink-text",
  sun: "text-well-sun-text",
};

export function StatTile({
  icon,
  value,
  label,
  hint,
  tone = "peri",
  compact = false,
  className,
}: {
  icon: React.ReactNode;
  /** The figure, already worded. Absent is `Nothing yet`, never `0`. */
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: WellTone;
  /** Smaller figure and padding, for three across on a phone. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-2xl",
        compact ? "gap-2 p-3" : "gap-2 p-3 sm:gap-3 sm:p-4",
        TONE_WASH[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-well-ink [&>svg]:size-[18px]",
          TONE_FILL[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "tabular text-ink [overflow-wrap:anywhere]",
            compact ? "text-h4" : "text-h4 sm:text-h3",
          )}
        >
          {value}
        </p>
        <p className="text-body-sm text-body">{label}</p>
        {hint && <p className="mt-0.5 text-meta text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function MascotPromoCard({
  title,
  text,
  art,
  action,
  tone = "pink",
  className,
}: {
  title: string;
  text?: React.ReactNode;
  /** A `WellnessArt`, sized by the caller. Decorative. */
  art: React.ReactNode;
  action?: React.ReactNode;
  tone?: WellTone;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-5",
        TONE_WASH[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-h4 text-ink">{title}</h3>
        {text && <p className="mt-1 text-body-sm text-body">{text}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div aria-hidden="true" className="-mb-3 shrink-0">
        {art}
      </div>
    </section>
  );
}
