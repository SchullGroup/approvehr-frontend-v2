import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/* Empty, loading and pending states. */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-5 py-10" : "px-5 py-16",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="mb-4 flex size-11 items-center justify-center rounded-full bg-sunken text-faint [&>svg]:size-5"
        >
          {icon}
        </span>
      )}
      <h3 className="text-body font-semibold text-ink">{title}</h3>
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
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <Loader2
        aria-hidden="true"
        className={cn("animate-spin text-accent-text motion-reduce:animate-none", sizes[size])}
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
        <span className="block text-body-sm font-medium text-ink">
          {label}
        </span>
        {detail && (
          <span className="block text-meta text-body">{detail}</span>
        )}
      </span>
    </div>
  );
}
