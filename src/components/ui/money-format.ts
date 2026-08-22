/**
 * Money formatting, with no React in it.
 *
 * Split out of `money.tsx` because that file is a **client** component now — it
 * reads the show/hide preference through a hook — and a plain function exported
 * from a client module cannot be called by a server component: the import
 * becomes a client reference rather than the function. `formatMoney` has three
 * non-client callers (`lib/pay/flags.ts`, `lib/audit/language.ts` and the
 * requisition page), so it lives here and `money.tsx` re-exports it for the
 * barrel.
 */
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

