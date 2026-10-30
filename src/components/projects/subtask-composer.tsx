"use client";

import { useEffect, useRef, useState } from "react";
import { CircleDashed, CornerDownLeft, Plus } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type NewIssueInput,
  type Priority,
} from "@/lib/projects/types";
import type { People } from "@/lib/store/project-session";
import { AssigneeMenu } from "./assignees";
import { registerPopup } from "./popups";

/**
 * Adding sub-tasks one after another, ClickUp's way: a name, the people on it,
 * a due date and a priority, then Save (or Enter).
 *
 * The row stays open after a save with the name cleared and focus back in it,
 * so a run of them can be typed without reaching for the mouse. The people, the
 * date and the priority stay as they were set, because a run of sub-tasks
 * usually shares them; change them for the next one, or Cancel to close.
 *
 * The name is cleared the moment it is sent, so a second Enter cannot add it
 * twice, and put back if the store refuses (the store has already said why).
 */
export function SubtaskComposer({
  people,
  candidates,
  onCreate,
  noun = "sub-task",
  canAssign = true,
  locked = [],
}: {
  people: People;
  /** Who may be put on it: the project's members. */
  candidates: readonly string[];
  /** Resolves true when it was made. */
  onCreate: (
    input: Pick<
      NewIssueInput,
      "title" | "assigneeIds" | "dueDate" | "priority"
    >,
  ) => Promise<boolean>;
  /** "sub-task", or "story" in an epic. */
  noun?: string;
  /** False where nobody can be chosen. */
  canAssign?: boolean;
  /** People always on it, chosen to begin with: a personal list's owner. */
  locked?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => [...locked]);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const sending = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setTitle("");
  };

  /* Escape closes this row, not the drawer around it. */
  useEffect(() => {
    if (!open) return;
    return registerPopup(() => {
      setOpen(false);
      setTitle("");
    });
  }, [open]);

  async function save() {
    const text = title.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setTitle("");
    const made = await onCreate({
      title: text,
      priority,
      ...(canAssign ? { assigneeIds } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    sending.current = false;
    if (!made) setTitle((now) => now || text);
    input.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-body-sm text-muted hover:bg-sunken hover:text-ink"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add {noun}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`New ${noun}`}
      className="space-y-2 rounded-b-md bg-canvas px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <CircleDashed
          aria-hidden="true"
          className="size-4 shrink-0 text-faint"
        />
        <Input
          ref={input}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder={`Name the ${noun}`}
          aria-label={`Name of the new ${noun}`}
          autoComplete="off"
          maxLength={240}
          className="h-9 min-w-0 flex-1"
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {canAssign && (
          <AssigneeMenu
            people={people}
            value={assigneeIds}
            candidates={candidates}
            onChange={setAssigneeIds}
            label={`Assignees for the new ${noun}`}
            locked={locked}
            align="start"
          />
        )}
        <Input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label={`Due date for the new ${noun}`}
          className="h-9 w-36"
        />
        <Select
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
          aria-label={`Priority for the new ${noun}`}
          className="h-9 w-28"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={!title.trim()}
        >
          Save
          <CornerDownLeft aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
