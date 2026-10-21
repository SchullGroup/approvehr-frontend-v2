import { describe, expect, it } from "vitest";
import type {
  LineSummaryByEmployee,
  Payslip,
  PayslipLine,
  RunException,
} from "@/lib/api/payroll";
import {
  DEFAULT_REVIEW_VIEW,
  adjustmentsOf,
  bonusOn,
  deductionLabels,
  deductionTotal,
  hasManualOvertime,
  hourlyFor,
  manualOvertimeHours,
  monthlyOf,
  nairaToKobo,
  visiblePayslips,
  warningsByPerson,
  type ReviewView,
} from "../src/app/(app)/payroll/runs/new/review-model";

/**
 * What the Review step decides about a payslip, asserted without a browser.
 *
 * None of this is a payslip figure: the engine owns those. These are decisions
 * about figures the API already sent (which ones somebody typed, who a filter
 * keeps, what order a sort puts them in), and each one is the kind of rule that
 * reads as obviously right and is wrong at one boundary:
 *
 * - a person with **no** hand-entered figure must not be counted as adjusted;
 * - **absent is not none**: until the line summary has been read, a deduction
 *   somebody typed is unknown, not nil;
 * - a sort on a figure some people do not have must not mix "no figure" in as
 *   though it were a zero.
 */

let n = 0;
function line(
  kind: PayslipLine["kind"],
  label: string,
  amountKobo: number,
): PayslipLine {
  n += 1;
  return { id: `l-${String(n)}`, kind, label, amountKobo, taxable: true };
}

/** A payslip with only what these rules read. Every other field is the engine's. */
function slip(over: Partial<Payslip> & { id: string; name: string }): Payslip {
  return {
    employeeId: `emp-${over.id}`,
    employeeNo: `AHR-${over.id}`,
    grossKobo: 100_000_00,
    pensionEmployeeKobo: 8_000_00,
    nhfKobo: 0,
    otherDeductionsKobo: 0,
    payeKobo: 10_000_00,
    payeOverridden: false,
    netKobo: 82_000_00,
    unpaidDays: 0,
    lines: [],
    ...over,
  } as Payslip;
}

const ADA = slip({ id: "01", name: "Ada Obi" });
const BOLA = slip({
  id: "02",
  name: "Bola Ade",
  netKobo: 70_000_00,
  grossKobo: 90_000_00,
  lines: [line("EARNING", "Bonus. Lagos install", 20_000_00)],
});
const CHIDI = slip({
  id: "03",
  name: "Chidi Eze",
  netKobo: 95_000_00,
  payeOverridden: true,
  lines: [
    line("EARNING", "Overtime, entered by hand (6.00h at 1.5x)", 5_000_00),
  ],
});
const ALL = [ADA, BOLA, CHIDI];

const NO_WARNINGS = new Map<string, RunException[]>();

describe("what counts as entered by hand", () => {
  it("counts nobody who has not had a figure typed in", () => {
    expect(adjustmentsOf(ADA, null)).toEqual([]);
  });

  it("finds a bonus, hand-entered overtime and a hand-entered PAYE", () => {
    expect(adjustmentsOf(BOLA, null)).toEqual(["bonus"]);
    expect(adjustmentsOf(CHIDI, null)).toEqual(["overtime", "paye"]);
  });

  it("does not take clocked overtime for overtime somebody typed", () => {
    const clocked = slip({
      id: "04",
      name: "Dayo K",
      lines: [line("EARNING", "Overtime (weekday)", 3_000_00)],
    });
    expect(hasManualOvertime(clocked)).toBe(false);
    expect(adjustmentsOf(clocked, null)).toEqual([]);
  });

  it("finds a statutory deduction set by hand", () => {
    const edited = slip({
      id: "05",
      name: "Efe L",
      overriddenDeductions: ["PENSION_EMPLOYEE"],
    });
    expect(adjustmentsOf(edited, null)).toEqual(["statutory"]);
  });

  it("reads deductions typed by hand only from the line summary, and not before it is known", () => {
    const summary: LineSummaryByEmployee = {
      [ADA.employeeId]: { state: "one", amountKobo: 5_000_00, reason: "Loan" },
      [BOLA.employeeId]: { state: "none" },
    };
    expect(adjustmentsOf(ADA, summary)).toEqual(["deductions"]);
    expect(adjustmentsOf(BOLA, summary)).toEqual(["bonus"]);
    /* Null is not "nobody": without the summary the same person simply is not
       counted, and the screen says the count may be short. */
    expect(adjustmentsOf(ADA, null)).toEqual([]);
  });

  it("does not call a zero bonus an adjustment", () => {
    const zero = slip({
      id: "06",
      name: "Femi R",
      lines: [line("EARNING", "Bonus", 0)],
    });
    expect(adjustmentsOf(zero, null)).toEqual([]);
  });
});

describe("reading the figures behind a label", () => {
  it("finds a bonus with and without a reason", () => {
    expect(bonusOn(BOLA)).toEqual({
      amountKobo: 20_000_00,
      reason: "Lagos install",
    });
    const bare = slip({
      id: "07",
      name: "Gozie T",
      lines: [line("EARNING", "Bonus", 1_000_00)],
    });
    expect(bonusOn(bare)).toEqual({ amountKobo: 1_000_00, reason: "" });
    expect(bonusOn(ADA)).toBeNull();
  });

  it("reads the hours back out of the label, and fails to null rather than to a guess", () => {
    expect(manualOvertimeHours(CHIDI)).toBe(6);
    const garbled = slip({
      id: "08",
      name: "Hauwa M",
      lines: [line("EARNING", "Overtime, entered by hand", 1_000_00)],
    });
    expect(hasManualOvertime(garbled)).toBe(true);
    expect(manualOvertimeHours(garbled)).toBeNull();
    expect(manualOvertimeHours(ADA)).toBeNull();
  });
});

describe("the deductions total", () => {
  it("is pension, housing fund and the rest, and is never employer pension", () => {
    const s = slip({
      id: "09",
      name: "Ife O",
      pensionEmployeeKobo: 8_000_00,
      nhfKobo: 2_500_00,
      otherDeductionsKobo: 4_000_00,
      pensionEmployerKobo: 10_000_00,
    });
    expect(deductionTotal(s)).toBe(14_500_00);
  });

  it("leaves out a deduction this payroll did not operate", () => {
    const s = slip({
      id: "10",
      name: "Jide P",
      pensionEmployeeKobo: 8_000_00,
      nhfKobo: 2_500_00,
      operates: { paye: "DEDUCTED", pension: "NOT_OPERATED", nhf: "DEDUCTED" },
    });
    expect(deductionTotal(s)).toBe(2_500_00);
    expect(deductionLabels(s)).toEqual(["Housing fund"]);
  });

  it("does not name a deduction that came to nothing", () => {
    const s = slip({
      id: "13",
      name: "Mide V",
      pensionEmployeeKobo: 8_000_00,
      nhfKobo: 0,
    });
    expect(deductionLabels(s)).toEqual(["Pension"]);
  });

  it("names the one other deduction by its own label, and several as Other", () => {
    const one = slip({
      id: "11",
      name: "Kemi S",
      otherDeductionsKobo: 4_000_00,
      lines: [line("DEDUCTION", "Staff loan", 4_000_00)],
    });
    expect(deductionLabels(one)).toEqual(["Pension", "Staff loan"]);
    const many = slip({
      id: "12",
      name: "Lola U",
      otherDeductionsKobo: 6_000_00,
      lines: [
        line("DEDUCTION", "Staff loan", 4_000_00),
        line("DEDUCTION", "Union dues", 2_000_00),
      ],
    });
    expect(deductionLabels(many)).toEqual(["Pension", "Other"]);
  });
});

describe("who the toolbar shows", () => {
  const view = (over: Partial<ReviewView>): ReviewView => ({
    ...DEFAULT_REVIEW_VIEW,
    ...over,
  });
  const names = (list: Payslip[]) => list.map((s) => s.name);

  it("shows everybody, in the run's own order, by default", () => {
    expect(
      names(visiblePayslips(ALL, DEFAULT_REVIEW_VIEW, null, NO_WARNINGS)),
    ).toEqual(["Ada Obi", "Bola Ade", "Chidi Eze"]);
  });

  it("filters to people with something typed in, and only them", () => {
    expect(
      names(
        visiblePayslips(ALL, view({ filter: "adjusted" }), null, NO_WARNINGS),
      ),
    ).toEqual(["Bola Ade", "Chidi Eze"]);
  });

  it("filters to people an exception names", () => {
    const warnings = warningsByPerson([
      {
        id: "x1",
        employeeId: ADA.employeeId,
        severity: "WARNING",
        code: "missing_pension_pin",
        message: "No pension PIN.",
      },
      {
        id: "x2",
        employeeId: null,
        severity: "WARNING",
        code: "period_not_finished",
        message: "Two days to come.",
      },
    ]);
    /* A run-wide exception names nobody, so it belongs to no row. */
    expect([...warnings.keys()]).toEqual([ADA.employeeId]);
    expect(
      names(visiblePayslips(ALL, view({ filter: "warnings" }), null, warnings)),
    ).toEqual(["Ada Obi"]);
  });

  it("searches by name and by staff number, ignoring case and padding", () => {
    expect(
      names(
        visiblePayslips(ALL, view({ query: "  BOLA " }), null, NO_WARNINGS),
      ),
    ).toEqual(["Bola Ade"]);
    expect(
      names(visiblePayslips(ALL, view({ query: "ahr-03" }), null, NO_WARNINGS)),
    ).toEqual(["Chidi Eze"]);
  });

  it("combines a search with a filter", () => {
    expect(
      visiblePayslips(
        ALL,
        view({ filter: "adjusted", query: "ada" }),
        null,
        NO_WARNINGS,
      ),
    ).toHaveLength(0);
  });

  it("sorts by net pay both ways, and does not change the list it was given", () => {
    const before = [...ALL];
    expect(
      names(
        visiblePayslips(
          ALL,
          view({ sort: { column: "net", order: "desc" } }),
          null,
          NO_WARNINGS,
        ),
      ),
    ).toEqual(["Chidi Eze", "Ada Obi", "Bola Ade"]);
    expect(
      names(
        visiblePayslips(
          ALL,
          view({ sort: { column: "net", order: "asc" } }),
          null,
          NO_WARNINGS,
        ),
      ),
    ).toEqual(["Bola Ade", "Ada Obi", "Chidi Eze"]);
    expect(ALL).toEqual(before);
  });

  it("breaks a tie on staff number, so two equal figures never swap between renders", () => {
    const a = slip({ id: "21", name: "Zed A", netKobo: 50_000_00 });
    const b = slip({ id: "20", name: "Zed B", netKobo: 50_000_00 });
    expect(
      names(
        visiblePayslips(
          [a, b],
          view({ sort: { column: "net", order: "desc" } }),
          null,
          NO_WARNINGS,
        ),
      ),
    ).toEqual(["Zed B", "Zed A"]);
  });

  it("puts a payroll with no PAYE below every real figure, so highest first means highest", () => {
    const withTax = slip({ id: "30", name: "Has Tax", payeKobo: 1_00 });
    const noTax = slip({
      id: "31",
      name: "No Tax",
      payeKobo: 0,
      operates: { paye: "NOT_OPERATED", pension: "DEDUCTED", nhf: "DEDUCTED" },
    });
    expect(
      names(
        visiblePayslips(
          [noTax, withTax],
          view({ sort: { column: "paye", order: "desc" } }),
          null,
          NO_WARNINGS,
        ),
      ),
    ).toEqual(["Has Tax", "No Tax"]);
  });

  it("sorts names alphabetically", () => {
    expect(
      names(
        visiblePayslips(
          [CHIDI, ADA, BOLA],
          view({ sort: { column: "name", order: "asc" } }),
          null,
          NO_WARNINGS,
        ),
      ),
    ).toEqual(["Ada Obi", "Bola Ade", "Chidi Eze"]);
  });
});

describe("the overtime working", () => {
  it("prices an hour on the calendar-day basis: monthly x 12 / 365 / hours a day", () => {
    /* The figure from the payslip workbook this was built against: ₦400,000 a
       month is ₦1,643.84 an hour on an eight-hour day. */
    expect(hourlyFor(400_000_00, 8, 22, "CALENDAR_DAYS")).toBe(164_384);
  });

  it("prices an hour on the working-days basis: monthly / working days / hours a day", () => {
    expect(hourlyFor(400_000_00, 8, 20, "WORKING_DAYS")).toBe(250_000);
  });

  it("never divides by zero", () => {
    expect(hourlyFor(100_00, 0, 0, "WORKING_DAYS")).toBe(100_00);
  });

  it("reads a contract from the directory in naira and returns kobo, or 0 when there is none", () => {
    expect(
      monthlyOf(ADA, [{ id: ADA.employeeId, grossMonthly: 400_000 }]),
    ).toBe(400_000_00);
    expect(monthlyOf(ADA, [{ id: ADA.employeeId, grossMonthly: null }])).toBe(
      0,
    );
    expect(monthlyOf(ADA, [])).toBe(0);
  });
});

describe("a figure typed in naira", () => {
  it("becomes integer kobo without a float error", () => {
    expect(nairaToKobo("12.34")).toBe(1234);
    expect(nairaToKobo("0")).toBe(0);
    expect(nairaToKobo(" 310830 ")).toBe(310_830_00);
  });

  it("is refused when it is not a figure, or is negative", () => {
    expect(nairaToKobo("")).toBeNull();
    expect(nairaToKobo("abc")).toBeNull();
    expect(nairaToKobo("-5")).toBeNull();
  });
});
