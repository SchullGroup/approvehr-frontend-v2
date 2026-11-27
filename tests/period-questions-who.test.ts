import { describe, expect, it } from "vitest";
import { whoOptionsFor } from "@/lib/performance/question-groups";

/**
 * Who a question added on a page may be asked of (F9).
 *
 * A question lands on the page of whoever answers it, so offering "The manager"
 * on the employee's page made a question disappear from the page it had just been
 * added on.
 */
describe("who a question added on a page may be asked of", () => {
  it("is the employee or both, on the employee's page", () => {
    expect(whoOptionsFor("self")).toEqual(["EMPLOYEE", "BOTH"]);
  });

  it("is the manager or both, on the manager's page", () => {
    expect(whoOptionsFor("manager")).toEqual(["MANAGER", "BOTH"]);
  });

  it("is anybody, on a competency page", () => {
    for (const group of ["core", "behavioural", "leadership"] as const) {
      expect(whoOptionsFor(group)).toEqual(["EMPLOYEE", "MANAGER", "BOTH"]);
    }
  });
});
