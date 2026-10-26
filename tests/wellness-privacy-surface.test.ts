import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The one rule, as a property of the source.
 *
 * Nothing a person logs is readable by anybody but that person, and the API
 * enforces that by having no route that takes an employee id. The client has to
 * hold the same line from its side: it must not call a route that reads a
 * person's data by id, and no screen may build a per-person list for an employer.
 * A source scan cannot prove a screen correct. It can stop the shape that would
 * be a breach from being typed without somebody meaning to, which is the same
 * job `no-raw-date-formatting` does for dates.
 */

/** The character, built rather than typed, so this file carries none. */
const EM_DASH = String.fromCharCode(0x2014);

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const SCREENS = path.join(ROOT, "src", "app", "(app)", "wellness");

/** What renders, without the comments that explain why something is absent. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const screens = readdirSync(SCREENS, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({
    name,
    source: withoutComments(read(`src/app/(app)/wellness/${name}`)),
  }));

describe("the client for the API", () => {
  const client = read("src/lib/api/wellness.ts");
  const code = withoutComments(client);

  it("calls only /wellness routes, and none has an employee in its path", () => {
    const paths = [...code.matchAll(/["`](\/wellness[^"`]*)["`]/g)].map(
      (m) => m[1] ?? "",
    );
    expect(paths.length).toBeGreaterThan(20);
    for (const route of paths) {
      expect(route, route).not.toMatch(/employee/i);
    }
  });

  it("takes an employee id in exactly one place: the colleague a kudos is for", () => {
    const mentions = [...code.matchAll(/\b\w*[eE]mployee\w*\b/g)].map(
      (m) => m[0],
    );
    const unique = new Set(mentions);
    expect([...unique].sort()).toEqual(["fromEmployeeId", "toEmployeeId"]);
    /* `fromEmployeeId` rides on a row the API sent; only `toEmployeeId` is sent. */
    expect(code).toMatch(
      /toEmployeeId: string;\s*message: string;\s*shared: boolean/,
    );
  });

  it("has no read that takes a person, a query by employee, or a list for an employer", () => {
    expect(code).not.toMatch(/employeeId\s*[:?]/);
    expect(code).not.toMatch(/\/wellness\/logs\b/);
    expect(code).not.toMatch(/\/wellness\/participants/);
  });
});

describe("the screens", () => {
  it("never reach for the people directory except to pick a colleague to thank", () => {
    const users = screens
      .filter(({ source }) => source.includes("employees-api"))
      .map(({ name }) => name);
    expect(users).toEqual(["recognition-screen.tsx"]);
  });

  it("keep nothing about a person in the browser's storage", () => {
    for (const { name, source } of screens) {
      expect(source, name).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
    const store = read("src/lib/store/wellness.ts");
    expect(store).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(store).not.toMatch(/createSharedResource|createPersistedState/);
  });

  it("never write the health targets the API refuses to claim", () => {
    for (const { name, source } of screens) {
      expect(source, name).not.toMatch(
        /8 glasses|10,000 steps|10000 steps|recommended|daily goal/i,
      );
    }
  });

  it("write no em dash in anything a person reads", () => {
    for (const { name, source } of screens) {
      const copy = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(copy, name).not.toMatch(EM_DASH);
    }
  });

  it("use the two status hues only: no red or green classes, and no tone or variant outside them", () => {
    for (const { name, source } of screens) {
      expect(source, name).not.toMatch(
        /\b(?:text|bg|border)-(?:red|green|emerald|rose)-/,
      );
      for (const match of source.matchAll(/<Badge[^>]*?\btone="(\w+)"/g)) {
        expect(
          ["neutral", "accent", "warning"],
          `${name}: ${match[0]}`,
        ).toContain(match[1]);
      }
      /* A toast is not red: refusals are ochre. A destructive menu item may
         be, which is the one place the app keeps red besides validation. */
      expect(source, name).not.toMatch(/push\(\{\s*tone:\s*"danger"/);
      expect(source, name).not.toMatch(/variant="(?:approve|success)"/);
    }
  });
});
