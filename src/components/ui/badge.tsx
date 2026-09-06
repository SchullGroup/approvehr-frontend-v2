import { cn } from "@/lib/cn";

/*
 * Status is never carried by colour alone. Every Badge renders a text label,
 * and Dot variants pair the colour with that label rather than replacing it.
 */

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ink";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-body border-line",
  accent: "bg-accent-soft text-accent-text border-accent-line",
  success: "bg-success-soft text-success-text border-success-line",
  warning: "bg-warning-soft text-warning-text border-warning-line",
  danger: "bg-danger-soft text-danger-text border-danger-line",
  info: "bg-info-soft text-info-text border-info-line",
  ink: "bg-fill-strong text-white border-fill-strong",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-muted",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  ink: "bg-white",
};

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Adds a status dot. The label still carries the meaning. */
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm"
          ? "px-2 py-0.5 text-meta"
          : "px-2.5 py-1 text-meta",
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full shrink-0", DOTS[tone])}
        />
      )}
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
}: {
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-line bg-canvas",
        "px-2 py-1 text-meta font-medium text-body whitespace-nowrap",
        className,
      )}
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
    <Badge tone={tone[tier]} size={size} className={cn("rounded-sm", className)}>
      {tier}
    </Badge>
  );
}
