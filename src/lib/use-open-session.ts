"use client";

import { useState } from "react";

/**
 * A number that goes up each time a dialog is opened: the `key` for a form that
 * has to start blank every time.
 *
 * A screen keeps its dialogs mounted so each can animate out, and a component
 * that stays mounted keeps its `useState`s. `Modal` unmounts its *children* when
 * it closes, so the controls inside it start over (a file picker reads "Choose a
 * file") while the fields held above them do not: the next open shows a picker
 * that looks empty over a button that is still live and still carries the
 * last file. The harm is the next record being made out of the last one's
 * entry: a duplicate document, one person's ID card on another's file, a PDF
 * sent for signature to somebody who was never picked.
 *
 * The cure is the one `RoleEditor` and the notice form already use: the dialog
 * is a thin wrapper that holds nothing but this number, and renders the real
 * form, which owns every field, with the number as its `key`. A new key is a new
 * form.
 *
 * ```tsx
 * export function ThingDialog(props: ThingProps) {
 *   const session = useOpenSession(props.open);
 *   return <ThingDialogForm key={session} {...props} />;
 * }
 * ```
 *
 * ## When it goes up, and when it must not
 *
 * - **The dialog opens** (`open` goes from false to true): a new session.
 * - **A different record arrives while it is open** (`identity` changes): a
 *   new session, because a form for one record must never go on answering for
 *   another. `identity` is optional; a dialog with no record leaves it out.
 *   `null` and `undefined` are "no record", never a change: a parent clears its
 *   prop to `null` the instant it closes a dialog, and that is not a new record.
 * - **The same record is handed over again** as a new object (a list that
 *   reloads on window focus): *not* a new session. A refresh must not wipe what
 *   somebody is typing, and `identity` is a string for that reason, not an object.
 * - **The dialog closes**: *not* a new session. What is on screen must not change
 *   while it animates away, and the next open will start one anyway.
 *
 * Cancel therefore discards what was typed, as every other dialog here does.
 *
 * The first render is session 0 whether or not `open` is true: the form was just
 * mounted, so it is already fresh.
 */
export function useOpenSession(
  open: boolean,
  identity?: string | null,
): number {
  const [seen, setSeen] = useState<{
    open: boolean;
    identity: string | null;
    session: number;
  }>({ open, identity: identity ?? null, session: 0 });

  const current = identity ?? seen.identity;
  const fresh = (open && !seen.open) || (open && current !== seen.identity);
  const next = {
    open,
    identity: current,
    session: seen.session + (fresh ? 1 : 0),
  };

  /* Written during render, like the other per-open wrappers: the form below
     is keyed by what this returns, so it has to be right in the same pass,
     and an effect would show one frame of the last session's fields. */
  if (
    next.session !== seen.session ||
    next.open !== seen.open ||
    next.identity !== seen.identity
  ) {
    setSeen(next);
  }
  return next.session;
}
