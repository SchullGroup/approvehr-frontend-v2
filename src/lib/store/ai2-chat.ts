"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { ai2Status, type Ai2Message, type Ai2Status } from "@/lib/api/ai2";
import { EMPTY_LIVE, runAi2Turn, type Live, type Step } from "./ai2-turn";
import { useSession } from "./session";

export type { Live, Step } from "./ai2-turn";

/**
 * A conversation with the `/ai2` assistant, streamed.
 *
 * ## Nothing is persisted, and that is a decision rather than an omission
 *
 * The same rule `ai-chat.ts` records at length, and for the same reason: the
 * API deliberately stores no transcript — the whole conversation is sent again
 * on every turn precisely so that nothing about who asked what is kept. Writing
 * it to `localStorage` would quietly undo that on a shared machine. There is no
 * `createPersistedState` here and there must not be one.
 *
 * ## What is on screen during a turn is not yet a turn
 *
 * This is the whole difference from `ai-chat.ts`. A streamed answer is visible
 * before it is finished and before anyone knows it *is* an answer — the model
 * may write a sentence and then go and look something up, which makes that
 * sentence a preamble to work not yet done. So the live turn is held in `live`,
 * separately from `turns`, and only ever joins the transcript once the server
 * has sent the finished text.
 *
 * Nothing provisional is ever sent back to the API. The transcript on the wire
 * is built from `turns` alone, so a discarded preamble cannot become something
 * the assistant is told it said.
 *
 * ## Two failures, kept apart
 *
 * `error` is the turn not going through — no answer, and the user message stays
 * so `retry` can send it again. An `unavailable` event is the server declining
 * to answer *this* question and saying why; it is shown the same way, because
 * from a reader's side both mean "no answer, here is the sentence", and neither
 * belongs in the transcript: appending a refusal would send it back next turn
 * as though the assistant had said it.
 */

/* -------------------------------------------------------------------- shape */

/** Matches the API's own ceiling in `modules/ai2/router.ts`. */
export const MAX_AI2_MESSAGES = 40;
export const MAX_AI2_MESSAGE_CHARS = 4000;

export type Ai2Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /**
   * What the assistant did to answer, kept beside the answer it produced.
   *
   * Retained after the turn lands rather than cleared, so a reader can still
   * see that a figure came from a lookup that was refused — which is the one
   * case where the answer alone does not tell the whole story.
   */
  steps?: Step[];
};

export type Ai2ChatState = {
  turns: Ai2Turn[];
  /** The turn in flight, or null. */
  live: Live | null;
  sending: boolean;
  /** The turn did not go through, or the server declined. Its own sentence. */
  error: string | null;
  full: boolean;
};

export type Ai2ChatActions = {
  /** Send what somebody typed. False when nothing was sent, so a composer keeps it. */
  send: (text: string) => Promise<boolean>;
  /** Send the transcript again, unchanged. Only meaningful after a failure. */
  retry: () => Promise<boolean>;
  /** Stop the turn in flight. What was streamed is dropped, not kept. */
  stop: () => void;
  /** Throw the conversation away. There is nowhere else it exists. */
  reset: () => void;
};

/* ---------------------------------------------------------------- the store */

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `a2-${Date.now().toString(36)}-${counter}`;
};

/** Exactly what the API takes: two fields, nothing else. */
const toWire = (turns: readonly Ai2Turn[]): Ai2Message[] =>
  turns.map((turn) => ({ role: turn.role, content: turn.content }));

/**
 * Why a message will not be sent, or null.
 *
 * The API refuses all of these and its refusal is the authority; these exist so
 * somebody is told before they press send rather than after. If the two ever
 * disagree the server wins, because its sentence is shown verbatim.
 */
function localRefusal(text: string, turns: readonly Ai2Turn[]): string | null {
  if (text.length === 0) return null;
  if (text.length > MAX_AI2_MESSAGE_CHARS) {
    return (
      `That message is ${text.length.toLocaleString()} characters. The limit is ` +
      `${MAX_AI2_MESSAGE_CHARS.toLocaleString()}. Shorten it, or ask in two parts.`
    );
  }
  if (turns.length + 1 > MAX_AI2_MESSAGES) {
    return (
      "This conversation has reached its length limit. Start a new one: " +
      "nothing here is saved either way."
    );
  }
  return null;
}

export function useAi2Chat(): Ai2ChatState & Ai2ChatActions {
  const { isConnected } = useSession();
  const [turns, setTurns] = useState<Ai2Turn[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The staleness guard, same shape as `ai-chat.ts`.
   *
   * Somebody presses Start again, or Stop, while a turn is streaming. Without
   * this its events would keep landing in a conversation they are no longer an
   * answer in — and a stream delivers many of them, so the window is the whole
   * turn rather than the moment it ends.
   */
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);

  /* A stream left open outlives the screen otherwise. */
  useEffect(() => () => abort.current?.abort(), []);

  const exchange = useCallback(async (next: Ai2Turn[]): Promise<boolean> => {
    const mine = ++sequence.current;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;

    setTurns(next);
    setLive(EMPTY_LIVE);
    setSending(true);
    setError(null);

    try {
      const result = await runAi2Turn(
        toWire(next),
        /* Provisional, and guarded: a superseded turn's events must not land
           in a conversation they are no longer an answer in. */
        (live) => {
          if (sequence.current === mine) setLive(live);
        },
        controller.signal,
      );
      if (sequence.current !== mine) return false;

      if (result.text !== null) {
        setTurns([
          ...next,
          {
            id: nextId(),
            role: "assistant",
            content: result.text,
            steps: result.steps,
          },
        ]);
        return true;
      }

      /* No answer. The server's own sentence where it gave one — it knows
         whether this was a missing key, a permission or a budget spent, and
         nothing here does. Not appended to the transcript: see the header. */
      setError(
        result.declined ??
          "The assistant did not answer. Ask again, or try a narrower question.",
      );
      return true;
    } catch (caught) {
      /* A stop, or the screen going away. Neither is a failure to report. */
      if (caught instanceof DOMException && caught.name === "AbortError")
        return false;
      if (sequence.current !== mine) return false;

      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not go through. Try again.",
      );
      return true;
    } finally {
      if (sequence.current === mine) {
        setSending(false);
        /* Whatever was streaming is either in the transcript now or was never
           an answer. Either way it does not stay on screen twice. */
        setLive(null);
      }
    }
  }, []);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || sending) return false;

      if (!isConnected) {
        setError(
          "The assistant needs the API. There are no records here for it to read.",
        );
        return false;
      }

      const refusal = localRefusal(trimmed, turns);
      if (refusal) {
        setError(refusal);
        return false;
      }

      return exchange([
        ...turns,
        { id: nextId(), role: "user", content: trimmed },
      ]);
    },
    [turns, sending, isConnected, exchange],
  );

  const retry = useCallback(async (): Promise<boolean> => {
    const last = turns[turns.length - 1];
    if (sending || !last || last.role !== "user") return false;
    return exchange(turns);
  }, [turns, sending, exchange]);

  /**
   * Stop, and keep nothing.
   *
   * A half-written answer is not a short answer — it is a sentence that stops,
   * and keeping it in the transcript would send it back next turn as something
   * the assistant said. The question stays, so it can be asked again.
   */
  const stop = useCallback(() => {
    sequence.current += 1;
    abort.current?.abort();
    abort.current = null;
    setLive(null);
    setSending(false);
  }, []);

  const reset = useCallback(() => {
    sequence.current += 1;
    abort.current?.abort();
    abort.current = null;
    setTurns([]);
    setLive(null);
    setSending(false);
    setError(null);
  }, []);

  return {
    turns,
    live,
    sending,
    error,
    full: turns.length >= MAX_AI2_MESSAGES,
    send,
    retry,
    stop,
    reset,
  };
}

/* ------------------------------------------------------------- availability */

export type Ai2Availability = {
  available: boolean;
  loading: boolean;
  /** The model's name. For a settings screen; never shown beside an answer. */
  model: string | null;
  /** Why not, when not. The API's own sentence. */
  reason: string | null;
};

const OFFLINE: Ai2Availability = {
  available: false,
  loading: false,
  model: null,
  reason:
    "The assistant needs the API, and this build is not connected to one.",
};

const LOADING: Ai2Availability = {
  available: false,
  loading: true,
  model: null,
  reason: null,
};

/**
 * Whether there is an assistant to talk to.
 *
 * Asked rather than assumed: `/ai2/status` answers 200 either way, because a
 * missing credential is a feature the company has not switched on rather than
 * an error. A screen that rendered a composer regardless would be a door with
 * nothing behind it.
 */
export function useAi2Available(): Ai2Availability {
  const { isConnected, isLoading } = useSession();
  const [fetched, setFetched] = useState<Ai2Availability | null>(null);

  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const status: Ai2Status = await ai2Status();
        if (!cancelled) {
          setFetched({
            available: status.available,
            loading: false,
            model: status.model,
            reason: status.reason ?? null,
          });
        }
      } catch {
        /* Unreachable rather than switched off, and the difference matters:
           this is a server that did not answer, not a company without a key. */
        if (!cancelled) {
          setFetched({
            available: false,
            loading: false,
            model: null,
            reason: "The server did not say whether an assistant is available.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, isLoading]);

  /* Derived during render rather than written into state by the effect — a
     synchronous `setState` in an effect is a cascading render, and the answer
     offline never depended on a request. Same rule as `store/ai.ts`. */
  if (isLoading) return LOADING;
  if (!isConnected) return OFFLINE;
  return fetched ?? LOADING;
}
