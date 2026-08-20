"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Contrast, verified on the token palette:
 *   primary    white on ink            16.8:1
 *   accent     white on indigo         10.1:1
 *   approve    ink on brand green       8.6:1   (green cannot carry white text)
 *   secondary  ink on white            17.1:1   border at 4.3:1
 *   ghost      body on white            7.1:1
 *   danger     white on danger-text     6.5:1
 */

export type ButtonVariant =
  | "primary"
  | "accent"
  | "approve"
  | "secondary"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white shadow-sm hover:bg-ink-soft active:bg-ink disabled:hover:bg-ink",
  accent:
    "bg-accent text-white shadow-sm hover:bg-accent-hover active:bg-accent-hover disabled:hover:bg-accent",
  approve:
    "bg-success text-ink shadow-sm hover:bg-success-strong hover:text-white active:bg-success-strong disabled:hover:bg-success disabled:hover:text-ink",
  secondary:
    "bg-surface text-ink border border-control-line shadow-xs hover:bg-canvas active:bg-sunken disabled:hover:bg-surface",
  ghost:
    "bg-transparent text-body hover:bg-sunken hover:text-ink active:bg-line disabled:hover:bg-transparent",
  danger:
    "bg-danger-text text-white shadow-sm hover:brightness-110 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.875rem] gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-[0.9375rem] gap-2.5 rounded-md",
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
