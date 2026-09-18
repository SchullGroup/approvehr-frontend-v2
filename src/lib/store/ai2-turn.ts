"use client";

import { askAi2Stream, type Ai2Event, type Ai2Message } from "@/lib/api/ai2";

/**
 * One streamed turn, as a thing a store can await. Shared by the assistant
 * page and the Ask page, which differ in what they do with a conversation but
 * not in how a turn arrives.
 *
 * `onLive` is provisional; the resolved value is not.
 */

/** One thing the assistant did, or is doing, during a turn. */
export type Step =
  | {
      kind: "lookup";
      key: string;
      entity?: string;
      running: boolean;
      refused: boolean;
    }
  | { kind: "note"; key: string; text: string };

export type Usage = { promptTokens: number; outputTokens: number; thinkingTokens: number };

/** What is on screen mid-turn, and is not yet a turn. Provisional. */
export type Live = {
  text: string;
  steps: Step[];
  usage: Usage | null;
};

export const EMPTY_LIVE: Live = { text: "", steps: [], usage: null };

/** How a turn ended. Exactly one of `text` and `declined` is set. */
export type TurnResult = {
  text: string | null;
  declined: string | null;
  steps: Step[];
  usage: Usage | null;
};

let noteCounter = 0;

/**
 * Ask, and report the turn as it happens. `onLive` receives the whole live
 * state on every change, not a diff.
 *
 * Throws only if the request never started. Once the stream is open, a
 * failure is a `declined` in the resolved value.
 */
export async function runAi2Turn(
  messages: Ai2Message[],
  onLive: (live: Live) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  let text = "";
  let steps: Step[] = [];
  let answered: string | null = null;
  let declined: string | null = null;
  let usage: Usage | null = null;

  const publish = () => onLive({ text, steps, usage });

  const onEvent = (event: Ai2Event) => {
    switch (event.type) {
      case "delta":
        text += event.text;
        publish();
        return;

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
        // Replaces the accumulation rather than confirming it — a dropped
        // delta would otherwise leave a gap in the middle of a sentence.
        answered = event.text;
        text = event.text;
        publish();
        return;

      case "usage":
        usage = {
          promptTokens: event.promptTokens,
          outputTokens: event.outputTokens,
          thinkingTokens: event.thinkingTokens,
        };
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
    usage,
  };
}
