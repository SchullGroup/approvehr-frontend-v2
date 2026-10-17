import { describe, expect, it } from "vitest";
import {
  acceptedNotice,
  createEmployeeLines,
  whatAcceptingDoes,
  whyNoEmployee,
} from "@/lib/hiring/hired/copy";
import type { HiredPerson } from "@/lib/hiring/hired/model";

/**
 * Accepting an offer used to create the employee record in the same breath. It now
 * puts the person on the Hired list, and an employee is made only when somebody asks
 * or the company's setting says so. Every place that records an acceptance says in one
 * plain sentence which of those is true, and **none of them claims an employee or an
 * email was created before the API has said so**.
 */

const person = (over: Partial<HiredPerson> = {}): HiredPerson => ({
  id: "h-1",
  applicationId: "pa-1",
  reference: "APP-J7ET3745",
  name: "Chioma Aduba",
  email: "chioma@example.com",
  phone: null,
  requisitionId: "req-1",
  role: "Payroll Analyst",
  requisitionReference: "FIN-032",
  department: "Finance",
  source: null,
  acceptedAt: "2026-10-10T09:00:00.000Z",
  startDate: "2026-11-02",
  state: "HIRED",
  employee: null,
  employeeVia: null,
  didNotJoin: null,
  createEmployee: { allowed: true },
  ...over,
});

describe("what recording an acceptance does, before it is pressed", () => {
  it("puts them on the Hired list and makes nobody an employee by default, when the company has Core HR", () => {
    const words = whatAcceptingDoes({
      setting: "HIRED_LIST_ONLY",
      coreHr: true,
    });
    expect(words.headline).toBe(
      "They are added to the Hired list. No employee record is created yet.",
    );
    expect(words.detail).toMatch(/Create it from the Hired list/);
    expect(words.makesEmployee).toBe(false);
  });

  it("says the Hired list is where they stay when the company has no Core HR", () => {
    const words = whatAcceptingDoes({
      setting: "HIRED_LIST_ONLY",
      coreHr: false,
    });
    expect(words.headline).toMatch(/No employee record is created yet/);
    expect(words.detail).toMatch(/does not use Core HR/);
    expect(words.detail).toMatch(/export/);
    expect(words.makesEmployee).toBe(false);
  });

  it("says the record is made now, as it always was, when the company kept the old behaviour", () => {
    const words = whatAcceptingDoes({
      setting: "CREATE_EMPLOYEE",
      coreHr: true,
    });
    expect(words.headline).toBe(
      "They are added to the Hired list and their employee record is created now.",
    );
    expect(words.detail).toMatch(/before the Hired list/);
    expect(words.makesEmployee).toBe(true);
  });

  it("does not promise a record the company cannot have, whatever the setting says", () => {
    const words = whatAcceptingDoes({
      setting: "CREATE_EMPLOYEE",
      coreHr: false,
    });
    expect(words.headline).toMatch(/No employee record is created/);
    expect(words.headline).toMatch(/does not use Core HR/);
    expect(words.makesEmployee).toBe(false);
  });

  it("claims only what is true either way while the setting has not been read", () => {
    for (const unknown of [
      { setting: null, coreHr: null },
      { setting: "CREATE_EMPLOYEE" as const, coreHr: null },
      { setting: null, coreHr: true },
    ]) {
      const words = whatAcceptingDoes(unknown);
      expect(words.headline).toBe("They are added to the Hired list.");
      expect(words.headline).not.toMatch(/employee record is created/);
      expect(words.detail).toMatch(/Hiring settings/);
    }
  });

  it("never uses an exclamation mark", () => {
    for (const setting of ["HIRED_LIST_ONLY", "CREATE_EMPLOYEE", null] as const)
      for (const coreHr of [true, false, null]) {
        const words = whatAcceptingDoes({ setting, coreHr });
        expect(`${words.headline} ${words.detail ?? ""}`).not.toMatch(/!/);
      }
  });
});

describe("the line shown after an acceptance was recorded", () => {
  it("claims an employee record only when the API's answer carries one", () => {
    const made = acceptedNotice("Chioma Aduba", {
      employeeId: "emp-1",
      rejectedOthers: 0,
    });
    expect(made).toMatch(/their employee record was created/);

    const none = acceptedNotice("Chioma Aduba", {
      employeeId: null,
      rejectedOthers: 0,
    });
    expect(none).toBe(
      "Chioma Aduba is on the Hired list. No employee record was created.",
    );
    expect(none).not.toMatch(/their employee record was created/);
  });

  it("says which hire this was when the role still has room", () => {
    expect(
      acceptedNotice("Chioma Aduba", {
        employeeId: null,
        rejectedOthers: 0,
        hiresSoFar: 1,
        headcount: 3,
        requisitionFilled: false,
      }),
    ).toMatch(/That is hire 1 of 3 for this role, so it is still open/);
  });

  it("says the role is filled, and how many others were rejected, when the last hire closes it", () => {
    expect(
      acceptedNotice("Chioma Aduba", {
        employeeId: null,
        rejectedOthers: 4,
        hiresSoFar: 3,
        headcount: 3,
        requisitionFilled: true,
      }),
    ).toMatch(
      /4 other candidates still in this pipeline were automatically rejected/,
    );
    expect(
      acceptedNotice("Chioma Aduba", { employeeId: null, rejectedOthers: 1 }),
    ).toMatch(/1 other candidate still in this pipeline was automatically/);
  });
});

describe("what Create employee says it will do", () => {
  it("uses the API's own description word for word when it gives one", () => {
    const lines = createEmployeeLines(
      person({
        createEmployee: {
          allowed: true,
          description: "Makes a probationary employee in Finance.",
        },
      }),
    );
    expect(lines).toEqual(["Makes a probationary employee in Finance."]);
  });

  it("otherwise says what is made, that onboarding starts, and that it sends no email of its own", () => {
    const lines = createEmployeeLines(person()).join(" ");
    expect(lines).toMatch(/An employee record is created for Chioma Aduba/);
    expect(lines).toMatch(/starting 2 Nov 2026/);
    expect(lines).toMatch(/Onboarding starts/);
    expect(lines).toMatch(/sends no email of its own/);
  });
});

describe("why Create employee is not on offer", () => {
  it("is absent for a company without Core HR, with the reason", () => {
    expect(whyNoEmployee(person(), false)).toMatch(/does not use Core HR/);
  });

  it("says already an employee, and did not join, before anything else", () => {
    expect(whyNoEmployee(person({ state: "EMPLOYEE_CREATED" }), true)).toBe(
      "Already an employee.",
    );
    expect(whyNoEmployee(person({ state: "DID_NOT_JOIN" }), true)).toBe(
      "They did not join.",
    );
  });

  it("passes the API's own reason through, and is empty when it would work", () => {
    expect(
      whyNoEmployee(
        person({
          createEmployee: {
            allowed: false,
            reason: "FIN-032 already has all 1 of its people as employees.",
          },
        }),
        true,
      ),
    ).toBe("FIN-032 already has all 1 of its people as employees.");
    expect(whyNoEmployee(person(), true)).toBeNull();
  });
});
