import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENERS,
  STANDING_PERMISSIONS,
  seesAllLeave,
  type Opener,
  type Standing,
} from "@/lib/assistant-openers";
import { backendFile } from "../scripts/backend-source";

/**
 * Every suggested question is one the API's lookups can answer for the person it is
 * offered to.
 *
 * `lib/assistant-openers.ts` says which lookup answers each question and who is
 * offered it. That is a claim about the API, and a sentence asking somebody to keep
 * it true is not a gate: the first permission-aware version of these buttons offered
 * line managers two questions about their team's leave, and the lookup behind both
 * gives a line manager only their own requests. So this reads the API's
 * `src/modules/ai/reads.ts` as text, the way the four cross-repo gates read theirs,
 * and checks the table against what is written there: that each lookup exists, that
 * the permission it needs is one the person holds, and that `leave_requests` gives
 * everybody's requests exactly to the people the table thinks it does.
 *
 * It skips when there is no backend checkout beside this repo
 * (`scripts/backend-source.ts` says where it looks; `APPROVEHR_BACKEND_DIR` points
 * it at one), because the frontend's CI clones this repo alone. The cases that feed
 * the checker a source of their own always run: they are what shows the checker can
 * fail, and a check that cannot fail proves nothing.
 */

type Lookup = { name: string; permission: string | null };

type Backend = {
  lookups: Lookup[];
  /** The permissions `leave_requests` gives everybody's requests to. */
  seesEveryone: string[];
  /** Whether everybody else is narrowed to their own requests. */
  narrowsToOwn: boolean;
};

/** What the checker needs from the API's `reads.ts`, read as text. */
function readBackend(source: string): Backend {
  const heads = [...source.matchAll(/^ {4}name: "([a-z_]+)",$/gm)];
  const blocks = heads.map((head, at) => ({
    name: head[1] ?? "",
    text: source.slice(head.index, heads[at + 1]?.index ?? source.length),
  }));
  const lookups = blocks.map(({ name, text }) => ({
    name,
    permission:
      /^ {4}permission: Permission\.([A-Z_]+),$/m.exec(text)?.[1] ?? null,
  }));
  const leave =
    blocks.find((block) => block.name === "leave_requests")?.text ?? "";
  const clause = /const seesEveryone =([^;]+);/.exec(leave)?.[1] ?? "";
  return {
    lookups,
    seesEveryone: [...clause.matchAll(/Permission\.([A-Z_]+)/g)].map(
      (match) => match[1] ?? "",
    ),
    narrowsToOwn:
      /seesEveryone\s*\?\s*\{\}\s*:\s*\{\s*employeeId:\s*actor\.employeeId/.test(
        leave,
      ),
  };
}

const KEYS = Object.keys(STANDING_PERMISSIONS) as (keyof Standing)[];

/** Every combination of the three things a standing is made of. */
function everyStanding(): Standing[] {
  return Array.from({ length: 1 << KEYS.length }, (_, bits) => ({
    editsRecords: (bits & 1) !== 0,
    viewsSalaries: (bits & 2) !== 0,
    approvesAllLeave: (bits & 4) !== 0,
  }));
}

const holdings = (who: Standing): string[] =>
  KEYS.filter((key) => who[key]).map((key) => STANDING_PERMISSIONS[key]);

const describeStanding = (who: Standing): string =>
  holdings(who).join(" + ") || "no permission";

/** Everything the table claims that the API's source does not bear out. */
function problemsWith(
  backend: Backend,
  openers: readonly Opener[] = OPENERS,
): string[] {
  const problems: string[] = [];
  const byName = new Map(
    backend.lookups.map((lookup) => [lookup.name, lookup]),
  );
  const modelled: string[] = Object.values(STANDING_PERMISSIONS);

  for (const permission of backend.seesEveryone) {
    if (!modelled.includes(permission)) {
      problems.push(
        `leave_requests now gives everybody's requests to holders of ${permission}, which standingFrom does not look at`,
      );
    }
  }
  if (!backend.narrowsToOwn) {
    problems.push(
      "leave_requests no longer narrows everybody else to their own requests",
    );
  }

  for (const who of everyStanding()) {
    const held = holdings(who);
    const givenEverybodys = backend.seesEveryone.some((p) => held.includes(p));
    if (seesAllLeave(who) !== givenEverybodys) {
      problems.push(
        `seesAllLeave disagrees with the API for ${describeStanding(who)}`,
      );
    }
    for (const opener of openers.filter((o) => o.offeredTo(who))) {
      for (const name of opener.reads) {
        const lookup = byName.get(name);
        if (!lookup) {
          problems.push(
            `"${opener.ask}" needs ${name}, which the API does not have`,
          );
        } else if (lookup.permission && !held.includes(lookup.permission)) {
          problems.push(
            `"${opener.ask}" is offered to ${describeStanding(who)}, but ${name} needs ${lookup.permission}`,
          );
        }
      }
      if (opener.leave === "all" && !givenEverybodys) {
        problems.push(
          `"${opener.ask}" is offered to ${describeStanding(who)}, but leave_requests would give them only their own requests`,
        );
      }
      if (opener.leave === "own" && givenEverybodys) {
        problems.push(
          `"${opener.ask}" is offered to ${describeStanding(who)}, but leave_requests would give them everybody's requests`,
        );
      }
    }
  }
  return [...new Set(problems)];
}

/* ------------------------------------------------- a source of our own */

/** A lookup written the way `reads.ts` writes one: four spaces, the permission after the name. */
const lookup = (name: string, permission?: string) =>
  [
    "  {",
    `    name: "${name}",`,
    `    description: "What ${name} is for.",`,
    permission ? `    permission: Permission.${permission},` : "    // no gate",
    "    async run() {",
    "      return { facts: [] };",
    "    },",
    "  },",
  ].join("\n");

const leaveRequests = (everyone: string[], narrows = true) =>
  [
    "  {",
    '    name: "leave_requests",',
    '    description: "Leave requests.",',
    "    async run(db, actor) {",
    "      const seesEveryone =",
    `        ${everyone.map((p) => `actor.permissions.includes(Permission.${p})`).join(" ||\n        ")};`,
    narrows
      ? "      const where = { ...(seesEveryone ? {} : { employeeId: actor.employeeId as string }) };"
      : "      const where = {};",
    "      return { facts: [] };",
    "    },",
    "  },",
  ].join("\n");

/** A `reads.ts` that agrees with the table, with whatever is changed for a case. */
function source(
  change: {
    gates?: Record<string, string | undefined>;
    omit?: string;
    everyone?: string[];
    narrows?: boolean;
  } = {},
): string {
  const gates: Record<string, string | undefined> = {
    headcount: undefined,
    payroll_periods: "VIEW_SALARIES",
    my_payslip: undefined,
    review_periods: undefined,
    ...change.gates,
  };
  const reads = Object.entries(gates)
    .filter(([name]) => name !== change.omit)
    .map(([name, permission]) => lookup(name, permission));
  return [
    "export const READS: readonly Read[] = [",
    ...reads,
    leaveRequests(
      change.everyone ?? ["APPROVE_LEAVE_ALL", "EDIT_RECORDS"],
      change.narrows,
    ),
    "];",
  ].join("\n");
}

describe("the checker, on a source that is written to agree with the table", () => {
  it("finds nothing wrong", () => {
    expect(problemsWith(readBackend(source()))).toEqual([]);
  });

  it("reads the lookups and the permissions each one needs", () => {
    const backend = readBackend(source());
    expect(backend.lookups.map((l) => l.name)).toEqual([
      "headcount",
      "payroll_periods",
      "my_payslip",
      "review_periods",
      "leave_requests",
    ]);
    expect(backend.lookups.find((l) => l.name === "payroll_periods")).toEqual({
      name: "payroll_periods",
      permission: "VIEW_SALARIES",
    });
    expect(backend.seesEveryone).toEqual(["APPROVE_LEAVE_ALL", "EDIT_RECORDS"]);
    expect(backend.narrowsToOwn).toBe(true);
  });
});

describe("the checker fails when the API stops answering what a button asks", () => {
  it("names a lookup the API no longer has", () => {
    const problems = problemsWith(readBackend(source({ omit: "my_payslip" })));
    expect(problems.join("\n")).toMatch(
      /"What was my last net pay\?" needs my_payslip, which the API does not have/,
    );
  });

  it("names a button offered to somebody who lacks the permission its lookup needs", () => {
    const problems = problemsWith(
      readBackend(source({ gates: { payroll_periods: "EDIT_RECORDS" } })),
    );
    expect(problems.join("\n")).toMatch(
      /"What did we pay last month\?" is offered to VIEW_SALARIES, but payroll_periods needs EDIT_RECORDS/,
    );
  });

  it("names a button for everybody's leave when the API would give only their own", () => {
    const problems = problemsWith(
      readBackend(source({ everyone: ["EDIT_RECORDS"] })),
    );
    expect(problems.join("\n")).toMatch(
      /"Whose leave requests are still waiting\?" is offered to APPROVE_LEAVE_ALL, but leave_requests would give them only their own requests/,
    );
    expect(problems.join("\n")).toMatch(/seesAllLeave disagrees with the API/);
  });

  it("names a button for 'my' leave when the API would give everybody's", () => {
    const problems = problemsWith(
      readBackend(
        source({
          everyone: ["APPROVE_LEAVE_ALL", "EDIT_RECORDS", "VIEW_SALARIES"],
        }),
      ),
    );
    expect(problems.join("\n")).toMatch(
      /"What leave have I asked for\?" is offered to VIEW_SALARIES, but leave_requests would give them everybody's requests/,
    );
  });

  it("notices a permission that now reaches everybody's leave and that the table does not model", () => {
    const problems = problemsWith(
      readBackend(
        source({
          everyone: ["APPROVE_LEAVE_ALL", "EDIT_RECORDS", "APPROVE_LEAVE"],
        }),
      ),
    );
    expect(problems.join("\n")).toMatch(
      /holders of APPROVE_LEAVE, which standingFrom does not look at/,
    );
  });

  it("notices when everybody else is no longer narrowed to their own requests", () => {
    const problems = problemsWith(readBackend(source({ narrows: false })));
    expect(problems.join("\n")).toMatch(/no longer narrows everybody else/);
  });
});

/* ------------------------------------------------- the API's own source */

const reads = backendFile("src/modules/ai/reads.ts");

describe.skipIf(!reads)("against the API's own lookups", () => {
  const backend = readBackend(reads ? readFileSync(reads, "utf8") : "");

  it("read the lookups out of the source, so the checks below are not vacuous", () => {
    expect(backend.lookups.length).toBeGreaterThanOrEqual(5);
    for (const name of OPENERS.flatMap((opener) => opener.reads)) {
      expect(backend.lookups.map((l) => l.name)).toContain(name);
    }
    expect(
      backend.lookups.find((l) => l.name === "payroll_periods")?.permission,
    ).toBe("VIEW_SALARIES");
    expect(backend.seesEveryone).toEqual(
      expect.arrayContaining(["APPROVE_LEAVE_ALL", "EDIT_RECORDS"]),
    );
  });

  it("answer every question for everybody it is offered to", () => {
    expect(problemsWith(backend)).toEqual([]);
  });
});
