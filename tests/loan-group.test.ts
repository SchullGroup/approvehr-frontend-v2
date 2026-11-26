import { describe, expect, it } from "vitest";
import type { ApiLoan, LoanStatus } from "@/lib/api/loans";
import {
  groupLoansByPerson,
  loanFigures,
  loanFinish,
  matchesLoanSearch,
  searchWords,
  sortPeople,
} from "@/lib/loans/group";

/**
 * The loan book, one entry per person.
 *
 * The sums are the part that can quietly mislead, so each rule has its own case:
 * a request is not money lent, only a loan being repaid has anything left to pay
 * or a deduction a month, and a figure with nothing behind it is `null` (printed
 * as "—") and never a zero. Everything is integer kobo.
 */

const N = (naira: number): number => Math.round(naira * 100);

let sequence = 0;

/** A loan, defaulting to an interest-free ₦600,000 over six months being repaid. */
const loan = (over: Partial<ApiLoan> = {}): ApiLoan => {
  sequence += 1;
  return {
    id: `loan-${sequence}`,
    employeeId: "e1",
    employeeName: "Ime Dennis",
    employeeNo: "CRF-001",
    jobTitle: "Site engineer",
    principalKobo: N(600_000),
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: N(600_000),
    termMonths: 6,
    monthlyRepaymentKobo: N(100_000),
    outstandingKobo: N(400_000),
    status: "ACTIVE",
    reason: null,
    startPeriod: "2026-07-01",
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    ...over,
  };
};

const ofStatus = (status: LoanStatus, over: Partial<ApiLoan> = {}): ApiLoan =>
  loan({ status, ...over });

describe("grouping", () => {
  it("makes one entry for each person, not each loan", () => {
    const people = groupLoansByPerson([
      loan({ employeeId: "e1" }),
      loan({ employeeId: "e2", employeeName: "Kelechi Uzor" }),
      loan({ employeeId: "e1" }),
    ]);

    expect(people.map((person) => person.employeeId)).toEqual(["e1", "e2"]);
    expect(people[0]!.count).toBe(2);
    expect(people[0]!.loans).toHaveLength(2);
    expect(people[1]!.count).toBe(1);
  });

  it("groups on the employee id, never on the name", () => {
    const people = groupLoansByPerson([
      loan({ employeeId: "e1", employeeName: "Chinedu Okwu" }),
      loan({ employeeId: "e2", employeeName: "Chinedu Okwu" }),
    ]);

    expect(people).toHaveLength(2);
  });

  it("takes the name, number and title from the person's newest loan", () => {
    const [person] = groupLoansByPerson([
      loan({
        createdAt: "2026-01-01T00:00:00.000Z",
        jobTitle: "Technician",
      }),
      loan({
        createdAt: "2026-09-01T00:00:00.000Z",
        jobTitle: "Foreman",
      }),
    ]);

    expect(person!.jobTitle).toBe("Foreman");
  });

  it("lists a person's loans newest first, and keeps ties in the order sent", () => {
    const old = loan({ createdAt: "2026-01-01T00:00:00.000Z" });
    const first = loan({ createdAt: "2026-05-01T00:00:00.000Z" });
    const second = loan({ createdAt: "2026-05-01T00:00:00.000Z" });
    const newest = loan({ createdAt: "2026-08-01T00:00:00.000Z" });

    const [person] = groupLoansByPerson([old, first, newest, second]);

    expect(person!.loans.map((l) => l.id)).toEqual([
      newest.id,
      first.id,
      second.id,
      old.id,
    ]);
  });

  it("does not reorder what it was given", () => {
    const input = [
      loan({ createdAt: "2026-01-01T00:00:00.000Z" }),
      loan({ createdAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const ids = input.map((l) => l.id);

    groupLoansByPerson(input);

    expect(input.map((l) => l.id)).toEqual(ids);
  });

  it("returns nothing for no loans", () => {
    expect(groupLoansByPerson([])).toEqual([]);
  });
});

describe("a person's figures, in kobo", () => {
  it("adds Borrowed over loans that were lent, leaving out waiting and declined ones", () => {
    const [person] = groupLoansByPerson([
      ofStatus("ACTIVE", { principalKobo: N(500_000.5) }),
      ofStatus("SETTLED", { principalKobo: N(120_000.25) }),
      ofStatus("PENDING", { principalKobo: N(900_000) }),
      ofStatus("DECLINED", { principalKobo: N(2_000_000) }),
    ]);

    expect(person!.figures.borrowedKobo).toBe(N(500_000.5) + N(120_000.25));
  });

  it("adds Left to pay and A month over the loans being repaid only", () => {
    const [person] = groupLoansByPerson([
      ofStatus("ACTIVE", {
        outstandingKobo: N(250_000.1),
        monthlyRepaymentKobo: N(50_000.01),
      }),
      ofStatus("ACTIVE", {
        outstandingKobo: N(71_428.57),
        monthlyRepaymentKobo: N(35_714.29),
      }),
      /* A finished loan owes nothing and takes nothing, whatever its row says. */
      ofStatus("SETTLED", {
        outstandingKobo: 0,
        monthlyRepaymentKobo: N(60_000),
      }),
      /* A request has not been lent: its balance is the whole amount, and it is
         not owed yet. */
      ofStatus("PENDING", {
        outstandingKobo: N(900_000),
        monthlyRepaymentKobo: N(75_000),
      }),
      ofStatus("DECLINED", {
        outstandingKobo: 0,
        monthlyRepaymentKobo: N(500_000),
      }),
    ]);

    expect(person!.figures.leftKobo).toBe(N(250_000.1) + N(71_428.57));
    expect(person!.figures.monthlyKobo).toBe(N(50_000.01) + N(35_714.29));
  });

  it("counts an approved loan as being repaid, since a status must render", () => {
    const [person] = groupLoansByPerson([
      ofStatus("APPROVED", {
        outstandingKobo: N(10_000),
        monthlyRepaymentKobo: N(2_500),
      }),
    ]);

    expect(person!.figures.leftKobo).toBe(N(10_000));
    expect(person!.figures.monthlyKobo).toBe(N(2_500));
  });

  it("is absent, not zero, when nothing is being repaid", () => {
    const [person] = groupLoansByPerson([
      ofStatus("SETTLED", { outstandingKobo: 0 }),
      ofStatus("DECLINED", { outstandingKobo: 0, startPeriod: null }),
    ]);

    expect(person!.figures.leftKobo).toBeNull();
    expect(person!.figures.monthlyKobo).toBeNull();
    /* The settled one was lent, so Borrowed is real. */
    expect(person!.figures.borrowedKobo).toBe(N(600_000));
  });

  it("has no Borrowed when every loan is still a request or was declined", () => {
    const [person] = groupLoansByPerson([
      ofStatus("PENDING", { startPeriod: null }),
      ofStatus("DECLINED", { startPeriod: null }),
    ]);

    expect(person!.figures.borrowedKobo).toBeNull();
    expect(person!.figures.finishes).toBeNull();
  });

  it("finishes at the latest end month, from the start month and the term", () => {
    const [person] = groupLoansByPerson([
      /* Jul 2026 + 6 months: last deduction Dec 2026. */
      ofStatus("ACTIVE", { startPeriod: "2026-07-01", termMonths: 6 }),
      /* Jan 2026 + 3 months: Mar 2026, long since over. */
      ofStatus("SETTLED", { startPeriod: "2026-01-01", termMonths: 3 }),
      /* Oct 2026 + 12 months: Sep 2027, the latest. */
      ofStatus("ACTIVE", { startPeriod: "2026-10-01", termMonths: 12 }),
    ]);

    expect(person!.figures.finishes).toBe("2027-09-01");
  });

  it("takes a mid-month start to the first of its month", () => {
    expect(
      loanFinish(
        ofStatus("ACTIVE", { startPeriod: "2026-11-17", termMonths: 1 }),
      ),
    ).toBe("2026-11-01");
  });

  it("has no finish month for a loan that has not started", () => {
    expect(loanFinish(ofStatus("PENDING", { startPeriod: null }))).toBeNull();
    expect(
      loanFinish(ofStatus("PENDING", { startPeriod: "2026-09-01" })),
    ).toBeNull();
    expect(
      loanFinish(ofStatus("DECLINED", { startPeriod: "2026-09-01" })),
    ).toBeNull();
    expect(loanFinish(ofStatus("ACTIVE", { startPeriod: null }))).toBeNull();
  });

  it("ignores a waiting loan when working out when the rest finishes", () => {
    const [person] = groupLoansByPerson([
      ofStatus("ACTIVE", { startPeriod: "2026-07-01", termMonths: 6 }),
      ofStatus("PENDING", { startPeriod: "2028-01-01", termMonths: 24 }),
    ]);

    expect(person!.figures.finishes).toBe("2026-12-01");
  });
});

describe("a single loan's own figures", () => {
  it("shows a waiting request's amount and monthly cost, but not a balance", () => {
    const figures = loanFigures(
      ofStatus("PENDING", {
        principalKobo: N(250_000),
        outstandingKobo: N(250_000),
        monthlyRepaymentKobo: N(50_000),
        startPeriod: null,
      }),
    );

    expect(figures).toEqual({
      borrowedKobo: N(250_000),
      leftKobo: null,
      monthlyKobo: N(50_000),
      finishes: null,
    });
  });

  it("shows a loan being repaid in full", () => {
    const figures = loanFigures(
      ofStatus("ACTIVE", {
        principalKobo: N(600_000),
        outstandingKobo: N(288_000),
        monthlyRepaymentKobo: N(100_000),
        startPeriod: "2026-04-01",
        termMonths: 6,
      }),
    );

    expect(figures).toEqual({
      borrowedKobo: N(600_000),
      leftKobo: N(288_000),
      monthlyKobo: N(100_000),
      finishes: "2026-09-01",
    });
  });

  it("takes nothing a month for a loan that is repaid or declined", () => {
    expect(
      loanFigures(ofStatus("SETTLED", { outstandingKobo: 0 })),
    ).toMatchObject({ leftKobo: 0, monthlyKobo: null });
    expect(loanFigures(ofStatus("DECLINED"))).toMatchObject({
      leftKobo: null,
      monthlyKobo: null,
    });
  });
});

describe("the status a person's row shows", () => {
  const statusOf = (...statuses: LoanStatus[]) => {
    const [person] = groupLoansByPerson(statuses.map((s) => ofStatus(s)));
    return person!;
  };

  it("counts loans by status", () => {
    expect(statusOf("ACTIVE", "SETTLED", "SETTLED").counts).toEqual({
      PENDING: 0,
      APPROVED: 0,
      ACTIVE: 1,
      SETTLED: 2,
      DECLINED: 0,
      CONSOLIDATED: 0,
      CANCELLED: 0,
    });
  });

  it("puts a loan waiting for a decision first", () => {
    const person = statusOf("ACTIVE", "PENDING", "SETTLED");

    expect(person.headline).toBe("PENDING");
    expect(person.others).toBe(2);
  });

  it("then a loan being repaid", () => {
    const person = statusOf("SETTLED", "ACTIVE", "DECLINED");

    expect(person.headline).toBe("ACTIVE");
    expect(person.others).toBe(2);
  });

  it("then repaid, then declined", () => {
    expect(statusOf("DECLINED", "SETTLED").headline).toBe("SETTLED");
    expect(statusOf("DECLINED", "DECLINED").headline).toBe("DECLINED");
  });

  it("has nothing else to point at when every loan is in the same status", () => {
    expect(statusOf("ACTIVE", "ACTIVE").others).toBe(0);
    expect(statusOf("SETTLED").others).toBe(0);
  });
});

describe("the order people are listed in", () => {
  const person = (
    id: string,
    name: string,
    status: LoanStatus,
    outstanding: number,
  ) =>
    loan({
      employeeId: id,
      employeeName: name,
      status,
      outstandingKobo: N(outstanding),
    });

  it("puts anybody with a loan waiting first, then the biggest balance, then name", () => {
    const people = groupLoansByPerson([
      person("a", "Zainab Musa", "ACTIVE", 100_000),
      person("b", "Ime Dennis", "ACTIVE", 900_000),
      person("c", "Kelechi Uzor", "PENDING", 0),
      person("d", "Amara Obi", "ACTIVE", 100_000),
      person("e", "Solomon Augustine", "SETTLED", 0),
    ]);

    expect(sortPeople(people).map((p) => p.employeeName)).toEqual([
      "Kelechi Uzor",
      "Ime Dennis",
      "Amara Obi",
      "Zainab Musa",
      "Solomon Augustine",
    ]);
  });

  it("puts somebody who owes a few kobo above somebody who owes nothing", () => {
    const people = groupLoansByPerson([
      person("a", "Adaeze", "SETTLED", 0),
      person("b", "Bola", "ACTIVE", 0.01),
    ]);

    expect(sortPeople(people).map((p) => p.employeeName)).toEqual([
      "Bola",
      "Adaeze",
    ]);
  });

  it("does not reorder what it was given", () => {
    const people = groupLoansByPerson([
      person("a", "Zainab", "ACTIVE", 1),
      person("b", "Amara", "ACTIVE", 2),
    ]);

    sortPeople(people);

    expect(people.map((p) => p.employeeName)).toEqual(["Zainab", "Amara"]);
  });
});

describe("search", () => {
  const ime = { employeeName: "Ime Dennis", employeeNo: "CRF-0042" };

  it("matches everybody for an empty or all-space box", () => {
    expect(matchesLoanSearch(ime, "")).toBe(true);
    expect(matchesLoanSearch(ime, "   ")).toBe(true);
    expect(searchWords("  ")).toEqual([]);
  });

  it("matches part of a name, in any case", () => {
    expect(matchesLoanSearch(ime, "ime")).toBe(true);
    expect(matchesLoanSearch(ime, "DENN")).toBe(true);
    expect(matchesLoanSearch(ime, "ola")).toBe(false);
  });

  it("matches the staff number", () => {
    expect(matchesLoanSearch(ime, "crf-0042")).toBe(true);
    expect(matchesLoanSearch(ime, "0042")).toBe(true);
    expect(matchesLoanSearch(ime, "0043")).toBe(false);
  });

  it("needs every word to match, in any order", () => {
    expect(matchesLoanSearch(ime, "dennis ime")).toBe(true);
    expect(matchesLoanSearch(ime, "ime 0042")).toBe(true);
    expect(matchesLoanSearch(ime, "ime ogbonna")).toBe(false);
  });
});

describe("a month, for somebody whose loans run in different months", () => {
  /* ₦25,000 that finishes in November, and ₦30,000 that starts in January. */
  const carried = (over: Partial<ApiLoan> = {}) =>
    loan({
      monthlyRepaymentKobo: N(25_000),
      startPeriod: "2026-10-01",
      termMonths: 2,
      ...over,
    });
  const rent = (over: Partial<ApiLoan> = {}) =>
    loan({
      monthlyRepaymentKobo: N(30_000),
      startPeriod: "2027-01-01",
      termMonths: 10,
      ...over,
    });

  it("is what comes off the next payroll, not the two plans added together", () => {
    const [person] = groupLoansByPerson([carried(), rent()], "2026-11-26");
    expect(person!.figures.monthlyKobo).toBe(N(25_000));
    expect(person!.figures.monthlyFor).toBe("2026-11-01");
    expect(person!.figures.finishes).toBe("2027-10-01");
  });

  it("moves on to the later loan once the earlier one is done", () => {
    const [person] = groupLoansByPerson(
      [carried({ status: "SETTLED" }), rent()],
      "2026-12-15",
    );
    expect(person!.figures.monthlyKobo).toBe(N(30_000));
  });

  it("adds loans that run the same months, and says nothing about a month", () => {
    const [both] = groupLoansByPerson(
      [
        loan({
          monthlyRepaymentKobo: N(10_000),
          startPeriod: "2026-09-01",
          termMonths: 6,
        }),
        loan({
          monthlyRepaymentKobo: N(5_000),
          startPeriod: "2026-09-01",
          termMonths: 6,
        }),
      ],
      "2026-11-26",
    );
    expect(both!.figures.monthlyKobo).toBe(N(15_000));
    expect(both!.figures.monthlyFor).toBeNull();
  });

  it("adds what comes off this month when one finishes sooner, and names the month", () => {
    const [both] = groupLoansByPerson(
      [
        loan({
          monthlyRepaymentKobo: N(10_000),
          startPeriod: "2026-09-01",
          termMonths: 3,
        }),
        loan({
          monthlyRepaymentKobo: N(5_000),
          startPeriod: "2026-09-01",
          termMonths: 6,
        }),
      ],
      "2026-11-26",
    );
    expect(both!.figures.monthlyKobo).toBe(N(15_000));
    expect(both!.figures.monthlyFor).toBe("2026-11-01");
  });

  it("is the one loan's own figure for a person with one loan", () => {
    const [only] = groupLoansByPerson([rent()], "2026-11-26");
    expect(only!.figures.monthlyKobo).toBe(N(30_000));
    expect(only!.figures.monthlyFor).toBeNull();
  });
});
