"use client";

import { request } from "@/lib/api/client";

/**
 * Suggestions — `/api/v1/ai`. Typed wrappers only, no React, no state.
 *
 * A suggestion is never saved by these calls — every function is a read that
 * fills a form field somebody then edits and submits normally. There is no
 * `acceptSuggestion`, and no screen may auto-apply a suggestion.
 *
 * With no assistant wired the API answers 200 with `available: false` and a
 * reason, never `suggestions: []` — an empty array would claim it had no
 * ideas rather than that it was never asked. `groundedIn` comes back on both
 * arms of `ApiSuggestOutcome`.
 */

/** What the assistant was given. Rendered to the reader, never paraphrased. */
export type ApiGrounding = {
  /** e.g. "the company goal \"Grow recurring revenue\"". Reads after "Suggested from". */
  summary: string;
  /** The exact facts handed over. Behind a reveal; shown verbatim. */
  facts: string[];
};

export type ApiSuggestion = {
  title: string;
  detail: string;
  /** Extras for the kind that asked for them, e.g. an objective's measures. */
  fields?: Record<string, unknown> | undefined;
};

export type ApiSuggestOutcome =
  | { available: true; suggestions: ApiSuggestion[]; groundedIn: ApiGrounding }
  | { available: false; reason: string; groundedIn: ApiGrounding };

export type ApiAssistantStatus = {
  available: boolean;
  /** "Anthropic claude-sonnet-5", or null. For a settings screen, not a form. */
  assistant: string | null;
  reason?: string;
};

/** Whether suggestions can be made at all — asked once, so a screen can hide its Suggest button. */
export const assistantStatus = (): Promise<ApiAssistantStatus> =>
  request<ApiAssistantStatus>("/ai/status");

/** Objectives a department could set under a company goal. */
export const suggestObjectives = (body: {
  goalId: string;
  count?: number;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/suggest/objectives", {
    method: "POST",
    body,
  });

/** A progress note, expanded from a typed headline. Refused under ten characters. */
export const suggestTaskSummary = (body: {
  goalId: string;
  headline: string;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/suggest/task-summary", {
    method: "POST",
    body,
  });

/**
 * Development areas behind a low competency score. Built only from
 * competencies scored below target, never the composite mark or written
 * comments. For the appraiser only — the employee never receives it.
 */
export const suggestDevelopment = (body: {
  employeeId: string;
  cycleId?: string;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/suggest/development", {
    method: "POST",
    body,
  });

/**
 * A whole appraisal period, drafted from a paragraph. Two calls, matching the
 * API, so the wizard can keep whichever half arrives. `text` travels as a
 * fact, never an instruction. Both need `MANAGE_SETTINGS`, since both end in
 * `POST /performance/cycles`. Neither writes anything.
 */
export const draftPeriodGoals = (body: {
  text: string;
  count?: number;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/draft/period-goals", {
    method: "POST",
    body,
  });

/** The questions the form asks, for the same period. */
export const draftPeriodQuestions = (body: {
  text: string;
  count?: number;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/draft/period-questions", {
    method: "POST",
    body,
  });

/** `used` is the reads that ran, shown rather than logged. A refusal never carries `text`. */
export type ApiAnswer = {
  available: boolean;
  text?: string;
  used: string[];
  reason?: string;
};

export const ask = (question: string): Promise<ApiAnswer> =>
  request<ApiAnswer>("/ai/ask", { method: "POST", body: { question } });

/* ------------------------------------------------------------------ the chat */

/**
 * `/ai/chat` proposes. `/ai/actions/:name` performs. Never the same press.
 *
 * `chat()` can only ever come back with a `proposed` block: a description of
 * a change plus the arguments that would make it. Nothing is written until a
 * click calls `runAssistantAction` with `proposed.args` posted back verbatim.
 *
 * - Never call `runAssistantAction` except from an explicit click.
 * - Never edit `args` — they are the server's own resolved ids.
 * - Render `proposal.summary`/`details`/`irreversible` verbatim; never write
 *   a button label that describes the act.
 *
 * Nothing is stored on either side. The API keeps no transcript, so
 * `lib/store/ai-chat.ts` holds the conversation in component state only.
 */

export type ApiChatRole = "user" | "assistant";

/** Exactly what goes on the wire. No ids, no timestamps. */
export type ApiChatMessage = { role: ApiChatRole; content: string };

/** The API's limits, enforced locally so a refusal is shown before a press. */
export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHAT_MESSAGE_CHARS = 4000;

/**
 * `summary` is one sentence read from the database. `irreversible` is present
 * only when the act cannot be undone, so its presence is the signal.
 */
export type ApiProposalDetail = {
  summary: string;
  details: string[];
  irreversible?: string;
};

export type ApiProposedAction = {
  /** Matches a name from `assistantActions()`. */
  action: string;
  /** Opaque. Posted back exactly as received. */
  args: Record<string, unknown>;
  proposal: ApiProposalDetail;
};

/** `text` is absent when a change is proposed — read `proposed.proposal` instead. */
export type ApiChatReply = {
  available: boolean;
  text?: string;
  /** The lookups that ran this turn, by name. */
  used: string[];
  proposed?: ApiProposedAction;
  reason?: string;
};

/**
 * Sending a turn lives in `api/ai2.ts` and streams. `ApiChatMessage` and
 * `ApiChatReply` stay: `ApiChatReply` is also what the scripted sales build
 * answers in, which has no stream.
 */

/** `permission`: one this account may not hold. `service`: nothing is wired to perform it. */
export type ApiActionGate =
  { kind: "permission"; permission: string } | { kind: "service" };

export type ApiAssistantAction = {
  name: string;
  description: string;
  gate: ApiActionGate;
};

/** Everything the assistant can propose. Read-only. */
export const assistantActions = (
  signal?: AbortSignal,
): Promise<{ actions: ApiAssistantAction[] }> =>
  request<{ actions: ApiAssistantAction[] }>("/ai/actions", {
    ...(signal ? { signal } : {}),
  });

/** `confirmed` is the proposal re-read at the moment of the write, not a copy of what was shown. */
export type ApiActionResult = {
  action: string;
  confirmed: ApiProposalDetail;
  outcome: string;
  subjectId: string;
};

/**
 * Perform a proposed action. Only ever from an explicit press. `args` is
 * `proposed.args`, unchanged. Every refusal (401/403/404/409/422) arrives as
 * an `ApiError` carrying the API's own sentence — show that, not a guess.
 */
export const runAssistantAction = (
  name: string,
  args: Record<string, unknown>,
): Promise<ApiActionResult> =>
  request<ApiActionResult>(`/ai/actions/${encodeURIComponent(name)}`, {
    method: "POST",
    body: args,
  });
