"use client";

import { cn } from "@/lib/cn";
import { useMoneyHidden } from "@/lib/store/money-privacy";
import { formatMoney, SYMBOLS, type Currency } from "./money-format";

export { formatMoney, SYMBOLS };
export type { Currency };

export function Money({
  amount,
  currency = "NGN",
  /** Locked naira rate. When present the naira equivalent is shown beneath. */
  ngnRate,
  compact = false,
  decimals = false,
  per,
  className,
  size = "md",
  absent = "Not set yet",
  /**
   * Ignore the hide-figures preference for this one. Use sparingly: the value
   * of the control is that one click covers everything, and every exception is
   * a figure somebody thought was hidden.
   */
  alwaysShow = false,
}: {
  /**
   * The figure, or **null** where there is not one.
   *
   * Null is not zero. `Employee.grossMonthly` is nullable — somebody can be on
   * the staff list before their pay is agreed — and "₦0" for that person is a
   * wrong claim about what they earn, not a formatting detail. Rendering the
   * absence here rather than at each call site is what makes it consistent
   * across the forty-odd screens that show a salary.
   */
  amount: number | null;
  currency?: Currency;
  ngnRate?: number;
  compact?: boolean;
  decimals?: boolean;
  /** Rate basis, for example day or month. */
  per?: string;
  /**
   * What to say when `amount` is null. "Not set yet" by default.
   *
   * Overridden where the reason for the absence is specific and worth naming —
   * "No pay agreed" on a payroll exception list reads better than the generic
   * form. Never override it with a zero or a dash: a dash tells the reader
   * nothing about whether somebody looked.
   */
  absent?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Exempt this figure from the hide-figures preference. See above. */
  alwaysShow?: boolean;
}) {
  /*
   * The size lands on the inner span, not the outer one `className` reaches —
   * so passing `className="text-h3"` from a caller does nothing: the inner
   * element's own size class wins over anything inherited. `xl` exists because
   * of that: a `Stat` card's value slot is `text-h3`, and a Money passed into it
   * rendered 9px smaller than the plain strings in the cards beside it.
   */
  const sizes = {
    sm: "text-body-sm",
    md: "text-body-sm",
    lg: "text-h4",
    xl: "text-h3",
  } as const;

  /* Before either early return: a hook cannot sit behind one. */
  const hidden = useMoneyHidden() && !alwaysShow;

  /* Deliberately not `!amount`: zero is a real figure and formats normally. */
  if (amount === null) {
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span className={cn("text-muted", sizes[size])}>{absent}</span>
      </span>
    );
  }

  /*
   * Masked with fixed-width dots rather than a blank or a dash.
   *
   * Six dots for every amount, so ₦18,000 and ₦1,450,000 are indistinguishable
   * — a mask whose width followed the figure would leak its magnitude, which is
   * most of what somebody reading over a shoulder wants. `tabular` keeps the
   * column from reflowing when the preference changes.
   */
  if (hidden) {
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span
          aria-label="Hidden"
          className={cn("tabular font-medium text-muted", sizes[size])}
        >
          {"\u2022".repeat(6)}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={cn("tabular font-medium text-ink", sizes[size])}>
        {formatMoney(amount, currency, { compact, decimals })}
        {per && (
          <span className="font-normal text-muted">
            {" "}
            per {per}
          </span>
        )}
      </span>
      {ngnRate !== undefined && currency === "USD" && (
        <span className="tabular text-meta text-muted">
          {formatMoney(amount * ngnRate, "NGN", { compact: true })} at locked
          rate
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** Masked figure, shown where a viewer's role should not see the number. */
export function MoneyHidden({ reason }: { reason?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-sunken px-2 py-1 text-meta font-medium text-muted"
      title={reason}
    >
      Hidden
    </span>
  );
}
