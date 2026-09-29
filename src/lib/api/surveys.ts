"use client";

import { request } from "@/lib/api/client";

/**
 * Surveys — `/api/v1/surveys`.
 *
 * ## What the anonymity promise actually is
 *
 * On an anonymous survey the API **never writes** the respondent's id against
 * their answers. Not writes-and-hides: never writes. So there is nothing for
 * this client to be careful about and nothing a future screen could
 * accidentally expose — which is exactly why it was built that way rather than
 * as a flag every read has to honour.
 *
 * What this side does have to get right is **not claiming more than that**.
 * `ANONYMITY_PROMISE` and `ANONYMITY_LIMIT` below are the two halves, and both
 * are shown wherever somebody is about to answer one: free text can identify
 * the person who wrote it however the database is shaped, and saying so is the
 * difference between a promise and a trap.
 */

export type SurveyKind =
  "GENERAL" | "ENGAGEMENT" | "EXIT" | "ONBOARDING" | "PULSE";
export type SurveyStatus = "DRAFT" | "OPEN" | "CLOSED";
export type SurveyQuestionKind =
  "SCALE" | "CHOICE" | "MULTI_CHOICE" | "TEXT" | "YES_NO";

export type ApiSurveyQuestion = {
  id: string;
  prompt: string;
  helpText: string | null;
  kind: SurveyQuestionKind;
  required: boolean;
  position: number;
  /** The top of the range for `SCALE`; the bottom is always 1. */
  scaleMax: number | null;
  options: unknown;
};

export type ApiSurvey = {
  id: string;
  title: string;
  description: string | null;
  kind: SurveyKind;
  anonymous: boolean;
  /** Results are withheld below this many responses. */
  minResponses: number;
  status: SurveyStatus;
  opensAt: string | null;
  closesAt: string | null;
  questions: ApiSurveyQuestion[];
  /**
   * How many were asked and how many answered.
   *
   * Safe on an anonymous survey, and worth knowing why: these count
   * invitations, which are allowed to name people. It is the *pairing* of a
   * person with an answer that is withheld — a survey nobody can chase is a
   * survey nobody completes.
   */
  invited: number;
  responded: number;
  archived: boolean;
};

export type ApiSurveyInvite = {
  id: string;
  title: string;
  description: string | null;
  anonymous: boolean;
  closesAt: string | null;
  questionCount: number;
};

/** Results, or the reason they are being held back. A discriminated union. */
export type ApiSurveyResults =
  | {
      suppressed: true;
      responded: number;
      minResponses: number;
      /** The API's own sentence. Render it verbatim; nothing re-derives it. */
      reason: string;
    }
  | {
      suppressed: false;
      responded: number;
      minResponses: number;
      anonymous: boolean;
      questions: {
        id: string;
        prompt: string;
        kind: SurveyQuestionKind;
        scaleMax: number | null;
        /** How many answered **this** question, which is not the response count. */
        answered: number;
        /** Null when nobody answered it. Never 0, which would be a rating. */
        average: number | null;
        tally: Record<string, number> | null;
        text: string[] | null;
      }[];
    };

export type SurveyBody = {
  title?: string;
  description?: string | null;
  kind?: SurveyKind;
  anonymous?: boolean;
  minResponses?: number;
  opensAt?: string | null;
  closesAt?: string | null;
};

export type SurveyQuestionBody = {
  prompt: string;
  helpText?: string | null;
  kind: SurveyQuestionKind;
  required?: boolean;
  scaleMax?: number | null;
  options?: string[] | null;
};

export type AnswerBody = {
  questionId: string;
  scaleValue?: number;
  choiceValue?: string;
  choiceValues?: string[];
  textValue?: string;
  boolValue?: boolean;
};

export const surveys = {
  list: (signal?: AbortSignal) =>
    request<ApiSurvey[]>("/surveys", { ...(signal ? { signal } : {}) }),

  mine: (signal?: AbortSignal) =>
    request<ApiSurveyInvite[]>("/surveys/mine", {
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiSurvey>(`/surveys/${id}`, { ...(signal ? { signal } : {}) }),

  create: (body: SurveyBody) =>
    request<ApiSurvey>("/surveys", { method: "POST", body }),

  update: (id: string, body: SurveyBody) =>
    request<ApiSurvey>(`/surveys/${id}`, { method: "PATCH", body }),

  setQuestions: (id: string, questions: SurveyQuestionBody[]) =>
    request<ApiSurvey>(`/surveys/${id}/questions`, {
      method: "PUT",
      body: { questions },
    }),

  invite: (id: string, employeeIds: string[]) =>
    request<ApiSurvey>(`/surveys/${id}/invitations`, {
      method: "POST",
      body: { employeeIds },
    }),

  open: (id: string) =>
    request<ApiSurvey>(`/surveys/${id}/open`, { method: "POST" }),
  close: (id: string) =>
    request<ApiSurvey>(`/surveys/${id}/close`, { method: "POST" }),

  respond: (id: string, answers: AnswerBody[]) =>
    request<{ submitted: true; anonymous: boolean }>(
      `/surveys/${id}/responses`,
      {
        method: "POST",
        body: { answers },
      },
    ),

  results: (id: string, signal?: AbortSignal) =>
    request<ApiSurveyResults>(`/surveys/${id}/results`, {
      ...(signal ? { signal } : {}),
    }),
};

/** What an anonymous survey actually guarantees. Written once, shown wherever it is claimed. */
export const ANONYMITY_PROMISE =
  "Your answers are not stored against your name. Whether you have answered " +
  "is recorded so you are not chased again; what you said is not linked to you.";

/**
 * And what it cannot guarantee.
 *
 * Shown in the same breath, always. A free-text answer carries somebody's own
 * words about their own situation and can identify them however the database is
 * shaped — a promise that does not say so is worse than no promise, because
 * people write more honestly under it.
 */
export const ANONYMITY_LIMIT =
  "Anything you write in your own words could still identify you to somebody " +
  "who knows your situation. The ratings cannot.";

/** What an attributed survey is, said just as plainly. */
export const ATTRIBUTED_NOTICE =
  "Your name is recorded against your answers on this one.";
