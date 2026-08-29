import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/* Surfaces. Stripe leans on hairlines and soft elevation rather than heavy
 * borders, so the default card is a hairline with no shadow until it lifts. */

export function Card({
  className,
  as: As = "div",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  as?: React.ElementType;
}) {
  return (
    <As
      className={cn(
        "rounded-lg border border-line bg-surface",
        "transition-shadow duration-200",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  level = 3,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Keeps the document outline correct wherever the card is placed. */
  level?: 2 | 3 | 4;
}) {
  const Heading = `h${level}` as const;
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 py-4 border-b border-line",
        className,
      )}
    >
      <div className="min-w-0">
        {/* `text-body-md` is 16px, asked for by name.
            It used to be `text-body`, which is the **colour** utility — the
            16px it rendered came from `body`'s own inheritance, not from
            anything this line said. That worked, and it made the size
            invisible to anybody reading the class list, which is how
            `Disclosure` came to be 17px beside it. See `globals.css`. */}
        <Heading className="text-body-md font-semibold text-ink">
          {title}
        </Heading>
        {description && (
          <p className="mt-1 text-body-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-3.5 border-t border-line bg-canvas rounded-b-lg",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */

/** A card that is entirely a link. The whole surface is the target. */
export function LinkCard({
  href,
  title,
  description,
  icon,
  meta,
  className,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border border-line bg-surface p-5",
        "transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out-soft)]",
        "hover:border-line-strong hover:shadow-md hover:-translate-y-0.5",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent-text [&>svg]:size-[18px]"
        >
          {icon}
        </span>
      )}
      <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
        {title}
        <ArrowRight
          aria-hidden="true"
          className="size-4 text-accent-text transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </span>
      {description && (
        <span className="text-body-sm leading-relaxed text-body">
          {description}
        </span>
      )}
      {meta && <span className="mt-auto pt-1">{meta}</span>}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  icon?: React.ReactNode;
  className?: string;
}) {
  const trendTone =
    trend?.direction === "up"
      ? "text-success-text"
      : trend?.direction === "down"
        ? "text-danger-text"
        : "text-muted";

  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface p-5 min-w-0",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-body-sm font-medium text-muted">{label}</p>
        {icon && (
          <span aria-hidden="true" className="text-faint [&>svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-h3 text-ink tabular truncate">{value}</p>
      {/*
       * Two lines when there are two things to say.
       *
       * `trend` and `hint` shared one flex row, so "Blocks payroll" and
       * "missing bank, PIN or TIN" sat side by side and wrapped into two ragged
       * columns inside the card. They are a verdict and its reason — the verdict
       * belongs on its own line above the reason it rests on.
       */}
      {trend && (
        <p className={cn("mt-1.5 text-body-sm font-medium", trendTone)}>
          {trend.label}
        </p>
      )}
      {hint && (
        /*
         * Truncated, with the whole thing in the tooltip.
         *
         * The hint is usually four words. It is also where a **filename** goes —
         * "ApproveHR_employees_reformatted.xlsx" — and a long one spilled past
         * the card's edge and over the card beside it. `truncate` needs
         * `min-w-0` on every flex ancestor to have anything to shrink against;
         * the card root already carries it.
         *
         * `title` rather than a wrap, because the card's height is what keeps a
         * row of four stats aligned. A hint that wraps to three lines makes one
         * card taller than its neighbours, which reads as a layout bug.
         */
        <p className="mt-1 truncate text-body-sm text-muted" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A tinted callout. Used for AI output, regulatory notes and warnings. */
export function Callout({
  tone = "info",
  title,
  icon,
  className,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "accent" | "neutral";
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-info-soft border-info-line text-info-text",
    success: "bg-success-soft border-success-line text-success-text",
    warning: "bg-warning-soft border-warning-line text-warning-text",
    danger: "bg-danger-soft border-danger-line text-danger-text",
    accent: "bg-accent-soft border-accent-line text-accent-text",
    neutral: "bg-canvas border-line text-body",
  } as const;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4",
        tones[tone],
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 mt-px [&>svg]:size-[18px]">
          {icon}
        </span>
      )}
      <div className="min-w-0 text-body-sm leading-relaxed">
        {title && <p className="font-semibold mb-1">{title}</p>}
        <div className={tone === "neutral" ? "" : "text-ink/85"}>{children}</div>
      </div>
    </div>
  );
}
