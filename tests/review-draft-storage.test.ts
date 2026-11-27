import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
} from "@/app/(focus)/performance/reviews/[id]/answer/draft-storage";

/**
 * What a review keeps in this browser until it is sent: the mark, how far the
 * person could go, the closing note, and the page. How far they could go was
 * not kept at all, so reloading a manager's form lost it while every page said
 * answers were kept.
 */

const key = (id: string) => `ahr:review-draft:${id}`;

beforeEach(() => window.localStorage.clear());

describe("the review draft held in this browser", () => {
  it("holds how far they could go, and why, across a reload", () => {
    writeLocalDraft("r1", {
      mark: "",
      summary: "",
      step: 3,
      potential: "HIGH",
      potentialReason: "Led the migration end to end.",
    });
    expect(readLocalDraft("r1")).toEqual({
      mark: "",
      summary: "",
      step: 3,
      potential: "HIGH",
      potentialReason: "Led the migration end to end.",
    });
  });

  it("holds an answer on its own, with nothing else typed and no page left", () => {
    writeLocalDraft("r1", {
      mark: "",
      summary: "",
      step: 0,
      potential: "LOW",
      potentialReason: "",
    });
    expect(readLocalDraft("r1").potential).toBe("LOW");
    expect(window.localStorage.getItem(key("r1"))).not.toBeNull();
  });

  it("keeps nothing once there is nothing to keep", () => {
    writeLocalDraft("r1", {
      mark: "",
      summary: "  ",
      step: 0,
      potential: "",
      potentialReason: "  ",
    });
    expect(window.localStorage.getItem(key("r1"))).toBeNull();
  });

  it("does not take anything as an answer that is not one of the three", () => {
    window.localStorage.setItem(
      key("r1"),
      JSON.stringify({ potential: "SOMEWHAT", potentialReason: "x", step: 2 }),
    );
    expect(readLocalDraft("r1").potential).toBe("");
    window.localStorage.setItem(key("r1"), JSON.stringify({ potential: 3 }));
    expect(readLocalDraft("r1").potential).toBe("");
  });

  it("reads a draft saved before it held these as one with neither", () => {
    window.localStorage.setItem(
      key("r1"),
      JSON.stringify({ mark: "4", summary: "A note.", step: 2 }),
    );
    expect(readLocalDraft("r1")).toEqual({
      mark: "4",
      summary: "A note.",
      step: 2,
      potential: "",
      potentialReason: "",
    });
  });

  it("is per review, and cleared by the send", () => {
    writeLocalDraft("r1", {
      mark: "",
      summary: "",
      step: 1,
      potential: "MEDIUM",
      potentialReason: "",
    });
    expect(readLocalDraft("r2").potential).toBe("");
    clearLocalDraft("r1");
    expect(readLocalDraft("r1").potential).toBe("");
  });

  it("survives storage being unreadable", () => {
    window.localStorage.setItem(key("r1"), "{not json");
    expect(readLocalDraft("r1").potential).toBe("");
  });
});
