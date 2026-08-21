"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Contrast, verified on the token palette by `npm run verify:contrast`:
 *   primary    white on ApproveHR blue 10.1:1
 *   accent     white on ApproveHR blue 10.1:1   (same fill — see below)
 *   approve    white on ApproveHR blue 10.1:1   (same fill — see below)
 *   success    success-text on success-soft     the green, now secondary
 *   secondary  ink on white            17.1:1   border at 4.3:1
 *   ghost      body on white            7.1:1
 *   danger     white on danger-text     6.5:1
 *
 * ## One primary fill, three names
 *
 * The brand's blue is the primary action everywhere. `primary` used to be
 * near-black and `approve` used to be a solid green fill, which meant the
 * loudest colour in the product was not a brand colour, and the three most
 * important buttons on a screen could be three different hues.
 *
 * All three now share the blue. The names are kept rather than collapsed because
 * 251 call sites use them and a rename is churn with no user-visible payoff —
 * `accent` alone is 215 of those. A later cleanup can fold them into one; doing
 * it here would bury this change in a diff nobody could review.
 *
 * ## Why `approve` is not the new green secondary
 *
 * The obvious reading of "green becomes secondary" is to make `approve` the soft
 * green. That would be wrong: `approve` is on approving a payroll run — a
 * one-way door that moves money — and it is the single most consequential control
 * in the product. Demoting it to a quiet button to satisfy a palette decision
 * trades real usability for tidiness.
 *
 * So approval stays loud and becomes on-brand, and the green moves to `success`,
 * where it is available for the positive-but-secondary case it is actually
 * suited to.
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

/** The brand blue. One string, so the three names cannot drift apart. */
const PRIMARY_FILL =
  "bg-accent text-white shadow-sm hover:bg-accent-hover " +
  "active:bg-accent-hover disabled:hover:bg-accent";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: PRIMARY_FILL,
  accent: PRIMARY_FILL,
  approve: PRIMARY_FILL,
  /* The green, in its secondary role: a tinted fill rather than a solid one, so
     it sits below the primary without disappearing. `success-text` on
     `success-soft` rather than ink on solid green — the old solid fill could not
     carry white text at all, which is what made it awkward as a primary. */
  success:
    "bg-success-soft text-success-text border border-success-line shadow-xs " +
    "hover:bg-success hover:text-ink active:bg-success-line " +
    "disabled:hover:bg-success-soft disabled:hover:text-success-text",
  secondary:
    "bg-surface text-ink border border-control-line shadow-xs hover:bg-canvas active:bg-sunken disabled:hover:bg-surface",
  ghost:
    "bg-transparent text-body hover:bg-sunken hover:text-ink active:bg-line disabled:hover:bg-transparent",
  danger:
    "bg-danger-text text-white shadow-sm hover:brightness-110 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5 rounded-sm",
  md: "h-10 px-4 text-body-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-body gap-2.5 rounded-md",
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
