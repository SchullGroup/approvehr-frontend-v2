"use client";

import { request } from "@/lib/api/client";

/**
 * Setup and feature flags — `/api/v1/setup`.
 *
 * Typed wrappers only, in the same hand-written style as `endpoints.ts`. Nothing
 * here converts money, because nothing here carries any.
 *
 * ## The questions are not in this file
 *
 * `GET /setup/wizard` returns the wizard: the questions, their help text, their
 * options, and **the exact flags each option writes** (`sets`). That is
 * deliberate on the API's side and it has to be respected here — wording, order
 * and the mapping from answer to capability can then change without shipping a
 * frontend. So there is no question list in this file and no copy of the rules.
 * A screen renders what it is served.
 *
 * The one place a question set exists on this side is the demo fallback in
 * `lib/store/features.ts`, which only runs when there is no API to ask.
 */

/* ------------------------------------------------------------------- shapes */

export type HeadcountBand =
  | "UNDER_10"
  | "FROM_10_TO_50"
  | "FROM_50_TO_250"
  | "OVER_250";

/** The switchable capabilities. `headcountBand` is an answer, not a switch. */
export const FEATURE_KEYS = [
  "departments",
  "grades",
  "shifts",
  "loans",
  "expenses",
  "appraisals",
  "hiring",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** What a PATCH sends, and what a wizard option's `sets` looks like. */
export type FeaturePatch = {
  [K in FeatureKey]?: boolean;
} & { headcountBand?: HeadcountBand };

export type ApiFeatures = {
  headcountBand: HeadcountBand;
  shifts: boolean;
  loans: boolean;
  expenses: boolean;
  appraisals: boolean;
  departments: boolean;
  hiring: boolean;
  grades: boolean;
  setupStep: number;
  totalSteps: number;
  setupCompletedAt: string | null;
  /** Computed by the API so nothing on this side re-derives it. */
  setupRequired: boolean;
};

export type ApiWizardOption = {
  value: string;
  label: string;
  /** Exactly what choosing this writes. Rendered, never recomputed. */
  sets: FeaturePatch;
};

export type ApiWizardQuestion = {
  id: string;
  /** 1-based. `step` reaching this number means this question is answered. */
  step: number;
  question: string;
  help: string;
  options: ApiWizardOption[];
};

export type ApiWizard = {
  totalSteps: number;
  /** Answered up to here, so a half-finished wizard resumes. */
  step: number;
  setupCompletedAt: string | null;
  questions: ApiWizardQuestion[];
};

export type ApiSetupStatus = {
  setupRequired: boolean;
  step: number;
  totalSteps: number;
};

export type ApiAnswerResult = ApiFeatures & { nextQuestionId: string | null };

/** What finishing seeded. Both counts are "created just now", so both can be 0. */
export type ApiSeeded = { leaveTypes: number; payrollSettings: boolean };

export type ApiCompleteResult = ApiFeatures & { seeded: ApiSeeded };

/* ----------------------------------------------------------------- requests */

export const setup = {
  /**
   * Two columns, no write. Built for a layout that calls it on every page load.
   *
   * The app does not currently use it: the sidebar reads `useFeatures()` on
   * every page anyway, so the full features row is already in memory and a
   * second request for a subset of it would be waste. Kept because the moment
   * something needs "is setup required" *without* needing the flags, this is
   * the cheap way to ask.
   */
  status: (signal?: AbortSignal) =>
    request<ApiSetupStatus>("/setup/status", {
      ...(signal ? { signal } : {}),
    }),

  /** Never 404s: a company that exists has features. */
  features: (signal?: AbortSignal) =>
    request<ApiFeatures>("/setup/features", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Turn capabilities on and off. Needs `MANAGE_SETTINGS`.
   *
   * Partial body. Absent means "leave it alone", which is not the same as
   * `false`. Naming `headcountBand: UNDER_10` switches departments and grades
   * off unless the same request names them explicitly — so a caller that means
   * to keep them sends them.
   */
  updateFeatures: (body: FeaturePatch) =>
    request<ApiFeatures>("/setup/features", { method: "PATCH", body }),

  wizard: (signal?: AbortSignal) =>
    request<ApiWizard>("/setup/wizard", {
      ...(signal ? { signal } : {}),
    }),

  answer: (questionId: string, value: string) =>
    request<ApiAnswerResult>("/setup/wizard/answer", {
      method: "POST",
      body: { questionId, value },
    }),

  /** Sets the go-live date once, then seeds the Nigerian SME defaults. */
  complete: () =>
    request<ApiCompleteResult>("/setup/wizard/complete", { method: "POST" }),
};
