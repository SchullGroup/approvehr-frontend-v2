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
}: {
  amount: number;
  currency?: Currency;
  ngnRate?: number;
  compact?: boolean;
  decimals?: boolean;
  /** Rate basis, for example day or month. */
  per?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-[0.875rem]",
    md: "text-sm",
    lg: "text-h4",
  } as const;

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
        <span className="tabular text-[0.75rem] text-muted">
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
      className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-sunken px-2 py-1 text-[0.75rem] font-medium text-muted"
      title={reason}
    >
      Hidden
    </span>
  );
}
