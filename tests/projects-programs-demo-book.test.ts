import { describe, expect, it } from "vitest";
import {
  ProjectRuleError,
  addProgramPeople,
  archiveProgramInBook,
  createProgramInBook,
  createProject,
  moveProjectInBook,
  removeProgramPerson,
  sampleBook,
  setProgramLevel,
  updateProgramInBook,
} from "@/lib/projects/demo-book";

/**
 * What the demo does when somebody changes a program, held to what the API does:
 * the same refusals in the same words, so the demo never teaches a rule the
 * connected product does not have.
 */

const NOW = "2026-10-15T12:00:00.000Z";
const book = sampleBook({
  today: "2026-10-15",
  now: NOW,
  people: ["p-01", "p-03", "p-09", "p-04"],
});
let n = 0;
const ctx = { actorId: "p-10", now: NOW, makeId: () => `id-${++n}` };

describe("starting a program", () => {
  it("makes it, led by the creator unless somebody else is chosen", () => {
    const out = createProgramInBook(book, { name: "Finance" }, ctx);
    expect(out.program.leadId).toBe("p-10");
    expect(out.book.programs[out.program.id]!.name).toBe("Finance");
    expect(out.book.programAccess[out.program.id]).toEqual({});
    const chosen = createProgramInBook(
      book,
      { name: "Sales", leadId: "p-02" },
      ctx,
    );
    expect(chosen.program.leadId).toBe("p-02");
  });

  it("refuses a name somebody has, in any case, as the API does", () => {
    expect(() =>
      createProgramInBook(book, { name: "operations" }, ctx),
    ).toThrow("Another program is already called operations.");
  });

  it("refuses a name that is too short", () => {
    expect(() => createProgramInBook(book, { name: "A" }, ctx)).toThrow(
      ProjectRuleError,
    );
  });
});

describe("changing a program", () => {
  it("renames it, and keeps the name unique", () => {
    const renamed = updateProgramInBook(book, "pg-ops", { name: "Ops" }, NOW);
    expect(renamed.programs["pg-ops"]!.name).toBe("Ops");
    expect(() =>
      updateProgramInBook(book, "pg-ops", { name: "Technology" }, NOW),
    ).toThrow("Another program is already called Technology.");
  });

  it("takes a new lead off the access list, since the lead is never listed", () => {
    const next = updateProgramInBook(book, "pg-ops", { leadId: "p-07" }, NOW);
    expect(next.programs["pg-ops"]!.leadId).toBe("p-07");
    expect(next.programAccess["pg-ops"]).toEqual({ "p-08": "WRITE" });
  });

  it("archives and restores it", () => {
    const archived = archiveProgramInBook(book, "pg-ops", true, NOW);
    expect(archived.programs["pg-ops"]!.archivedAt).toBe(NOW);
    expect(
      archiveProgramInBook(archived, "pg-ops", false, NOW).programs["pg-ops"]!
        .archivedAt,
    ).toBeNull();
  });
});

describe("who is on a program", () => {
  it("adds people at a level, and moves the ones already there", () => {
    const out = addProgramPeople(
      book,
      "pg-ops",
      ["p-03", "p-07"],
      "WRITE",
      NOW,
    );
    expect(out.added).toEqual(["p-03"]);
    expect(out.changed).toEqual(["p-07"]);
    expect(out.book.programAccess["pg-ops"]).toEqual({
      "p-03": "WRITE",
      "p-07": "WRITE",
      "p-08": "WRITE",
    });
  });

  it("never lists the lead", () => {
    const out = addProgramPeople(book, "pg-ops", ["p-10"], "READ", NOW);
    expect(out.added).toEqual([]);
    expect(out.book.programAccess["pg-ops"]!["p-10"]).toBeUndefined();
  });

  it("seeds a department once and never lowers somebody who has more", () => {
    const first = addProgramPeople(
      book,
      "pg-ops",
      ["p-08", "p-03"],
      "READ",
      NOW,
      {
        keepExisting: true,
      },
    );
    expect(first.added).toEqual(["p-03"]);
    expect(first.book.programAccess["pg-ops"]!["p-08"]).toBe("WRITE");
    const again = addProgramPeople(
      first.book,
      "pg-ops",
      ["p-03"],
      "READ",
      NOW,
      {
        keepExisting: true,
      },
    );
    expect(again.added).toEqual([]);
  });

  it("refuses to add anybody to an archived program", () => {
    const archived = archiveProgramInBook(book, "pg-ops", true, NOW);
    expect(() =>
      addProgramPeople(archived, "pg-ops", ["p-03"], "READ", NOW),
    ).toThrow("Operations is archived, so nobody can be added to it.");
  });

  it("changes a level and removes a person, and says so when they are not there", () => {
    const changed = setProgramLevel(book, "pg-ops", "p-07", "WRITE");
    expect(changed.programAccess["pg-ops"]!["p-07"]).toBe("WRITE");
    const removed = removeProgramPerson(book, "pg-ops", "p-07");
    expect(removed.programAccess["pg-ops"]!["p-07"]).toBeUndefined();
    expect(() => removeProgramPerson(book, "pg-ops", "p-03")).toThrow(
      "That person is not on this program.",
    );
    expect(() => setProgramLevel(book, "pg-ops", "p-03", "READ")).toThrow(
      ProjectRuleError,
    );
  });
});

describe("moving a project", () => {
  it("changes its program and nothing else about it", () => {
    const before = book.projects["pj-off"]!;
    const next = moveProjectInBook(book, "pj-off", "pg-ops", NOW);
    const after = next.projects["pj-off"]!;
    expect(after.project.programId).toBe("pg-ops");
    expect(after.project.memberIds).toEqual(before.project.memberIds);
    expect(after.issues).toEqual(before.issues);
    expect(after.project.key).toBe(before.project.key);
  });

  it("takes a project out of its program", () => {
    const next = moveProjectInBook(book, "pj-cnt", null, NOW);
    expect(next.projects["pj-cnt"]!.project.programId).toBeNull();
  });

  it("refuses an archived destination", () => {
    const archived = archiveProgramInBook(book, "pg-tech", true, NOW);
    expect(() => moveProjectInBook(archived, "pj-off", "pg-tech", NOW)).toThrow(
      "Technology is archived, so it cannot take a project.",
    );
  });
});

describe("starting a project in a program", () => {
  const input = {
    name: "Quarterly review",
    key: "QRV",
    type: "KANBAN" as const,
    departmentId: null,
    description: "",
    seedMembersFromDepartment: false,
    memberIds: [],
  };

  it("puts it in the program chosen", () => {
    const out = createProject(book, { ...input, programId: "pg-ops" }, ctx);
    expect(out.project.programId).toBe("pg-ops");
  });

  it("starts it in no program when none is chosen", () => {
    expect(createProject(book, input, ctx).project.programId).toBeNull();
  });

  it("refuses a program that is not there, or is archived", () => {
    expect(() =>
      createProject(book, { ...input, programId: "pg-nope" }, ctx),
    ).toThrow("That program could not be found.");
    const archived = archiveProgramInBook(book, "pg-ops", true, NOW);
    expect(() =>
      createProject(archived, { ...input, programId: "pg-ops" }, ctx),
    ).toThrow("Operations is archived, so it cannot take a new project.");
  });
});
