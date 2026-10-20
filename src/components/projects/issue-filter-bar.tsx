"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Select } from "@/components/ui";
import {
  EMPTY_FILTER,
  UNASSIGNED,
  filterAssigneeIds,
  isFiltering,
  toggleAssignee,
} from "@/lib/projects/filters";
import {
  ISSUE_TYPES,
  ISSUE_TYPE_LABEL,
  type IssueType,
} from "@/lib/projects/types";
import { PersonAvatar } from "./person";
import { useProject } from "./project-context";

/**
 * The bar above every list of issues: text, people, "only mine", type.
 *
 * One filter per project, shared by Board, Backlog and All issues, so narrowing
 * the board and then opening the table keeps the narrowing. The text box is the
 * target of the `/` shortcut (`FILTER_INPUT_ID`).
 */

export const FILTER_INPUT_ID = "project-filter-input";

export function IssueFilterBar({ extra }: { extra?: React.ReactNode }) {
  const { project, issues, people, meId, filter, setFilter } = useProject();
  const ids = filterAssigneeIds(project.memberIds, issues);
  const active = isFiltering(filter);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          id={FILTER_INPUT_ID}
          type="search"
          value={filter.q}
          onChange={(event) => setFilter({ ...filter, q: event.target.value })}
          placeholder="Filter issues"
          aria-label="Filter issues by key, title or label"
          autoComplete="off"
          className={cn(
            "h-10 w-full rounded-md border border-field-line bg-surface pl-9 pr-9 text-body-sm pointer-coarse:text-body-md text-ink placeholder:text-muted",
            "transition-[border-color,box-shadow] duration-150 hover:border-ink-soft",
            "focus:border-accent-text focus:outline-none focus:ring-3 focus:ring-accent/25",
          )}
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-line px-1.5 text-meta text-faint sm:block"
        >
          /
        </kbd>
      </div>

      <div
        role="group"
        aria-label="Filter by assignee"
        className="flex flex-wrap items-center gap-1"
      >
        {ids.map((id) => {
          const on = filter.assigneeIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              title={people.nameOf(id)}
              onClick={() => setFilter(toggleAssignee(filter, id))}
              className={cn(
                "rounded-full p-0.5 ring-2 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                on ? "ring-accent" : "ring-transparent hover:ring-line-strong",
              )}
            >
              <PersonAvatar people={people} id={id} size="sm" />
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={filter.assigneeIds.includes(UNASSIGNED)}
          title="Unassigned"
          onClick={() => setFilter(toggleAssignee(filter, UNASSIGNED))}
          className={cn(
            "rounded-full p-0.5 ring-2 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            filter.assigneeIds.includes(UNASSIGNED)
              ? "ring-accent"
              : "ring-transparent hover:ring-line-strong",
          )}
        >
          <PersonAvatar people={people} id={null} size="sm" />
        </button>
      </div>

      {meId && (
        <button
          type="button"
          aria-pressed={filter.mine}
          onClick={() => setFilter({ ...filter, mine: !filter.mine })}
          className={cn(
            "h-9 rounded-full border px-3.5 text-body-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            filter.mine
              ? "border-accent-line bg-accent-soft text-accent-text"
              : "border-control-line bg-surface text-muted hover:text-ink",
          )}
        >
          Only my issues
        </button>
      )}

      <div className="w-[calc(50%-0.5rem)] sm:w-40">
        <Select
          aria-label="Issue type"
          value={filter.type}
          onChange={(event) =>
            setFilter({ ...filter, type: event.target.value as IssueType | "" })
          }
        >
          <option value="">All types</option>
          {ISSUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {ISSUE_TYPE_LABEL[type]}
            </option>
          ))}
        </Select>
      </div>

      {extra}

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilter(EMPTY_FILTER)}
        >
          <X aria-hidden="true" className="size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
