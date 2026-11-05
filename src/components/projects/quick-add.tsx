"use client";

import { useRef, useState } from "react";
import { Select, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ISSUE_TYPE_LABEL, type IssueType } from "@/lib/projects/types";
import { useProject } from "./project-context";

/** What the quick row can make. Epics and sub-tasks have their own places. */
const QUICK_TYPES = ["STORY", "TASK", "BUG"] as const;

/**
 * The row under a list that adds an issue to it: a type, a title, Enter.
 *
 * `sprintId` is where it goes: a sprint's id for a sprint's own row, null for the
 * backlog (and always null on a Kanban project, which has no sprints). The new
 * issue takes the last rank, so it lands at the bottom of the list it was typed
 * under, and the field keeps focus so a run of them can be typed one after the
 * other.
 *
 * The text is cleared the moment it is sent, so a second Enter cannot add it
 * twice, and put back if the store refuses — the store has already said why.
 */
export function QuickAdd({
  label,
  sprintId,
}: {
  /** Names the list for assistive technology: "CHK Sprint 3", "the backlog". */
  label: string;
  sprintId: string | null;
}) {
  const { project, actions } = useProject();
  const toast = useToast();
  const [type, setType] = useState<IssueType>("STORY");
  const [title, setTitle] = useState("");
  const sending = useRef(false);

  async function add() {
    const text = title.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setTitle("");
    const result = await actions.createIssue({
      type,
      title: text,
      sprintId: project.type === "SCRUM" ? sprintId : null,
    });
    sending.current = false;
    if (!result.ok) {
      setTitle((now) => now || text);
      return;
    }
    toast.push({
      tone: "success",
      title: `${result.value.key} created`,
      detail: text,
    });
  }

  return (
    <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
      <div className="w-28 shrink-0">
        <Select
          aria-label={`Type of the issue to add to ${label}`}
          value={type}
          onChange={(event) => setType(event.target.value as IssueType)}
          className="h-9"
        >
          {QUICK_TYPES.map((value) => (
            <option key={value} value={value}>
              {ISSUE_TYPE_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>
      <input
        type="text"
        value={title}
        maxLength={240}
        autoComplete="off"
        aria-label={`Add an issue to ${label}`}
        placeholder="What needs to be done? Press Enter to add"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void add();
        }}
        className={cn(
          "h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2.5 text-body-sm pointer-coarse:text-body-md text-ink placeholder:text-muted",
          "hover:border-field-line focus:border-accent-text focus:bg-surface focus:outline-none focus:ring-3 focus:ring-accent/25",
        )}
      />
    </div>
  );
}
