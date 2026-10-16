import { describe, expect, it } from "vitest";
import type {
  FitSummary,
  ScreeningSummary,
} from "@/lib/hiring/screening/model";
import { SORTS, SCORE_STATUSES } from "@/lib/hiring/screening/model";
import {
  STATUS_OPTIONS,
  STALE_NOTE,
  VERDICT_WORDS,
  cleanScoreFilters,
  compareBySort,
  fitAnnouncement,
  matchesScoreFilters,
  parseScoreBound,
  scoreRangeBackwards,
  sortParams,
  statusWords,
} from "@/lib/hiring/screening/score";

/**
 * How a score is put into words, and how a list is narrowed and ordered by it.
 *
 * The rules these hold: the number is always in the text, no status reads as a
 * verdict on a person, a range only ever matches people who have a score, and
 * somebody with no score sorts after everybody who has one, never as a zero.
 */

const fit = (over: Partial<FitSummary> = {}): FitSummary => ({
  status: "SCORED",
  score: 72,
  version: 2,
  stale: false,
  ...over,
});

const summary = (
  over: Partial<ScreeningSummary> & { fit?: FitSummary } = {},
): ScreeningSummary => ({
  fit: fit(),
  assessment: null,
  knockoutCount: 0,
  belowPassMark: false,
  ...over,
});

describe("the words for a score", () => {
  it("writes the number, out of 100", () => {
    expect(statusWords(fit()).label).toBe("Fit 72");
    expect(statusWords(fit()).detail).toMatch(/72 out of 100/);
    expect(fitAnnouncement(fit())).toBe("Fit score 72 out of 100");
  });

  it("says a stale score was worked out with an older version", () => {
    expect(fitAnnouncement(fit({ stale: true }))).toMatch(/older version/);
    expect(STALE_NOTE).toMatch(/older version/);
  });

  it("has a status for every way of having no score, and none says zero", () => {
    for (const status of SCORE_STATUSES) {
      if (status === "SCORED") continue;
      const words = statusWords(fit({ status, score: null }));
      expect(words.label).not.toMatch(/\b0\b/);
      expect(words.detail.length).toBeGreaterThan(20);
    }
    expect(statusWords(fit({ status: "NO_TEXT", score: null })).label).toBe(
      "Needs a person to read it",
    );
    expect(
      statusWords(fit({ status: "WAITING_FOR_TEXT", score: null })).label,
    ).toBe("Waiting for CV text");
    expect(statusWords(fit({ status: "NO_CRITERIA", score: null })).label).toBe(
      "No criteria yet",
    );
  });

  it("never reads as a verdict on a person, in any status or verdict", () => {
    const all = [
      ...SCORE_STATUSES.flatMap((status) => {
        const w = statusWords(
          fit({ status, score: status === "SCORED" ? 40 : null }),
        );
        return [w.label, w.detail];
      }),
      ...Object.values(VERDICT_WORDS).flatMap((w) => [w.label, w.detail]),
      ...STATUS_OPTIONS.map((o) => o.label),
      ...SORTS.map((o) => o.label),
      STALE_NOTE,
    ].join(" ");
    expect(all).not.toMatch(
      /reject|fail|eliminat|disqualif|\bAI\b|artificial|machine|algorithm|automat/i,
    );
  });

  it("keeps unknown apart from missing", () => {
    expect(VERDICT_WORDS.UNKNOWN.label).toBe("Unknown");
    expect(VERDICT_WORDS.UNKNOWN.detail).toMatch(/left out of the score/);
    expect(VERDICT_WORDS.MISSING.label).toBe("Missing");
  });
});

describe("narrowing by score", () => {
  it("only gives a range to people who have a score", () => {
    const scored = summary({ fit: fit({ score: 55 }) });
    const none = summary({ fit: fit({ status: "NO_TEXT", score: null }) });
    expect(matchesScoreFilters(scored, { scoreMin: 50, scoreMax: 60 })).toBe(
      true,
    );
    expect(matchesScoreFilters(scored, { scoreMin: 56 })).toBe(false);
    expect(matchesScoreFilters(scored, { scoreMax: 54 })).toBe(false);
    expect(matchesScoreFilters(none, { scoreMin: 0 })).toBe(false);
    expect(matchesScoreFilters(none, { scoreMax: 100 })).toBe(false);
  });

  it("finds somebody with no score by their status", () => {
    const none = summary({ fit: fit({ status: "NO_TEXT", score: null }) });
    expect(matchesScoreFilters(none, { scoreStatus: "NO_TEXT" })).toBe(true);
    expect(matchesScoreFilters(none, { scoreStatus: "SCORED" })).toBe(false);
  });

  it("applies neither bound of a backwards range", () => {
    expect(scoreRangeBackwards({ scoreMin: 80, scoreMax: 20 })).toBe(true);
    expect(cleanScoreFilters({ scoreMin: 80, scoreMax: 20 })).toEqual({});
  });

  it("reads a bound as a whole number from 0 to 100, or nothing", () => {
    expect(parseScoreBound("0")).toBe(0);
    expect(parseScoreBound(" 100 ")).toBe(100);
    expect(parseScoreBound("101")).toBeUndefined();
    expect(parseScoreBound("-1")).toBeUndefined();
    expect(parseScoreBound("4.5")).toBeUndefined();
    expect(parseScoreBound("")).toBeUndefined();
  });
});

describe("ordering by score", () => {
  const person = (id: string, s: ScreeningSummary, at = "2026-08-01") => ({
    id,
    summary: s,
    at,
  });
  const order = (
    sort: Parameters<typeof compareBySort>[0],
    list: ReturnType<typeof person>[],
  ) => [...list].sort((a, b) => compareBySort(sort, a, b)).map((p) => p.id);

  const a = person("a", summary({ fit: fit({ score: 40 }) }));
  const b = person("b", summary({ fit: fit({ score: 90 }) }));
  const c = person(
    "c",
    summary({ fit: fit({ status: "NO_TEXT", score: null }) }),
  );
  const d = person("d", summary({ fit: fit({ score: 90 }) }), "2026-09-01");

  it("puts the best first, ties newest first, and no score last", () => {
    expect(order("fit-desc", [a, b, c, d])).toEqual(["d", "b", "a", "c"]);
  });

  it("puts the lowest first, and still no score last", () => {
    expect(order("fit-asc", [a, b, c])).toEqual(["a", "b", "c"]);
  });

  it("orders by assessment, with nobody un-assessed ahead of anybody assessed", () => {
    const x = person("x", summary({ assessment: 30 }));
    const y = person("y", summary({ assessment: null }));
    const z = person("z", summary({ assessment: 80 }));
    expect(order("assessment-desc", [x, y, z])).toEqual(["z", "x", "y"]);
  });

  it("orders by how many answers raised a flag", () => {
    const x = person("x", summary({ knockoutCount: 1 }));
    const y = person("y", summary({ knockoutCount: 3 }));
    expect(order("knockouts-desc", [x, y])).toEqual(["y", "x"]);
  });

  it("asks the API in its own words", () => {
    expect(sortParams("newest")).toBeNull();
    expect(sortParams("fit-desc")).toEqual({ sort: "fitScore", order: "desc" });
    expect(sortParams("knockouts-desc")).toEqual({
      sort: "knockoutCount",
      order: "desc",
    });
  });
});
