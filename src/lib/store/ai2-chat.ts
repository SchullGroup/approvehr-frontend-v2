"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { ai2Status, type Ai2Message, type Ai2Status } from "@/lib/api/ai2";
import { EMPTY_LIVE, runAi2Turn, type Live, type Step } from "./ai2-turn";
import { refreshAi2Usage } from "./ai2-usage";
import { useSession } from "./session";

export type { Live, Step } from "./ai2-turn";

/**
 * A conversation with the `/ai2` assistant, streamed. No persistence — same
 * reasoning as `ai-chat.ts`: the API stores no transcript.
 *
 * What is on screen during a turn is not yet a turn: a streamed answer is
 * shown before anyone knows it is one, so it lives in `live`, separate from
 * `turns`, and only joins the transcript once the server sends finished
 * text. The wire transcript is built from `turns` alone.
 *
 * `error` covers both a failed turn and an `unavailable` event — a refusal is
 * never appended to the transcript, or the next turn would see it as
 * something the assistant said.
 */

/* -------------------------------------------------------------------- shape */

/** Matches the API's own ceiling in `modules/ai2/router.ts`. */
export const MAX_AI2_MESSAGES = 40;
export const MAX_AI2_MESSAGE_CHARS = 4000;

export type Ai2Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Kept after the turn lands, so a reader can see a refused lookup behind a figure. */
  steps?: Step[];
};

export type Ai2ChatState = {
  turns: Ai2Turn[];
  live: Live | null;
  sending: boolean;
  error: string | null;
  full: boolean;
};

export type Ai2ChatActions = {
  /** False when nothing was sent, so a composer keeps the draft. */
  send: (text: string) => Promise<boolean>;
  /** Send the transcript again, unchanged. Only meaningful after a failure. */
  retry: () => Promise<boolean>;
  /** Stop the turn in flight. What was streamed is dropped. */
  stop: () => void;
  reset: () => void;
};

/* ---------------------------------------------------------------- the store */

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `a2-${Date.now().toString(36)}-${counter}`;
};

const toWire = (turns: readonly Ai2Turn[]): Ai2Message[] =>
  turns.map((turn) => ({ role: turn.role, content: turn.content }));

/** Local refusal, shown before a press. The server's own refusal wins if they differ. */
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

  /** Staleness guard against events from a stopped or superseded turn. */
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);

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
        (live) => {
          if (sequence.current === mine) setLive(live);
        },
        controller.signal,
      );
      if (sequence.current !== mine) return false;
      if (result.usage) refreshAi2Usage();

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

      setError(
        result.declined ??
          "The assistant did not answer. Ask again, or try a narrower question.",
      );
      return true;
    } catch (caught) {
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

/** Whether there is an assistant to talk to. `/ai2/status` answers 200 either way. */
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

  if (isLoading) return LOADING;
  if (!isConnected) return OFFLINE;
  return fetched ?? LOADING;
}
