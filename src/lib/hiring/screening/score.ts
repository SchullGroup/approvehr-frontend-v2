import type { BadgeTone } from "@/components/ui";
import type {
  FitSummary,
  ScoreFilters,
  ScoreStatus,
  ScreeningSort,
  ScreeningSummary,
  Verdict,
} from "./model";

/**
 * How a score is put into words.
 *
 * Everything a screen says about a fit score goes through here, so the words are
 * chosen once and a test can read all of them at the same time. The rules they
 * follow:
 *
 * - **The number is in the text.** A bar, a colour or a position is decoration; the
 *   figure and its status are always written, so nothing depends on seeing a
 *   colour.
 * - **No verdicts.** "Below the pass mark" and "needs a look", never "rejected",
 *   "failed" or "eliminated". A score ranks people for a person to read; it
 *   decides nothing.
 * - **No model, no machine.** The score is a count of matches against criteria
 *   somebody wrote. The screens never describe it as anything cleverer.
 * - **Honest about gaps.** No text is "needs a person to read it", not a zero; a
 *   CV that does not say is "unknown", not "missing".
 */

/** How the status reads on a badge or a line, and how loudly. */
export type StatusWords = {
  /** Short, for a badge. */
  label: string;
  /** A sentence for a record or a tooltip. */
  detail: string;
  tone: BadgeTone;
};

const STATUS_WORDS: Record<Exclude<ScoreStatus, "SCORED">, StatusWords> = {
  WAITING_FOR_TEXT: {
    label: "Waiting for CV text",
    detail:
      "The CV is in line to be read. A score appears once its text has been read.",
    tone: "neutral",
  },
  NO_TEXT: {
    label: "Needs a person to read it",
    detail:
      "There is no text in this CV to read, as with a scan or a photograph, so it has no score. It needs a person to read it.",
    tone: "warning",
  },
  NO_CRITERIA: {
    label: "No criteria yet",
    detail:
      "This advert has no screening criteria, so there is nothing to score against.",
    tone: "neutral",
  },
  COULD_NOT_READ: {
    label: "Could not read the CV",
    detail:
      "The file would not open, so it has no score. It needs a person to read it.",
    tone: "warning",
  },
};

export function statusWords(fit: FitSummary): StatusWords {
  if (fit.status === "SCORED" && fit.score !== null) {
    return {
      label: `Fit ${String(fit.score)}`,
      detail: `Fit score ${String(fit.score)} out of 100. It is advice for the person reading, not a decision.`,
      tone: "accent",
    };
  }
  const status = fit.status === "SCORED" ? "NO_CRITERIA" : fit.status;
  return STATUS_WORDS[status];
}

/** The words for a status on its own, for a filter menu. */
export const STATUS_OPTIONS: { value: ScoreStatus; label: string }[] = [
  { value: "SCORED", label: "Scored" },
  { value: "WAITING_FOR_TEXT", label: "Waiting for CV text" },
  { value: "NO_TEXT", label: "Needs a person to read it" },
  { value: "COULD_NOT_READ", label: "Could not read the CV" },
  { value: "NO_CRITERIA", label: "No criteria yet" },
];

/** What a screen reader hears for a fit badge: the number and the status, not the bar. */
export function fitAnnouncement(fit: FitSummary): string {
  const words = statusWords(fit);
  const base =
    fit.status === "SCORED" && fit.score !== null
      ? `Fit score ${String(fit.score)} out of 100`
      : words.label;
  return fit.stale ? `${base}, worked out with an older version` : base;
}

/** The line under a stale score. */
export const STALE_NOTE =
  "Scored with an older version of the criteria. A new score is on its way.";

/* -------------------------------------------------------------------- verdicts */

export const VERDICT_WORDS: Record<
  Verdict,
  { label: string; tone: BadgeTone; detail: string }
> = {
  MATCHED: {
    label: "Matched",
    tone: "success",
    detail: "The CV says so.",
  },
  PARTIAL: {
    label: "Partly",
    tone: "info",
    detail: "The CV says something close, or only part of it.",
  },
  MISSING: {
    label: "Missing",
    tone: "neutral",
    detail: "The CV was read and does not show it.",
  },
  UNKNOWN: {
    label: "Unknown",
    tone: "neutral",
    detail: "The CV does not say, so this is left out of the score.",
  },
};

/* ------------------------------------------------------------ sort and filter */

/** The API's own words for each sort, kept in one place. */
export function sortParams(sort: ScreeningSort): {
  sort: string;
  order: "asc" | "desc";
} | null {
  switch (sort) {
    case "newest":
      return null;
    case "fit-desc":
      return { sort: "fitScore", order: "desc" };
    case "fit-asc":
      return { sort: "fitScore", order: "asc" };
    case "assessment-desc":
      return { sort: "assessmentScore", order: "desc" };
    case "knockouts-desc":
      return { sort: "knockoutCount", order: "desc" };
  }
}

/** Whether a range names no one: the start is after the end. */
export function scoreRangeBackwards(filters: ScoreFilters): boolean {
  return (
    filters.scoreMin !== undefined &&
    filters.scoreMax !== undefined &&
    filters.scoreMin > filters.scoreMax
  );
}

/** Whole numbers 0 to 100 only, and nothing for a blank. */
export function parseScoreBound(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "" || !/^\d{1,3}$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= 0 && value <= 100 ? value : undefined;
}

/** Drops anything empty or backwards, so equal questions make equal keys. */
export function cleanScoreFilters(filters: ScoreFilters): ScoreFilters {
  const out: ScoreFilters = {};
  if (!scoreRangeBackwards(filters)) {
    if (filters.scoreMin !== undefined) out.scoreMin = filters.scoreMin;
    if (filters.scoreMax !== undefined) out.scoreMax = filters.scoreMax;
  }
  if (filters.scoreStatus) out.scoreStatus = filters.scoreStatus;
  return out;
}

export const hasScoreFilters = (filters: ScoreFilters): boolean =>
  Object.keys(cleanScoreFilters(filters)).length > 0;

/**
 * Whether a person is in under a score filter. Mirrors what the API does, so the
 * demo cannot show a list the real one would not: a range only ever matches people
 * who *have* a score, and a status matches exactly.
 */
export function matchesScoreFilters(
  summary: ScreeningSummary,
  filters: ScoreFilters,
): boolean {
  const { scoreMin, scoreMax, scoreStatus } = cleanScoreFilters(filters);
  if (scoreStatus && summary.fit.status !== scoreStatus) return false;
  if (scoreMin !== undefined || scoreMax !== undefined) {
    const score = summary.fit.score;
    if (score === null) return false;
    if (scoreMin !== undefined && score < scoreMin) return false;
    if (scoreMax !== undefined && score > scoreMax) return false;
  }
  return true;
}

/** Highest first; people with no score after everybody who has one, never as zeros. */
export function compareBySort(
  sort: ScreeningSort,
  a: { summary: ScreeningSummary; at: string; id: string },
  b: { summary: ScreeningSummary; at: string; id: string },
): number {
  const newest = b.at.localeCompare(a.at) || b.id.localeCompare(a.id);
  const byNumber = (
    x: number | null,
    y: number | null,
    direction: "asc" | "desc",
  ): number => {
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return direction === "desc" ? y - x : x - y;
  };
  switch (sort) {
    case "newest":
      return newest;
    case "fit-desc":
      return (
        byNumber(a.summary.fit.score, b.summary.fit.score, "desc") || newest
      );
    case "fit-asc":
      return (
        byNumber(a.summary.fit.score, b.summary.fit.score, "asc") || newest
      );
    case "assessment-desc":
      return (
        byNumber(a.summary.assessment, b.summary.assessment, "desc") || newest
      );
    case "knockouts-desc":
      return b.summary.knockoutCount - a.summary.knockoutCount || newest;
  }
}

/** "1,240", the way the rest of the product writes a count. */
export const count = (n: number): string => n.toLocaleString("en-NG");
