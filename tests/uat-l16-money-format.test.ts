import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/components/ui/money-format";
import { formatKobo } from "@/lib/api/payroll";
import { money } from "@/lib/pay/flags";
import { formatKobo as finalPayKobo } from "@/lib/api/offboarding";

/**
 * UAT 23 Nov, L16 (NC-32): a deduction read "₦-80,000". Money has one shape:
 * the minus sign first, then the naira sign, "−₦80,000".
 */

describe("a negative figure", () => {
  it("puts the minus before the naira sign", () => {
    expect(formatMoney(-80_000)).toBe("−₦80,000");
    expect(formatMoney(-80_000, "NGN", { decimals: true })).toBe("−₦80,000.00");
    expect(formatMoney(-2_500_000, "NGN", { compact: true })).toBe("−₦2.5m");
  });

  it("is the same through every kobo formatter", () => {
    expect(formatKobo(-8_000_000)).toBe("−₦80,000.00");
    expect(money(-8_000_000)).toBe("−₦80,000.00");
    expect(finalPayKobo(-8_000_000)).toBe("−₦80,000");
  });

  it("leaves a positive figure as it was", () => {
    expect(formatMoney(80_000)).toBe("₦80,000");
    expect(formatKobo(8_000_050)).toBe("₦80,000.50");
    expect(finalPayKobo(8_000_000)).toBe("₦80,000");
  });
});

describe("a screen that writes naira", () => {
  it("goes through formatMoney rather than its own ₦ template", () => {
    const root = join(__dirname, "..", "src");
    for (const path of [
      "lib/api/payroll.ts",
      "lib/api/offboarding.ts",
      "lib/loans/payment-split.ts",
      "lib/store/loans.ts",
      "app/(app)/reports/reports-screen.tsx",
      "app/(app)/payroll/payroll-screen.tsx",
      "app/(app)/reports/company/departments-tab.tsx",
    ]) {
      const source = readFileSync(join(root, path), "utf8");
      expect({ path, own: source.includes("`₦${") }).toEqual({
        path,
        own: false,
      });
    }
  });
});
