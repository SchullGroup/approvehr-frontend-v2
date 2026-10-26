import { cn } from "@/lib/cn";

/*
 * Status is never carried by colour alone. Every Badge renders a text label,
 * and Dot variants pair the colour with that label rather than replacing it.
 */

export type BadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "ink";

/** Exported so a genuinely interactive look-alike (a `<button>`, which this
 *  span-only component cannot become) can share the same colours instead of
 *  re-deriving them — see the applied-filter chip in `filter-bar.tsx`. */
export const TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-body border-line",
  accent: "bg-accent-soft text-accent-text border-accent-line",
  /* Two hues, not five: good and informational are the brand indigo, a thing
     to look at or a problem is ochre. Red is not used for a label. */
  success: "bg-accent-soft text-accent-text border-accent-line",
  warning: "bg-warning-soft text-warning-text border-warning-line",
  danger: "bg-warning-soft text-warning-text border-warning-line",
  info: "bg-accent-soft text-accent-text border-accent-line",
  ink: "bg-fill-strong text-white border-fill-strong",
};

/**
 * A status, written as plain muted text.
 *
 * Not a pill: the owner does not want coloured chips for status, and the only
 * colour left on a row is its buttons. `tone` and `dot` are still accepted so
 * the many call sites keep compiling and keep saying what they mean, but they
 * no longer change how it looks; the label carries the meaning on its own.
 */
export function Badge({
  size = "md",
  icon,
  className,
  children,
  tone: _tone,
  dot: _dot,
  ...props
}: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Kept for existing callers; has no visual effect. */
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  void _tone;
  void _dot;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-muted",
        size === "sm" ? "text-meta" : "text-body-sm",
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 [&>svg]:size-3">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** A squarer, quieter label. Used for taxonomy: basins, disciplines, tiers. */
export function Tag({
  className,
  icon,
  children,
  ...props
}: {
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-line bg-canvas",
        "px-2 py-1 text-meta font-medium text-body whitespace-nowrap",
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 [&>svg]:size-3 text-faint">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export type TierName = "Junior" | "Mid" | "Senior" | "Platinum";

/** Experience tier has a fixed visual language across the whole product. */
export function TierBadge({
  tier,
  size = "md",
  className,
}: {
  tier: TierName;
  size?: "sm" | "md";
  className?: string;
}) {
  const tone: Record<TierName, BadgeTone> = {
    Junior: "neutral",
    Mid: "info",
    Senior: "accent",
    Platinum: "ink",
  };
  return (
    <Badge
      tone={tone[tier]}
      size={size}
      className={cn("rounded-sm", className)}
    >
      {tier}
    </Badge>
  );
}
