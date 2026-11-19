import { describe, expect, it } from "vitest";
import type { ApiRepayment, LoanRepaymentStatus } from "@/lib/api/loans";
import { effectiveSchedule } from "@/lib/loans/effective-schedule";

/**
 * The schedule as the loan screen prints it.
 *
 * The case that prompted this is a ₦500,000 loan over seven months: six
 * instalments of ₦71,428.57 and a last of ₦71,428.58. October's payroll could
 * only take ₦50,000 of the first, which left it part paid with ₦21,428.57 owing.
 * Payroll asks for that again in November alongside November's own instalment
 * (`dueRepaymentsForMany`), so the table shows it there: October settled at what
 * was taken, November at ₦92,857.14.
 *
 * Money is integer kobo throughout.
 */

const INSTALMENT = 7_142_857;
const LAST = 7_142_858;
const SHORT = 5_000_000;
const OWING = INSTALMENT - SHORT; // ₦21,428.57

const repaymentOf = (
  sequence: number,
  over: Partial<ApiRepayment> = {},
): ApiRepayment => {
  const amountKobo = over.amountKobo ?? (sequence === 7 ? LAST : INSTALMENT);
  const month = 9 + sequence; // sequence 1 is October 2026
  const year = 2026 + Math.floor((month - 1) / 12);
  const monthNo = ((month - 1) % 12) + 1;
  return {
    id: `r${sequence}`,
    sequence,
    dueDate: `${year}-${String(monthNo).padStart(2, "0")}-01`,
    amountKobo,
    paidAmountKobo: 0,
    remainingKobo: amountKobo,
    status: "SCHEDULED",
    paidAt: null,
    payslipId: null,
    note: null,
    ...over,
  };
};

/** An instalment that payroll took `paid` of in its month. */
const partPaid = (sequence: number, paid: number): ApiRepayment => {
  const amountKobo = sequence === 7 ? LAST : INSTALMENT;
  return repaymentOf(sequence, {
    status: "PARTIAL",
    paidAmountKobo: paid,
    remainingKobo: amountKobo - paid,
    paidAt: "2026-10-25T09:00:00.000Z",
    payslipId: `slip-${sequence}`,
  });
};

const paid = (sequence: number): ApiRepayment => {
  const amountKobo = sequence === 7 ? LAST : INSTALMENT;
  return repaymentOf(sequence, {
    status: "PAID",
    paidAmountKobo: amountKobo,
    remainingKobo: 0,
    paidAt: "2026-10-25T09:00:00.000Z",
    payslipId: `slip-${sequence}`,
  });
};

const waived = (sequence: number): ApiRepayment =>
  repaymentOf(sequence, {
    status: "WAIVED",
    remainingKobo: 0,
    note: "Written off by HR",
  });

const loan = (overrides: Record<number, ApiRepayment> = {}): ApiRepayment[] =>
  [1, 2, 3, 4, 5, 6, 7].map((n) => overrides[n] ?? repaymentOf(n));

const amounts = (rows: ReturnType<typeof effectiveSchedule>) =>
  rows.map((r) => r.amountKobo);

/** Whatever happens to the display, the column adds up to the stored schedule. */
const expectSameTotal = (
  stored: readonly ApiRepayment[],
  rows: ReturnType<typeof effectiveSchedule>,
) => {
  expect(rows.reduce((sum, r) => sum + r.amountKobo, 0)).toBe(
    stored.reduce((sum, r) => sum + r.amountKobo, 0),
  );
};

const NOV = "2026-11-18";

describe("the Kenedy Obasi case", () => {
  const stored = loan({ 1: partPaid(1, SHORT) });
  const rows = effectiveSchedule(stored, NOV);

  it("shows October settled at what was taken", () => {
    expect(rows[0]).toMatchObject({
      amountKobo: SHORT,
      movedOnKobo: OWING,
      movedTo: "2026-11-01",
      carriedInKobo: 0,
      owingKobo: 0,
    });
    expect(rows[0]!.row.status).toBe("PARTIAL");
    expect(rows[0]!.row.paidAmountKobo).toBe(SHORT);
  });

  it("shows November with the shortfall inside it", () => {
    expect(rows[1]).toMatchObject({
      amountKobo: 9_285_714, // ₦92,857.14
      carriedInKobo: OWING, // ₦21,428.57
      carriedFrom: ["2026-10-01"],
      movedOnKobo: 0,
      movedTo: null,
      owingKobo: 9_285_714,
    });
  });

  it("leaves the other months alone", () => {
    expect(amounts(rows).slice(2)).toEqual([
      INSTALMENT,
      INSTALMENT,
      INSTALMENT,
      INSTALMENT,
      LAST,
    ]);
    expect(rows.slice(2).every((r) => r.carriedInKobo === 0)).toBe(true);
    expect(rows.slice(2).every((r) => r.movedOnKobo === 0)).toBe(true);
  });

  it("adds up to the loan's scheduled total, with nothing counted twice", () => {
    expectSameTotal(stored, rows);
    expect(rows.reduce((sum, r) => sum + r.amountKobo, 0)).toBe(50_000_000);
  });

  it("hands the stored row back untouched, for the actions to act on", () => {
    expect(rows[0]!.row).toBe(stored[0]);
    expect(rows[1]!.row).toBe(stored[1]);
  });
});

describe("a part-paid instalment in the current month", () => {
  it("is not folded: its remainder comes off this month's payroll", () => {
    // Paid by hand before payroll ran, or payroll has run and is short this month.
    const stored = loan({ 1: partPaid(1, SHORT) });
    const rows = effectiveSchedule(stored, "2026-10-20");

    expect(rows[0]).toMatchObject({
      amountKobo: INSTALMENT,
      movedOnKobo: 0,
      movedTo: null,
      carriedInKobo: 0,
      owingKobo: OWING,
    });
    expect(rows[1]).toMatchObject({ amountKobo: INSTALMENT, carriedInKobo: 0 });
    expectSameTotal(stored, rows);
  });

  it("is the first open one even when an earlier shortfall is behind it, and takes that in", () => {
    // October left behind; November is part paid by hand and is the current one.
    const stored = loan({
      1: partPaid(1, SHORT),
      2: repaymentOf(2, {
        status: "PARTIAL",
        paidAmountKobo: 1_000_000,
        remainingKobo: INSTALMENT - 1_000_000,
        paidAt: "2026-11-05T09:00:00.000Z",
      }),
    });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[0]).toMatchObject({ amountKobo: SHORT, movedOnKobo: OWING });
    expect(rows[1]).toMatchObject({
      amountKobo: INSTALMENT + OWING,
      carriedInKobo: OWING,
      movedOnKobo: 0,
      owingKobo: INSTALMENT - 1_000_000 + OWING,
    });
    // Its own payment stays on the row.
    expect(rows[1]!.row.paidAmountKobo).toBe(1_000_000);
    expectSameTotal(stored, rows);
  });
});

describe("the same month in the company's day, not the clock's", () => {
  it("treats the first of the month as the current month", () => {
    const stored = loan({ 1: partPaid(1, SHORT) });
    expect(effectiveSchedule(stored, "2026-11-01")[1]!.carriedInKobo).toBe(
      OWING,
    );
    expect(effectiveSchedule(stored, "2026-10-31")[1]!.carriedInKobo).toBe(0);
  });
});

describe("a shortfall with no later instalment to sit beside", () => {
  it("stays visible on the last instalment when it is the part-paid one", () => {
    const stored = loan({
      1: paid(1),
      2: paid(2),
      3: paid(3),
      4: paid(4),
      5: paid(5),
      6: paid(6),
      7: partPaid(7, SHORT),
    });
    const rows = effectiveSchedule(stored, "2027-05-10");

    expect(rows[6]).toMatchObject({
      amountKobo: LAST,
      movedOnKobo: 0,
      movedTo: null,
      owingKobo: LAST - SHORT,
    });
    expectSameTotal(stored, rows);
  });

  it("keeps every shortfall where it is when the whole schedule is behind", () => {
    const stored = loan({
      1: partPaid(1, SHORT),
      2: partPaid(2, SHORT),
      3: paid(3),
      4: paid(4),
      5: paid(5),
      6: paid(6),
      7: paid(7),
    });
    const rows = effectiveSchedule(stored, "2027-06-10");

    expect(rows[0]).toMatchObject({ amountKobo: INSTALMENT, movedOnKobo: 0 });
    expect(rows[1]).toMatchObject({ amountKobo: INSTALMENT, movedOnKobo: 0 });
    expectSameTotal(stored, rows);
  });

  it("does not move it onto a later month when this month has no instalment left", () => {
    // November's instalment is already paid, so the next open row is December's.
    // The current run still takes October's shortfall as a line of its own;
    // putting it on December would show it a month late.
    const stored = loan({ 1: partPaid(1, SHORT), 2: paid(2) });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[0]).toMatchObject({
      amountKobo: INSTALMENT,
      movedOnKobo: 0,
      owingKobo: OWING,
    });
    expect(rows[2]).toMatchObject({ amountKobo: INSTALMENT, carriedInKobo: 0 });
    expectSameTotal(stored, rows);
  });
});

describe("written-off instalments", () => {
  it("contribute nothing and are never the one that picks up a shortfall", () => {
    // November is written off, so the first open instalment is December's. That
    // is not this month, so the shortfall stays on October and the waived row
    // takes nothing.
    const stored = loan({ 1: partPaid(1, SHORT), 2: waived(2) });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[1]).toMatchObject({
      amountKobo: INSTALMENT,
      carriedInKobo: 0,
      movedOnKobo: 0,
      owingKobo: 0,
    });
    expect(rows[2]).toMatchObject({ carriedInKobo: 0 });
    expect(rows[0]).toMatchObject({ movedOnKobo: 0, owingKobo: OWING });
    expectSameTotal(stored, rows);
  });

  it("are skipped over when they sit behind: nothing moves off them", () => {
    const stored = loan({ 1: waived(1), 2: partPaid(2, SHORT) });
    const rows = effectiveSchedule(stored, "2026-12-03");

    expect(rows[0]).toMatchObject({
      amountKobo: INSTALMENT,
      movedOnKobo: 0,
      owingKobo: 0,
    });
    expect(rows[1]).toMatchObject({ amountKobo: SHORT, movedOnKobo: OWING });
    expect(rows[2]).toMatchObject({
      amountKobo: INSTALMENT + OWING,
      carriedFrom: ["2026-11-01"],
    });
    expectSameTotal(stored, rows);
  });
});

describe("a prepayment spilled onto a future instalment", () => {
  it("is not carry: it shows its own remainder and nothing moves", () => {
    // ₦40,000 recorded against December that has not come yet.
    const stored = loan({
      1: paid(1),
      2: paid(2),
      3: repaymentOf(3, {
        status: "PARTIAL",
        paidAmountKobo: 4_000_000,
        remainingKobo: INSTALMENT - 4_000_000,
        paidAt: "2026-11-10T09:00:00.000Z",
      }),
    });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[2]).toMatchObject({
      amountKobo: INSTALMENT,
      carriedInKobo: 0,
      movedOnKobo: 0,
      owingKobo: INSTALMENT - 4_000_000,
    });
    expectSameTotal(stored, rows);
  });

  it("is not a source while the current instalment has a real shortfall behind it", () => {
    const stored = loan({
      1: partPaid(1, SHORT),
      3: repaymentOf(3, {
        status: "PARTIAL",
        paidAmountKobo: 4_000_000,
        remainingKobo: INSTALMENT - 4_000_000,
        paidAt: "2026-11-10T09:00:00.000Z",
      }),
    });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[1]).toMatchObject({ amountKobo: INSTALMENT + OWING });
    expect(rows[2]).toMatchObject({
      amountKobo: INSTALMENT,
      carriedInKobo: 0,
      movedOnKobo: 0,
    });
    expectSameTotal(stored, rows);
  });
});

describe("several months behind", () => {
  it("brings every shortfall onto the current instalment, oldest first", () => {
    const stored = loan({
      1: partPaid(1, SHORT),
      2: partPaid(2, 6_000_000),
    });
    const rows = effectiveSchedule(stored, "2026-12-04");

    expect(rows[0]).toMatchObject({ amountKobo: SHORT, movedTo: "2026-12-01" });
    expect(rows[1]).toMatchObject({
      amountKobo: 6_000_000,
      movedOnKobo: INSTALMENT - 6_000_000,
      movedTo: "2026-12-01",
    });
    const carried = OWING + (INSTALMENT - 6_000_000);
    expect(rows[2]).toMatchObject({
      amountKobo: INSTALMENT + carried,
      carriedInKobo: carried,
      carriedFrom: ["2026-10-01", "2026-11-01"],
    });
    expectSameTotal(stored, rows);
  });

  it("carries an instalment nothing was recovered against, in full", () => {
    // November's payroll took nothing at all, and it is now December.
    const stored = loan({ 1: paid(1) });
    const rows = effectiveSchedule(stored, "2026-12-04");

    expect(rows[1]).toMatchObject({
      amountKobo: 0,
      movedOnKobo: INSTALMENT,
      movedTo: "2026-12-01",
      owingKobo: 0,
    });
    expect(rows[1]!.row.status).toBe("SCHEDULED");
    expect(rows[2]).toMatchObject({
      amountKobo: 2 * INSTALMENT,
      carriedInKobo: INSTALMENT,
      carriedFrom: ["2026-11-01"],
    });
    expectSameTotal(stored, rows);
  });

  it("mixes a short month and a missed one", () => {
    const stored = loan({ 1: partPaid(1, SHORT) });
    // Now it is January: November and December were never run.
    const rows = effectiveSchedule(stored, "2027-01-07");

    expect(rows[3]).toMatchObject({
      amountKobo: INSTALMENT + OWING + 2 * INSTALMENT,
      carriedFrom: ["2026-10-01", "2026-11-01", "2026-12-01"],
    });
    expect(amounts(rows).slice(0, 3)).toEqual([SHORT, 0, 0]);
    expectSameTotal(stored, rows);
  });
});

describe("loans with nothing to move", () => {
  it("returns every stored amount for a loan that has not started", () => {
    const stored = loan();
    const rows = effectiveSchedule(stored, "2026-08-19");

    expect(amounts(rows)).toEqual(stored.map((r) => r.amountKobo));
    expect(
      rows.every((r) => r.carriedInKobo === 0 && r.movedOnKobo === 0),
    ).toBe(true);
  });

  it("returns every stored amount when everything behind is paid", () => {
    const stored = loan({ 1: paid(1), 2: paid(2) });
    const rows = effectiveSchedule(stored, "2026-12-10");

    expect(amounts(rows)).toEqual(stored.map((r) => r.amountKobo));
    expect(rows[2]!.owingKobo).toBe(INSTALMENT);
  });

  it("gives an empty schedule back as an empty list", () => {
    expect(effectiveSchedule([], NOV)).toEqual([]);
  });

  it("does not move anything off a row with nothing left owing, whatever its status", () => {
    const odd: ApiRepayment = repaymentOf(1, {
      status: "PARTIAL" as LoanRepaymentStatus,
      paidAmountKobo: INSTALMENT,
      remainingKobo: 0,
    });
    const stored = loan({ 1: odd });
    const rows = effectiveSchedule(stored, NOV);

    expect(rows[0]).toMatchObject({ amountKobo: INSTALMENT, movedOnKobo: 0 });
    expect(rows[1]).toMatchObject({ carriedInKobo: 0 });
  });
});

describe("the order of the rows", () => {
  it("comes back by due month, however it was handed in", () => {
    const stored = loan({ 1: partPaid(1, SHORT) }).reverse();
    const rows = effectiveSchedule(stored, NOV);

    expect(rows.map((r) => r.row.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows[1]!.carriedInKobo).toBe(OWING);
  });

  it("does not change the schedule it was given", () => {
    const stored = loan({ 1: partPaid(1, SHORT) });
    const before = JSON.stringify(stored);
    effectiveSchedule(stored, NOV);
    expect(JSON.stringify(stored)).toBe(before);
  });
});

describe("a schedule that crosses a year", () => {
  it("compares months, not days or years in isolation", () => {
    // 12-month loan from December: the December instalment is behind in January.
    const rowsIn = [
      repaymentOf(1, {
        dueDate: "2026-12-01",
        status: "PARTIAL",
        paidAmountKobo: SHORT,
        remainingKobo: OWING,
      }),
      repaymentOf(2, { dueDate: "2027-01-01" }),
      repaymentOf(3, { dueDate: "2027-02-01" }),
    ];
    const rows = effectiveSchedule(rowsIn, "2027-01-15");

    expect(rows[0]).toMatchObject({ movedTo: "2027-01-01" });
    expect(rows[1]).toMatchObject({
      amountKobo: INSTALMENT + OWING,
      carriedFrom: ["2026-12-01"],
    });
    expectSameTotal(rowsIn, rows);
  });
});
