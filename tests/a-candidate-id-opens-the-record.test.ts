import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Three kinds of id reach `/hiring/candidates/[id]`, and all three now work.
 *
 * The screen's own header has claimed that for a while and it was not true of
 * the connected path. `useRealPipelineApplication` tried the URL id as a
 * pipeline **application** id, and fell back to a candidate lookup keyed only
 * on the careers `candidateId` passed beside it — which is `null` for anybody
 * who never applied through the careers page.
 *
 * So a recruiter following a link to a candidate the API knows perfectly well
 * got *"Nothing here matches that record"*. Reproduced against the live API
 * before the fix, on a real seeded candidate, and confirmed resolved after.
 *
 * ## The order is the cost model
 *
 * Application id first, because that is what the board links and it resolves in
 * one request. Only a miss pays for a second read, and a miss was a screen
 * about to say it could not find anything.
 */

const sourceOf = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

const store = sourceOf("../src/lib/store/recruitment.ts");
const screen = sourceOf(
  "../src/app/(app)/hiring/candidates/[id]/candidate-screen.tsx",
);

describe("the resolver", () => {
  it("tries the URL id as a candidate, not only as an application", () => {
    /* The whole fix. Without this branch the fallback can only ever fire for
       somebody who also has a careers application. */
    expect(store).toMatch(/if \(!application && id\)/);
  });

  it("still tries it as an application first", () => {
    /* Order matters for cost: the board links application ids, and that case
       must not grow a second request. */
    const from = store.indexOf("const throughCandidate");
    const body = store.slice(from, from + 2600);
    expect(body.indexOf("getApplication")).toBeLessThan(
      body.indexOf("if (!application && id)"),
    );
  });

  it("keeps the careers candidateId as a third route", () => {
    /* Screened in from the applications queue, where the id to hand is the one
       `advance` returned. Removing this would break that entry point. */
    expect(store).toMatch(/if \(!application && candidateId\)/);
  });

  it("shares one lookup between the two candidate routes", () => {
    /* Two copies would drift on which application to pick when somebody has
       applied for more than one role — and picking differently by entry point
       is how one screen comes to disagree with another about the same person. */
    expect(store).toMatch(/const throughCandidate = async/);
    /* Two call sites — the URL id and the careers candidateId — against one
       declaration. The declaration itself is `= async`, so it does not match
       the call pattern; a first draft counted it and asserted three. */
    expect(store.match(/await throughCandidate\(/g)?.length).toBe(2);
  });

  it("does not let an abort look like a miss", () => {
    /* An aborted request is the resolver dropping its own work, not an answer.
       Swallowing it as "not found" would render a refusal for a navigation that
       was simply superseded. */
    const from = store.indexOf("if (!application && id)");
    const body = store.slice(from, from + 700);
    expect(body).toMatch(/AbortError/);
  });
});

describe("the refusal", () => {
  it("names all three lookups", () => {
    /* Read by somebody holding a link that did not work, so what was tried is
       the useful part. It named two before this. */
    const prose = screen.replace(/\s+/g, " ");
    expect(prose).toMatch(
      /not a pipeline application, not a candidate, and not a careers-page application/,
    );
  });
});
