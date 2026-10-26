import type {
  ApiChallenge,
  ApiChallengeDetail,
  ApiConsents,
  ApiRecognition,
  ApiReminderPolicy,
  ApiWellnessSettings,
} from "@/lib/api/wellness";

/**
 * Answers the Wellness API gives, as the tests need them.
 *
 * Shaped from the merged backend (`modules/wellness/*`), not from a guess: the
 * consent wording version, the statement a join carries, the held-back notes and
 * the fields a kudos row has are all read off that code.
 */

export const TODAY = "2026-10-21";
export const CONSENT_VERSION = "2026-10-20.2";

export const paged = <T>(rows: T[], hasMore = false) => ({
  data: rows,
  meta: {
    page: 1,
    pageSize: 20,
    total: rows.length,
    totalPages: 1,
    hasMore,
  },
});

export const consents = (
  granted: boolean,
  over: { deviceSync?: boolean; withdrawnAt?: string | null } = {},
): ApiConsents => ({
  version: CONSENT_VERSION,
  consents: [
    {
      purpose: "SELF_TRACKING",
      title: "Keep a private record of your water and steps",
      statement:
        "ApproveHR will store the water and steps you choose to log, so you can see your own history. Nobody at your company can see these entries.",
      granted,
      version: granted ? CONSENT_VERSION : null,
      grantedAt: granted ? "2026-10-01T08:00:00.000Z" : null,
      withdrawnAt: over.withdrawnAt ?? null,
    },
    {
      purpose: "DEVICE_SYNC",
      title: "Send your daily steps from your phone",
      statement: "Let the ApproveHR mobile app send your daily step total.",
      granted: over.deviceSync ?? false,
      version: over.deviceSync ? CONSENT_VERSION : null,
      grantedAt: over.deviceSync ? "2026-10-02T08:00:00.000Z" : null,
      withdrawnAt: null,
    },
  ],
});

export const reminders = (
  over: Partial<ApiReminderPolicy> = {},
): ApiReminderPolicy => ({
  source: "DEFAULT",
  enabled: true,
  intervals: [15, 30],
  breaks: [],
  ...over,
});

export const settings = (
  over: Partial<ApiWellnessSettings> = {},
): ApiWellnessSettings => ({
  privacyFloor: 3,
  privacyFloorMinimum: 3,
  privacyFloorMaximum: 50,
  reminders: reminders(),
  ...over,
});

export const challenge = (over: Partial<ApiChallenge> = {}): ApiChallenge => ({
  id: "c1",
  title: "October steps",
  description: null,
  mode: "INDIVIDUAL",
  metric: "STEPS",
  startsOn: "2026-10-19",
  endsOn: "2026-11-01",
  status: "ACTIVE",
  cancelledAt: null,
  joined: false,
  createdAt: "2026-10-18T09:00:00.000Z",
  ...over,
});

export const detail = (
  over: Partial<ApiChallengeDetail> = {},
): ApiChallengeDetail => ({
  ...challenge(),
  team: null,
  consentVersion: CONSENT_VERSION,
  joinStatement:
    "Everybody who joins this challenge sees your name and your total on its board. Only entries from the day you join count.",
  ...over,
});

export const kudos = (over: Partial<ApiRecognition> = {}): ApiRecognition => ({
  id: "k1",
  fromEmployeeId: "e-ada",
  fromName: "Ada Obi",
  toEmployeeId: "e-tunde",
  toName: "Tunde Bello",
  message: "Thank you for covering the Friday release.",
  shared: true,
  createdAt: "2026-10-20T10:00:00.000Z",
  canDelete: false,
  ...over,
});
