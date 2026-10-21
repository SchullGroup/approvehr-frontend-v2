import { createElement, useId } from "react";
import { InfoTooltip } from "./field";
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
  /* `createElement` rather than `<As .../>`: with `As` typed as the fully
     open `React.ElementType`, JSX's generic-tag resolution intersects props
     across *every* intrinsic element in scope. `@react-three/fiber` (used
     by the workforce explorer) globally augments `JSX.IntrinsicElements`
     with its own elements — `mesh`, `group`, and the rest — which carry no
     `className`, and the intersection collapsed `className`'s type to
     `never` project-wide the moment any file imported it. `createElement`
     takes the same arguments and produces the identical element at
     runtime, but is typed against `As` directly rather than through JSX's
     library-managed-attributes machinery, so it never hits that collapse. */
  return createElement(As, {
    className: cn(
      /* `min-w-0`: a card is very often a grid or flex item, and an item's
         automatic minimum width is its content's. One row with a no-wrap
         progress bar made a card 510px wide inside a 335px column and the
         whole onboarding page scroll sideways on a phone. */
      "min-w-0 rounded-lg border border-line bg-surface",
      "transition-shadow duration-200",
      className,
    ),
    ...props,
  });
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
        /* `flex-wrap`, not the plain row `PageHeader` had before its own
           mobile fix: a wide `action` (a multi-option SegmentedControl is
           the case that found this) beside a `min-w-0` title does not make
           the title scroll or truncate — it squeezes it to a sliver one
           character wide while the action claims the rest of the row, which
           at 375px reads as the two overlapping. Wrapping the action onto
           its own line under the title is what `PageHeader` already does
           for the same shape of collision. */
        "flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-line",
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
      {/* `max-w-full`: `shrink-0` alone let a wide action — a four-option
          SegmentedControl is the case that found this — claim more than the
          card has, and the page grew a sideways scrollbar at 320px. Capped at
          the header's own width, the action wraps inside it instead. */}
      {action && <div className="max-w-full shrink-0">{action}</div>}
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
        /* Same collision as CardHeader, one component down: two children
           (a note on the left, actions on the right, most often) that do not
           fit side by side at 375px need to wrap onto their own lines rather
           than squeeze one child to a sliver. Found the same way — a footer
           note colliding with two pill buttons on the Overtime screen. */
        "flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-line bg-canvas rounded-b-lg",
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
        "transition-[border-color,box-shadow,transform] duration-200 ease-out-soft",
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
      <span className="flex items-center gap-1.5 font-semibold text-ink">
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
      <p className="mt-2 break-words text-h3 text-ink tabular">{value}</p>
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
         * Wraps. It used to truncate, with the whole thing in a tooltip.
         *
         * Truncating was right for the case it was written for — a filename,
         * "ApproveHR_employees_reformatted.xlsx", which spilled past the card's
         * edge and over the card beside it — and wrong for the case that is now
         * most of its use: a hint is a full clause ("Across the 9 marks given.
         * People with no mark are not counted."), and the half of the sentence
         * that was cut off is usually the caveat. On a phone there is no hover
         * to read a `title`, so the caveat was simply gone, and it was gone on
         * a laptop too, where four cards share a row.
         *
         * `break-words` keeps the filename inside the card: it only breaks a
         * word that cannot fit, so a sentence wraps at its spaces. The reason
         * for truncating was that "a hint that wraps to three lines makes one
         * card taller than its neighbours". Stats sit in grids, and a grid item
         * stretches to its row's tallest, so the row grows and the cards still
         * line up; the `title` stays for anybody who hovers.
         */
        <p className="mt-1 break-words text-body-sm text-muted" title={hint}>
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
  const quiet = useId();
  /* Information that is only good to know is not worth a block on the page: a
     short line with the detail behind an info icon. Warnings, errors and
     anything with something to click stay in full. */
  if (
    (tone === "info" || tone === "neutral" || tone === "accent") &&
    typeof children === "string"
  ) {
    const first = children.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() ?? children;
    const visible = title ?? first;
    const detail = title ? children : children.slice(first.length).trim();
    if (detail.length > 0 || title) {
      return (
        <p
          className={cn(
            "inline-flex max-w-full items-center gap-2 text-body-sm text-muted",
            className,
          )}
        >
          <span className="min-w-0">{visible}</span>
          <InfoTooltip id={quiet} text={detail || children} label="Read more" />
        </p>
      );
    }
  }

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
      className={cn("flex gap-3 rounded-lg border p-4", tones[tone], className)}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 mt-px [&>svg]:size-[18px]">
          {icon}
        </span>
      )}
      <div className="min-w-0 text-body-sm leading-relaxed">
        {title && <p className="font-semibold mb-1">{title}</p>}
        <div className={tone === "neutral" ? "" : "text-ink/85"}>
          {children}
        </div>
      </div>
    </div>
  );
}
