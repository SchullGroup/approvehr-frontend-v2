"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MAX_FILES,
  uploadFailure,
  uploadIssueFile,
} from "@/lib/projects/files";
import { encodeMentions, mentionQueryAt } from "@/lib/projects/mentions";
import type { AttachmentRef } from "@/lib/projects/types";
import type { People } from "@/lib/store/project-session";
import { PersonAvatar } from "./person";
import { registerPopup } from "./popups";
import {
  AttachButton,
  StagedList,
  useDropTarget,
  useStagedFiles,
} from "./task-files";

/**
 * The comment box, with @mentions.
 *
 * Typing `@` at the start of a word opens a list of the project's members;
 * choosing one writes `@Name` into the text and remembers which id that name
 * stands for, so posting stores `<@employeeId>`. A rename never orphans a
 * mention, and the API can tell the right person.
 *
 * Ctrl or ⌘ + Enter posts. A failed post keeps what was typed: the text is only
 * cleared once the comment is actually there.
 *
 * The same box edits a comment: give it the text and mentions to start from (a
 * stored body run through `decodeMentions`), a label for the button, and a way to
 * cancel. Editing keeps the text after a save, since the caller closes it.
 *
 * ## Files
 *
 * Given `attach`, a paperclip and the box itself (as a drop target) take files.
 * They are listed under the box before sending; on send each is uploaded first
 * (`uploadIssueFile`), and only when every one is stored does the comment go,
 * carrying their keys. A file that fails stops the send and keeps the words.
 * Send is enabled with words or at least one file. An edit takes no files.
 */
export function MentionComposer({
  people,
  memberIds,
  meId,
  disabled = false,
  onPost,
  initial,
  submitLabel = "Comment",
  onCancel,
  label = "Add a comment",
  attach,
}: {
  people: People;
  memberIds: readonly string[];
  meId: string | null;
  disabled?: boolean;
  /** Resolves true once the comment is saved. `attachments` are uploaded already. */
  onPost: (body: string, attachments: AttachmentRef[]) => Promise<boolean>;
  /** Start from this text, with these names standing for these people. */
  initial?: { text: string; mentions: Record<string, string> };
  submitLabel?: string;
  onCancel?: () => void;
  label?: string;
  /** Lets the comment carry files, uploaded for this issue. */
  attach?: { issueId: string } | undefined;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [mentions, setMentions] = useState<Record<string, string>>(
    initial?.mentions ?? {},
  );
  const [query, setQuery] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const [posting, setPosting] = useState(false);
  const listId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const staged = useStagedFiles(
    MAX_FILES,
    `A comment can have up to ${MAX_FILES} files.`,
  );
  const sendable = staged.items.filter((item) => !item.refused);
  const drop = useDropTarget((files) => staged.add(files), Boolean(attach));

  const hits = useMemo(() => {
    if (!query) return [];
    const needle = query.query.toLowerCase();
    return memberIds
      .map((id) => ({ id, name: people.nameOf(id) }))
      .filter((p) => p.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [query, memberIds, people]);

  const open = query !== null && hits.length > 0;

  useEffect(() => {
    if (!open) return;
    return registerPopup(() => setQuery(null));
  }, [open]);

  function update(value: string, caret: number) {
    setText(value);
    const next = mentionQueryAt(value, caret);
    setQuery(next);
    if (next?.query !== query?.query) setActive(0);
  }

  function pick(id: string) {
    if (!query) return;
    const field = fieldRef.current;
    const name = people.nameOf(id).replace(/\s+/g, " ");
    const caret = field?.selectionStart ?? query.start + query.query.length + 1;
    const next = `${text.slice(0, query.start)}@${name} ${text.slice(caret)}`;
    setText(next);
    setMentions((m) => ({ ...m, [name]: id }));
    setQuery(null);
    const at = query.start + name.length + 2;
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(at, at);
    });
  }

  /** Upload each file not yet stored; null if any failed. */
  async function upload(issueId: string): Promise<AttachmentRef[] | null> {
    const refs: AttachmentRef[] = [];
    let ok = true;
    for (const item of sendable) {
      if (item.ref) {
        refs.push(item.ref);
        continue;
      }
      staged.patch(item.id, { progress: 0, error: null });
      try {
        const ref = await uploadIssueFile(issueId, item.file, (p) =>
          staged.patch(item.id, { progress: p }),
        );
        staged.patch(item.id, { progress: null, ref });
        refs.push(ref);
      } catch (error) {
        ok = false;
        staged.patch(item.id, { progress: null, error: uploadFailure(error) });
      }
    }
    return ok ? refs : null;
  }

  async function post() {
    const body = text.trim();
    if ((!body && sendable.length === 0) || posting) return;
    setPosting(true);
    const refs =
      attach && sendable.length > 0 ? await upload(attach.issueId) : [];
    if (!refs) {
      setPosting(false);
      return;
    }
    const done = await onPost(encodeMentions(body, mentions), refs);
    setPosting(false);
    if (done && !initial) {
      setText("");
      setMentions({});
      setQuery(null);
      staged.clear();
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative rounded-md",
          drop.over &&
            "outline-2 outline-offset-2 outline-dashed outline-accent",
        )}
        {...drop.handlers}
      >
        <textarea
          ref={fieldRef}
          value={text}
          rows={3}
          disabled={disabled}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          placeholder="Add a comment. Type @ to mention someone."
          onChange={(event) =>
            update(event.target.value, event.target.selectionStart)
          }
          onKeyUp={(event) => {
            /* Moving the caret with the arrow keys can leave or enter a mention. */
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              const field = event.currentTarget;
              setQuery(mentionQueryAt(field.value, field.selectionStart));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void post();
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + hits.length) % hits.length);
            } else if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              pick(hits[active]!.id);
            }
          }}
          className={cn(
            "w-full resize-y rounded-md border border-field-line bg-surface px-3 py-2.5 text-body-sm pointer-coarse:text-body-md text-ink placeholder:text-muted",
            "transition-[border-color,box-shadow] duration-150 hover:border-ink-soft",
            "focus:border-accent-text focus:outline-none focus:ring-3 focus:ring-accent/25",
            "disabled:cursor-not-allowed disabled:bg-sunken",
          )}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="People to mention"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
          >
            {hits.map((hit, index) => (
              <li key={hit.id} role="none">
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  tabIndex={-1}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    pick(hit.id);
                  }}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-ink",
                    index === active && "bg-sunken",
                  )}
                >
                  <PersonAvatar people={people} id={hit.id} />
                  <span className="truncate">{hit.name}</span>
                  {hit.id === meId && (
                    <span className="text-meta text-muted">you</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {attach && (
        <StagedList
          items={staged.items}
          onRemove={staged.remove}
          busy={posting}
          label="Files to send with your comment"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {attach && (
            <AttachButton
              iconOnly
              label="Attach files to your comment"
              disabled={disabled || posting}
              onFiles={(files) => void staged.add(files)}
            />
          )}
          <span className="text-meta text-muted">
            Ctrl or ⌘ + Enter to {initial ? "save" : "post"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            loading={posting}
            disabled={disabled || (text.trim() === "" && sendable.length === 0)}
            onClick={() => void post()}
          >
            {submitLabel}
          </Button>
        </span>
      </div>
    </div>
  );
}
