"use client";

import { ApiError, request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Wellness: `/api/v1/wellness`.
 *
 * Break reminders, water and steps a person logs for themselves, challenges and
 * kudos, behind the `wellness` company flag. Every route is refused with a 422
 * (`reason: "module_off"`) while the flag is off; see `moduleOff` below.
 *
 * ## The one rule, and what it means for this file
 *
 * What a person logs is readable by nobody but that person. So **no function in
 * this file takes an employee id to read with**, because the API has no route
 * that accepts one: a person's own routes are `/me/...` and read the person off
 * the token. The one id that crosses the wire is `toEmployeeId` when somebody
 * gives kudos, which names a colleague to thank and reads nothing of theirs.
 *
 * An employer gets participation counts and totals above a privacy floor, and
 * only through `challengeResults`. Nothing here is shaped like a per-person
 * list for an employer, and none should be added.
 *
 * ## Nothing is kept in the browser
 *
 * The API answers `Cache-Control: no-store` on every route here, and the store
 * built on this file keeps no answer past the screen that asked: no shared
 * cache, no localStorage. A person's log is not something to leave on a shared
 * machine.
 *
 * No money crosses this module, so there is no kobo boundary in this file.
 */

/* ------------------------------------------------------------------- shapes */

export type WellnessMetric = "WATER_ML" | "STEPS";
export type WellnessSource = "MANUAL" | "DEVICE";
export type WellnessPurpose = "SELF_TRACKING" | "DEVICE_SYNC";
export type ChallengeMode = "INDIVIDUAL" | "TEAM";
export type ChallengeStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";

/** One consent, with the wording the person is shown before they agree to it. */
export type ApiConsent = {
  purpose: WellnessPurpose;
  title: string;
  statement: string;
  granted: boolean;
  /** The wording version the person agreed to. Null when never. */
  version: string | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
};

export type ApiConsents = {
  /** The current wording. Sent back with a grant so the person has seen it. */
  version: string;
  consents: ApiConsent[];
};

export type ApiLogEntry = {
  id: string;
  metric: WellnessMetric;
  value: number;
  /** `YYYY-MM-DD`, in the company's zone. */
  day: string;
  source: WellnessSource;
  createdAt: string;
};

/**
 * What a day counts as. Steps from a phone replace typed steps for the day; the
 * API works that out, so a screen shows `total` and never adds rows up itself.
 */
export type ApiDailyValue = {
  day: string;
  metric: WellnessMetric;
  total: number;
};

export type ApiSummary = {
  from: string;
  to: string;
  /** Only days with something logged. A missing day is a day with no entry. */
  days: ApiDailyValue[];
};

export type ApiReminderBreak = {
  name: string;
  /** `HH:MM`, 24-hour, in the company's zone. */
  startsAt: string;
  durationMinutes: number;
};

export type ApiReminderPolicy = {
  /** Whose it is: the person's own, the company's, or the built-in one. */
  source: "PERSONAL" | "ORGANISATION" | "DEFAULT";
  enabled: boolean;
  /** Minutes between reminders. Each its own cadence. */
  intervals: number[];
  breaks: ApiReminderBreak[];
};

export type ReminderPolicyBody = {
  enabled: boolean;
  intervals: number[];
  breaks: ApiReminderBreak[];
};

export type ApiWellnessSettings = {
  privacyFloor: number;
  privacyFloorMinimum: number;
  privacyFloorMaximum: number;
  /** The company default for break reminders. */
  reminders: ApiReminderPolicy;
};

export type ApiChallenge = {
  id: string;
  title: string;
  description: string | null;
  mode: ChallengeMode;
  metric: WellnessMetric;
  /** `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  status: ChallengeStatus;
  cancelledAt: string | null;
  /** Whether the caller is taking part. Never a count or a name. */
  joined: boolean;
  createdAt: string;
};

export type ApiTeamChoice = { id: string; name: string; members: number };

/** One challenge as the caller sees it: the definition and whether they joined. */
export type ApiChallengeView = ApiChallenge & {
  /** The team the caller competes for, in a team challenge they joined. */
  team: { id: string; name: string } | null;
};

export type ApiChallengeDetail = ApiChallengeView & {
  /** The wording version to send back when joining. */
  consentVersion: string;
  /** What the person agrees to by joining, for this mode and the floor in force. */
  joinStatement: string;
  /** Team challenges only: the teams the caller could compete for. */
  myTeams?: ApiTeamChoice[];
};

export type CreateChallengeBody = {
  title: string;
  description?: string | null;
  mode: ChallengeMode;
  metric: WellnessMetric;
  /** `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
};

export type ApiBoardHeader = {
  challengeId: string;
  status: ChallengeStatus;
  mode: ChallengeMode;
  metric: WellnessMetric;
};

/** The board of an individual challenge: people who joined, and only them. */
export type ApiIndividualBoard = ApiBoardHeader & {
  mode: "INDIVIDUAL";
  participants: number;
  entries: { rank: number; name: string; total: number; mine: boolean }[];
  me: { rank: number; total: number };
};

export type ApiBoardTeam =
  | {
      teamId: string;
      name: string;
      mine: boolean;
      withheld: true;
      note: string;
    }
  | {
      teamId: string;
      name: string;
      mine: boolean;
      withheld: false;
      participants: number;
      total: number;
      average: number;
    };

/** The board of a team challenge. Never a person's number but your own. */
export type ApiTeamBoard = ApiBoardHeader & {
  mode: "TEAM";
  floor: number;
  teams: ApiBoardTeam[];
  mine: { total: number };
};

export type ApiBoard = ApiIndividualBoard | ApiTeamBoard;

export type ApiResultsHeader = {
  id: string;
  title: string;
  mode: ChallengeMode;
  metric: WellnessMetric;
  status: ChallengeStatus;
  startsOn: string;
  endsOn: string;
};

/**
 * What an employer may see of a challenge: counts and totals, above the floor.
 *
 * `withheld` means the floor stopped a number; `released` means the time has
 * come (totals are held back for a week after the end). They are different, and
 * a screen that says "below the floor" for an unreleased total is wrong.
 */
export type ApiIndividualResults = {
  challenge: ApiResultsHeader;
  /** The floor that applies to this challenge, which can exceed the company's. */
  floor: number;
  participation:
    | { withheld: false; participants: number; note: null }
    | { withheld: true; participants: null; note: string };
  totals: {
    released: boolean;
    withheld: boolean;
    total: number | null;
    average: number | null;
    note: string | null;
  };
};

/**
 * Team results carry no overall count: with one, the size of a team under the
 * floor could be recovered by subtracting the teams shown. Teams under the
 * floor are not listed at all.
 */
export type ApiTeamResults = {
  challenge: ApiResultsHeader;
  floor: number;
  participation: null;
  totals: {
    released: boolean;
    note: string;
    teams: {
      teamId: string;
      name: string;
      participants: number;
      withheld: boolean;
      total: number | null;
      average: number | null;
    }[];
  };
};

export type ApiResults = ApiIndividualResults | ApiTeamResults;

export type ApiRecognition = {
  id: string;
  fromName: string;
  toName: string;
  message: string;
  /** False is private: the giver and the recipient only. */
  shared: boolean;
  createdAt: string;
  /** The giver, or an administrator for a shared one. */
  canDelete: boolean;
  /** Ids ride on the row; a screen has no use for them and shows names. */
  fromEmployeeId: string;
  toEmployeeId: string;
};

export type RecognitionBody = {
  toEmployeeId: string;
  message: string;
  shared: boolean;
};

export type LogBody = {
  metric: WellnessMetric;
  /** A whole number: millilitres, or steps. */
  value: number;
  /** `YYYY-MM-DD`. Left out means today, in the company's zone. */
  day?: string;
};

/* -------------------------------------------------------------------- limits */

/**
 * The server's sanity bounds, for the form to say before it sends.
 *
 * They are not health advice and the screen never presents them as a target:
 * they stop a typo becoming a total. The server enforces them whatever this
 * says, so a change there is a change here and a stale number is only a worse
 * message, not a hole.
 */
export const WELLNESS_LIMITS = {
  WATER_ML: { entry: 3_000, day: 10_000, unit: "ml", noun: "water" },
  STEPS: { entry: 100_000, day: 150_000, unit: "steps", noun: "steps" },
} as const;

/** How far back a typed entry may be filed. */
export const BACKFILL_DAYS = 7;

/** The longest a challenge may run. */
export const MAX_CHALLENGE_DAYS = 90;

export const METRIC_LABEL: Record<WellnessMetric, string> = {
  WATER_ML: "Water",
  STEPS: "Steps",
};

export const MODE_LABEL: Record<ChallengeMode, string> = {
  INDIVIDUAL: "Individual",
  TEAM: "Teams",
};

/* ------------------------------------------------------------ reading errors */

/** The `details.reason` the API puts on a refusal, when it put one. */
export function reasonOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const { details } = error;
  if (!details || Array.isArray(details)) return null;
  const reason = (details as Record<string, unknown>)["reason"];
  return typeof reason === "string" ? reason : null;
}

/** Wellness is switched off for the company. A state to show, not a failure. */
export function moduleOff(error: unknown): boolean {
  return reasonOf(error) === "module_off";
}

/** The person has not agreed to tracking, or took it back. */
export function consentRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === "consent_required";
}

/** The consent wording moved on since the person was shown it. */
export function consentStale(error: unknown): boolean {
  return reasonOf(error) === "consent_stale";
}

/** A team challenge needs the person to name a team. The teams ride along. */
export function teamsOffered(error: unknown): ApiTeamChoice[] | null {
  if (reasonOf(error) !== "team_required") return null;
  const details = (error as ApiError).details as Record<string, unknown>;
  const teams = details["teams"];
  return Array.isArray(teams) ? (teams as ApiTeamChoice[]) : null;
}

/* ------------------------------------------------------------------ the calls */

const optional = (signal?: AbortSignal) => (signal ? { signal } : {});

export const wellnessApi = {
  /* ---------------------------------------------------------------- settings */

  /** Open to everybody: the consent screen shows the floor, and it must be the real one. */
  settings: (signal?: AbortSignal) =>
    request<ApiWellnessSettings>("/wellness/settings", optional(signal)),

  /** `MANAGE_SETTINGS`. 3 to 50; the API refuses less than 3 and so does the form. */
  setPrivacyFloor: (privacyFloor: number) =>
    request<ApiWellnessSettings>("/wellness/settings", {
      method: "PATCH",
      body: { privacyFloor },
    }),

  /* ----------------------------------------------------------------- consent */

  consents: (signal?: AbortSignal) =>
    request<ApiConsents>("/wellness/me/consents", optional(signal)),

  /** `version` is the wording the person was shown. Stale is a 409. */
  grantConsent: (purpose: WellnessPurpose, version: string) =>
    request<ApiConsents>(`/wellness/me/consents/${purpose}`, {
      method: "PUT",
      body: { accept: true, version },
    }),

  /**
   * `erase` has no default on purpose: the person says whether their record goes
   * with the consent. Works with the module off.
   */
  withdrawConsent: (purpose: WellnessPurpose, erase: boolean) =>
    request<ApiConsents>(`/wellness/me/consents/${purpose}/withdraw`, {
      method: "POST",
      body: { erase },
    }),

  /* -------------------------------------------------------------------- logs */

  addLog: (body: LogBody) =>
    request<ApiLogEntry>("/wellness/me/logs", { method: "POST", body }),

  logs: (
    query: {
      page?: number;
      pageSize?: number;
      metric?: WellnessMetric;
      from?: string;
      to?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiLogEntry>> =>
    requestPaged<ApiLogEntry>("/wellness/me/logs", {
      query,
      ...optional(signal),
    }),

  deleteLog: (id: string) =>
    request<{ id: string; deleted: true }>(`/wellness/me/logs/${id}`, {
      method: "DELETE",
    }),

  /** Everything the caller logged. Needs no consent, and works with the module off. */
  eraseLogs: () =>
    request<{ deleted: number }>("/wellness/me/logs", { method: "DELETE" }),

  summary: (
    query: { from?: string; to?: string; metric?: WellnessMetric } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiSummary>("/wellness/me/summary", {
      query,
      ...optional(signal),
    }),

  /* --------------------------------------------------------------- reminders */

  /** Yours if you have set your own, else the company's, else the built-in one. */
  myReminders: (signal?: AbortSignal) =>
    request<ApiReminderPolicy>("/wellness/me/reminders", optional(signal)),

  /** A whole policy, not a patch. */
  setMyReminders: (body: ReminderPolicyBody) =>
    request<ApiReminderPolicy>("/wellness/me/reminders", {
      method: "PUT",
      body,
    }),

  /** Back to the company's. */
  clearMyReminders: () =>
    request<ApiReminderPolicy>("/wellness/me/reminders", { method: "DELETE" }),

  /** `MANAGE_SETTINGS`. The company default. */
  setOrganisationReminders: (body: ReminderPolicyBody) =>
    request<ApiReminderPolicy>("/wellness/reminders/policy", {
      method: "PUT",
      body,
    }),

  /* -------------------------------------------------------------- challenges */

  challenges: (
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiChallenge>> =>
    requestPaged<ApiChallenge>("/wellness/challenges", {
      query,
      ...optional(signal),
    }),

  challenge: (id: string, signal?: AbortSignal) =>
    request<ApiChallengeDetail>(`/wellness/challenges/${id}`, optional(signal)),

  /** `MANAGE_SETTINGS`. */
  createChallenge: (body: CreateChallengeBody) =>
    request<ApiChallengeDetail>("/wellness/challenges", {
      method: "POST",
      body,
    }),

  /** `MANAGE_SETTINGS`. Title and description only. */
  updateChallenge: (
    id: string,
    body: { title?: string; description?: string | null },
  ) =>
    request<ApiChallengeView>(`/wellness/challenges/${id}`, {
      method: "PATCH",
      body,
    }),

  /** `MANAGE_SETTINGS`. */
  cancelChallenge: (id: string) =>
    request<ApiChallengeView>(`/wellness/challenges/${id}/cancel`, {
      method: "POST",
    }),

  /**
   * Joining is a consent of its own, so it carries the wording version the
   * person was shown. `teamId` is named even when the person is on one team.
   */
  joinChallenge: (id: string, version: string, teamId?: string) =>
    request<ApiChallengeView>(`/wellness/challenges/${id}/join`, {
      method: "POST",
      body: { accept: true, version, ...(teamId ? { teamId } : {}) },
    }),

  /** Always open, and open with the module off. */
  leaveChallenge: (id: string) =>
    request<ApiChallengeView>(`/wellness/challenges/${id}/leave`, {
      method: "POST",
    }),

  /** Participants only; a role never opens it. */
  board: (id: string, signal?: AbortSignal) =>
    request<ApiBoard>(`/wellness/challenges/${id}/board`, optional(signal)),

  /** `MANAGE_SETTINGS`: counts and totals above the floor, never a person. */
  results: (id: string, signal?: AbortSignal) =>
    request<ApiResults>(`/wellness/challenges/${id}/results`, optional(signal)),

  /* ------------------------------------------------------------- recognition */

  /** The company feed: shared kudos only. */
  recognitions: (
    query: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiRecognition>> =>
    requestPaged<ApiRecognition>("/wellness/recognitions", {
      query,
      ...optional(signal),
    }),

  /** What the caller gave and received, private ones included. */
  myRecognitions: (
    query: {
      page?: number;
      pageSize?: number;
      direction?: "received" | "given";
    } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiRecognition>> =>
    requestPaged<ApiRecognition>("/wellness/recognitions/mine", {
      query,
      ...optional(signal),
    }),

  giveRecognition: (body: RecognitionBody) =>
    request<ApiRecognition>("/wellness/recognitions", {
      method: "POST",
      body,
    }),

  removeRecognition: (id: string) =>
    request<{ id: string; deleted: true }>(`/wellness/recognitions/${id}`, {
      method: "DELETE",
    }),
};
