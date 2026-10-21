import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The walkthrough's one rule, held by code instead of by a paragraph.
 *
 * The rule is that a journey acts like a person: it clicks, types, chooses a
 * file, follows a link, goes back, signs out and in. It does not read the
 * database, call the API, edit storage or cookies, `goto` its way around, guess
 * what is on screen with a conditional, or skip a step that fails. Every one of
 * those would make the recording show a product that works when a person's
 * hands could not make it work, and a walkthrough that cannot fail finds
 * nothing.
 *
 * ## Two layers
 *
 * A journey is never handed a `page` (see `harness/walker.ts`), so most of this
 * list cannot even be written. This test is the second layer: it reads every
 * journey file and refuses the words that would be needed to go round the first.
 *
 * ## It reads syntax, not text
 *
 * A search for the string `fetch` would refuse a caption that says "Fetch the
 * report" and would let `window["fe" + "tch"]` through. So the files are parsed
 * and the **identifiers and statements** are checked: a string is ignored, a
 * comment is ignored, `if` and `try` are found as statements, and a property
 * called `goto` is found wherever it is written.
 *
 * ## What is exempt, and why each file is
 *
 * The harness and the stage are the things that *make* the actors and the
 * observers, so they have to touch pages and sockets. They are listed below by
 * name with the reason, and everything not on the list, including any file added
 * later, is a journey and is held to the rules. The list is checked in both
 * directions: a name that no longer exists fails, so it cannot quietly become a
 * door.
 *
 * Tamper-tested twice: the cases below each add a forbidden line and watch it
 * fail, and the same was done by hand on a real journey file.
 */

const ROOT = __dirname;

const INFRASTRUCTURE: Record<string, string> = {
  "harness/walker.ts": "the actor API; wraps goto and paints the caption",
  "harness/observers.ts": "observers: console, requests, accessibility scan",
  "harness/overlay.ts": "the cursor and caption script that runs in the page",
  "harness/fixtures.ts": "creates the browser page and writes the run's files",
  "harness/config.ts": "reads the environment",
  "harness/timeline.ts": "pure: chapters, captions file, coverage ticks",
  "harness/title-card.ts": "the opening card, written into the blank page",
  "people.ts": "the fictional people, and their run-time passwords",
  "walkthrough.guard.test.ts": "this file",
};
const INFRASTRUCTURE_FOLDERS = ["stage/"];

/** Names that are forbidden wherever they are written in a journey. */
const IDENTIFIERS: Record<string, string> = {
  fetch: "an API call",
  XMLHttpRequest: "an API call",
  axios: "an API call",
  request: "an API call (page.request, APIRequestContext)",
  apiRequest: "an API call",
  prisma: "database access",
  PrismaClient: "database access",
  pg: "database access",
  psql: "database access",
  skip: "skipping a step",
  fixme: "skipping a step",
  slow: "bending the timeout",
  fail: "expecting failure",
  retries: "retrying a step",
  isVisible: "guessing what is on screen",
  isHidden: "guessing what is on screen",
  isEnabled: "guessing what is on screen",
  isDisabled: "guessing what is on screen",
  isChecked: "guessing what is on screen",
  isEditable: "guessing what is on screen",
  catch: "carrying on past a failure",
  localStorage: "editing storage",
  sessionStorage: "editing storage",
  indexedDB: "editing storage",
  cookies: "editing cookies",
  addCookies: "editing cookies",
  clearCookies: "editing cookies",
  cookie: "editing cookies",
  goto: "teleporting (a person types the address once)",
  page: "reaching past the walker",
  browser: "reaching past the walker",
  evaluate: "running code in the page",
  evaluateHandle: "running code in the page",
  $eval: "running code in the page",
  $$eval: "running code in the page",
  waitForFunction: "running code in the page",
  exposeFunction: "running code in the page",
  exposeBinding: "running code in the page",
  addInitScript: "running code in the page",
  addScriptTag: "running code in the page",
  setContent: "replacing the page",
  route: "intercepting requests",
  unroute: "intercepting requests",
  dispatchEvent: "faking an event",
  setExtraHTTPHeaders: "changing requests",
  waitForTimeout:
    "sleeping instead of waiting for what the person is waiting for",
  fill: "setting a value in one instant, which is not typing",
  setInputFiles: "choosing a file without the dialog",
  force: "clicking what a person could not click",
  eval: "running code from a string",
  Function: "running code from a string",
  require: "loading something the walker does not offer",
  process: "reading the environment",
  any: "switching the type checker off",
};

const MODULES_ALLOWED = new Set([
  "../harness/fixtures",
  "../harness/walker",
  "../people",
]);

export type Violation = { line: number; rule: string; text: string };

/** What is wrong with one journey file's source. Pure, so the cases below can drive it. */
export function violationsOf(
  source: string,
  fileName = "journey.ts",
): Violation[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: Violation[] = [];
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const add = (node: ts.Node, rule: string): void => {
    found.push({
      line: lineOf(node),
      rule,
      text: node.getText(sf).slice(0, 60),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const why = IDENTIFIERS[node.text];
      if (why !== undefined && Object.hasOwn(IDENTIFIERS, node.text)) {
        add(node, `${node.text}: ${why}`);
      }
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      add(node, "any: switching the type checker off");
    if (ts.isIfStatement(node))
      add(node, "if: a conditional guesses; an assertion states");
    if (ts.isSwitchStatement(node)) add(node, "switch: a conditional");
    if (ts.isConditionalExpression(node)) add(node, "?: a conditional");
    if (ts.isTryStatement(node)) add(node, "try: carrying on past a failure");
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        add(
          node.operatorToken,
          `${node.operatorToken.getText(sf)}: a conditional`,
        );
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const from = node.moduleSpecifier.text;
      if (!MODULES_ALLOWED.has(from) && !from.startsWith("./")) {
        add(
          node,
          `import "${from}": a journey imports the walker, the people and its own files`,
        );
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      add(node, "dynamic import");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  /* Comments are not syntax, and these two are the ones that switch checks off. */
  for (const match of source.matchAll(/@ts-(ignore|expect-error|nocheck)/g)) {
    const line = source.slice(0, match.index).split("\n").length;
    found.push({
      line,
      rule: `@ts-${match[1] ?? ""}: switching the type checker off`,
      text: match[0],
    });
  }
  return found.sort((a, b) => a.line - b.line);
}

/* ------------------------------------------------------------- the folder */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const isCode = (file: string): boolean => /\.(ts|tsx|mjs|js|cjs)$/.test(file);
const relative = (file: string): string =>
  path.relative(ROOT, file).split(path.sep).join("/");
const isInfrastructure = (rel: string): boolean =>
  Object.hasOwn(INFRASTRUCTURE, rel) ||
  INFRASTRUCTURE_FOLDERS.some((folder) => rel.startsWith(folder));

const files = walk(ROOT)
  .filter(isCode)
  .map((f) => ({ file: f, rel: relative(f) }));
/* Tests of the infrastructure are infrastructure: they are vitest files about the
   harness, not journeys. A journey is a `*.walk.ts` or a helper under `journey/`. */
const isInfrastructureTest = (rel: string): boolean =>
  /^(harness|stage)\/.*\.test\.ts$/.test(rel);
const journeys = files.filter(
  ({ rel }) => !isInfrastructure(rel) && !isInfrastructureTest(rel),
);

describe("what a journey may not write", () => {
  const clean = `
    import { test, by } from "../harness/fixtures";
    import { PEOPLE } from "../people";

    test("a person signs in", async ({ walk }) => {
      await walk.chapter("Owner", "owner", async () => {
        await walk.step({ id: "own-signin", name: "Fetch the report: if it works, try again" }, async () => {
          await walk.type(by.label("Work email"), PEOPLE.owner.email);
          await walk.click(by.button(/sign in/i));
          await walk.seeUrl(/dashboard/);
        });
      });
    });
  `;

  it("passes a journey that only does what a person does, even with those words in a caption", () => {
    expect(violationsOf(clean)).toEqual([]);
  });

  /* Each is one line added to an otherwise clean journey, and each has to be
     named by the rule that catches it, not merely refused. */
  const cases: [name: string, line: string, rule: RegExp][] = [
    ["an API call", `await fetch("/api/v1/employees");`, /^fetch/],
    [
      "an API call through the page",
      `await walk.page.request.get("/x");`,
      /^page|^request/,
    ],
    [
      "the database",
      `import { PrismaClient } from "@prisma/client";`,
      /^import|^PrismaClient/,
    ],
    [
      "the database by name",
      `const rows = await prisma.employee.findMany();`,
      /^prisma/,
    ],
    ["a skipped step", `test.skip("later", async () => {});`, /^skip/],
    ["a fixme", `test.fixme(true, "later");`, /^fixme/],
    ["a visibility guess", `const here = await x.isVisible();`, /^isVisible/],
    ["a conditional", `if (here) { await walk.pause(1); }`, /^if/],
    ["a ternary", `const a = here ? 1 : 2;`, /^\?:/],
    ["an or-guard", `await (a || b);`, /^\|\|/],
    ["a switch", `switch (x) { default: break; }`, /^switch/],
    ["a try", `try { await walk.pause(1); } finally {}`, /^try/],
    ["a catch", `await walk.pause(1).catch(() => {});`, /^catch/],
    ["local storage", `window.localStorage.clear();`, /^localStorage/],
    ["session storage", `sessionStorage.clear();`, /^sessionStorage/],
    ["cookies", `await context.addCookies([]);`, /^addCookies/],
    ["goto", `await walk.goto("/x");`, /^goto/],
    ["evaluate", `await walk.evaluate(() => 1);`, /^evaluate/],
    ["fill", `await loc.fill("x");`, /^fill/],
    ["a forced click", `await loc.click({ force: true });`, /^force/],
    ["a sleep", `await waitForTimeout(500);`, /^waitForTimeout/],
    ["an escape hatch", `const w = walk as any;`, /^any/],
    ["a type-check switch-off", `// @ts-ignore\nconst x = 1;`, /^@ts-ignore/],
    [
      "an import of the test runner",
      `import { expect } from "@playwright/test";`,
      /^import/,
    ],
    ["a dynamic import", `await import("node:fs");`, /^dynamic import/],
    ["a request interceptor", `await ctx.route("**/*", () => {});`, /^route/],
  ];

  for (const [name, line, rule] of cases) {
    it(`catches ${name}`, () => {
      const source = `${clean}\n${line}\n`;
      const hits = violationsOf(source).map((v) => v.rule);
      expect(
        hits.some((hit) => rule.test(hit)),
        `${line} gave ${JSON.stringify(hits)}`,
      ).toBe(true);
    });
  }

  it("does not mistake a property called request on something else for the clean case", () => {
    /* The rule is on the name, deliberately: a journey has no reason to write it. */
    expect(violationsOf(`const x = thing.request;`).length).toBeGreaterThan(0);
  });
});

describe("the walkthrough folder", () => {
  it("still reads the folder it thinks it does", () => {
    /* An empty list would make every assertion below pass on nothing. */
    expect(files.length).toBeGreaterThan(8);
    expect(files.some(({ rel }) => rel === "harness/walker.ts")).toBe(true);
    expect(journeys.length).toBeGreaterThan(0);
  });

  it("keeps every journey file inside the rules", () => {
    const report = journeys.flatMap(({ file, rel }) =>
      violationsOf(readFileSync(file, "utf8"), rel).map(
        (v) => `${rel}:${String(v.line)} ${v.rule}  ${v.text}`,
      ),
    );
    expect(report).toEqual([]);
  });

  it("exempts only files that exist, so the list cannot become a door", () => {
    const existing = new Set(files.map(({ rel }) => rel));
    const missing = Object.keys(INFRASTRUCTURE).filter(
      (rel) => !existing.has(rel),
    );
    expect(missing).toEqual([]);
  });

  it("treats a file nobody listed as a journey", () => {
    /* A new file in the harness folder is held to the rules until it is named
       here with a reason, which is the point of naming them. */
    const unlisted = files
      .filter(
        ({ rel }) =>
          rel.startsWith("harness/") &&
          !isInfrastructure(rel) &&
          !isInfrastructureTest(rel),
      )
      .map(({ rel }) => rel);
    expect(unlisted).toEqual([]);
  });
});
