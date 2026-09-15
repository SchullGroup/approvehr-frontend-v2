"use client";

import { askAi2Stream, type Ai2Event, type Ai2Message } from "@/lib/api/ai2";

/**
 * One streamed turn, as a thing a store can await.
 *
 * ## Why this is not inside a store
 *
 * Two surfaces talk to `/ai2` — the assistant page and the Ask page — and they
 * differ in what they do with a *conversation*: one carries proposals, a
 * confirm step and a scripted build, the other is a plain read. What they do
 * not differ in is how a turn arrives, and that part is fiddly enough to be
 * worth having once: prose is provisional until the server says otherwise,
 * lookups open and close out of order, and a `discard` takes back something
 * already on screen.
 *
 * A second copy of that would be a second place for "the preamble is not the
 * answer" to be got subtly wrong, and the wrong version reads fine — it just
 * leaves a sentence on screen describing work that never happened.
 *
 * So the rule lives here: **`onLive` is provisional, the resolved value is
 * not.** A store renders what `onLive` hands it and commits only what the
 * promise resolves to.
 */

/** One thing the assistant did, or is doing, during a turn. */
export type Step =
  | {
      kind: "lookup";
      key: string;
      /** The record being read, where the model named one. */
      entity?: string;
      /** Still running. */
      running: boolean;
      /** Declined — not the same as finding nothing. */
      refused: boolean;
    }
  /** Prose written alongside the lookups. The model's own words, not a label. */
  | { kind: "note"; key: string; text: string };

/** What is on screen mid-turn, and is not yet a turn. */
export type Live = {
  /** The answer so far. Provisional — see the header. */
  text: string;
  steps: Step[];
};

export const EMPTY_LIVE: Live = { text: "", steps: [] };

/** How a turn ended. Exactly one of `text` and `declined` is set. */
export type TurnResult = {
  /** The finished answer, or null if there was none. */
  text: string | null;
  /** The server's reason for not answering, verbatim, or null. */
  declined: string | null;
  /** What it did, in order. Kept beside the answer it produced. */
  steps: Step[];
};

let noteCounter = 0;

/**
 * Ask, and report the turn as it happens.
 *
 * `onLive` is called with the whole live state on every change rather than with
 * a diff — a store setting `live` from it cannot then drift from what arrived,
 * and the object is three fields.
 *
 * Throws only if the request never started: a validation refusal, a dead
 * session, no network. Once the stream is open a failure is a `declined` in the
 * resolved value, because that is what it is — the server saying why, not the
 * request going wrong.
 */
export async function runAi2Turn(
  messages: Ai2Message[],
  onLive: (live: Live) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  /* The turn's own state, held here rather than read back out of the store:
     `onLive` is provisional by construction and a store may be re-rendering,
     unmounted or superseded. These are the values the result is built from. */
  let text = "";
  let steps: Step[] = [];
  let answered: string | null = null;
  let declined: string | null = null;

  const publish = () => onLive({ text, steps });

  const onEvent = (event: Ai2Event) => {
    switch (event.type) {
      case "delta":
        text += event.text;
        publish();
        return;

      /* The prose so far was a preamble to a lookup, not an answer. Off the
         screen — it described work that had not happened yet. */
      case "discard":
        text = "";
        publish();
        return;

      case "note":
        noteCounter += 1;
        steps = [
          ...steps,
          { kind: "note", key: `n${String(noteCounter)}`, text: event.text },
        ];
        publish();
        return;

      case "lookup":
        steps = [
          ...steps,
          {
            kind: "lookup",
            key: `r${String(event.round)}-${String(event.index)}`,
            ...(event.entity === undefined ? {} : { entity: event.entity }),
            running: true,
            refused: false,
          },
        ];
        publish();
        return;

      case "lookup_done": {
        const key = `r${String(event.round)}-${String(event.index)}`;
        steps = steps.map((step) =>
          step.kind === "lookup" && step.key === key
            ? { ...step, running: false, refused: event.refused }
            : step,
        );
        publish();
        return;
      }

      case "answer":
        /* Authoritative, and it replaces the accumulation rather than
           confirming it: a dropped delta would otherwise leave a gap in the
           middle of a sentence that reads like the assistant's own wording. */
        answered = event.text;
        text = event.text;
        publish();
        return;

      case "unavailable":
        declined = event.reason;
        return;
    }
  };

  await askAi2Stream(messages, onEvent, signal);

  return {
    text: answered !== null && answered !== "" ? answered : null,
    declined,
    steps,
  };
}
