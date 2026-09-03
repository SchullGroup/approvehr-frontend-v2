"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  assistantActions,
  chat,
  runAssistantAction,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  type ApiActionResult,
  type ApiAssistantAction,
  type ApiChatMessage,
  type ApiProposedAction,
} from "@/lib/api/ai";
import { useSession } from "./session";

/**
 * The assistant conversation.
 *
 * ## Nothing is persisted, and that is a decision rather than an omission
 *
 * Every other store in this directory either reads the API or falls back to
 * `localStorage`. This one does neither: the conversation lives in component
 * state and is gone when the page is closed.
 *
 * The API deliberately stores no transcript — the whole conversation is sent
 * again on every turn precisely so that nothing about who asked what is kept.
 * Mirroring it into browser storage would quietly undo that: a machine somebody
 * shares would carry the last person's questions about a colleague's leave, in a
 * key nobody thinks to clear, on a product whose own DPA says the assistant
 * keeps nothing. So there is no `createPersistedState` here and there must not
 * be one. If a conversation needs to survive a reload, that is a server-side
 * decision about retention, not a client-side convenience.
 *
 * ## `/ai/chat` proposes. Only a press performs.
 *
 * `send` can never write anything. It can come back carrying a `proposed`
 * block — a described change plus the arguments that would make it — and that
 * is all. `confirm` is the only function here that writes, it takes a turn id
 * rather than a payload, and it posts `proposed.args` back **verbatim**.
 *
 * Do not call `confirm` from an effect, from a reply handler, or because a
 * proposal looked harmless. The confirm step exists so that a human reads a
 * sentence the database produced before a record moves; an automatic one is the
 * same feature with the safety taken out.
 *
 * ## Two failures, kept apart
 *
 * `error` is about the conversation — the turn did not go through. A turn's own
 * `actionError` is about a refused write: a permission, a leave request somebody
 * already decided, arguments the API will not take. They read differently, they
 * are fixed by different people, and they render in different places.
 */

/* -------------------------------------------------------------------- shape */

export type ChatTurn =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      /**
       * What goes on the wire for this turn.
       *
       * Usually the API's prose. When a change was proposed there is no prose —
       * the API omits `text` on purpose — so this holds `proposal.summary`,
       * which is the server's own sentence read out of the database. It is not a
       * paraphrase and nothing here writes it; without it the next turn would
       * send an empty assistant message and the model would have no record of
       * what it had already offered to do.
       */
      content: string;
      /** The lookups that ran, by name. Shown, never logged — see `ask-panel`. */
      used: string[];
      /** Present when this turn proposed a change. Never edited. */
      proposed?: ApiProposedAction;
      /** Set once `confirm` succeeded. The API's re-read of what it did. */
      done?: ApiActionResult;
      /** Somebody chose not to do it. Local only — see `discard` below. */
      discarded?: boolean;
      /** A refused write, in the API's own words. Not a failure of the turn. */
      actionError?: string;
      /**
       * Whether the API *decided* against it, rather than being unable to answer.
       *
       * A 403, 404, 409 or 422 will refuse identically however many times the
       * button is pressed — the permission is still missing, the leave request
       * is still already decided. A timeout or a 5xx is a moment that was wrong.
       * Only the second is worth offering a second press for, which is the same
       * rule `components/portal/load-failure.tsx` applies to Try again.
       */
      actionRefused?: boolean;
      /** True when this turn *is* the receipt for a performed action. */
      receipt?: boolean;
    };

export type ChatState = {
  turns: ChatTurn[];
  /** A turn is in flight. */
  sending: boolean;
  /** The id of the turn whose action is being performed, or null. */
  confirming: string | null;
  /** The conversation failed. The API's sentence where it wrote one. */
  error: string | null;
  /** True once the transcript has reached the API's own ceiling. */
  full: boolean;
};

export type ChatActions = {
  /**
   * Send what somebody typed.
   *
   * Returns false when nothing was sent, so a composer can keep the text rather
   * than clearing a field whose message never left. A turn that *was* sent and
   * then failed keeps its bubble and sets `error`; the transcript still ends
   * with a user message, which is what `retry` needs and what the API requires.
   */
  send: (text: string) => Promise<boolean>;
  /** Send the transcript again, unchanged. Only meaningful after a failure. */
  retry: () => Promise<boolean>;
  /** Perform the change this turn proposed. **Only ever from a click.** */
  confirm: (turnId: string) => Promise<void>;
  /** Put the proposal aside. Writes nothing and tells nobody — see below. */
  discard: (turnId: string) => void;
  /** Throw the conversation away. There is nowhere else it exists. */
  reset: () => void;
};

/* ---------------------------------------------------------------- the store */

/**
 * Statuses that mean the API decided, rather than could not answer.
 *
 * A second press changes none of them. 401 is deliberately absent: the client
 * refreshes and retries a 401 itself, and what reaches here is a session that
 * has ended, which is a sign-in rather than a retry.
 */
const REFUSALS = new Set([400, 403, 404, 409, 422]);

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `t-${Date.now().toString(36)}-${counter}`;
};

/** Exactly what the API takes: two fields, in order, nothing else. */
const toWire = (turns: readonly ChatTurn[]): ApiChatMessage[] =>
  turns.map((turn) => ({ role: turn.role, content: turn.content }));

/**
 * Why a message will not be sent, or null.
 *
 * The API refuses all three of these and its refusal is the authority; these
 * exist so somebody is told before they press send rather than after. If the two
 * ever disagree the server wins, because a 400 is shown verbatim.
 */
function localRefusal(text: string, turns: readonly ChatTurn[]): string | null {
  if (text.length === 0) return null;
  if (text.length > MAX_CHAT_MESSAGE_CHARS) {
    return (
      `That message is ${text.length.toLocaleString()} characters. The limit is ` +
      `${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} — shorten it, or ask in two parts.`
    );
  }
  if (turns.length + 1 > MAX_CHAT_MESSAGES) {
    return (
      "This conversation has reached its length limit. Start a new one — " +
      "nothing here is saved either way."
    );
  }
  return null;
}

export function useAssistantChat(): ChatState & ChatActions {
  const { isConnected } = useSession();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The staleness guard, same shape as `useSuggestion` in `store/ai.ts`.
   *
   * Somebody presses Start again while a turn is in flight, and the reply
   * arrives afterwards. Without this it would be appended to a conversation it
   * is no longer an answer in — a reply to a question that is no longer on
   * screen, which is worse than no reply at all.
   */
  const sequence = useRef(0);

  /** Everything after this point is a click, so `turns` is never read in render. */
  const exchange = useCallback(
    async (next: ChatTurn[]): Promise<boolean> => {
      const mine = ++sequence.current;
      setTurns(next);
      setSending(true);
      setError(null);

      try {
        const reply = await chat(toWire(next));
        if (sequence.current !== mine) return false;

        /* An assistant that went away mid-conversation. `reason` is not an
           answer and must not be appended as one — putting it in the transcript
           would send it back next turn as though the assistant had said it. */
        if (!reply.available) {
          setError(
            reply.reason ??
              "The assistant is not available. Nothing was sent to it.",
          );
          return true;
        }

        /* `text` when there is prose; the proposal's own summary when there is
           not. See the field's own note above. */
        const content = reply.text ?? reply.proposed?.proposal.summary ?? "";

        /* Neither is a shape the API says it produces. Appending it anyway
           would put an empty assistant message in the transcript, and the very
           next turn would come back 400 — "An empty message says nothing" —
           about a message nobody typed, which is an unrecoverable conversation.
           Reported as a turn that did not go through instead, which it is. */
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
            used: reply.used,
            ...(reply.proposed ? { proposed: reply.proposed } : {}),
          },
        ]);
        return true;
      } catch (caught) {
        if (sequence.current !== mine) return false;
        /* The API's own sentence where it wrote one — it knows whether this was
           a rate limit, a malformed transcript or a refusal, and nothing here
           does. Paraphrasing a server message locally is how the two stop
           agreeing. */
        setError(
          caught instanceof ApiError
            ? caught.message
            : "That did not go through. Try again.",
        );
        return true;
      } finally {
        if (sequence.current === mine) setSending(false);
      }
    },
    [],
  );

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

  const confirm = useCallback(
    async (turnId: string): Promise<void> => {
      const turn = turns.find((candidate) => candidate.id === turnId);
      if (!turn || turn.role !== "assistant" || !turn.proposed) return;
      if (turn.done || confirming !== null) return;

      setConfirming(turnId);
      try {
        /* `proposed.args` posted back exactly as it arrived. Not rebuilt, not
           filtered, not merged with anything typed on screen — the args are the
           server's own resolved ids, and the sentence somebody just read
           describes those and not a set assembled here. */
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
            /* The API's own sentence about what it did. Appended so the
               transcript reads as one thing that happened, and so the next turn
               carries the fact — otherwise the assistant would go on offering to
               do something already done. */
            content: result.outcome,
            used: [],
            receipt: true,
          },
        ]);
      } catch (caught) {
        /* Verbatim. A 403 names the permission, a 409 names what has already
           been decided, a 422 names the argument it will not take. Nothing on
           this side knows any of that. */
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

  /**
   * Local, and the assistant is not told.
   *
   * Discarding writes nothing anywhere, so there is nothing for the server to
   * hear about. The alternative — appending "they said no" to the transcript —
   * would put a sentence nobody typed into the conversation under a person's own
   * turn, which is the one thing this whole surface is arranged not to do. The
   * proposal stays visible and struck through so the record of what was offered
   * survives, and somebody who wants the assistant to know can say so.
   */
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
    setTurns([]);
    setSending(false);
    setConfirming(null);
    setError(null);
  }, []);

  return {
    turns,
    sending,
    confirming,
    error,
    full: turns.length >= MAX_CHAT_MESSAGES,
    send,
    retry,
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

/**
 * Offline: no list, and not loading, because nothing was ever going to be asked.
 *
 * Derived during render rather than written into state by the effect — a
 * synchronous `setState` in an effect is a cascading render, and `store/ai.ts`
 * and `store/holidays.ts` both settle the offline answer the same way for the
 * same reason. `react-hooks/set-state-in-effect` catches it if anybody forgets.
 */
const ACTIONS_OFFLINE: AssistantActionsState = {
  actions: NO_ACTIONS,
  loading: false,
  error: null,
};

/**
 * Everything the assistant is allowed to propose.
 *
 * Read once, for a panel answering "what can I ask it to do". There is no demo
 * branch: an invented list of things a switched-off assistant could do is a
 * claim about capabilities nobody can exercise, which is the same class of thing
 * as a canned suggestion — see the header of `store/ai.ts`.
 *
 * The gate on each row is the API's, not a guess: `permission` is one this
 * account may or may not hold, `service` means nothing on the server is wired to
 * perform it. Both are worth showing, because they are different problems.
 */
export function useAssistantActions(): AssistantActionsState {
  const { isConnected } = useSession();
  /* Only the fetch lives in state. Offline is settled below, during render. */
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
        if (error instanceof DOMException && error.name === "AbortError") return;
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
