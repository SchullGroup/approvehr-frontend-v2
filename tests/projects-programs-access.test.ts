import { describe, expect, it } from "vitest";
import {
  accessFor,
  canCreateProgram,
  canCreateProjectIn,
  canManageProgram,
  programAccessFor,
  type Actor,
  type ProgramFacts,
} from "@/lib/projects/access";

/**
 * The one access rule, as a table. It mirrors the API's `accessFor`
 * ("Backend as built", section 2 of `docs/specs/projects-hierarchy.md`): the
 * highest level any reason gives, and nothing a lower reason takes back.
 *
 * Every row of the API's table is a case here, so a change to the rule on either
 * side shows up as a failing line with a person's name on it.
 */

const actor = (
  over: Partial<Actor> & { employeeId: string | null },
): Actor => ({
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
  ...over,
});

const program: ProgramFacts = {
  leadId: "lead",
  levels: { reader: "READ", writer: "WRITE", both: "READ" },
};

const inProgram = { leadId: "plead", memberIds: ["plead", "member"] };

describe("what a person may do in a project of a program", () => {
  const cases: [string, Actor, "NONE" | "READ" | "WRITE" | "MANAGE"][] = [
    ["the project lead", actor({ employeeId: "plead" }), "MANAGE"],
    [
      "the program lead, who is on no project",
      actor({ employeeId: "lead" }),
      "MANAGE",
    ],
    [
      "HR (edit records)",
      actor({ employeeId: "hr", editRecords: true }),
      "MANAGE",
    ],
    ["a project member", actor({ employeeId: "member" }), "WRITE"],
    [
      "program access: read and write",
      actor({ employeeId: "writer" }),
      "WRITE",
    ],
    ["program access: read", actor({ employeeId: "reader" }), "READ"],
    [
      "the Master grant alone",
      actor({ employeeId: "coo", seesAll: true }),
      "READ",
    ],
    ["somebody with nothing", actor({ employeeId: "outsider" }), "NONE"],
    ["a sign-in with no staff record", actor({ employeeId: null }), "NONE"],
  ];
  it.each(cases)("%s", (_who, who, expected) => {
    expect(accessFor(who, inProgram, program)).toBe(expected);
  });

  it("takes the highest reason: a member who also has program read is still a writer", () => {
    const both = actor({ employeeId: "both" });
    expect(
      accessFor(both, { ...inProgram, memberIds: ["both"] }, program),
    ).toBe("WRITE");
  });

  it("does not let the Master grant lower anybody", () => {
    const lead = actor({ employeeId: "plead", seesAll: true });
    expect(accessFor(lead, inProgram, program)).toBe("MANAGE");
  });

  it("never gives a program's access to a project outside it", () => {
    const outside = { leadId: "x", memberIds: ["x"] };
    expect(accessFor(actor({ employeeId: "writer" }), outside, null)).toBe(
      "NONE",
    );
    expect(accessFor(actor({ employeeId: "lead" }), outside, null)).toBe(
      "NONE",
    );
  });

  it("gives a department link no access: only the list and the roles count", () => {
    /* A program carries `departmentId` in the API; the rule above never reads it. */
    const linked: ProgramFacts = { leadId: "lead", levels: {} };
    expect(accessFor(actor({ employeeId: "anybody" }), inProgram, linked)).toBe(
      "NONE",
    );
  });
});

describe("what a person has in the program itself", () => {
  it.each([
    ["the lead", actor({ employeeId: "lead" }), "MANAGE"],
    ["HR", actor({ employeeId: "hr", editRecords: true }), "MANAGE"],
    ["read and write", actor({ employeeId: "writer" }), "WRITE"],
    ["read", actor({ employeeId: "reader" }), "READ"],
    ["the Master grant", actor({ employeeId: "coo", seesAll: true }), "READ"],
    ["a project member only", actor({ employeeId: "member" }), null],
  ] as const)("%s", (_who, who, expected) => {
    expect(programAccessFor(who, program)).toBe(expected);
  });

  it("lets only the lead and HR manage it, never the Master grant", () => {
    expect(canManageProgram(actor({ employeeId: "lead" }), program)).toBe(true);
    expect(
      canManageProgram(actor({ employeeId: "hr", editRecords: true }), program),
    ).toBe(true);
    expect(
      canManageProgram(actor({ employeeId: "coo", seesAll: true }), program),
    ).toBe(false);
    expect(canManageProgram(actor({ employeeId: "writer" }), program)).toBe(
      false,
    );
  });

  it("lets HR and the Master grant start a program, and nobody else", () => {
    expect(
      canCreateProgram(actor({ employeeId: "a", editRecords: true })),
    ).toBe(true);
    expect(canCreateProgram(actor({ employeeId: "a", seesAll: true }))).toBe(
      true,
    );
    expect(
      canCreateProgram(actor({ employeeId: "a", leadsPeople: true })),
    ).toBe(false);
  });
});

describe("who may start a project in a program", () => {
  it("is its lead and HR", () => {
    expect(canCreateProjectIn(actor({ employeeId: "lead" }), program)).toBe(
      true,
    );
    expect(
      canCreateProjectIn(
        actor({ employeeId: "hr", editRecords: true }),
        program,
      ),
    ).toBe(true);
  });

  it("is read and write only for somebody who also leads people", () => {
    expect(canCreateProjectIn(actor({ employeeId: "writer" }), program)).toBe(
      false,
    );
    expect(
      canCreateProjectIn(
        actor({ employeeId: "writer", leadsPeople: true }),
        program,
      ),
    ).toBe(true);
    expect(
      canCreateProjectIn(
        actor({ employeeId: "writer", headsDepartment: true }),
        program,
      ),
    ).toBe(true);
  });

  it("is never read alone, and never the Master grant alone", () => {
    expect(
      canCreateProjectIn(
        actor({ employeeId: "reader", leadsPeople: true }),
        program,
      ),
    ).toBe(false);
    expect(
      canCreateProjectIn(actor({ employeeId: "coo", seesAll: true }), program),
    ).toBe(false);
  });
});
