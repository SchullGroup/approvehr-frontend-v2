import { cn } from "@/lib/cn";

/*
 * Contracts are denominated in USD. Settlement can be USD or NGN at a rate
 * locked when the invoice is issued, so every figure that a Nigerian payee
 * sees can show both. The locked rate travels with the record rather than
 * being looked up at render time, which is why it is passed in.
 */

export type Currency = "USD" | "NGN";

export const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  NGN: "₦",
};

export function formatMoney(
  amount: number,
  currency: Currency = "NGN",
  options: { compact?: boolean; decimals?: boolean } = {},
): string {
  const { compact = false, decimals = false } = options;

  if (compact && Math.abs(amount) >= 1000) {
    const units = [
      { limit: 1_000_000_000, suffix: "b" },
      { limit: 1_000_000, suffix: "m" },
      { limit: 1_000, suffix: "k" },
    ];
    for (const { limit, suffix } of units) {
      if (Math.abs(amount) >= limit) {
        const scaled = amount / limit;
        const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
        return `${SYMBOLS[currency]}${text.replace(/\.0$/, "")}${suffix}`;
      }
    }
  }

  return `${SYMBOLS[currency]}${amount.toLocaleString("en-NG", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

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

  /* Deliberately not `!amount`: zero is a real figure and formats normally. */
  if (amount === null) {
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span className={cn("text-muted", sizes[size])}>{absent}</span>
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
