"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  assistantActions,
  runAssistantAction,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  type ApiActionResult,
  type ApiAssistantAction,
  type ApiChatMessage,
  type ApiChatReply,
  type ApiProposedAction,
} from "@/lib/api/ai";
import {
  EMPTY_LIVE,
  runAi2Turn,
  type Live,
  type Step,
  type Usage,
} from "./ai2-turn";
import { refreshAi2Usage } from "./ai2-usage";
import { useSession } from "./session";

export type { Live, Step, Usage } from "./ai2-turn";
import { findScriptedAnswer } from "@/lib/mock/sales-script-qa";
import { scriptedFallback } from "@/lib/sales-script";

/**
 * The assistant conversation. Nothing is persisted — no `createPersistedState`
 * — because the API stores no transcript either, and mirroring it into
 * localStorage would undo that on a shared machine.
 *
 * `/ai/chat` proposes; only `confirm` writes, and it posts `proposed.args`
 * back verbatim. Never call it except from a click.
 *
 * `error` is the conversation failing to go through; a turn's own
 * `actionError` is a refused write. They render in different places.
 */

/* -------------------------------------------------------------------- shape */

export type ChatTurn =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      /** The API's prose, or `proposal.summary` when a change was proposed. */
      content: string;
      /** Lookups that ran, by name. Used only by the scripted build. */
      used?: string[];
      /** What the assistant did to reach this answer. Supersedes `used`. */
      steps?: Step[];
      usage?: Usage;
      /** Present when this turn proposed a change. Never edited. */
      proposed?: ApiProposedAction;
      /** Set once `confirm` succeeded. */
      done?: ApiActionResult;
      /** Chose not to do it. Local only — see `discard`. */
      discarded?: boolean;
      actionError?: string;
      /** Whether the API decided against it rather than failed to answer. */
      actionRefused?: boolean;
      /** True when this turn is the receipt for a performed action. */
      receipt?: boolean;
    };

export type ChatState = {
  turns: ChatTurn[];
  /** The turn in flight, provisional until it lands in `turns`. */
  live: Live | null;
  sending: boolean;
  /** The id of the turn whose action is being performed, or null. */
  confirming: string | null;
  error: string | null;
  /** True once the transcript has reached the API's own ceiling. */
  full: boolean;
};

export type ChatActions = {
  /** Returns false when nothing was sent, so a composer keeps the draft. */
  send: (text: string) => Promise<boolean>;
  /** Send the transcript again, unchanged. Only meaningful after a failure. */
  retry: () => Promise<boolean>;
  /** Stop the turn in flight, keeping nothing shown so far. */
  stop: () => void;
  /** Perform the change this turn proposed. Only ever from a click. */
  confirm: (turnId: string) => Promise<void>;
  /** Put the proposal aside. Writes nothing. */
  discard: (turnId: string) => void;
  reset: () => void;
};

/* ---------------------------------------------------------------- the store */

/** Statuses meaning the API decided, rather than failing to answer. */
const REFUSALS = new Set([400, 403, 404, 409, 422]);

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `t-${Date.now().toString(36)}-${counter}`;
};

const toWire = (turns: readonly ChatTurn[]): ApiChatMessage[] =>
  turns.map((turn) => ({ role: turn.role, content: turn.content }));

/** Local refusal, shown before a press. The server's own refusal wins if they differ. */
function localRefusal(text: string, turns: readonly ChatTurn[]): string | null {
  if (text.length === 0) return null;
  if (text.length > MAX_CHAT_MESSAGE_CHARS) {
    return (
      `That message is ${text.length.toLocaleString()} characters. The limit is ` +
      `${MAX_CHAT_MESSAGE_CHARS.toLocaleString()}. Shorten it, or ask in two parts.`
    );
  }
  if (turns.length + 1 > MAX_CHAT_MESSAGES) {
    return (
      "This conversation has reached its length limit. Start a new one: " +
      "nothing here is saved either way."
    );
  }
  return null;
}

export function useAssistantChat(): ChatState & ChatActions {
  const { isConnected } = useSession();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Staleness guard against a reply landing after Start again was pressed. */
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  /** The scripted build's answer to the last thing typed, shaped as an ApiChatReply. */
  function scriptedReplyFor(turns: readonly ChatTurn[]): ApiChatReply {
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    const found = lastUser ? findScriptedAnswer(lastUser.content) : null;
    return {
      available: true,
      text: found ? found.answer : scriptedFallback(),
      used: found?.used ?? [],
    };
  }

  const exchange = useCallback(async (next: ChatTurn[]): Promise<boolean> => {
    const mine = ++sequence.current;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;

    setTurns(next);
    setLive(SALES_SCRIPT_ENABLED ? null : EMPTY_LIVE);
    setSending(true);
    setError(null);

    try {
      if (SALES_SCRIPT_ENABLED) {
        const reply: ApiChatReply = scriptedReplyFor(next);
        if (sequence.current !== mine) return false;

        const content = reply.text ?? reply.proposed?.proposal.summary ?? "";
        if (content.trim().length === 0) {
          setError("The assistant answered with nothing. Ask again.");
          return true;
        }

        setTurns([
          ...next,
          {
            id: nextId(),
            role: "assistant",
            content,
            used: reply.used ?? [],
            ...(reply.proposed ? { proposed: reply.proposed } : {}),
          },
        ]);
        return true;
      }

      const result = await runAi2Turn(
        toWire(next),
        (next_live) => {
          if (sequence.current === mine) setLive(next_live);
        },
        controller.signal,
      );
      if (sequence.current !== mine) return false;
      if (result.usage) refreshAi2Usage();

      if (result.text === null) {
        setError(
          result.declined ?? "The assistant answered with nothing. Ask again.",
        );
        return true;
      }

      setTurns([
        ...next,
        {
          id: nextId(),
          role: "assistant",
          content: result.text,
          used: [],
          steps: result.steps,
          ...(result.usage ? { usage: result.usage } : {}),
        },
      ]);
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

      if (!SALES_SCRIPT_ENABLED && !isConnected) {
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

  const confirm = useCallback(
    async (turnId: string): Promise<void> => {
      const turn = turns.find((candidate) => candidate.id === turnId);
      if (!turn || turn.role !== "assistant" || !turn.proposed) return;
      if (turn.done || confirming !== null) return;

      setConfirming(turnId);
      try {
        const result = await runAssistantAction(
          turn.proposed.action,
          turn.proposed.args,
        );
        setTurns((current) => [
          ...current.map((candidate) =>
            candidate.id === turnId && candidate.role === "assistant"
              ? {
                  ...candidate,
                  done: result,
                  actionError: undefined,
                  actionRefused: undefined,
                }
              : candidate,
          ),
          {
            id: nextId(),
            role: "assistant" as const,
            content: result.outcome,
            used: [],
            receipt: true,
          },
        ]);
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.message
            : "That could not be done. Try again in a moment.";
        const refused =
          caught instanceof ApiError && REFUSALS.has(caught.status);
        setTurns((current) =>
          current.map((candidate) =>
            candidate.id === turnId && candidate.role === "assistant"
              ? { ...candidate, actionError: message, actionRefused: refused }
              : candidate,
          ),
        );
      } finally {
        setConfirming(null);
      }
    },
    [turns, confirming],
  );

  const discard = useCallback((turnId: string) => {
    setTurns((current) =>
      current.map((candidate) =>
        candidate.id === turnId && candidate.role === "assistant"
          ? { ...candidate, discarded: true }
          : candidate,
      ),
    );
  }, []);

  const reset = useCallback(() => {
    sequence.current += 1;
    abort.current?.abort();
    abort.current = null;
    setTurns([]);
    setLive(null);
    setSending(false);
    setConfirming(null);
    setError(null);
  }, []);

  return {
    turns,
    live,
    sending,
    confirming,
    error,
    full: turns.length >= MAX_CHAT_MESSAGES,
    send,
    retry,
    stop,
    confirm,
    discard,
    reset,
  };
}

/* ------------------------------------------------------- what it can propose */

export type AssistantActionsState = {
  actions: ApiAssistantAction[];
  loading: boolean;
  error: unknown;
};

const NO_ACTIONS: ApiAssistantAction[] = [];

const ACTIONS_LOADING: AssistantActionsState = {
  actions: NO_ACTIONS,
  loading: true,
  error: null,
};

const ACTIONS_OFFLINE: AssistantActionsState = {
  actions: NO_ACTIONS,
  loading: false,
  error: null,
};

/** Everything the assistant is allowed to propose. No demo branch. */
export function useAssistantActions(): AssistantActionsState {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<AssistantActionsState | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const answer = await assistantActions(controller.signal);
        if (!cancelled) {
          setFetched({ actions: answer.actions, loading: false, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setFetched({ actions: NO_ACTIONS, loading: false, error });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected]);

  if (!isConnected) return ACTIONS_OFFLINE;
  return fetched ?? ACTIONS_LOADING;
}
