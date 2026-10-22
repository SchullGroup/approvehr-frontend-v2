import { createElement, useId } from "react";
import { InfoTooltip } from "./field";
import { AttentionMark } from "./attention-mark";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
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
  mark,
  className,
  level = 3,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /**
   * Something about the whole section that is worth a look: "3 of these have
   * ended", "2 have no end date". Shown as an `AttentionMark` after the title,
   * with the sentence behind it, where a banner above the card used to be.
   */
  mark?: string | readonly (string | null | false | undefined)[] | null | false;
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
          {mark && (
            <AttentionMark text={mark} className="ml-2 -translate-y-px" />
          )}
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
  mark,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Something about this figure worth a look: an `AttentionMark` beside the label. */
  mark?: string | readonly (string | null | false | undefined)[] | null | false;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  icon?: React.ReactNode;
  className?: string;
}) {
  /* Never red and green. A trend is a remark on a figure, not an alarm: the
     good direction takes the brand colour and the rest stay quiet. */
  const trendTone =
    trend?.direction === "up" ? "text-accent-text" : "text-muted";

  return (
    <div
      className={cn(
        /* Compact below `sm`, roomy from there up. A phone shows these two to a
           row (see `StatGrid`), so the padding that suits a 300px card is far
           too much for a 170px one. */
        "min-w-0 rounded-lg border border-line bg-surface p-3.5 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-body-sm font-medium text-muted">
          {label}
          {mark && <AttentionMark text={mark} className="ml-1.5" />}
        </p>
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

/**
 * A row of `Stat`s, two to a row on a phone.
 *
 * Four stat cards stacked one to a row took more than a screen before the page's
 * own content began, on a dozen screens (payroll, payslips, the period screen,
 * the directory, departments, hiring, leave, shifts, KPIs and more). Two across
 * is the shape a phone can hold — with `Stat`'s own padding and figure size
 * stepping down to match — so four become a 2×2 block under the header and the
 * content is back in the first screenful.
 *
 * From `sm` up it is the layout every screen already had, so a desktop does not
 * change: two across at `sm`, and `columns` across from `xl` (or from `sm` for
 * three). An odd stat out spans the phone's full width rather than leaving a
 * hole beside it.
 *
 * This is the one place that decides how a row of metrics lays out. A screen
 * that writes its own `grid` around `Stat`s is the thing this replaces.
 */
export function StatGrid({
  columns = 4,
  className,
  children,
}: {
  /** How many across on a wide screen. Two across on a phone whatever this is. */
  columns?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "xl:grid-cols-4",
        /* The last of an odd number takes the whole row on a phone. */
        "[&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(odd)]:col-span-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The words of a callout whose children are only words, or null. */
function plainText(children: React.ReactNode): string | null {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (
    Array.isArray(children) &&
    children.every(
      (child) => typeof child === "string" || typeof child === "number",
    )
  ) {
    return children.join("");
  }
  return null;
}

/** Whether there is anything to draw: `{null}` and `{false}` are the common empties. */
function hasContent(children: React.ReactNode): boolean {
  return children !== null && children !== undefined && children !== false;
}

/**
 * One sentence on the page, never a box.
 *
 * ## What this replaced
 *
 * A tinted panel: an icon, a heading, a paragraph and sometimes a button, laid
 * over the page it was about. The owner does not want large banners anywhere.
 * What each of them said now has a better home, and this is the floor that
 * makes it impossible to fall back to a box:
 *
 * - **A fact about a person, a row or a section** belongs on it, as an
 *   `AttentionMark` with the sentence behind it. That is a call-site decision and
 *   is made at the call site; reaching for `Callout` for it is the thing to stop.
 * - **A failure** (`danger`) is words on screen, because it is the one thing the
 *   reader must read to carry on: a refused action, a failed load. Plain red
 *   text, no fill, no border, no icon.
 * - **Everything else** is a quiet line. The first sentence (or the title) is
 *   visible; anything after it is behind an icon that shows it on hover, focus or
 *   a tap. A `warning` carries the ochre mark, because it is the one that asks to
 *   be noticed; the rest carry the grey help icon.
 *
 * `icon` is accepted and ignored, as `Badge`'s `tone` is: the glyph is decided
 * here so that two callouts cannot disagree about what a warning looks like.
 */
export function Callout({
  tone = "info",
  title,
  icon: _icon,
  className,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "accent" | "neutral";
  title?: string;
  /** Kept for existing callers; has no visual effect. */
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const quiet = useId();
  void _icon;
  const text = plainText(children);

  /* A failure: plain red words, inline. No role is added: a failure shown on
     arrival is announced by whoever raised it. The title is the heavier of the
     two words, so a message after it reads as the rest of the sentence. */
  if (tone === "danger") {
    const message = hasContent(children);
    return (
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 text-body-sm leading-relaxed text-danger-text",
          className,
        )}
      >
        {title && <span className="font-medium">{title}</span>}
        {message && <div className="min-w-0">{children}</div>}
      </div>
    );
  }

  /* Words only: the first sentence, with the rest behind an icon. */
  if (text !== null && tone !== "success") {
    const first = text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() ?? text;
    const visible = title ?? first;
    const detail = title ? text : text.slice(first.length).trim();
    return (
      <p
        className={cn(
          "inline-flex max-w-full items-center gap-2 text-body-sm text-muted",
          className,
        )}
      >
        <span className="min-w-0">{visible}</span>
        {detail.length > 0 && (
          <InfoTooltip
            id={quiet}
            text={detail}
            label="Read more"
            tone={tone === "warning" ? "attention" : "info"}
          />
        )}
      </p>
    );
  }

  /* Something with markup in it, a name in bold or a link or a button: it has
     to stay on the page, so it is a line of text with the markup where it was. */
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-body-sm leading-relaxed text-muted",
        className,
      )}
    >
      {tone === "warning" ? (
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning-text"
        />
      ) : tone === "success" ? (
        <Check
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-accent-text"
        />
      ) : null}
      <div className="min-w-0">
        {title && <p className="font-medium text-ink">{title}</p>}
        {hasContent(children) && <div>{children}</div>}
      </div>
    </div>
  );
}
