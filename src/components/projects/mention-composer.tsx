"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { encodeMentions, mentionQueryAt } from "@/lib/projects/mentions";
import type { People } from "@/lib/store/project-session";
import { PersonAvatar } from "./person";
import { registerPopup } from "./popups";

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
 */
export function MentionComposer({
  people,
  memberIds,
  meId,
  disabled = false,
  onPost,
}: {
  people: People;
  memberIds: readonly string[];
  meId: string | null;
  disabled?: boolean;
  /** Resolves true once the comment is saved. */
  onPost: (body: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const [posting, setPosting] = useState(false);
  const listId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

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

  async function post() {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    const done = await onPost(encodeMentions(body, mentions));
    setPosting(false);
    if (done) {
      setText("");
      setMentions({});
      setQuery(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={fieldRef}
          value={text}
          rows={3}
          disabled={disabled}
          role="combobox"
          aria-label="Add a comment"
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
            "w-full resize-y rounded-md border border-field-line bg-surface px-3 py-2.5 text-body-sm text-ink placeholder:text-muted",
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta text-muted">Ctrl or ⌘ + Enter to post</span>
        <Button
          size="sm"
          variant="primary"
          loading={posting}
          disabled={disabled || text.trim() === ""}
          onClick={() => void post()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
