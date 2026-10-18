import type { EmailNotice, EmailStatus } from "./model";

/**
 * What to say about an email, in one place.
 *
 * ## It never says an email went out unless the API says so
 *
 * An action that owes an email only *queues* it: a worker sends it a moment later,
 * and it can still be skipped (no reply-to address, a field with no value, mail not
 * set up) or fail. So `SENT` is the only status worded as sent. Everything still on
 * its way is "queued", a skip says why, and a failure says it failed.
 *
 * No React, no state.
 */

export type EmailLine = {
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  /** One or two words for a badge. */
  label: string;
  /** The sentence under it. */
  detail: string | null;
};

/** The API writes "not sent: ..." and "waiting: ..."; the label says it already. */
export const withoutLead = (note: string | null): string | null => {
  if (!note) return null;
  const trimmed = note.replace(/^(not sent|waiting):\s*/i, "").trim();
  if (trimmed === "") return null;
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  /* The API writes these as clauses, and a clause on a screen reads as unfinished. */
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

export function emailLine(
  status: EmailStatus,
  note: string | null,
  sentAt: string | null,
  when: (iso: string) => string,
): EmailLine {
  switch (status) {
    case "SENT":
      return {
        tone: "success",
        label: "Sent",
        detail: sentAt ? `Sent ${when(sentAt)}.` : null,
      };
    case "PENDING":
    case "SENDING":
      return {
        tone: "info",
        label: "Queued",
        detail: withoutLead(note) ?? "It is waiting to be sent.",
      };
    case "SKIPPED":
      return {
        tone: "warning",
        label: "Not sent",
        detail: withoutLead(note) ?? "It was skipped.",
      };
    case "FAILED":
      return {
        tone: "danger",
        label: "Failed",
        detail: withoutLead(note) ?? "The mail provider did not take it.",
      };
  }
}

/** What a toast says about the email an action owed. `null` when none was owed. */
export function noticeSentence(
  notice: EmailNotice,
  who: string,
): { tone: "success" | "info" | "warning" | "danger"; text: string } | null {
  if (!notice) return null;
  switch (notice.status) {
    case "SENT":
      return { tone: "success", text: `The email to ${who} was sent.` };
    case "PENDING":
    case "SENDING":
      return {
        tone: "info",
        text: `The email to ${who} is queued. It is not sent yet.`,
      };
    case "SKIPPED":
      return {
        tone: "warning",
        text: `The email to ${who} was not sent. ${withoutLead(notice.note) ?? "It was skipped."}`,
      };
    case "FAILED":
      return {
        tone: "danger",
        text: `The email to ${who} could not be sent. ${withoutLead(notice.note) ?? ""}`.trim(),
      };
  }
}

/** What asked for an email, in words. */
export function becauseOf(
  trigger: "STAGE_ENTRY" | "REJECTION" | "INTERVIEW" | "OFFER",
  stageName: string | null,
): string {
  switch (trigger) {
    case "STAGE_ENTRY":
      return stageName
        ? `Moved into ${stageName}`
        : "Moved into a stage that has a message";
    case "REJECTION":
      return "Rejected, with a decline email";
    case "INTERVIEW":
      return "An interview was booked, with an invitation";
    case "OFFER":
      return "An offer was sent, with a notice";
  }
}
