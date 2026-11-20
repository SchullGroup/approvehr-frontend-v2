import { describe, expect, it } from "vitest";
import type { LoanRepaymentStatus } from "@/lib/api/loans";
import {
  allocatePayment,
  describeSplit,
  sharesList,
  type PayableInstalment,
  type PaymentSplit,
} from "@/lib/loans/payment-split";

/**
 * Where a payment recorded outside payroll goes, as the screen works it out.
 *
 * `allocatePayment` is a port of the API's function of the same name, and these
 * are the API's cases (`tests/loan-payment-allocation.test.ts` in approvehr-api),
 * case for case. If one changes there it changes here. The screen only promises a
 * split; the server decides it, so a case that passes here and fails there is a
 * screen that lied.
 */

const N = (naira: number): number => Math.round(naira * 100);

const SCHEDULED = "SCHEDULED";
const PARTIAL = "PARTIAL";
const PAID = "PAID";
const WAIVED = "WAIVED";
type Status = LoanRepaymentStatus;

/** A schedule of `count` equal instalments, all untouched. */
const schedule = (count: number, naira = 50_000): PayableInstalment[] =>
  Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    dueKobo: N(naira),
    paidKobo: 0,
    status: SCHEDULED,
  }));

/** The same schedule with some instalments in another state. */
const withRows = (
  rows: PayableInstalment[],
  changes: Record<number, { status: Status; paidKobo?: number }>,
): PayableInstalment[] =>
  rows.map((row) => {
    const change = changes[row.sequence];
    return change
      ? { ...row, ...change, paidKobo: change.paidKobo ?? row.paidKobo }
      : row;
  });

const sharesOf = (result: PaymentSplit) => {
  if (!result.ok) throw new Error(`refused: ${result.refusal.message}`);
  return result.shares.map(
    (s) => [s.sequence, s.amountKobo, s.status] as const,
  );
};
const sumOf = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

describe("allocatePayment", () => {
  it("takes an exact payment onto the instalment chosen and nothing else", () => {
    const result = allocatePayment(schedule(6), 1, N(50_000));
    expect(sharesOf(result)).toEqual([[1, N(50_000), PAID]]);
  });

  it("leaves an instalment PARTIAL when the payment is short", () => {
    const result = allocatePayment(schedule(6), 1, N(20_000));
    expect(sharesOf(result)).toEqual([[1, N(20_000), PARTIAL]]);
    if (result.ok) expect(result.shares[0]!.paidKobo).toBe(N(20_000));
  });

  it("fills a PARTIAL instalment from what it already holds", () => {
    const rows = withRows(schedule(3), {
      1: { status: PARTIAL, paidKobo: N(20_000) },
    });
    const result = allocatePayment(rows, 1, N(30_000));
    expect(sharesOf(result)).toEqual([[1, N(30_000), PAID]]);
  });

  it("spills the excess into the next instalment", () => {
    const result = allocatePayment(schedule(6), 1, N(60_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      [2, N(10_000), PARTIAL],
    ]);
    if (result.ok) expect(result.shares[1]!.paidKobo).toBe(N(10_000));
  });

  it("spills into several instalments, each filled before the next is started", () => {
    const result = allocatePayment(schedule(6), 1, N(175_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      [2, N(50_000), PAID],
      [3, N(50_000), PAID],
      [4, N(25_000), PARTIAL],
    ]);
  });

  it("clears the next instalment exactly when the excess is exactly its size", () => {
    const result = allocatePayment(schedule(4), 1, N(100_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      [2, N(50_000), PAID],
    ]);
  });

  it("skips PAID and WAIVED instalments after the one chosen", () => {
    const rows = withRows(schedule(5), {
      2: { status: PAID, paidKobo: N(50_000) },
      3: { status: WAIVED },
    });
    const result = allocatePayment(rows, 1, N(80_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      [4, N(30_000), PARTIAL],
    ]);
  });

  it("uses a PARTIAL instalment that follows a PAID one, topping it up rather than starting it", () => {
    const rows = withRows(schedule(4), {
      2: { status: PAID, paidKobo: N(50_000) },
      3: { status: PARTIAL, paidKobo: N(40_000) },
    });
    const result = allocatePayment(rows, 1, N(65_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      /* Only ₦10,000 was left on it, so it is cleared and the rest moves on. */
      [3, N(10_000), PAID],
      [4, N(5_000), PARTIAL],
    ]);
    if (result.ok) expect(result.shares[1]!.paidKobo).toBe(N(50_000));
  });

  it("never touches an instalment before the one chosen, however much is owing on it", () => {
    const result = allocatePayment(schedule(4), 3, N(70_000));
    expect(sharesOf(result)).toEqual([
      [3, N(50_000), PAID],
      [4, N(20_000), PARTIAL],
    ]);
    if (result.ok) {
      expect(result.shares.map((s) => s.sequence)).not.toContain(1);
      expect(result.shares.map((s) => s.sequence)).not.toContain(2);
    }
  });

  it("settles the loan when the payment is exactly everything still owing", () => {
    const rows = withRows(schedule(3), {
      1: { status: PAID, paidKobo: N(50_000) },
      2: { status: PARTIAL, paidKobo: N(10_000) },
    });
    const result = allocatePayment(rows, 2, N(90_000));
    expect(sharesOf(result)).toEqual([
      [2, N(40_000), PAID],
      [3, N(50_000), PAID],
    ]);
    if (result.ok) expect(result.maxKobo).toBe(N(90_000));
  });

  it("refuses more than everything still owing, naming the most that can be recorded", () => {
    const result = allocatePayment(schedule(3), 1, N(150_000) + 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe("TOO_MUCH");
    expect(result.maxKobo).toBe(N(150_000));
    expect(result.refusal.message).toBe(
      "Only ₦150,000.00 is left to pay from instalment 1 onwards. Record ₦150,000.00 or less.",
    );
  });

  it("counts only what is owing from the chosen instalment on when it names the most", () => {
    const rows = withRows(schedule(4), {
      1: { status: PAID, paidKobo: N(50_000) },
      3: { status: WAIVED },
    });
    const result = allocatePayment(rows, 2, N(100_001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.maxKobo).toBe(N(100_000));
  });

  it("says it the old way when nothing after the chosen instalment can take money", () => {
    const result = allocatePayment(schedule(3), 3, N(50_000) + 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.message).toBe(
      "Only ₦50,000.00 is left on instalment 3. Record ₦50,000.00 or less.",
    );
  });

  it("refuses an amount that is not a whole, positive number of kobo", () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      const result = allocatePayment(schedule(3), 1, amount);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.kind).toBe("AMOUNT");
    }
  });

  it("refuses a chosen instalment that is paid, written off, or not there", () => {
    const rows = withRows(schedule(4), {
      1: { status: PAID, paidKobo: N(50_000) },
      2: { status: WAIVED },
    });
    const kindOf = (sequence: number) => {
      const result = allocatePayment(rows, sequence, N(10_000));
      return result.ok ? "ok" : result.refusal.kind;
    };
    expect(kindOf(1)).toBe("ALREADY_PAID");
    expect(kindOf(2)).toBe("WRITTEN_OFF");
    expect(kindOf(9)).toBe("NO_INSTALMENT");
    expect(kindOf(3)).toBe("ok");
  });

  it("is exact when the instalments do not divide evenly: the last one is the balancing figure", () => {
    /* ₦50,000 over three: 16,666.66, 16,666.66 and 16,666.68. */
    const rows: PayableInstalment[] = [
      { sequence: 1, dueKobo: 1_666_666, paidKobo: 0, status: SCHEDULED },
      { sequence: 2, dueKobo: 1_666_666, paidKobo: 0, status: SCHEDULED },
      { sequence: 3, dueKobo: 1_666_668, paidKobo: 0, status: SCHEDULED },
    ];

    const spill = allocatePayment(rows, 1, N(20_000));
    expect(sharesOf(spill)).toEqual([
      [1, 1_666_666, PAID],
      [2, 333_334, PARTIAL],
    ]);

    const everything = allocatePayment(rows, 1, N(50_000));
    expect(sharesOf(everything)).toEqual([
      [1, 1_666_666, PAID],
      [2, 1_666_666, PAID],
      [3, 1_666_668, PAID],
    ]);

    const over = allocatePayment(rows, 1, N(50_000) + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.maxKobo).toBe(N(50_000));
  });

  it("never loses or invents a kobo, and never starts an instalment before filling the last one", () => {
    const rows = withRows(schedule(7, 33_333.33), {
      2: { status: PAID, paidKobo: N(33_333.33) },
      4: { status: PARTIAL, paidKobo: 1_234_567 },
      5: { status: WAIVED },
    });
    const max = allocatePayment(rows, 1, 1).maxKobo;
    for (const amount of [1, 7, 99, 333_333, 1_234_567, max - 1, max]) {
      const result = allocatePayment(rows, 1, amount);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(sumOf(result.shares.map((s) => s.amountKobo))).toBe(amount);
      /* Only the last share can be a part-fill: everything before it is cleared. */
      for (const share of result.shares.slice(0, -1)) {
        expect(share.status).toBe(PAID);
      }
      expect(result.shares.every((s) => s.amountKobo > 0)).toBe(true);
    }
  });

  it("takes the schedule in any order", () => {
    const shuffled = [...schedule(4)].reverse();
    const result = allocatePayment(shuffled, 1, N(75_000));
    expect(sharesOf(result)).toEqual([
      [1, N(50_000), PAID],
      [2, N(25_000), PARTIAL],
    ]);
  });
});

describe("describeSplit", () => {
  /* ₦50,000 over three: 16,666.66, 16,666.66 and 16,666.68. */
  const kobo3: PayableInstalment[] = [
    { sequence: 1, dueKobo: 1_666_666, paidKobo: 0, status: SCHEDULED },
    { sequence: 2, dueKobo: 1_666_666, paidKobo: 0, status: SCHEDULED },
    { sequence: 3, dueKobo: 1_666_668, paidKobo: 0, status: SCHEDULED },
  ];
  const shares = (amountKobo: number, rows = kobo3, from = 1) => {
    const result = allocatePayment(rows, from, amountKobo);
    if (!result.ok) throw new Error(result.refusal.message);
    return result.shares;
  };

  it("says nothing when it all lands on the instalment chosen", () => {
    expect(describeSplit(shares(N(10_000)))).toBeNull();
    expect(describeSplit(shares(1_666_666))).toBeNull();
  });

  it("says where the excess goes", () => {
    expect(describeSplit(shares(N(20_000)))).toBe(
      "₦16,666.66 clears instalment 1, ₦3,333.34 goes to instalment 2",
    );
  });

  it("says clears for every instalment the payment clears", () => {
    expect(describeSplit(shares(N(50_000)))).toBe(
      "₦16,666.66 clears instalment 1, ₦16,666.66 clears instalment 2, ₦16,666.68 clears instalment 3",
    );
  });

  it("folds the cleared instalments together past three, so it stays a line", () => {
    const rows = schedule(8, 10_000);
    expect(describeSplit(shares(N(45_000), rows))).toBe(
      "₦40,000.00 clears instalments 1 to 4, ₦5,000.00 goes to instalment 5",
    );
    const skipping = withRows(rows, { 3: { status: WAIVED } });
    expect(describeSplit(shares(N(45_000), skipping))).toBe(
      "₦40,000.00 clears instalments 1, 2, 4 and 5, ₦5,000.00 goes to instalment 6",
    );
  });

  it("lists the instalments a payment landed on", () => {
    expect(sharesList(shares(N(20_000)))).toBe("1 and 2");
    expect(sharesList(shares(N(45_000), schedule(8, 10_000)))).toBe("1 to 5");
  });
});
