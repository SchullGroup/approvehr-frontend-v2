"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Avatar, Button, IconButton, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { projectsApi } from "@/lib/api/projects";
import type { WatchState } from "@/lib/projects/types";
import type { People } from "@/lib/store/project-session";
import { PersonPicker } from "./person";

const failed = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.message ? error.message : fallback;

/**
 * Who hears about a task without being its assignee.
 *
 * An avatar stack and a count, Watch / Stop watching for yourself, the names
 * (with a remove button where the reader may take somebody off), and "Add a
 * watcher": a picker of only the people who are allowed — a board's members, or
 * anybody in the company on a personal task its owner or their leader opens.
 *
 * The API is the authority on all of it. Every route answers with the whole
 * `{ watchers, watching }`, which replaces what is shown; a refusal is shown in
 * the API's own words.
 */
export function Watchers({
  issueId,
  state: fromThread,
  meId,
  people,
  candidates,
  mayChoose,
  mayRemove,
  onChanged,
}: {
  issueId: string;
  state: WatchState;
  meId: string | null;
  people: People;
  /** Who the picker may offer. */
  candidates: readonly string[];
  /** Whether the reader may add somebody else. */
  mayChoose: boolean;
  /** Whether the reader may take this person (never themselves) off. */
  mayRemove: (employeeId: string) => boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const heading = useId();
  const [state, setState] = useState(fromThread);
  const [seen, setSeen] = useState(fromThread);
  if (seen !== fromThread) {
    setSeen(fromThread);
    setState(fromThread);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { watchers, watching } = state;
  const count = watchers.length;

  async function run(
    call: () => Promise<WatchState>,
    done: (next: WatchState) => void,
    fallback: string,
    inline = false,
  ) {
    setBusy(true);
    setError(null);
    try {
      const next = await call();
      setState(next);
      done(next);
      onChanged?.();
    } catch (caught) {
      const message = failed(caught, fallback);
      if (inline) setError(message);
      else toast.push({ tone: "danger", title: fallback, detail: message });
    } finally {
      setBusy(false);
    }
  }

  const toggle = () =>
    watching
      ? run(
          () => projectsApi.unwatch(issueId),
          () =>
            toast.push({
              tone: "success",
              title: "You stopped watching this task",
            }),
          "Could not stop watching",
        )
      : run(
          () => projectsApi.watch(issueId),
          () =>
            toast.push({ tone: "success", title: "You're watching this task" }),
          "Could not watch this task",
        );

  const add = (employeeId: string) =>
    run(
      () => projectsApi.addWatcher(issueId, employeeId),
      () =>
        toast.push({
          tone: "success",
          title: `${people.nameOf(employeeId)} is watching this task`,
        }),
      "Could not add that watcher",
      true,
    );

  const remove = (employeeId: string, name: string) =>
    run(
      () => projectsApi.removeWatcher(issueId, employeeId),
      () => toast.push({ tone: "success", title: `${name} stopped watching` }),
      `Could not remove ${name}`,
      true,
    );

  const offered = candidates.filter(
    (id) => id !== meId && !watchers.some((w) => w.id === id),
  );

  return (
    <section aria-labelledby={heading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={heading} className="text-meta font-semibold text-muted">
          Watchers
        </h3>
        {meId && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            aria-pressed={watching}
            onClick={() => void toggle()}
          >
            {watching ? "Stop watching" : "Watch"}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {count > 0 && (
          <span aria-hidden="true" className="flex -space-x-1.5">
            {watchers.slice(0, 5).map((w) => (
              <span key={w.id} className="rounded-full ring-2 ring-surface">
                <Avatar name={w.name} size="xs" />
              </span>
            ))}
          </span>
        )}
        <span className="text-body-sm text-muted">
          {count === 0 ? "Nobody is watching" : `${count} watching`}
        </span>
      </div>

      {count > 0 && (
        <ul
          aria-label="People watching"
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {watchers.map((w) => (
            <li
              key={w.id}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1 text-meta text-ink"
            >
              <span
                className={mayRemove(w.id) && w.id !== meId ? "" : "pr-1.5"}
              >
                {w.name}
              </span>
              {w.id !== meId && mayRemove(w.id) && (
                <IconButton
                  label={`Remove ${w.name} as a watcher`}
                  size="sm"
                  className="size-6"
                  disabled={busy}
                  onClick={() => void remove(w.id, w.name)}
                >
                  <X className="size-3.5" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {mayChoose && (
        <div className="mt-3 max-w-xs">
          <PersonPicker
            people={people}
            value=""
            ids={offered}
            placeholder="Add a watcher"
            disabled={busy}
            aria-label="Add a watcher"
            onChange={(id) => {
              if (id) void add(id);
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}
