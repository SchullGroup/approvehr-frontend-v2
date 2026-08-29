"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Contrast, verified on the token palette by `npm run verify:contrast`:
 *   primary    white on ApproveHR blue 10.1:1
 *   accent     white on ApproveHR blue 10.1:1   (same fill as primary)
 *   approve    success-text on success-soft  4.95:1  (same fill as success)
 *   success    success-text on success-soft  4.95:1
 *   secondary  body on white            7.1:1   (same fill as ghost)
 *   ghost      body on white            7.1:1
 *   danger     white on danger-text     6.5:1
 *
 * ## Two fills, four names
 *
 * The brand's blue is the primary action everywhere. `primary` used to be
 * near-black and `approve` used to be a solid green fill, which meant the
 * loudest colour in the product was not a brand colour, and the three most
 * important buttons on a screen could be three different hues.
 *
 * `primary` and `accent` share the blue; `approve` and `success` share the green.
 * Each pair is one string, so the names in it cannot drift apart. The names are
 * kept rather than collapsed because 251 call sites use them — `accent` alone is
 * 215 — and a rename is churn with no user-visible payoff. A later cleanup can
 * fold each pair into one name.
 *
 * ## `approve` is green, and it is a secondary
 *
 * A decision taken deliberately and worth recording, because it cuts against the
 * usual advice. `approve` sits on approving a payroll — a one-way door that
 * moves money, and the most consequential control in the product. The received
 * wisdom is that such a button should be the loudest thing on its screen.
 *
 * It is not, here. Green is the secondary treatment and approval wears it, so
 * the brand's blue is the only primary anywhere in the product. The trade is
 * accepted knowingly: consistency of the primary action across every screen,
 * against emphasis on one screen.
 *
 * Two things make that safe rather than merely tidy. The approve control is
 * never the *only* way forward on its screen competing with a louder blue — it
 * is the terminal action of the payroll wizard, where the alternative is going
 * back. And the guard on approving a payroll was never its colour: it is the
 * blockers list, the exception summary, and a confirmation naming what is about
 * to be settled. A green button that somebody has to read three counts to reach
 * is safer than a blue one they can reach by reflex.
 *
 * If approval ever does sit beside a blue primary on the same screen, revisit
 * this — that is the case the received wisdom is actually about.
 *
 * ## `secondary` lost its border
 *
 * `secondary` used to carry its own white fill and a visible grey border — the
 * "outline" look, and also what every bare `<Button>`/`<ButtonLink>` rendered,
 * since `secondary` is the default for both. Asked to change everywhere the
 * border showed up, which is everywhere: restyling the one variant fixes every
 * explicit `secondary` and every default-only call site at once, which a sweep
 * of call sites cannot guarantee. `secondary` and `ghost` share
 * `GHOST_TREATMENT` for the same reason `primary`/`accent` share a fill — the
 * name still says what the button *is* (the secondary action on its screen),
 * the shared string says what it now *looks like*.
 */

export type ButtonVariant =
  | "primary"
  | "accent"
  | "approve"
  | "success"
  | "secondary"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * The green, in its secondary role: a tinted fill rather than a solid one, so it
 * sits below the primary without disappearing. `success-text` on `success-soft`
 * rather than ink on solid green — the old solid fill could not carry white text
 * at all, which is what made it awkward as a primary.
 */
const SECONDARY_GREEN =
  "bg-success-soft text-success-text border border-success-line shadow-xs " +
  "hover:bg-success hover:text-ink active:bg-success-line " +
  "disabled:hover:bg-success-soft disabled:hover:text-success-text";

/** The brand blue. One string, so the two names cannot drift apart. */
const PRIMARY_FILL =
  "bg-accent text-white shadow-sm hover:bg-accent-hover " +
  "active:bg-accent-hover disabled:hover:bg-accent";

const GHOST_TREATMENT =
  "bg-transparent text-body hover:bg-sunken hover:text-ink active:bg-line " +
  "disabled:hover:bg-transparent";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: PRIMARY_FILL,
  accent: PRIMARY_FILL,
  approve: SECONDARY_GREEN,
  success: SECONDARY_GREEN,
  secondary: GHOST_TREATMENT,
  ghost: GHOST_TREATMENT,
  danger:
    "bg-danger-text text-white shadow-sm hover:brightness-110 active:brightness-95",
};

/**
 * `text-body` is deliberately absent from `lg`. Tailwind resolves that utility
 * name to the `--color-body` gray, not the `--text-body` size (see the trap
 * documented in globals.css) — so it was silently clobbering every colored
 * variant's text colour on `size="lg"` (white-on-accent came out gray). The
 * 16px baseline it was reaching for is what a button inherits anyway.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5 rounded-sm",
  md: "h-10 px-4 text-body-sm gap-2 rounded-md",
  lg: "h-12 px-6 gap-2.5 rounded-md",
};

const BASE =
  "inline-flex items-center justify-center font-medium whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,transform] duration-150 " +
  "ease-[var(--ease-out-soft)] active:translate-y-px " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 " +
  "disabled:shadow-none";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Renders full width. Used inside steppers and mobile action bars. */
  block?: boolean;
};

export type ButtonProps = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      block = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          BASE,
          VARIANTS[variant],
          SIZES[size],
          block && "w-full",
          className,
        )}
        {...props}
      >
        {loading && (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        )}
        {children}
      </button>
    );
  },
);

/* -------------------------------------------------------------------------- */

export type ButtonLinkProps = CommonProps &
  React.ComponentProps<typeof Link> & { disabled?: boolean };

/** Same visual language as Button, for navigation rather than actions. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block = false,
  disabled = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

export type IconButtonProps = Omit<ButtonProps, "block" | "children"> & {
  /** Required. Icon only controls carry no visible text. */
  label: string;
  children: React.ReactNode;
};

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  className,
  children,
  ...props
}: IconButtonProps) {
  const square = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cn("px-0", square, className)}
      {...props}
    >
      {children}
    </Button>
  );
}
