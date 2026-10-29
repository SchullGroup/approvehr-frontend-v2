import { describe, expect, it } from "vitest";
import { noticeReach } from "@/lib/api/announcements";
import type { EmployeeAccess } from "@/lib/types";

/**
 * Who a notice can be addressed to by name.
 *
 * The API refuses somebody with no account at all or with an archived one
 * (`assertPeople`), and accepts everybody else, including a person who was
 * invited and has not accepted yet. This copy of the rule is pinned to that and
 * to nothing stricter: the screen it replaced refused everybody who was not
 * `ACCEPTED`, which turned away people the server takes.
 */

const STATES: EmployeeAccess["state"][] = [
  "NONE",
  "SENT",
  "EXPIRED",
  "ACCEPTED",
  "DISABLED",
];

describe("who a notice can be addressed to", () => {
  it.each([
    ["NONE", false],
    ["DISABLED", false],
    ["SENT", true],
    ["EXPIRED", true],
    ["ACCEPTED", true],
  ] as const)("%s: can be addressed is %s", (state, can) => {
    expect(noticeReach({ state }).can).toBe(can);
  });

  it("refuses exactly the two states the API refuses, and no others", () => {
    const refused = STATES.filter((state) => !noticeReach({ state }).can);
    expect(refused).toEqual(["NONE", "DISABLED"]);
  });

  it("allows somebody whose access is not known, and leaves the API to decide", () => {
    expect(noticeReach(undefined)).toEqual({
      can: true,
      line: null,
      headline: null,
      detail: null,
    });
  });

  it("says nothing about somebody who can already sign in", () => {
    expect(noticeReach({ state: "ACCEPTED" })).toEqual({
      can: true,
      line: null,
      headline: null,
      detail: null,
    });
  });

  it("never refuses silently: a refusal always says why and what to do", () => {
    for (const state of ["NONE", "DISABLED"] as const) {
      const reach = noticeReach({ state });
      expect(reach.line).toMatch(/cannot be sent a message/);
      expect(reach.headline).toBeTruthy();
      expect(reach.detail).toBeTruthy();
    }
  });

  it("tells somebody with no account to invite them, and nobody else", () => {
    expect(noticeReach({ state: "NONE" }).detail).toMatch(/Invite them/);
    for (const state of ["SENT", "EXPIRED", "DISABLED"] as const) {
      expect(noticeReach({ state }).detail).not.toMatch(/Invite them/);
    }
  });

  it("does not tell somebody who was already invited to invite them", () => {
    const sent = noticeReach({ state: "SENT" });
    expect(sent.can).toBe(true);
    expect(sent.line).toBe("Invited, has not signed in yet");
    expect(sent.detail).toMatch(/invited and have not accepted/);

    const expired = noticeReach({ state: "EXPIRED" });
    expect(expired.can).toBe(true);
    expect(expired.line).toMatch(/Invitation expired/);
    expect(expired.detail).toMatch(/another invitation/);
  });
});
