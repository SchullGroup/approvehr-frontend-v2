import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * One button language for the whole marketing site.
 *
 *   solid    brand green fill, ink label — 8.6:1. The single primary action
 *            on any given screen. Green is the approval colour, so the button
 *            that starts a relationship wears it.
 *   dark     near-black fill, white label — 17.9:1. Secondary, and the default
 *            inside light washed cards where green would fight the tint.
 *   quiet    hairline outline on sand. Tertiary.
 *   text     inline link with a travelling arrow. Used inside cards.
 *
 * All four share the same lift on hover so the site has one motion signature.
 */

type Variant = "solid" | "dark" | "quiet" | "text";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  solid:
    "bg-success text-slate hover:bg-success-strong hover:text-white shadow-[0_1px_2px_rgb(20_18_15/0.10)]",
  dark: "bg-slate text-white hover:bg-slate-soft shadow-[0_1px_2px_rgb(20_18_15/0.14)]",
  quiet:
    "border border-sand-line bg-transparent text-slate hover:border-slate hover:bg-white",
  text: "text-slate hover:text-slate-muted p-0",
};

const SIZES: Record<Size, string> = {
  md: "h-10 px-5 text-body-sm",
  lg: "h-12 px-6 text-body",
};

const BASE =
  "pill-press inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate";

export function Pill({
  href,
  variant = "solid",
  size = "md",
  arrow = false,
  className,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  /** Adds a trailing arrow that travels on hover. */
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={cn(
        BASE,
        variant !== "text" && SIZES[size],
        VARIANTS[variant],
        "group/pill",
        className,
      )}
      {...props}
    >
      {children}
      {arrow && (
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover/pill:translate-x-1"
        />
      )}
    </Link>
  );
}

/** Same language, for real buttons rather than navigation. */
export function PillButton({
  variant = "solid",
  size = "md",
  arrow = false,
  className,
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        BASE,
        variant !== "text" && SIZES[size],
        VARIANTS[variant],
        "group/pill disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {arrow && (
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover/pill:translate-x-1"
        />
      )}
    </button>
  );
}

/** The "Find out more →" link that closes every module card. */
export function LearnMore({
  href,
  children = "Find out more",
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/more inline-flex items-center gap-2 text-body-sm font-medium text-slate",
        "transition-colors hover:text-slate-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
        className,
      )}
    >
      {children}
      <span className="flex size-6 items-center justify-center rounded-full bg-slate/8 transition-all duration-200 ease-[var(--ease-out-soft)] group-hover/more:bg-slate group-hover/more:text-white">
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </span>
    </Link>
  );
}
