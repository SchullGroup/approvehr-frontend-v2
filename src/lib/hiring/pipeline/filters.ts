import type { AppliedFilter } from "@/components/ui";
import {
  cleanScoreFilters,
  matchesScoreFilters,
  scoreRangeBackwards,
  STATUS_OPTIONS,
} from "@/lib/hiring/screening/score";
import type { BoardCard, BoardFilters, Tag } from "./model";

/**
 * The questions a board, a table and a bulk selection all ask.
 *
 * One definition of "what narrows a list", so the board's filter bar, the "select
 * everyone matching these filters" count and the demo's own matching cannot
 * disagree about who is in. No React, no state.
 */

/** The channel's own name for itself, for a chip and a menu. */
const CHANNEL_WORDS: Record<string, string> = {
  "careers-page": "Careers page",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  email: "Email",
  referral: "Referral",
  agency: "Agency",
  sourced: "Sourced by a recruiter",
  jobberman: "Jobberman",
};

export function channelLabel(source: string | null | undefined): string {
  if (!source) return "Not given";
  return (
    CHANNEL_WORDS[source] ??
    source.charAt(0).toUpperCase() + source.slice(1).replace(/-/g, " ")
  );
}

/** No filters at all. */
export const NO_FILTERS: BoardFilters = {};

export function hasFilters(filters: BoardFilters): boolean {
  return (
    Boolean(filters.q?.trim()) ||
    Boolean(filters.tagId) ||
    Boolean(filters.source) ||
    Boolean(filters.flagged) ||
    filters.knockoutMin !== undefined ||
    Boolean(filters.belowCutoff) ||
    Boolean(filters.duplicate) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.talentPool) ||
    Object.keys(cleanScoreFilters(filters)).length > 0
  );
}

/** Start after end is nobody's question; the screen says so and sends neither. */
export function rangeIsBackwards(filters: BoardFilters): boolean {
  return Boolean(filters.from && filters.to && filters.from > filters.to);
}

/** Drops anything empty or unusable so equal questions produce equal keys. */
export function cleanFilters(filters: BoardFilters): BoardFilters {
  const out: BoardFilters = {};
  const q = filters.q?.trim();
  if (q) out.q = q;
  if (filters.tagId) out.tagId = filters.tagId;
  if (filters.source) out.source = filters.source;
  if (filters.flagged) out.flagged = true;
  if (filters.knockoutMin !== undefined && filters.knockoutMin >= 1)
    out.knockoutMin = filters.knockoutMin;
  if (filters.belowCutoff) out.belowCutoff = true;
  if (filters.duplicate) out.duplicate = true;
  if (filters.talentPool) out.talentPool = true;
  if (!rangeIsBackwards(filters)) {
    if (filters.from) out.from = filters.from;
    if (filters.to) out.to = filters.to;
  }
  Object.assign(out, cleanScoreFilters(filters));
  if (filters.sort && filters.sort !== "newest") out.sort = filters.sort;
  return out;
}

/** A stable key: changes exactly when the question does. */
export const filterKey = (filters: BoardFilters): string =>
  JSON.stringify(cleanFilters(filters));

/** The removable chips under the filter bar. */
export function appliedChips(
  filters: BoardFilters,
  context: {
    tags: Tag[];
    clear: (key: keyof BoardFilters) => void;
  },
): AppliedFilter[] {
  const chips: AppliedFilter[] = [];
  if (filters.tagId) {
    chips.push({
      label: "Tag",
      value:
        context.tags.find((tag) => tag.id === filters.tagId)?.name ??
        "Selected tag",
      onClear: () => context.clear("tagId"),
    });
  }
  if (filters.source) {
    chips.push({
      label: "Heard via",
      value: channelLabel(filters.source),
      onClear: () => context.clear("source"),
    });
  }
  if (filters.flagged) {
    chips.push({
      label: "Showing",
      value: "Needs a look",
      onClear: () => context.clear("flagged"),
    });
  }
  if (filters.knockoutMin !== undefined && filters.knockoutMin >= 1) {
    chips.push({
      label: "Flagged answers",
      value:
        filters.knockoutMin === 1
          ? "1 or more"
          : `${String(filters.knockoutMin)} or more`,
      onClear: () => context.clear("knockoutMin"),
    });
  }
  if (filters.belowCutoff) {
    chips.push({
      label: "Showing",
      value: "Below the pass mark",
      onClear: () => context.clear("belowCutoff"),
    });
  }
  if (filters.duplicate) {
    chips.push({
      label: "Showing",
      value: "Possible duplicates",
      onClear: () => context.clear("duplicate"),
    });
  }
  if (filters.talentPool) {
    chips.push({
      label: "Showing",
      value: "Talent pool",
      onClear: () => context.clear("talentPool"),
    });
  }
  if (filters.from) {
    chips.push({
      label: "Entered from",
      value: filters.from,
      onClear: () => context.clear("from"),
    });
  }
  if (filters.to) {
    chips.push({
      label: "Entered to",
      value: filters.to,
      onClear: () => context.clear("to"),
    });
  }
  if (
    (filters.scoreMin !== undefined || filters.scoreMax !== undefined) &&
    !scoreRangeBackwards(filters)
  ) {
    chips.push({
      label: "Fit score",
      value:
        filters.scoreMin !== undefined && filters.scoreMax !== undefined
          ? `${String(filters.scoreMin)} to ${String(filters.scoreMax)}`
          : filters.scoreMin !== undefined
            ? `${String(filters.scoreMin)} or more`
            : `${String(filters.scoreMax ?? "")} or less`,
      onClear: () => {
        context.clear("scoreMin");
        context.clear("scoreMax");
      },
    });
  }
  if (filters.scoreStatus) {
    chips.push({
      label: "Score",
      value:
        STATUS_OPTIONS.find((option) => option.value === filters.scoreStatus)
          ?.label ?? "",
      onClear: () => context.clear("scoreStatus"),
    });
  }
  return chips;
}

/**
 * Whether a card is in, for the demo's own list.
 *
 * Mirrors what the API does so the demo cannot show a list the real one would
 * not: every word of the search must be in the name or the email, dates are
 * inclusive, and the day is the day they entered the pipeline.
 */
export function cardMatches(
  card: BoardCard,
  filters: BoardFilters,
  enteredOn: string,
): boolean {
  const words = (filters.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length > 0) {
    const haystack =
      `${card.name} ${card.email ?? ""} ${card.reference ?? ""}`.toLowerCase();
    if (!words.every((word) => haystack.includes(word))) return false;
  }
  if (filters.tagId && !card.tags.some((tag) => tag.id === filters.tagId))
    return false;
  if (filters.source && card.source !== filters.source) return false;
  if (filters.flagged && !card.flagged) return false;
  /* Somebody added by hand has no application, so no answers to be flagged on. */
  if (
    filters.knockoutMin !== undefined &&
    (card.screening?.knockoutCount ?? 0) < filters.knockoutMin
  )
    return false;
  if (filters.belowCutoff && card.screening?.belowPassMark !== true)
    return false;
  if (filters.duplicate && !card.duplicate) return false;
  if (filters.talentPool && !card.talentPool) return false;
  if (filters.from && enteredOn < filters.from) return false;
  if (filters.to && enteredOn > filters.to) return false;
  /* A range only ever matches people who have a score. */
  if (
    (filters.scoreMin !== undefined ||
      filters.scoreMax !== undefined ||
      filters.scoreStatus) &&
    !(card.screening && matchesScoreFilters(card.screening, filters))
  )
    return false;
  return true;
}
