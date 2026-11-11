"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Picker, Select } from "@/components/ui";
import {
  DEPT_NONE,
  DEPT_UNASSIGNED,
  EMPTY_FILTER,
  STATUS_FILTER_LABEL,
  UNASSIGNED,
  filterAssigneeIds,
  isFiltering,
  toggleAssignee,
} from "@/lib/projects/filters";
import { FILTER_TYPES, STAGE, TYPE_LABEL } from "@/lib/projects/terms";
import {
  type IssueType,
  type StatusCategory,
} from "@/lib/projects/types";
import { PersonAvatar } from "./person";
import { useProject } from "./project-context";

/**
 * The bar above every list of tasks: text, people, "only mine", type, status.
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
  /* Everybody on the project or on a task, by name, so a large team is found by
     typing rather than by guessing initials. Those already chosen are chips. */
  const peopleChoices = [
    ...ids
      .filter((id) => !filter.assigneeIds.includes(id))
      .map((id) => {
        const jobTitle = people.byId.get(id)?.jobTitle ?? "";
        return {
          value: id,
          label: people.nameOf(id),
          ...(jobTitle ? { hint: jobTitle } : {}),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
    ...(filter.assigneeIds.includes(UNASSIGNED)
      ? []
      : [{ value: UNASSIGNED, label: "Unassigned", hint: "Nobody on it yet" }]),
  ];
  const stages = [...project.statuses].sort((a, b) => a.position - b.position);
  const stageValue =
    filter.statusIds.length === 1
      ? `id:${filter.statusIds[0]!}`
      : filter.statusCategory
        ? `cat:${filter.statusCategory}`
        : "";

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
          placeholder="Search tasks"
          aria-label="Search tasks by key, title, label, person or subtask"
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
        className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
      >
        <div className="w-full sm:w-56">
          <Picker
            aria-label="Filter by person"
            searchable
            value=""
            placeholder={
              filter.assigneeIds.length > 0
                ? "Add another person"
                : "Filter by person"
            }
            onChange={(id) => {
              if (id && !filter.assigneeIds.includes(id))
                setFilter(toggleAssignee(filter, id));
            }}
            options={peopleChoices}
          />
        </div>
        {filter.assigneeIds.map((id) => (
          <span
            key={id}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft pl-1 pr-1.5 text-body-sm text-accent-text"
          >
            <PersonAvatar
              people={people}
              id={id === UNASSIGNED ? null : id}
              size="sm"
            />
            <span className="max-w-40 truncate">
              {id === UNASSIGNED ? "Unassigned" : people.nameOf(id)}
            </span>
            <button
              type="button"
              aria-label={`Stop filtering by ${
                id === UNASSIGNED ? "Unassigned" : people.nameOf(id)
              }`}
              onClick={() => setFilter(toggleAssignee(filter, id))}
              className="grid size-6 place-items-center rounded-full hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ))}
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
          Only my tasks
        </button>
      )}

      <div className="w-[calc(50%-0.5rem)] sm:w-40">
        <Select
          aria-label="Task type"
          value={filter.type}
          onChange={(event) =>
            setFilter({ ...filter, type: event.target.value as IssueType | "" })
          }
        >
          <option value="">All types</option>
          {FILTER_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-[calc(50%-0.5rem)] sm:w-40">
        <Select
          aria-label={STAGE.One}
          value={stageValue}
          onChange={(event) => {
            const raw = event.target.value;
            const kind = raw.slice(0, raw.indexOf(":"));
            const rest = raw.slice(raw.indexOf(":") + 1);
            setFilter({
              ...filter,
              statusIds: kind === "id" ? [rest] : [],
              statusCategory: kind === "cat" ? (rest as StatusCategory) : "",
            });
          }}
        >
          <option value="">Any {STAGE.one}</option>
          {/* This project's own stages, as named in its settings. */}
          {stages.map((status) => (
            <option key={status.id} value={`id:${status.id}`}>
              {status.name}
            </option>
          ))}
          {/* No "any not started / in progress / done" choices: the stages
              above are what people pick from. A link that arrives with a group
              (`?status=`) still shows what it applied, so the box is never blank. */}
          {filter.statusCategory && (
            <option value={`cat:${filter.statusCategory}`}>
              {`Any ${STATUS_FILTER_LABEL[filter.statusCategory].toLowerCase()}`}
            </option>
          )}
        </Select>
      </div>

      {project.memberDepartments && (
        <div className="w-[calc(50%-0.5rem)] sm:w-48">
          <Select
            aria-label="Assignee's department"
            title="By the department of the person on the task"
            value={filter.department}
            onChange={(event) =>
              setFilter({ ...filter, department: event.target.value })
            }
          >
            <option value="">All departments</option>
            {departmentChoices(
              project.memberDepartments,
              project.departmentNames,
            ).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
            <option value={DEPT_NONE}>No department</option>
            <option value={DEPT_UNASSIGNED}>Unassigned</option>
          </Select>
        </div>
      )}

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

/** The departments the project's members are in, by name. */
function departmentChoices(
  members: Readonly<Record<string, string | null>>,
  names: Readonly<Record<string, string>> = {},
): { value: string; label: string }[] {
  const ids = [
    ...new Set(Object.values(members).filter((v): v is string => v !== null)),
  ];
  return ids
    .map((value) => ({ value, label: names[value] || "Unnamed department" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
