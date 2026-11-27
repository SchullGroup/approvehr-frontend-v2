import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  askedLine,
  lastAskedLine,
  notSwitchedOn,
} from "@/lib/performance/notify-objectives";

describe("ask everyone to set objectives", () => {
  it("says who was asked and who already has objectives, as one calm line", () => {
    expect(askedLine({ notified: 61, alreadyHad: 7 })).toBe(
      "Asked 61 people. 7 already have objectives.",
    );
    expect(askedLine({ notified: 1, alreadyHad: 1 })).toBe(
      "Asked 1 person. 1 already has an objective.",
    );
  });
  it("a second press inside the day is not an error", () => {
    expect(
      askedLine({
        notified: 0,
        alreadyHad: 7,
        askedAt: "2026-11-24T10:00:00.000Z",
      }),
    ).toBe("Everyone was asked in the last day. 7 already have objectives.");
  });
  it("does not say everyone was asked when there was nobody left to ask", () => {
    /* Asking nobody has two causes, and the server's time tells them apart: it has
       one when people were asked in the last day and none when nobody had to be. */
    expect(askedLine({ notified: 0, alreadyHad: 10 })).toBe(
      "Nobody new was asked. 10 already have objectives.",
    );
  });
  it("says who could not be asked in the app because they have no sign-in", () => {
    expect(askedLine({ notified: 4, alreadyHad: 2, noAccount: 1 })).toBe(
      "Asked 4 people. 2 already have objectives. 1 has no sign-in, so could not be asked in the app.",
    );
    expect(askedLine({ notified: 4, alreadyHad: 0, noAccount: 3 })).toBe(
      "Asked 4 people. 3 have no sign-in, so could not be asked in the app.",
    );
    expect(askedLine({ notified: 4, alreadyHad: 0, noAccount: 0 })).toBe(
      "Asked 4 people.",
    );
  });
  it("reads a missing figure tolerantly", () => {
    expect(askedLine({})).toBe("Asked.");
    expect(askedLine({ notified: 3 })).toBe("Asked 3 people.");
  });
  it("names the day it was last asked, only when the API said", () => {
    expect(lastAskedLine({})).toBeNull();
    expect(lastAskedLine({ askedAt: "2026-11-24T10:00:00.000Z" })).toMatch(
      /^Last asked .*24/,
    );
    expect(lastAskedLine({ askedAt: "nonsense" })).toBeNull();
  });
  it("hides the button for an API that does not have it, on 404 and 410 only", () => {
    expect(notSwitchedOn(new ApiError(404, "c", "x"))).toBe(true);
    expect(notSwitchedOn(new ApiError(410, "c", "x"))).toBe(true);
    expect(notSwitchedOn(new ApiError(500, "c", "x"))).toBe(false);
    expect(notSwitchedOn(new ApiError(403, "c", "x"))).toBe(false);
  });
});
