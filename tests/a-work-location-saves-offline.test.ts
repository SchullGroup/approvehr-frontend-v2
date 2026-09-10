import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A work location can be set on a record in either mode.
 *
 * ## What was actually wrong, which is not what it looked like
 *
 * `useEmployeeMutations().update` dropped `workLocationId` offline, because
 * `Employee.location` there is a **display name with no id behind it** — the
 * same shape `Employee.department` has. So a picker would have handed the local
 * store an id it cannot store.
 *
 * The previous author closed that correctly, by removing the control offline
 * rather than letting it save onto nothing, and left a comment naming the real
 * fix as "a separate fix". This is that fix: `demoWorkLocationName` resolves the
 * id to a name, exactly as `demoDepartmentName` already did for the field
 * directly above it.
 *
 * So the defect being closed is **not** a silent save. It is two fields side by
 * side behaving differently for a reason no reader could see.
 *
 * ## `current()`, never `read()`
 *
 * The seam runs while assembling a patch — a write path. `read()` would answer
 * from the seed and refuse any location created in this browser with "That work
 * location does not exist", which is the defect `verify-stores` exists to catch
 * and the one that had already been declared fixed once in another store.
 */

const sourceOf = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

const locations = sourceOf("../src/lib/store/work-locations.ts");
const employees = sourceOf("../src/lib/store/employees-api.ts");
const record = sourceOf("../src/app/(app)/people/[id]/record.tsx");

describe("the seam", () => {
  it("exists, beside the locations it resolves", () => {
    expect(locations).toMatch(/export function demoWorkLocationName/);
  });

  it("reads current(), not read()", () => {
    /* The whole reason `verify-stores` exists. Both functions are correctly
       typed and only one of them can see what this browser has written. */
    const from = locations.indexOf("export function demoWorkLocationName");
    const body = locations.slice(from, from + 700);
    expect(body).toMatch(/demoStore\.current\(\)/);
    expect(body).not.toMatch(/demoStore\.read\(\)/);
  });

  it("refuses an id it cannot resolve rather than writing a blank", () => {
    /* A stale picker option must fail loudly. Writing "" would quietly
       unassign somebody, which is a change nobody asked for wearing the
       appearance of a save. */
    const from = locations.indexOf("export function demoWorkLocationName");
    const body = locations.slice(from, from + 700);
    expect(body).toMatch(/does not exist/);
  });

  it("refuses an archived office too", () => {
    /* Switching an office off and then assigning somebody to it is a move the
       API refuses, so the demo refuses it rather than teaching a second rule. */
    const from = locations.indexOf("export function demoWorkLocationName");
    const body = locations.slice(from, from + 700);
    expect(body).toMatch(/archived\.includes/);
  });
});

describe("the demo write uses it", () => {
  it("no longer drops workLocationId", () => {
    expect(employees).toMatch(/demoWorkLocationName\(workLocationId\)/);
  });

  it("treats absent and cleared apart, the same as department", () => {
    /* `undefined` is a patch that did not mention the field; "" is a person
       taken off an office. Collapsing them would either make unassigning
       impossible or wipe the field on every unrelated edit. */
    expect(employees).toMatch(/workLocationId === undefined/);
  });

  it("does not still claim the bug is open", () => {
    /* The comment said `workLocationId` "still has the bug". It does not. A
       stale comment explaining a limitation makes the gap harder to see, not
       easier — it reads as a decision rather than a hole. */
    expect(employees).not.toMatch(/`workLocationId` still has the bug/);
  });
});

describe("the picker", () => {
  it("is offered in both modes now", () => {
    /* It was `connected ? [field] : []`. Offering a control that saves onto
       nothing is worse than not offering it, which is why it was removed —
       and once the seam exists, withholding it is the thing without a
       reason. */
    expect(record).not.toMatch(
      /\.\.\.\(connected\s*\n?\s*\?\s*\[\s*\{\s*\n?\s*key: "workLocationId"/,
    );
    expect(record).toMatch(/key: "workLocationId" as const/);
  });

  it("says when the record's own value is not one of the offices", () => {
    /* `Employee.location` is free text and a work location is a row with a
       geofence, so "Lagos, NG" against an office called "Lagos HQ" is two
       different facts rather than a mismatch to hide. The demo seed does
       exactly this, so the sentence is not hypothetical. */
    expect(record).toMatch(/not one of the offices below/);
    expect(record).toMatch(/employee\.location && !currentLocation/);
  });
});

/* --------------------------------------------------------- the real thing */

/**
 * The seam, exercised rather than read.
 *
 * The assertions above are about the shape of the code. These are about what it
 * does, and they are the ones that would survive somebody rewriting the file:
 * a name comes back for a real office, and an id nothing knows about is refused
 * rather than resolved to a blank.
 *
 * jsdom with a fresh `localStorage` per test, the stub
 * `setup-guide.test.tsx` already uses — `createPersistedState` hydrates from it
 * and jsdom's own implementation is missing `clear` in this environment.
 *
 * **Not walked in a browser.** Demo sign-in cannot be driven in this session's
 * preview pane — a real click on the persona button, at its own coordinates,
 * leaves `localStorage` empty and the gate on screen. That is the pane, not the
 * product: the same class of thing HANDOVER already records about its
 * coordinate frame. Somebody with a normal browser should pick an office on a
 * record offline, reload, and see it stick.
 */
function freshStorage() {
  let held: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => held[k] ?? null,
      setItem: (k: string, v: string) => {
        held[k] = v;
      },
      removeItem: (k: string) => {
        delete held[k];
      },
      clear: () => {
        held = {};
      },
    },
  });
}

describe("resolving an id to a name, for real", () => {
  beforeEach(() => {
    vi.resetModules();
    freshStorage();
  });

  it("returns the office's name", async () => {
    const { demoWorkLocationName } = await import("@/lib/store/work-locations");
    const { WORK_LOCATIONS } = await import("@/lib/mock/attendance");
    const first = WORK_LOCATIONS[0];
    expect(first).toBeDefined();
    expect(demoWorkLocationName(first!.id)).toBe(first!.name);
  });

  it("reads an empty id as nothing, not as a refusal", () => {
    /* "" is the picker's "Not set", which is a person taken off an office
       rather than a bad id. It has to travel as an empty name, and the caller
       maps it onto the record. */
    return import("@/lib/store/work-locations").then(
      ({ demoWorkLocationName }) => {
        expect(demoWorkLocationName("")).toBe("");
        expect(demoWorkLocationName("   ")).toBe("");
      },
    );
  });

  it("refuses an id nothing knows about", async () => {
    /* The half that matters. Returning "" here would quietly unassign somebody
       whose picker held a stale option — a change nobody asked for, wearing the
       appearance of a save. */
    const { demoWorkLocationName } = await import("@/lib/store/work-locations");
    expect(() => demoWorkLocationName("dl-nothing-here")).toThrow(
      /does not exist/,
    );
  });
});
