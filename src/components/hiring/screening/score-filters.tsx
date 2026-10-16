"use client";

import { useCallback, useState } from "react";
import { Field, Input, Select, type AppliedFilter } from "@/components/ui";
import type {
  ScoreFilters,
  ScoreStatus,
  ScreeningSort,
} from "@/lib/hiring/screening/model";
import { SORTS } from "@/lib/hiring/screening/model";
import {
  STATUS_OPTIONS,
  cleanScoreFilters,
  parseScoreBound,
  scoreRangeBackwards,
} from "@/lib/hiring/screening/score";

/**
 * Filtering and sorting by score, the same on the queue and on the board.
 *
 * ## What the boxes mean
 *
 * A range only ever matches people who **have** a score: "fit 40 to 80" does not
 * quietly include somebody whose CV has not been read. Somebody with no score is
 * found by their status instead ("Needs a person to read it"), which is its own
 * question with its own answer.
 *
 * ## Why a hook holds the text
 *
 * A half-typed "4" is not a bound, and "abc" is not a number. The hook keeps what
 * is typed, hands the screen only what is valid, and says which box to mark.
 */

export type ScoreFilterState = {
  minText: string;
  maxText: string;
  status: ScoreStatus | "";
  sort: ScreeningSort;
  setMinText: (text: string) => void;
  setMaxText: (text: string) => void;
  setStatus: (status: ScoreStatus | "") => void;
  setSort: (sort: ScreeningSort) => void;
  /** What is valid to ask. */
  filters: ScoreFilters;
  minBad: boolean;
  maxBad: boolean;
  backwards: boolean;
  /** Any score filter in force (sorting is not one). */
  narrowed: boolean;
  chips: AppliedFilter[];
  clear: () => void;
};

export function useScoreFilterState(): ScoreFilterState {
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [status, setStatus] = useState<ScoreStatus | "">("");
  const [sort, setSort] = useState<ScreeningSort>("newest");

  const min = parseScoreBound(minText);
  const max = parseScoreBound(maxText);
  const minBad = minText.trim() !== "" && min === undefined;
  const maxBad = maxText.trim() !== "" && max === undefined;
  const raw: ScoreFilters = {
    ...(min !== undefined ? { scoreMin: min } : {}),
    ...(max !== undefined ? { scoreMax: max } : {}),
    ...(status ? { scoreStatus: status } : {}),
  };
  const backwards = scoreRangeBackwards(raw);
  const filters = cleanScoreFilters(raw);

  const clear = useCallback(() => {
    setMinText("");
    setMaxText("");
    setStatus("");
  }, []);

  const chips: AppliedFilter[] = [];
  if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
    chips.push({
      label: "Fit score",
      value:
        filters.scoreMin !== undefined && filters.scoreMax !== undefined
          ? `${String(filters.scoreMin)} to ${String(filters.scoreMax)}`
          : filters.scoreMin !== undefined
            ? `${String(filters.scoreMin)} or more`
            : `${String(filters.scoreMax ?? "")} or less`,
      onClear: () => {
        setMinText("");
        setMaxText("");
      },
    });
  }
  if (filters.scoreStatus) {
    chips.push({
      label: "Score",
      value:
        STATUS_OPTIONS.find((option) => option.value === filters.scoreStatus)
          ?.label ?? "",
      onClear: () => setStatus(""),
    });
  }

  return {
    minText,
    maxText,
    status,
    sort,
    setMinText,
    setMaxText,
    setStatus,
    setSort,
    filters,
    minBad,
    maxBad,
    backwards,
    narrowed: chips.length > 0,
    chips,
    clear,
  };
}

/** The four fields, for a `FilterBar`'s children. */
export function ScoreFilterFields({ state }: { state: ScoreFilterState }) {
  return (
    <>
      <Field label="Sort by">
        <Select
          value={state.sort}
          onChange={(event) =>
            state.setSort(event.target.value as ScreeningSort)
          }
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Fit score from"
        optional
        {...(state.minBad ? { error: "0 to 100" } : {})}
      >
        <Input
          inputMode="numeric"
          value={state.minText}
          placeholder="0"
          onChange={(event) => state.setMinText(event.target.value)}
        />
      </Field>
      <Field
        label="Fit score to"
        optional
        {...(state.maxBad
          ? { error: "0 to 100" }
          : state.backwards
            ? { error: "That is below the start, so no scores are applied." }
            : {})}
      >
        <Input
          inputMode="numeric"
          value={state.maxText}
          placeholder="100"
          onChange={(event) => state.setMaxText(event.target.value)}
        />
      </Field>
      <Field label="Score status">
        <Select
          value={state.status}
          onChange={(event) =>
            state.setStatus(event.target.value as ScoreStatus | "")
          }
        >
          <option value="">Any</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
