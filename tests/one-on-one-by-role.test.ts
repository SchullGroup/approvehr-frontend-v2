import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

/**
 * One-to-ones belong to the two people in them, and to nobody else.
 *
 * The feedback, verbatim: *"I shouldn't have one on one if I am not a
 * departmental manager and above in role as this creates always errors for the
 * employee role."*
 *
 * Two separate defects behind it, and the second is the one that produced the
 * errors:
 *
 * 1. The sidebar row was `always: true`, so every employee carried it.
 * 2. The dialog behind it offered **the whole company directory**, and
 *    `POST /one-on-ones` accepts a person only when they report to the caller
 *    — so for an ordinary employee every single choice was refused, with a
 *    404 reading "somebody who reports to you".
 *
 * ## Why the fix is not a permission
 *
 * There is no permission that means "manages people", and inventing one would
 * be wrong: an administrator holding every grant in the catalogue and managing
 * nobody still cannot start a one-to-one, because the API asks the reporting
 * line, not the role. So the nav asks the rows (`NavRowFact`) and the screen
 * asks `useIsManager()`.
 *
 * ## Why the row must come back for a report
 *
 * A one-to-one has two people in it and only one of them is the manager. Hide
 * the module from everybody without reports and the *other* half of every pair
 * loses the screen they were asked to write in. So the condition is "manages
 * somebody **or** is already in one", which is why `NavFacts.rows` carries an
 * answer rather than the nav reading a permission.
 */

const EMPLOYEE = new Set<PermissionKey>([]);
/* Every permission this product has. The point of several assertions below is
   that no amount of permission buys this row, so the strongest possible set is
   the one worth asserting against. */
const EVERYTHING: ReadonlySet<PermissionKey> = new Set(PERMISSION_KEYS);

const facts = (inIt: boolean): NavFacts => ({
  assistantWired: true,
  /* Signatures stays on throughout: this file is about one-to-ones, and a row
     hidden for an unrelated reason would be a false negative. Its own rule is
     asserted in `signatures-by-role.test.ts`. */
  rows: { "one-on-ones": inIt, signatures: true },
});

const labels = (
  permissions: ReadonlySet<PermissionKey>,
  answered: NavFacts,
): string[] =>
  visibleNav(NAV, permissions, {}, answered).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe("'no amount of permission' means something", () => {
  it("is asserting against the real catalogue", () => {
    /* `EVERYTHING` is the product's own key list rather than a set written
       out here — which is the point: a permission added next month is in it
       without anybody remembering this file. If it were ever empty the three
       assertions below would silently become restatements of the employee
       case, passing while testing nothing. */
    expect(EVERYTHING.size).toBeGreaterThan(15);
    expect(EVERYTHING.has("EDIT_RECORDS")).toBe(true);
  });
});

describe("the sidebar row", () => {
  it("is absent for an employee who manages nobody and is in none", () => {
    expect(labels(EMPLOYEE, facts(false))).not.toContain("One-to-ones");
  });

  it("is there for somebody who is in one, whatever their permissions", () => {
    /* The report's half of the pair. Their manager started it, the notes are
       addressed to them, and this is the door. */
    expect(labels(EMPLOYEE, facts(true))).toContain("One-to-ones");
  });

  it("is not bought by permissions", () => {
    /* An administrator with the whole catalogue and nobody reporting to them
       has no one-to-ones, because the API asks the reporting line. A row here
       would be a row to a screen with a refusal behind it — which is the
       defect, one layer up. */
    expect(labels(EVERYTHING, facts(false))).not.toContain("One-to-ones");
    expect(labels(EVERYTHING, facts(true))).toContain("One-to-ones");
  });

  it("is hidden while nothing has answered yet", () => {
    /* The direction matters: an item that appears a moment late is better than
       one that appears and is taken away under somebody's pointer. */
    expect(labels(EVERYTHING, NOTHING_ANSWERED_YET)).not.toContain(
      "One-to-ones",
    );
  });

  it("hides only itself", () => {
    /* A regression guard on the filter rather than on this item: `rows` is
       checked before `always` and before the permission branches, so a
       mistake there would take rows with it. Everything an employee could see
       before must still be there. */
    const before = labels(EMPLOYEE, facts(true));
    const after = labels(EMPLOYEE, facts(false));
    expect(before.filter((label) => label !== "One-to-ones")).toEqual(after);
    expect(after.length).toBeGreaterThan(3);
  });
});

/* -------------------------------------------------------------------------- */

const sourceOf = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

const screen = sourceOf(
  "../src/app/(app)/people/one-on-ones/one-on-ones-screen.tsx",
);

/**
 * Read as source, not mounted.
 *
 * Mounting this screen needs a session, a permission set, a toast provider and
 * three fetches, and would then prove that one fixture renders one way. The
 * two claims worth holding are about the code: the button asks the reporting
 * line, and the picker is not the directory. Both are one import away from
 * regressing, and an import is exactly what a source read catches.
 */
describe("the screen", () => {
  it("gates the button on the reporting line, not a permission", () => {
    expect(screen).toMatch(/mutations\.available && isManager/);
  });

  it("no longer fills the picker from the whole directory", () => {
    /* The specific line that caused the reported errors:
       `directory.employees.map` over `useEmployeeDirectory({ pageSize: 200 })`
       — every colleague in the company, each one refused. */
    expect(screen).not.toMatch(/useEmployeeDirectory/);
    expect(screen).not.toMatch(/directory\.employees/);
  });

  it("fills it from the caller's reports instead", () => {
    expect(screen).toMatch(/useWhoICanStartWith/);
  });

  it("does not tell somebody with no reports to start one", () => {
    /* The old empty state read "If you manage somebody, start one with them",
       next to a button that refused them. Advice that cannot be followed. */
    expect(screen).toMatch(/the manager starts it/);
  });
});

describe("the picker asks the API's own column", () => {
  const client = sourceOf("../src/lib/api/one-on-ones.ts");

  it("filters on managerId server-side", () => {
    /* Not a client-side filter over the directory, which would be a second
       definition of "who reports to me" and is the thing the screen's old
       header rightly objected to. `managerId` is the same column
       `POST /one-on-ones` compares. */
    expect(client).toMatch(/query:\s*\{\s*managerId: employeeId/);
    expect(client).toMatch(/requestPaged<ApiPossibleReport>\("\/employees"/);
  });

  it("takes only what a picker needs off a wide row", () => {
    /* `/employees` returns the whole employee, pay included. The narrow type
       is what stops the next person reading a fourth field because it happened
       to be on the wire. */
    const shape = client.match(
      /export type ApiPossibleReport = \{([\s\S]*?)\};/,
    )?.[1];
    expect(shape).toBeTruthy();
    expect(shape).not.toMatch(/salary|Kobo|gross|pay/i);
  });
});
