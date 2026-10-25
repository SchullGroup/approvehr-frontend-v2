"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button, IconButton, Input, Select } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  projectsApi,
  type IssueLink,
  type IssueSearchHit,
  type LinkChoice,
} from "@/lib/api/projects";
import { StatusPill } from "./glyphs";
import { useProject } from "./project-context";

/** The choices in the order people read them, with what the API is sent. */
export const LINK_CHOICES: { label: string; value: LinkChoice }[] = [
  { label: "Relates to", value: "RELATES" },
  { label: "Blocks", value: "BLOCKS" },
  { label: "Blocked by", value: "BLOCKED_BY" },
  { label: "Front end for", value: "IMPLEMENTS" },
  { label: "Back end for", value: "IMPLEMENTED_BY" },
  { label: "Duplicates", value: "DUPLICATES" },
  { label: "Duplicated by", value: "DUPLICATED_BY" },
];

const capital = (text: string) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : text;

/**
 * The server's own words, except for the ones it is told how to phrase. A 404
 * means "no such task" only when adding; on remove it means the link is gone.
 */
function explain(error: unknown, path: "add" | "remove" = "add"): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return path === "remove"
        ? "That link was already removed."
        : "No task with that key that you can open";
    }
    if (error.status === 409) return "These tasks are already linked that way";
    return error.message;
  }
  return "Something went wrong. Try again.";
}

/**
 * The tasks this one is linked to, and a way to add or remove a link.
 *
 * Loaded from the API on its own, not from the project's store: a link can reach
 * into another project, and the other task is only named when the reader may open
 * it (otherwise the row says "A task you can't open"). Editing a link's reason is
 * not offered here; the API supports it.
 */
/** A task on somebody's own list (`MY-4`); boards may not use the key `MY`. */
const isPersonalKey = (key: string) => /^MY-\d+$/.test(key);

export function LinkedTasks({
  issueId,
  onChanged,
}: {
  issueId: string;
  /** Called after a link is added or removed, so the history can catch up. */
  onChanged?: () => void;
}) {
  const { project, canWork, openIssue, issueByKey } = useProject();
  const router = useRouter();
  const base = useId();
  const [links, setLinks] = useState<IssueLink[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [type, setType] = useState<LinkChoice>("RELATES");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IssueSearchHit[]>([]);
  const [picked, setPicked] = useState<IssueSearchHit | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .links(issueId, controller.signal)
      .then(setLinks)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [issueId]);

  const search = useCallback(
    (text: string) => {
      setQuery(text);
      const seq = ++searchSeq.current;
      if (text.trim().length < 2) {
        setHits([]);
        return;
      }
      projectsApi
        .searchIssues(text.trim())
        .then((found) => {
          if (seq === searchSeq.current)
            setHits(found.filter((h) => h.id !== issueId));
        })
        .catch(() => {
          if (seq === searchSeq.current) setHits([]);
        });
    },
    [issueId],
  );

  async function add() {
    if (!picked || busy) return;
    setBusy(true);
    setAddError(null);
    try {
      const reason = note.trim();
      const created = await projectsApi.addLink(issueId, {
        toIssueKey: picked.key,
        type,
        ...(reason ? { note: reason } : {}),
      });
      setLinks((current) => [...(current ?? []), created]);
      setPicked(null);
      setQuery("");
      setHits([]);
      setNote("");
      onChanged?.();
    } catch (error) {
      setAddError(explain(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(link: IssueLink) {
    setRemoveError(null);
    try {
      await projectsApi.removeLink(link.id);
      setLinks((current) => (current ?? []).filter((l) => l.id !== link.id));
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setLinks((current) => (current ?? []).filter((l) => l.id !== link.id));
        onChanged?.();
      }
      setRemoveError(explain(error, "remove"));
    }
  }

  const rows = links ?? [];

  return (
    <section aria-labelledby={`${base}-links`}>
      <h3
        id={`${base}-links`}
        className="mb-2 text-meta font-semibold text-muted"
      >
        Linked tasks
      </h3>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {links === null && !loadError && (
          <li className="px-3 py-3 text-body-sm text-muted">Loading</li>
        )}
        {loadError && (
          <li className="px-3 py-3 text-body-sm text-danger-text">
            Couldn&apos;t load linked tasks.
          </li>
        )}
        {links !== null && rows.length === 0 && !canWork && (
          <li className="px-3 py-3 text-body-sm text-muted">None</li>
        )}
        {rows.map((link) => {
          const other = link.other;
          return (
            <li key={link.id} className="flex items-start gap-2.5 px-3 py-2">
              <div className="min-w-0 flex-1 text-body-sm text-ink">
                <span className="text-muted">{capital(link.label)}</span>{" "}
                {other.hidden ? (
                  <span className="text-muted">A task you can&apos;t open</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        /* The project screen only opens keys from its own
                           project, so another project's task is reached
                           through that project's page. A personal task has
                           no page of its list: it opens by id. */
                        other.projectId === project.id &&
                        (!isPersonalKey(other.key) || issueByKey.has(other.key))
                          ? openIssue({ key: other.key })
                          : isPersonalKey(other.key)
                            ? router.push(`/projects/tasks/${other.id}`)
                            : router.push(
                                `/projects/${other.projectId}?issue=${encodeURIComponent(other.key)}`,
                              )
                      }
                      className="tabular text-meta font-medium text-muted hover:underline"
                    >
                      {other.key}
                    </button>{" "}
                    {other.projectId !== project.id && (
                      <span className="text-meta text-faint">
                        · {other.projectName}
                      </span>
                    )}{" "}
                    <span>{other.title}</span>
                  </>
                )}
                {link.note && (
                  <p className="mt-0.5 text-meta text-muted">
                    <em>{link.note}</em>
                  </p>
                )}
              </div>
              {!other.hidden && (
                <StatusPill
                  status={{
                    name: other.statusName,
                    category: other.statusCategory,
                  }}
                  className="hidden sm:inline-flex"
                />
              )}
              {canWork && (
                <IconButton
                  label={
                    other.hidden
                      ? "Remove this link"
                      : `Remove link to ${other.key}`
                  }
                  size="sm"
                  onClick={() => void remove(link)}
                >
                  <X className="size-4" />
                </IconButton>
              )}
            </li>
          );
        })}
        {canWork && (
          <li className="space-y-2 bg-canvas px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Link type"
                value={type}
                onChange={(event) => setType(event.target.value as LinkChoice)}
                className="h-9 w-40"
              >
                {LINK_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              {picked ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 text-body-sm">
                  <span className="tabular text-meta font-medium text-muted">
                    {picked.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {picked.title}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPicked(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <Input
                    value={query}
                    onChange={(event) => search(event.target.value)}
                    placeholder="Find a task by key or title"
                    aria-label="Find a task"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
            {!picked && hits.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(hit);
                        setHits([]);
                      }}
                      className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-body-sm hover:bg-sunken"
                    >
                      <span className="tabular text-meta font-medium text-muted">
                        {hit.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {hit.title}
                      </span>
                      <span className="text-meta text-faint">
                        {hit.projectName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason (optional)"
                  aria-label="Reason"
                  autoComplete="off"
                  maxLength={300}
                />
              </div>
              <Button
                size="sm"
                disabled={!picked || busy}
                onClick={() => void add()}
              >
                Link
              </Button>
            </div>
            {(addError ?? removeError) && (
              <p role="alert" className="text-body-sm text-danger-text">
                {addError ?? removeError}
              </p>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
