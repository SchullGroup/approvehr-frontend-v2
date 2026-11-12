"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Issue } from "@/lib/projects/types";
import { useProject } from "./project-context";

/**
 * The top of a task's panel: its key as a small chip that copies a link to it,
 * and its name, which is the panel's title and is edited where it stands.
 *
 * The chip comes first so that it, not the name, takes focus when the panel
 * opens: a first Escape then closes the panel, as it does everywhere else.
 */
export function TaskHeading({ issue }: { issue: Issue }) {
  const { personal } = useProject();
  return (
    <div className="space-y-1.5">
      {personal ? (
        <span className="tabular inline-flex items-center rounded-sm bg-sunken px-1.5 py-0.5 text-meta font-medium text-muted">
          {issue.key}
        </span>
      ) : (
        <KeyChip issueKey={issue.key} />
      )}
      <TaskTitle issue={issue} />
    </div>
  );
}

/** The key, which copies a link to the task and says so. */
function KeyChip({ issueKey }: { issueKey: string }) {
  const toast = useToast();
  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}?issue=${issueKey}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ tone: "success", title: "Link copied" });
    } catch {
      toast.push({
        tone: "info",
        title: "Could not copy the link",
        detail: "It is in the address bar.",
      });
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy link to ${issueKey}`}
      title="Copy link"
      className="tabular inline-flex items-center gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-meta font-medium text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      {issueKey}
      <Link2 aria-hidden="true" className="size-3" />
    </button>
  );
}

/**
 * The task's name, edited in place.
 *
 * Enter or leaving the field saves, and waits for the API: the field says it is
 * saving, and a refusal is said under it with the typed text kept, to fix or
 * send again. Escape puts the saved name back without sending anything (and
 * leaves the field, so the next Escape closes the panel); with nothing changed,
 * Escape closes the panel straight away. An empty name is not
 * sent; the saved one comes back. Somebody who may not change it reads it as a
 * heading.
 */
function TaskTitle({ issue }: { issue: Issue }) {
  const { actions, canWork, canEditDetails = canWork } = useProject();
  const [draft, setDraft] = useState(issue.title);
  const [seen, setSeen] = useState(issue.title);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  /* Set by Escape, so the blur that follows it does not save. */
  const skip = useRef(false);

  /* The saved name wins whenever it is not being edited, saved or fixed. A
     refused save rolls the stored name back while it is still saving, and the
     typed text has to survive that. */
  if (issue.title !== seen) {
    setSeen(issue.title);
    if (!editing && !busy && error === null) setDraft(issue.title);
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const changed = draft !== issue.title || error !== null;

  if (!canEditDetails) {
    return <p className="break-words text-h4 text-ink">{issue.title}</p>;
  }

  async function commit() {
    setEditing(false);
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (busy) return;
    const next = draft.trim();
    if (!next) {
      setDraft(issue.title);
      setError(null);
      return;
    }
    if (next === issue.title) {
      setDraft(next);
      setError(null);
      return;
    }
    setDraft(next);
    setBusy(true);
    setError(null);
    const result = await actions.patchIssue(
      issue,
      { title: next },
      { quiet: true },
    );
    setBusy(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <div>
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        aria-label="Title"
        aria-busy={busy || undefined}
        aria-invalid={error !== null || undefined}
        maxLength={240}
        readOnly={busy}
        /* While there is an edit to throw away, Escape belongs to the field and
           the panel's own Escape handler steps aside; with nothing changed it
           closes the panel as usual. */
        {...(changed ? { "data-escape-to-popup": "" } : {})}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onFocus={() => {
          skip.current = false;
          setEditing(true);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape" && changed) {
            event.preventDefault();
            setDraft(issue.title);
            setError(null);
            skip.current = true;
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "-mx-2 block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-h4 text-ink",
          "hover:bg-canvas focus:border-accent-text focus:bg-surface focus:outline-none focus:ring-3 focus:ring-accent/25",
          error && "border-danger-text",
        )}
      />
      {busy && (
        <p role="status" className="mt-1 text-meta text-muted">
          Saving
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-body-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
