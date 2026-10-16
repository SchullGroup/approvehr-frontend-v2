"use client";

import { useMemo } from "react";
import { Checkbox, Field, FilterBar, Input, Select } from "@/components/ui";
import { useScreeningGateway } from "@/lib/hiring/screening/use-gateway";
import {
  ScoreFilterFields,
  type ScoreFilterState,
} from "@/components/hiring/screening/score-filters";
import {
  appliedChips,
  channelLabel,
  rangeIsBackwards,
} from "@/lib/hiring/pipeline/filters";
import type { BoardFilters, Tag } from "@/lib/hiring/pipeline/model";

/**
 * What narrows a role's board or table: a search, a tag, where they heard of the
 * role, "needs a look", possible duplicates, and the days they entered.
 *
 * It owns no state. The screen holds the filters because the same filters drive
 * the board's columns, the table, and the "select everyone matching" count, and
 * one place keeps those three from disagreeing.
 *
 * ## Channels
 *
 * The API groups sources by the channel a link carried, so the options are the
 * channels the share links offer, plus the one currently chosen if it is a
 * company's own ("jobberman") that is not on the list.
 */

const CHANNELS = [
  "careers-page",
  "linkedin",
  "referral",
  "agency",
  "sourced",
  "x",
  "whatsapp",
  "facebook",
  "email",
] as const;

export function PipelineFilters({
  search,
  onSearchChange,
  filters,
  onChange,
  tags,
  count,
  actions,
  score,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  tags: readonly Tag[];
  /** The server's count under the filters, when it is known. */
  count?: number | undefined;
  /** Beside the filters: the view toggle and the outcome picker. */
  actions?: React.ReactNode;
  /** The score filters and the sort, held by the screen that also asks the board. */
  score?: ScoreFilterState;
}) {
  const gateway = useScreeningGateway();
  const channels = useMemo(() => {
    const list: string[] = [...CHANNELS];
    if (filters.source && !list.includes(filters.source))
      list.push(filters.source);
    return list;
  }, [filters.source]);

  const chips = [
    ...appliedChips(
      { ...filters, ...(search.trim() ? { q: search.trim() } : {}) },
      {
        tags: [...tags],
        clear: (key) => {
          const next = { ...filters };
          delete next[key];
          onChange(next);
        },
      },
    ),
    ...(score ? score.chips : []),
  ];
  const backwards = rangeIsBackwards(filters);

  const set = <K extends keyof BoardFilters>(
    key: K,
    value: BoardFilters[K] | undefined | "",
  ) => {
    const next = { ...filters };
    if (value === undefined || value === "" || value === false)
      delete next[key];
    else next[key] = value as BoardFilters[K];
    onChange(next);
  };

  return (
    <FilterBar
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Find a name, email or reference"
      searchLabel="Find a candidate by name, email or reference"
      applied={chips}
      onClearAll={() => {
        onSearchChange("");
        onChange({});
        score?.clear();
      }}
      count={count}
      noun={["person", "people"]}
      actions={actions}
    >
      <Field label="Tag">
        <Select
          value={filters.tagId ?? ""}
          onChange={(event) => set("tagId", event.target.value)}
        >
          <option value="">Any tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Heard via">
        <Select
          value={filters.source ?? ""}
          onChange={(event) => set("source", event.target.value)}
        >
          <option value="">Any source</option>
          {channels.map((channel) => (
            <option key={channel} value={channel}>
              {channelLabel(channel)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Entered from" optional>
        <Input
          type="date"
          value={filters.from ?? ""}
          max={filters.to || undefined}
          onChange={(event) => set("from", event.target.value)}
        />
      </Field>
      <Field
        label="Entered to"
        optional
        {...(backwards
          ? { error: "That is before the start date, so no dates are applied." }
          : {})}
      >
        <Input
          type="date"
          value={filters.to ?? ""}
          min={filters.from || undefined}
          onChange={(event) => set("to", event.target.value)}
        />
      </Field>
      {score && gateway.supports.board && <ScoreFilterFields state={score} />}
      <div className="flex flex-col justify-end gap-2.5 pb-1.5">
        <Checkbox
          label="Needs a look"
          description="A knockout answer was given."
          checked={Boolean(filters.flagged)}
          onChange={(event) => set("flagged", event.target.checked)}
        />
        <Checkbox
          label="Possible duplicates"
          description="Same email or phone as an earlier one."
          checked={Boolean(filters.duplicate)}
          onChange={(event) => set("duplicate", event.target.checked)}
        />
        <Checkbox
          label="Talent pool"
          description="Kept on file for another role."
          checked={Boolean(filters.talentPool)}
          onChange={(event) => set("talentPool", event.target.checked)}
        />
      </div>
    </FilterBar>
  );
}
