import { describe, expect, it } from "vitest";
import {
  JOIN_LINK_HINT,
  cleanJoinLink,
  joinLinkProblem,
  joinLinkProvider,
} from "@/lib/hiring/interviews/join-link";

/**
 * The link to an online interview goes into a candidate's email and a calendar file, so
 * it is https and nothing else, with no spaces, no password in it and no script.
 */

describe("a join link", () => {
  it("is optional: nothing typed is nothing wrong", () => {
    expect(joinLinkProblem("")).toBeNull();
    expect(joinLinkProblem("   ")).toBeNull();
    expect(cleanJoinLink("   ")).toBeNull();
  });

  it("accepts an https link from the usual places", () => {
    for (const link of [
      "https://meet.google.com/abc-defg-hij",
      "https://zoom.us/j/84012345678?pwd=abc",
      "https://us02web.zoom.us/j/84012345678",
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
      "  https://example.com/room  ",
    ]) {
      expect(joinLinkProblem(link), link).toBeNull();
    }
  });

  it("refuses everything that is not https", () => {
    for (const link of [
      "http://meet.google.com/abc",
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com/x",
      "meet.google.com/abc-defg-hij",
      "mailto:a@b.co",
    ]) {
      expect(joinLinkProblem(link), link).not.toBeNull();
    }
    expect(joinLinkProblem("http://meet.google.com/abc")).toBe(
      "Use a link that starts with https://",
    );
  });

  it("refuses a link with a space in it, a password in it or no real host", () => {
    expect(joinLinkProblem("https://meet.google.com/a b")).toContain(
      "no spaces",
    );
    expect(joinLinkProblem("https://user:pass@example.com/x")).toContain(
      "name or password",
    );
    expect(joinLinkProblem("https://localhost/x")).not.toBeNull();
    expect(
      joinLinkProblem(`https://example.com/${"a".repeat(1100)}`),
    ).toContain("1000 characters");
  });

  it("refuses a bare address and localhost: the usual way a link that is not what it says it is is written", () => {
    for (const link of [
      "https://192.168.1.10/room",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://localhost/x",
    ])
      expect(joinLinkProblem(link), link).toBe(
        "A join link has to be a full https:// address to a website, like https://meet.example.com/abc.",
      );
  });

  it("names the call it looks like, and says nothing about one it does not know", () => {
    expect(joinLinkProvider("https://meet.google.com/abc-defg-hij")).toBe(
      "Google Meet",
    );
    expect(joinLinkProvider("https://us02web.zoom.us/j/1")).toBe("Zoom");
    expect(joinLinkProvider("https://teams.microsoft.com/l/x")).toBe(
      "Microsoft Teams",
    );
    expect(joinLinkProvider("https://example.com/room")).toBeNull();
    expect(joinLinkProvider("http://meet.google.com/x")).toBeNull();
  });

  it("carries the hint the dialog shows before anything is typed", () => {
    expect(JOIN_LINK_HINT).toBe("Paste a Google Meet / Zoom / Teams link");
  });
});
