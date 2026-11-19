import { describe, expect, it } from "vitest";
import {
  counter,
  diffBody,
  draftFromDetail,
  saveProblem,
  type LetterDraft,
} from "@/lib/queries/draft";
import { detail } from "./queries-fixtures";

const ZONE = "Africa/Lagos";

const base = (): LetterDraft =>
  draftFromDetail(
    detail({
      status: "DRAFT",
      rulesRelied: "Attendance policy 4.2",
      replyBy: "2026-11-20T16:00:00.000Z",
    }),
    ZONE,
  );

describe("the draft as the form holds it", () => {
  it("reads the reply-by time as the wall in the company's zone", () => {
    const draft = base();
    expect(draft.replyByDay).toBe("2026-11-20");
    expect(draft.replyByTime).toBe("17:00");
  });

  it("turns nothing into an empty string, never the word null", () => {
    const draft = draftFromDetail(
      detail({ rulesRelied: null, incidentOn: null, replyBy: null }),
      ZONE,
    );
    expect(draft.rulesRelied).toBe("");
    expect(draft.incidentOn).toBe("");
    expect(draft.replyByDay).toBe("");
  });
});

describe("what is sent", () => {
  it("is nothing when nothing changed", () => {
    const draft = base();
    expect(diffBody(draft, draft, ZONE)).toEqual({ ok: true, body: {} });
  });

  it("is only the field that changed", () => {
    const saved = base();
    const result = diffBody(
      { ...saved, question: "A different question, in full." },
      saved,
      ZONE,
    );
    expect(result).toEqual({
      ok: true,
      body: { question: "A different question, in full." },
    });
  });

  it("trims what it sends, and does not send a change that is only spaces", () => {
    const saved = base();
    expect(
      diffBody(
        { ...saved, subjectLine: `${saved.subjectLine}   ` },
        saved,
        ZONE,
      ),
    ).toEqual({ ok: true, body: {} });
  });

  it("clears an optional field with null and never with an empty string", () => {
    const saved = base();
    const result = diffBody(
      { ...saved, rulesRelied: "  ", incidentUntil: "" },
      saved,
      ZONE,
    );
    expect(result).toEqual({
      ok: true,
      body: { rulesRelied: null, incidentUntil: null },
    });
  });

  it("sends a reply-by time as an instant converted from the company's zone", () => {
    const saved = base();
    const result = diffBody(
      { ...saved, replyByDay: "2026-11-25", replyByTime: "09:30" },
      saved,
      ZONE,
    );
    expect(result).toEqual({
      ok: true,
      body: { replyBy: "2026-11-25T08:30:00.000Z" },
    });
  });

  it("names a time that is not real instead of sending a different one", () => {
    const saved = base();
    const result = diffBody(
      { ...saved, replyByDay: "2026-02-31", replyByTime: "09:00" },
      saved,
      ZONE,
    );
    expect(result.ok).toBe(false);
  });

  it("sends how it was served and who handed it over", () => {
    const saved = base();
    const result = diffBody(
      {
        ...saved,
        servedHow: "IN_PERSON",
        servedAtDay: "2026-11-18",
        servedAtTime: "11:00",
        servedHandedByName: " Fatima Bello ",
      },
      saved,
      ZONE,
    );
    expect(result).toEqual({
      ok: true,
      body: {
        servedHow: "IN_PERSON",
        servedAt: "2026-11-18T10:00:00.000Z",
        servedHandedByName: "Fatima Bello",
      },
    });
  });
});

describe("what a draft may be saved with", () => {
  it("asks for a subject line of three characters, which is looser than issuing needs", () => {
    expect(saveProblem({ ...base(), subjectLine: "ab" })).toMatch(
      /at least three/,
    );
    expect(saveProblem({ ...base(), subjectLine: "abc" })).toBeNull();
  });

  it("names a box that is over its limit", () => {
    expect(saveProblem({ ...base(), whatHappened: "x".repeat(5001) })).toMatch(
      /5000/,
    );
    expect(saveProblem({ ...base(), question: "x".repeat(2001) })).toMatch(
      /2000/,
    );
  });
});

describe("the counter", () => {
  it("is quiet until it is close", () => {
    expect(counter("short", 300)).toBeNull();
  });
  it("shows a figure near the end and past it, and never truncates", () => {
    expect(counter("x".repeat(250), 300)).toBe("250 of 300 characters");
    expect(counter("x".repeat(310), 300)).toBe("310 of 300 characters");
  });
});
