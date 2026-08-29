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
