import { describe, expect, it } from "vitest";
import {
  MAX_TOPICAL,
  OPEN_ENDED,
  OPENERS,
  openersFor,
  seesAllLeave,
  standingFrom,
  type Standing,
} from "@/lib/assistant-openers";
import { PERMISSION_KEYS } from "@/lib/permission-keys";
import type { PermissionKey, PermissionSet } from "@/lib/permissions";

/**
 * The questions the Assistant page offers as buttons.
 *
 * The rule is that a button only asks what this person's lookups can answer, and
 * the cases here are the people the API's seed creates, by what each holds. Two
 * of them are the people the first permission-aware version got wrong: a line
 * manager was offered two questions about their team's leave that the lookup behind
 * them cannot answer for a manager, and the payroll roles were offered no payroll
 * question because it sat inside the `EDIT_RECORDS` branch.
 */

const holding = (...keys: PermissionKey[]): PermissionSet =>
  new Set<PermissionKey>(keys);

/** What `prisma/seed.ts` in the API gives each role. */
const SEEDED = {
  employee: holding(),
  lineManager: holding("APPROVE_LEAVE", "MANAGE_HIRING"),
  hrManager: holding(
    "VIEW_SALARIES",
    "EDIT_RECORDS",
    "APPROVE_LEAVE_ALL",
    "MANAGE_HIRING",
    "EXPORT_DATA",
  ),
  payrollAnalyst: holding("VIEW_SALARIES", "RUN_PAYROLL", "EXPORT_DATA"),
  financeApprover: holding(
    "VIEW_SALARIES",
    "APPROVE_PAYROLL",
    "APPROVE_LOANS",
    "APPROVE_EXPENSES",
    "APPROVE_HIRING",
  ),
  administrator: holding(...PERMISSION_KEYS),
};

const asked = (permissions: PermissionSet) =>
  openersFor(standingFrom(permissions));

const FOR_AN_EMPLOYEE = [
  "What was my last net pay?",
  "What leave have I asked for?",
  "Which review periods are running?",
  OPEN_ENDED,
];

const FOR_THE_COMPANY = [
  "How many people have no bank account?",
  "Whose leave requests are still waiting?",
  "Is anyone missing something before payday?",
  OPEN_ENDED,
];

const FOR_PAYROLL = [
  "Is anyone missing something before payday?",
  "What did we pay last month?",
  "What was my last net pay?",
  OPEN_ENDED,
];

describe("the questions each kind of person is offered", () => {
  it("gives an employee their own pay, their own leave and the review periods", () => {
    expect(asked(SEEDED.employee).questions).toEqual(FOR_AN_EMPLOYEE);
  });

  it("gives a line manager what an employee gets, because nothing the assistant can look up covers their team", () => {
    expect(asked(SEEDED.lineManager).questions).toEqual(FOR_AN_EMPLOYEE);
    expect(asked(SEEDED.lineManager).intro).toBe(asked(SEEDED.employee).intro);
  });

  it("never offers a line manager a question about their team's leave", () => {
    const text = asked(SEEDED.lineManager).questions.join(" | ");
    expect(text).not.toMatch(/waiting for me/i);
    expect(text).not.toMatch(/my team/i);
  });

  it("gives the HR manager and the administrator the company's questions", () => {
    expect(asked(SEEDED.hrManager).questions).toEqual(FOR_THE_COMPANY);
    expect(asked(SEEDED.administrator).questions).toEqual(FOR_THE_COMPANY);
  });

  it("gives the payroll roles a payroll question, though they cannot edit records", () => {
    expect(asked(SEEDED.payrollAnalyst).questions).toEqual(FOR_PAYROLL);
    expect(asked(SEEDED.financeApprover).questions).toEqual(FOR_PAYROLL);
  });

  it("offers somebody who edits records but cannot see salaries nothing about payroll", () => {
    const { questions, intro } = asked(holding("EDIT_RECORDS"));
    expect(questions).toEqual([
      "How many people have no bank account?",
      "Whose leave requests are still waiting?",
      "What was my last net pay?",
      OPEN_ENDED,
    ]);
    expect(intro).not.toMatch(/payroll|deduct/i);
  });

  it("gives a company-wide leave approver the waiting requests and not 'my' leave", () => {
    const { questions } = asked(holding("APPROVE_LEAVE_ALL"));
    expect(questions).toEqual([
      "Whose leave requests are still waiting?",
      "What was my last net pay?",
      "Which review periods are running?",
      OPEN_ENDED,
    ]);
    expect(questions).not.toContain("What leave have I asked for?");
  });
});

describe("the sentence above the buttons", () => {
  it("is the employee's sentence, word for word, for an employee", () => {
    expect(asked(SEEDED.employee).intro).toBe(
      "Ask about your own pay, your leave, or the review periods.",
    );
  });

  it("does not promise payroll to somebody who is not offered any", () => {
    expect(asked(SEEDED.employee).intro).not.toMatch(/payroll/i);
    expect(asked(SEEDED.lineManager).intro).not.toMatch(/payroll/i);
    expect(asked(holding("EDIT_RECORDS")).intro).not.toMatch(/payroll/i);
  });

  it("mentions payroll to somebody who is offered it", () => {
    expect(asked(SEEDED.hrManager).intro).toBe(
      "Ask about your people, your leave, or your payroll runs.",
    );
    expect(asked(SEEDED.payrollAnalyst).intro).toBe(
      "Ask about your payroll runs or your own pay.",
    );
  });
});

describe("standing", () => {
  it("is read from the three permissions the lookups care about", () => {
    expect(standingFrom(holding("EDIT_RECORDS"))).toEqual({
      editsRecords: true,
      viewsSalaries: false,
      approvesAllLeave: false,
    });
    expect(standingFrom(holding("VIEW_SALARIES"))).toEqual({
      editsRecords: false,
      viewsSalaries: true,
      approvesAllLeave: false,
    });
    expect(standingFrom(holding("APPROVE_LEAVE_ALL"))).toEqual({
      editsRecords: false,
      viewsSalaries: false,
      approvesAllLeave: true,
    });
  });

  it("does not count APPROVE_LEAVE, which reaches one report's request and lists nobody", () => {
    expect(standingFrom(holding("APPROVE_LEAVE"))).toEqual({
      editsRecords: false,
      viewsSalaries: false,
      approvesAllLeave: false,
    });
    expect(seesAllLeave(standingFrom(holding("APPROVE_LEAVE")))).toBe(false);
  });
});

/** Every combination of the three things a standing is made of. */
const EVERY_STANDING: Standing[] = [false, true].flatMap((editsRecords) =>
  [false, true].flatMap((viewsSalaries) =>
    [false, true].map((approvesAllLeave) => ({
      editsRecords,
      viewsSalaries,
      approvesAllLeave,
    })),
  ),
);

describe.each(EVERY_STANDING)("for the standing %o", (who) => {
  const { questions, intro } = openersFor(who);

  it("shows a few questions and then the open-ended one, each once", () => {
    expect(questions).toHaveLength(MAX_TOPICAL + 1);
    expect(questions.at(-1)).toBe(OPEN_ENDED);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("offers nothing that is not in the catalogue for this person", () => {
    const offered = OPENERS.filter((opener) => opener.offeredTo(who)).map(
      (opener) => opener.ask,
    );
    for (const question of questions.slice(0, -1)) {
      expect(offered).toContain(question);
    }
  });

  it("never mixes everybody's leave with 'mine'", () => {
    for (const opener of OPENERS.filter((o) => o.offeredTo(who))) {
      if (opener.leave === "all") expect(seesAllLeave(who)).toBe(true);
      if (opener.leave === "own") expect(seesAllLeave(who)).toBe(false);
    }
  });

  it("says every topic of every button it shows, and ends in a full stop", () => {
    const shown = OPENERS.filter((o) => questions.includes(o.ask));
    for (const opener of shown) {
      for (const topic of opener.topics) expect(intro).toContain(topic);
    }
    expect(intro).toMatch(/^Ask about .+\.$/);
  });
});
