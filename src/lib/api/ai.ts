"use client";

import { request } from "@/lib/api/client";

/**
 * Suggestions — `/api/v1/ai`.
 *
 * Typed wrappers only, in the same style as `performance.ts` beside it. No
 * React, no state.
 *
 * ## The one thing to understand before using any of this
 *
 * **A suggestion is never saved by these calls.** Every function here is a
 * read: it returns text that lands in a form field a person then edits and
 * submits through the ordinary endpoint. There is no `acceptSuggestion` and
 * there must not be one — a suggestion somebody kept and a sentence somebody
 * typed are the same row, and the difference is only who did the typing.
 *
 * The API enforces this (see `modules/ai/service.ts` — it reads and never
 * writes), and the frontend has to hold the same line: **nothing in a screen
 * may auto-apply a suggestion.** A suggestion that fills a field on arrival is
 * a generated sentence submitted under somebody's name by default, and the
 * first time anybody notices is at an appraisal.
 *
 * ## Absent is a refusal with a reason, never an empty list
 *
 * `SuggestOutcome` is a discriminated union and that is load-bearing. With no
 * assistant wired the API answers **200** with `available: false` and a
 * sentence — not a 500, and not `suggestions: []`. An empty array would read as
 * "it thought about your goal and had no ideas", which is a claim about a
 * request nobody made. Screens branch on `available` and render the reason.
 *
 * The `groundedIn` block comes back on **both** arms, so a screen can say what
 * the suggestion would have been based on even when it cannot make one.
 */

/** What the assistant was given. Rendered to the reader, so never paraphrased. */
export type ApiGrounding = {
  /** "the company goal \"Grow recurring revenue\"". Reads after "Suggested from". */
  summary: string;
  /** The exact facts handed over. Behind a reveal; shown verbatim. */
  facts: string[];
};

export type ApiSuggestion = {
  title: string;
  detail: string;
  /**
   * Extras for the kind that asked for them — an objective's measures arrive as
   * `{ measures: [{ label, unit }] }`. Deliberately loose on the wire; the one
   * caller that reads it narrows it there rather than typing every kind here.
   */
  fields?: Record<string, unknown> | undefined;
};

export type ApiSuggestOutcome =
  | { available: true; suggestions: ApiSuggestion[]; groundedIn: ApiGrounding }
  | { available: false; reason: string; groundedIn: ApiGrounding };

export type ApiAssistantStatus = {
  available: boolean;
  /** "Anthropic claude-sonnet-5", or null. For a settings screen, not a form. */
  assistant: string | null;
  /** Present only when unavailable. */
  reason?: string;
};

/**
 * Whether suggestions can be made at all.
 *
 * Asked once by the shell rather than per form, so a screen can decide whether
 * to render its Suggest button — **absent, not disabled**, the same rule the nav
 * and the dashboard tiles follow. A button that is present and always refuses
 * teaches people the product is broken.
 */
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

/**
 * A progress note, expanded from the headline somebody typed.
 *
 * `headline` is the person's own words and the API refuses fewer than ten
 * characters — three words is a blank page, and a note generated from "did
 * work" would be entirely invention.
 */
export const suggestTaskSummary = (body: {
  goalId: string;
  headline: string;
}): Promise<ApiSuggestOutcome> =>
  request<ApiSuggestOutcome>("/ai/suggest/task-summary", {
    method: "POST",
    body,
  });

/**
 * Development areas behind a low competency score.
 *
 * Built only from competencies scored **below their target** — never from the
 * composite mark, never from written comments. Somebody meeting every target is
 * refused rather than handed a weakness invented to fill the panel, and that
 * refusal arrives as a 422 the screen shows as an ordinary message.
 *
 * This is a note for whoever is writing the appraisal. The employee never
 * receives it, and nothing is recorded unless the appraiser puts it in the form
 * themselves.
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
 * A whole appraisal period, drafted from a paragraph.
 *
 * Two calls rather than one, matching the API. The wizard keeps whichever half
 * arrives: a period with drafted goals and hand-written questions is a period,
 * while a single request that refuses because its second half timed out puts
 * somebody back at a blank page.
 *
 * `text` is the person's own description and travels to the model as a **fact**,
 * never as the instruction — the instruction is assembled server-side, which is
 * what keeps the guardrails enforceable. See `modules/ai/schemas.ts`.
 *
 * Both need `MANAGE_SETTINGS`, because both exist to end in
 * `POST /performance/cycles`, which needs it. The other three suggestion
 * endpoints are gated by what they read; these two read nothing narrowed by the
 * caller, so there is nothing for a read-gate to check.
 *
 * **Neither writes anything.** The wizard's last screen calls the ordinary
 * create endpoints with whatever the person edited, and a measure cannot even
 * be created without a target — `CreateKeyResultBody.targetValue` is required,
 * which is the API refusing at the type level the one thing the model must
 * never fill in.
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

/**
 * An answer to a question about the company's own records.
 *
 * `used` is the reads that ran, by name, and it is shown rather than logged —
 * an answer a person cannot check the working of is an oracle, and this
 * product does not ship those. `available: false` carries a `reason` and never
 * a `text`, so a refusal cannot be rendered as an answer.
 */
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
 * A conversation, and the one thing in this module that can lead to a write.
 *
 * ## `/ai/chat` proposes. `/ai/actions/:name` performs. Never the same press.
 *
 * This is the whole safety model and it is not a convention — it is two
 * endpoints. `chat()` can only ever come back with a `proposed` block, which is
 * a description of a change and the arguments that would make it. Nothing is
 * written until somebody presses a button, and that button calls
 * `runAssistantAction` with `proposed.args` **posted back verbatim**.
 *
 * Three rules follow, and undoing any one of them undoes the model:
 *
 * 1. **Never call `runAssistantAction` except from an explicit click.** Not from
 *    an effect, not on arrival, not because the proposal looked safe.
 * 2. **Never edit `args`.** They are the server's own resolved ids. Rewriting
 *    them here would mean the thing confirmed is not the thing described.
 * 3. **Render `proposal.summary`, `proposal.details` and `proposal.irreversible`
 *    verbatim, and never write a button label that describes the act.** Those
 *    sentences were read out of the database by the API; a paraphrase is a
 *    sentence the model wrote about a record nobody checked. The point of the
 *    confirm step is that its words come from the data rather than from the
 *    assistant.
 *
 * ## Nothing is stored, on either side
 *
 * The API keeps no transcript, deliberately — the whole conversation is sent
 * again every turn. So the frontend must not keep one either: mirroring it into
 * `localStorage` would quietly undo a privacy decision somebody made on purpose.
 * See `lib/store/ai-chat.ts`, which holds the conversation in component state
 * and says the same thing.
 */

export type ApiChatRole = "user" | "assistant";

/** Exactly what goes on the wire. No ids, no timestamps — the API takes neither. */
export type ApiChatMessage = { role: ApiChatRole; content: string };

/**
 * The API's limits, named here because the composer and the store both enforce
 * them and neither should carry its own copy of a number the server owns.
 *
 * Enforced locally so somebody typing a long paragraph is told before they press
 * send rather than by a 400 afterwards — the server still refuses, and that
 * refusal is what is shown if these two ever drift.
 */
export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHAT_MESSAGE_CHARS = 4000;

/**
 * What a change would be, in the API's own words.
 *
 * `summary` is one sentence read from the database. `details` are the specifics
 * somebody checks before agreeing. `irreversible` is present **only** when the
 * act cannot be undone, so its presence is the signal and a screen should make
 * it prominent rather than treating it as one more line.
 */
export type ApiProposalDetail = {
  summary: string;
  details: string[];
  irreversible?: string;
};

export type ApiProposedAction = {
  /** `"decide_leave_request"`. Matches a name from `assistantActions()`. */
  action: string;
  /** Opaque. Posted back exactly as received — never built, edited or filtered. */
  args: Record<string, unknown>;
  proposal: ApiProposalDetail;
};

/**
 * One turn's answer.
 *
 * `text` is absent when a change is proposed, which is deliberate on the API's
 * side: prose beside a proposal would be the assistant describing its own
 * suggestion, and then two sentences on screen would compete to say what the
 * button does. Read `proposed.proposal` in that case.
 */
export type ApiChatReply = {
  available: boolean;
  /** Prose. Absent when `proposed` is present. */
  text?: string;
  /** The lookups that ran this turn, by name — `["leave_requests"]`. */
  used: string[];
  proposed?: ApiProposedAction;
  /** Why, when `available` is false. Never rendered as an answer. */
  reason?: string;
};

/**
 * Send the whole conversation and get the next turn.
 *
 * The last message must be `role: "user"` or the API answers 400. Every turn
 * carries the transcript because the server holds none of it.
 */
export const chat = (
  messages: ApiChatMessage[],
  signal?: AbortSignal,
): Promise<ApiChatReply> =>
  request<ApiChatReply>("/ai/chat", {
    method: "POST",
    body: { messages },
    ...(signal ? { signal } : {}),
  });

/**
 * How an action is gated.
 *
 * `permission` is one this account either holds or does not. `service` means the
 * capability itself is not wired on the server — a provider nobody has
 * credentialed — which is a different fact and reads differently to a person.
 */
export type ApiActionGate =
  | { kind: "permission"; permission: string }
  | { kind: "service" };

export type ApiAssistantAction = {
  name: string;
  description: string;
  gate: ApiActionGate;
};

/**
 * Everything the assistant can propose.
 *
 * Read-only, and worth rendering somewhere: "what can I ask it to do" has no
 * other answer, and a chat box with an invisible set of capabilities is the
 * findable-by-nobody defect this file's neighbours keep recording.
 */
export const assistantActions = (
  signal?: AbortSignal,
): Promise<{ actions: ApiAssistantAction[] }> =>
  request<{ actions: ApiAssistantAction[] }>("/ai/actions", {
    ...(signal ? { signal } : {}),
  });

/**
 * What was actually done.
 *
 * `confirmed` is the proposal as the API re-read it at the moment of the write,
 * not a copy of what was shown — so a record that moved between the proposal and
 * the press is described by the sentence that is true now.
 */
export type ApiActionResult = {
  action: string;
  confirmed: ApiProposalDetail;
  /** One sentence naming what happened. Shown verbatim; never paraphrased. */
  outcome: string;
  subjectId: string;
};

/**
 * Perform a proposed action. **Only ever from an explicit press.**
 *
 * `args` is `proposed.args`, unchanged. This is the only function in the
 * frontend that writes through the assistant, and everything the API can refuse
 * — 401, 403 for a permission, 404 for a record that is not this company's, 409
 * for something already decided, 422 for arguments it will not take — arrives as
 * an `ApiError` carrying the API's own sentence. Show that sentence; it names
 * the permission or the conflict, and nothing here can.
 */
export const runAssistantAction = (
  name: string,
  args: Record<string, unknown>,
): Promise<ApiActionResult> =>
  request<ApiActionResult>(`/ai/actions/${encodeURIComponent(name)}`, {
    method: "POST",
    body: args,
  });
