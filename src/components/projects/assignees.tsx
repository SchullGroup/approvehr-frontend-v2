"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { Avatar, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { People } from "@/lib/store/project-session";
import { PersonAvatar, PersonPicker } from "./person";
import { registerPopup } from "./popups";

/**
 * Several people on one task: who is on it, and choosing them.
 *
 * The first person is the lead. Credit for finished work and the weekly task
 * follow them, so the list says which one that is rather than leaving it to the
 * order of the avatars.
 */

/** Overlapping avatars, the lead first; past `max`, a "+2". */
export function AssigneeStack({
  people,
  ids,
  max = 3,
  className,
}: {
  people: People;
  ids: readonly string[];
  max?: number;
  className?: string;
}) {
  if (ids.length === 0) return <PersonAvatar people={people} id={null} />;
  const shown = ids.slice(0, max);
  const more = ids.length - shown.length;
  const names = ids.map((id) => people.nameOf(id)).join(", ");
  return (
    <span
      role="img"
      aria-label={names}
      title={names}
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      {shown.map((id, index) => (
        <span
          key={id}
          aria-hidden="true"
          className={cn(
            "rounded-full ring-2 ring-surface",
            index > 0 && "-ml-1",
          )}
        >
          <Avatar name={people.nameOf(id)} size="xs" />
        </span>
      ))}
      {more > 0 && (
        <span
          aria-hidden="true"
          className="-ml-1 inline-flex size-6 items-center justify-center rounded-full bg-sunken text-meta font-medium text-ink ring-2 ring-surface"
        >
          +{more}
        </span>
      )}
    </span>
  );
}

/**
 * The drawer's list: each person with a way to take them off, and a picker to
 * add another. Changes are saved as they are made, like every other field there.
 */
export function AssigneeList({
  people,
  value,
  candidates,
  disabled,
  onChange,
  locked = [],
}: {
  people: People;
  value: readonly string[];
  /** Who may be put on it: the project's members. */
  candidates: readonly string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
  /** People who stay on it: a personal list's owner. No way to take them off. */
  locked?: readonly string[];
}) {
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <ul className="space-y-1" aria-label="Assignees">
          {value.map((id, index) => (
            <li key={id} className="flex min-w-0 items-center gap-2">
              <PersonAvatar people={people} id={id} decorative />
              <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                {people.nameOf(id)}
              </span>
              {index === 0 && value.length > 1 && (
                <span className="shrink-0 text-meta text-muted">Lead</span>
              )}
              {!disabled && !locked.includes(id) && (
                <IconButton
                  label={`Take ${people.nameOf(id)} off this task`}
                  size="sm"
                  onClick={() => onChange(value.filter((x) => x !== id))}
                >
                  <X className="size-3.5" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <PersonPicker
          people={people}
          value=""
          ids={candidates}
          exclude={value}
          placeholder={
            value.length === 0 ? "Unassigned: add someone" : "Add someone"
          }
          aria-label="Add an assignee"
          onChange={(id) => {
            if (id) onChange([...value, id]);
          }}
        />
      )}
      {disabled && value.length === 0 && (
        <span className="text-body-sm text-muted">Unassigned</span>
      )}
    </div>
  );
}

/** Past this many people a filter box appears. */
const FILTER_FROM = 8;

/**
 * A small button that opens a tick list of people: the sub-task row's assignee
 * control. Shows who is chosen on the button itself, as avatars.
 */
export function AssigneeMenu({
  people,
  value,
  candidates,
  onChange,
  label = "Assignees",
  disabled = false,
  align = "end",
  locked = [],
}: {
  people: People;
  value: readonly string[];
  candidates: readonly string[];
  onChange: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
  /** Which edge of the button the list lines up with, so it stays in the panel. */
  align?: "start" | "end";
  /** People who stay on it, ticked and fixed: a personal list's owner. */
  locked?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      trigger.current?.focus();
    };
    const unregister = registerPopup(close);
    const outside = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", outside);
    return () => {
      unregister();
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const options = candidates
    .map((id) => ({ id, name: people.nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((p) => !needle || p.name.toLowerCase().includes(needle));

  const toggle = (id: string) => {
    if (locked.includes(id)) return;
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  };

  const chosen = value.map((id) => people.nameOf(id)).join(", ");

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={chosen ? `${label}: ${chosen}` : `${label}: nobody yet`}
        aria-expanded={open}
        aria-controls={listId}
        title={chosen || "Assign people"}
        onClick={() => setOpen((now) => !now)}
        className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-line bg-surface px-1.5 text-muted hover:border-ink-soft hover:text-ink focus:outline-none focus:ring-3 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {value.length > 0 ? (
          <AssigneeStack people={people} ids={value} max={2} />
        ) : (
          <UserPlus aria-hidden="true" className="size-4" />
        )}
      </button>
      {open && (
        <div
          id={listId}
          role="group"
          aria-label={label}
          className={cn(
            "absolute z-30 mt-1 w-64 rounded-md border border-line bg-surface p-1.5 shadow-lg",
            align === "start" ? "left-0" : "right-0",
          )}
        >
          {candidates.length > FILTER_FROM && (
            <label className="mb-1 flex items-center gap-2 rounded-sm border border-line px-2">
              <Search aria-hidden="true" className="size-3.5 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find someone"
                aria-label="Find someone"
                className="h-8 min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none pointer-coarse:text-body-md"
              />
            </label>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {options.map((person) => {
              const on = value.includes(person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    aria-disabled={locked.includes(person.id) || undefined}
                    onClick={() => toggle(person.id)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-body-sm text-ink hover:bg-sunken focus:bg-sunken focus:outline-none"
                  >
                    <PersonAvatar people={people} id={person.id} decorative />
                    <span className="min-w-0 flex-1 truncate">
                      {person.name}
                    </span>
                    {on && (
                      <Check
                        aria-hidden="true"
                        className="size-4 text-accent-text"
                      />
                    )}
                  </button>
                </li>
              );
            })}
            {options.length === 0 && (
              <li className="px-2 py-2 text-body-sm text-muted">
                Nobody matches.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
