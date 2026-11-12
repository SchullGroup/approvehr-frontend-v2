"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { BOARD_SWITCHED_NOTE } from "@/lib/projects/terms";
import type { Project } from "@/lib/projects/types";

/** How long after the switch the note is shown. */
export const BOARD_SWITCHED_NOTE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per project, per browser: dismissing it here does not dismiss it elsewhere. */
export const boardSwitchedNoteKey = (projectId: string) =>
  `projects.boardSwitchedNote.${projectId}`;

/** Whether a switch at `at` is recent enough to mention, as of `nowMs`. */
export function switchedRecently(
  at: string | null | undefined,
  nowMs: number,
): boolean {
  if (!at) return false;
  const then = Date.parse(at);
  if (Number.isNaN(then)) return false;
  const age = nowMs - then;
  return age >= 0 && age < BOARD_SWITCHED_NOTE_DAYS * DAY_MS;
}

/**
 * The one-time note on a project that was moved from cycles to a simple board
 * for its people, because it was on cycles and had never had one. It says what
 * happened and where to undo it, for 30 days, until somebody closes it.
 *
 * Read after mount, so the server render and the first client render agree; it
 * starts hidden and appears once storage has been read. Storage that cannot be
 * read (a private window, a blocked site) shows the note and cannot remember a
 * close beyond this page.
 */
export function BoardSwitchedNote({
  project,
}: {
  project: Pick<Project, "id" | "type" | "boardSwitchedAt">;
}) {
  const [shown, setShown] = useState(false);
  const key = boardSwitchedNoteKey(project.id);
  const at = project.boardSwitchedAt;
  const simple = project.type === "KANBAN";

  useEffect(() => {
    const now = Date.now(); // reads-the-clock: an elapsed-time check against an instant, no calendar day
    if (!simple || !switchedRecently(at, now)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to match the server render
      setShown(false);
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) !== null;
    } catch {
      /* storage unavailable: show it */
    }
    setShown(!dismissed);
  }, [key, at, simple]);

  if (!shown) return null;

  const dismiss = () => {
    setShown(false);
    try {
      localStorage.setItem(key, "dismissed");
    } catch {
      /* not remembered */
    }
  };

  return (
    <div
      role="note"
      className="flex items-start justify-between gap-3 rounded-lg border border-line bg-sunken px-4 py-3"
    >
      <p className="text-body-sm text-body">{BOARD_SWITCHED_NOTE}</p>
      <IconButton
        label="Dismiss this note"
        size="sm"
        variant="ghost"
        onClick={dismiss}
        className="-my-1 shrink-0"
      >
        <X aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  );
}
