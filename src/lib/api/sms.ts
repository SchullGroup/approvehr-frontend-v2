"use client";

import { request, requestPaged } from "@/lib/api/client";

/**
 * The weekly text message digest, `/api/v1/sms`.
 *
 * Typed wrappers in the same hand-written style as the rest of `lib/api/*`. The
 * rules live on the API (`modules/sms/consent.ts`); the wrappers and the label
 * helpers below only carry them to the screen without softening any of them.
 *
 * ## What the screens may not hide
 *
 * - **Nobody is texted without opting in.** Per employee, by the employee or by a
 *   signed form HR records. There is no third way, which is why `optIn` takes
 *   `acknowledged: true` as a literal and not a boolean: the tick is the act, and
 *   a caller cannot send the request without having one to pass.
 * - **An opt-out the employee made, by STOP, by the link or in the app, is theirs
 *   to undo.** HR may record an opt-out and may undo one HR recorded; it may not
 *   undo the employee's. `hrMayRecordConsent` is that rule for a row.
 * - **The digest carries counts and a link only.**
 * - **Nothing is sent unless a provider is wired.** `GET /sms/status` says so in
 *   `transport.sends`, and `GET /sms/me` says so in `note`. A switch that is on
 *   while nothing can send is not a working feature, and the screens say that.
 *
 * ## Numbers are masked
 *
 * `+234******4567`, last four digits only, for everybody including HR. The one
 * place a full number is typed is the opt-in form, and it goes out and is not
 * echoed back.
 *
 * ## No money, no health data
 *
 * Nothing in here is an amount. The digest is three counts, and they are not on
 * this surface at all: the status route reports how many texts went, not what they
 * said.
 */

/* ------------------------------------------------------------------- shapes */

export type SmsConsentChannel = "APP" | "WRITTEN" | "SMS" | "LINK";
export type SmsConsentActor = "EMPLOYEE" | "HR" | "SYSTEM";
export type SmsSubscriptionState = "OPTED_IN" | "OPTED_OUT";
export type SmsMessageKind = "WEEKLY_DIGEST" | "OPT_IN_CONFIRMATION";
export type SmsMessageStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED"
  | "UNKNOWN";

/** `GET /sms/me`: one person's own state. */
export type ApiSmsMe = {
  /** `OrgFeatures.smsDigest`. Opting in needs it; opting out never does. */
  enabledForOrganisation: boolean;
  state: "NOT_SUBSCRIBED" | SmsSubscriptionState;
  /** `+234******4567`, the number consented to. */
  phoneMasked: string | null;
  optedInAt: string | null;
  /** Whether a text could reach this person this week, as far as anyone can tell. */
  canReceive: boolean;
  /** One sentence, written by the API, true of the case. */
  note: string;
  /** What they would agree to, word for word, and its version. */
  consent: { version: string; text: string };
  /** Whether this number has said STOP to ApproveHR. Sticky: only support clears it. */
  numberStopped: boolean;
};

/** What a change to somebody's consent did. */
export type ApiSmsChange = {
  state: "NOT_SUBSCRIBED" | SmsSubscriptionState;
  /** False for a repeat: nothing was written. */
  changed: boolean;
  phoneMasked: string | null;
  /** False when nothing can send. The consent is recorded either way. */
  confirmationQueued: boolean;
  note: string;
};

export type ApiSmsSubscription = {
  employeeId: string;
  employeeNo: string;
  name: string;
  phoneMasked: string;
  state: SmsSubscriptionState;
  optedInAt: string | null;
  optInChannel: SmsConsentChannel | null;
  optInActor: SmsConsentActor | null;
  optedOutAt: string | null;
  optOutChannel: SmsConsentChannel | null;
  optOutActor: SmsConsentActor | null;
  lastMessage: {
    kind: SmsMessageKind;
    status: SmsMessageStatus;
    reason: string | null;
    at: string;
  } | null;
};

/** `GET /sms/status`: the company's side, in counts and in words. */
export type ApiSmsStatus = {
  /** `OrgFeatures.smsDigest`. */
  enabled: boolean;
  transport: { name: string; sends: boolean; supportsReply: boolean };
  /** How a recipient can stop a text. `none` means nothing is sent. */
  optOutPath: "reply" | "link" | "none";
  /** True only when a digest planned now would really be sent. */
  ready: boolean;
  subscribers: { optedIn: number; optedOut: number };
  thisWeek: {
    weekKey: string;
    byStatus: Record<string, number>;
    segments: number;
  };
  /** What is and is not happening, in words. Empty when all is in order. */
  notes: string[];
};

export type SmsSubscriptionsParams = {
  page?: number;
  pageSize?: number;
  state?: SmsSubscriptionState;
};

/* ----------------------------------------------------------------- requests */

export const smsApi = {
  /** Any signed-in person. An account with no employee record reads as not subscribed. */
  me: (signal?: AbortSignal) =>
    request<ApiSmsMe>("/sms/me", { ...(signal ? { signal } : {}) }),

  /**
   * Opt in, for oneself.
   *
   * `phone` is optional: left out, the API uses the number on the employee's
   * record, if it is a Nigerian mobile. `textVersion` is the version from `me`,
   * which the API checks is still the current wording. `acknowledged` is the
   * ticked box, a literal `true` and not a boolean.
   */
  optIn: (body: { phone?: string; textVersion: string; acknowledged: true }) =>
    request<ApiSmsChange>("/sms/me/opt-in", { method: "POST", body }),

  /** Never refused: it works with the flag off and with no provider. */
  optOut: () => request<ApiSmsChange>("/sms/me/opt-out", { method: "POST" }),

  /** `MANAGE_SETTINGS`. */
  status: (signal?: AbortSignal) =>
    request<ApiSmsStatus>("/sms/status", { ...(signal ? { signal } : {}) }),

  /** `MANAGE_SETTINGS`. Only people who have a subscription row: opted in, or opted out. */
  subscriptions: (params: SmsSubscriptionsParams, signal?: AbortSignal) =>
    requestPaged<ApiSmsSubscription>("/sms/subscriptions", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),

  /**
   * HR records written consent. `MANAGE_SETTINGS`.
   *
   * `employeeId` is the employee's id, not a subscription's: this is how a first
   * consent is recorded for somebody who has no row yet. `evidence` is where the
   * signed form is filed, 5 to 200 characters, and is required: consent that
   * cannot be shown later is not consent. Refused with a 422 when the employee
   * opted out themselves.
   */
  recordConsent: (
    employeeId: string,
    body: { phone?: string; evidence: string },
  ) =>
    request<ApiSmsChange>(`/sms/subscriptions/${employeeId}/consent`, {
      method: "POST",
      body,
    }),

  /** HR records an opt-out. `MANAGE_SETTINGS`. */
  recordOptOut: (employeeId: string) =>
    request<ApiSmsChange>(`/sms/subscriptions/${employeeId}/opt-out`, {
      method: "POST",
    }),
};

/* ------------------------------------------------------------ words, per row */

/** The evidence reference the API takes. Mirrors `recordConsentSchema`. */
export const EVIDENCE_MIN = 5;
export const EVIDENCE_MAX = 200;

/** Said when the box is empty or short, in the API's own words. */
export const EVIDENCE_PROBLEM = `Say where the signed form is filed (at least ${String(EVIDENCE_MIN)} characters).`;

/**
 * How a person came to be opted in, in two short lines.
 *
 * Only the channels the API can record are named. An unknown one falls back to
 * what was sent, rather than to a guess at what it meant.
 */
export function howOptedIn(row: {
  optInChannel: SmsConsentChannel | null;
  optInActor: SmsConsentActor | null;
}): { how: string; by: string } {
  if (row.optInChannel === "APP" && row.optInActor === "EMPLOYEE") {
    return { how: "In the app", by: "By the employee" };
  }
  if (row.optInChannel === "WRITTEN") {
    return {
      how: "Written form",
      by: row.optInActor === "HR" ? "Recorded by HR" : "On paper",
    };
  }
  return {
    how: row.optInChannel ? titleCase(row.optInChannel) : "Not recorded",
    by: row.optInActor ? titleCase(row.optInActor) : "",
  };
}

/** How a person opted out. HR's own opt-out is the only one HR can reverse. */
export function howOptedOut(row: {
  optOutChannel: SmsConsentChannel | null;
  optOutActor: SmsConsentActor | null;
}): { how: string; by: string } {
  if (row.optOutActor === "HR") {
    return { how: "Opted out by HR", by: "HR can record consent again" };
  }
  const by = "By the employee";
  switch (row.optOutChannel) {
    case "SMS":
      return { how: "Replied STOP", by };
    case "LINK":
      return { how: "Used the stop link", by };
    case "APP":
      return { how: "Opted out in the app", by };
    default:
      return { how: "Opted out", by };
  }
}

/**
 * Whether HR may record written consent for this row, and why not when it may not.
 *
 * **HR cannot undo the employee's own word.** An opt-out by the employee, by a
 * STOP reply or by the stop link locks the row until the employee opts back in
 * themselves, from the app. The API refuses it with a 422 in the same terms; this
 * is so the menu says so before somebody tries, and lists the action rather than
 * hiding it, which would leave a reader wondering where it went.
 *
 * A null opt-out actor on an opted-out row is treated as the employee's, because
 * the API refuses anything that is not HR's.
 */
export function hrMayRecordConsent(row: {
  state: SmsSubscriptionState;
  optOutActor: SmsConsentActor | null;
}): { allowed: true } | { allowed: false; why: string } {
  if (row.state === "OPTED_IN") {
    return { allowed: false, why: "Already opted in." };
  }
  if (row.optOutActor === "HR") return { allowed: true };
  return {
    allowed: false,
    why: "They opted out themselves. Only they can opt back in, from the app.",
  };
}

/** HR may opt anybody out, at any time. Only an opted-in row has anything to stop. */
export function hrMayRecordOptOut(row: {
  state: SmsSubscriptionState;
}): { allowed: true } | { allowed: false; why: string } {
  return row.state === "OPTED_IN"
    ? { allowed: true }
    : { allowed: false, why: "Already opted out." };
}

/* --------------------------------------------------------- words, per message */

const KIND_LABEL: Record<SmsMessageKind, string> = {
  WEEKLY_DIGEST: "Weekly text",
  OPT_IN_CONFIRMATION: "Confirmation",
};

const STATUS_LABEL: Record<SmsMessageStatus, string> = {
  QUEUED: "Waiting",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  BLOCKED: "Not sent",
  SKIPPED: "Nothing to say",
  UNKNOWN: "Not known",
};

/** The API's reason classes, in a few words. An unknown one is not echoed. */
const REASON_LABEL: Record<string, string> = {
  opted_out: "They opted out",
  not_opted_in: "Not opted in",
  suppressed: "Number said stop",
  not_employed: "No longer employed",
  feature_off: "Weekly text was off",
  no_opt_out_path: "No way to stop it",
  nothing_to_say: "Nothing to say",
};

/**
 * What happened to a person's most recent text, as one label and whether it is
 * worth a second look.
 *
 * `attention` is for an outcome somebody might act on: a text that failed, one the
 * carrier or the company declined, one whose outcome is not known. A delivered,
 * waiting or empty week is the system working.
 */
export function lastTextSummary(
  message: NonNullable<ApiSmsSubscription["lastMessage"]>,
): { label: string; kind: string; attention: boolean } {
  const status = STATUS_LABEL[message.status] ?? "Not known";
  const reason =
    message.reason !== null ? REASON_LABEL[message.reason] : undefined;
  return {
    label:
      message.status === "BLOCKED" && reason !== undefined ? reason : status,
    kind: KIND_LABEL[message.kind] ?? "Text",
    attention:
      message.status === "FAILED" ||
      message.status === "BLOCKED" ||
      message.status === "UNKNOWN",
  };
}

/**
 * The one line the company overview leads with, and whether it is worth a second
 * look.
 *
 * **The first thing it says, whatever else is true, is that nothing is sent while
 * no provider is connected.** A switch that is on beside a text that cannot leave
 * is not a working feature, and every other state is a smaller question than that
 * one. The API's own `notes` are kept for the detail behind it.
 *
 * `null` means all is in order and there is nothing to say.
 */
export function statusHeadline(
  status: ApiSmsStatus,
): { text: string; attention: boolean } | null {
  if (!status.transport.sends) {
    return {
      text: "Nothing is sent until a text provider is connected.",
      attention: true,
    };
  }
  if (status.optOutPath === "none") {
    return {
      text: "Nothing is sent: there is no way for a person to stop a text.",
      attention: true,
    };
  }
  if (!status.enabled) {
    return { text: "The weekly text is switched off.", attention: false };
  }
  if (status.subscribers.optedIn === 0) {
    return { text: "Nobody has opted in yet.", attention: false };
  }
  return null;
}

/** The provider's name for a person: `termii` is Termii. */
export const providerName = (status: ApiSmsStatus): string =>
  status.transport.name.charAt(0).toUpperCase() +
  status.transport.name.slice(1);

/** Texts that left, delivered or not: what "sent this week" counts. */
export function sentThisWeek(status: ApiSmsStatus): number {
  const by = status.thisWeek.byStatus;
  return (by["SENT"] ?? 0) + (by["DELIVERED"] ?? 0);
}

/** `WRITTEN` is Written. For the enum values the API sends, which are already capitals. */
const titleCase = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase();
