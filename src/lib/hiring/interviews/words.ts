import { withoutLead } from "@/lib/hiring/comms/status";
import type { InviteExplainer } from "./model";
import type {
  ChangeOutcome,
  InterviewNotice,
  NoticeAudience,
  NoticeKind,
  NoticeStatus,
} from "./model";

/**
 * What to say about the messages an interview owed, in one place.
 *
 * ## It never says a message went out unless the API says so
 *
 * Booking, changing or cancelling an interview only *queues* a message: a worker
 * sends it a moment later, and it can still be skipped (no reply-to address, mail not
 * set up) or fail. And when the person chose not to send one, nothing was queued at
 * all. So `SENT` is the only status worded as sent. A queue is "queued", a skip says
 * why, a choice not to send is "not asked", and a failure says it failed.
 *
 * No React, no state.
 */

export type NoticeLine = {
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  /** One or two words for a badge. */
  label: string;
  /** The sentence under it. */
  detail: string | null;
};

const KIND_WORD: Record<NoticeKind, string> = {
  INVITE: "invitation",
  UPDATE: "updated invitation",
  CANCEL: "cancellation",
};

export const noticeKindLabel = (
  kind: NoticeKind,
  audience: NoticeAudience,
): string => {
  const word = KIND_WORD[kind];
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  return audience === "PANELIST" ? `${label} to a panelist` : label;
};

/** The badge and the sentence for one message. */
export function noticeLine(
  notice: Pick<InterviewNotice, "status" | "note" | "kind" | "at">,
  when: (iso: string) => string,
): NoticeLine {
  const word = KIND_WORD[notice.kind];
  switch (notice.status) {
    case "SENT":
      return {
        tone: "success",
        label: "Sent",
        detail: notice.at ? `Sent ${when(notice.at)}.` : null,
      };
    case "PENDING":
    case "SENDING":
      return {
        tone: "info",
        label: "Queued",
        detail:
          withoutLead(notice.note) ??
          `The ${word} is queued. It is not sent yet.`,
      };
    case "SKIPPED":
      return {
        tone: "warning",
        label: "Skipped",
        detail:
          withoutLead(notice.note) ??
          `The ${word} was skipped, so nothing was sent.`,
      };
    case "FAILED":
      return {
        tone: "danger",
        label: "Failed",
        detail:
          withoutLead(notice.note) ?? "The mail provider did not take it.",
      };
    case "NOT_ASKED":
      return {
        tone: "neutral",
        label: "Not asked",
        detail: `You chose not to send ${/^[aeiou]/.test(word) ? "an" : "a"} ${word}.`,
      };
  }
}

/* ------------------------------------------------------- what a change answered */

/**
 * What the notice in a panelist's ApproveHR inbox came to, in a sentence. It is a
 * different thing from the email and is never worded as one: "a notice is there" is the
 * API's word that it was made, and says nothing about the email.
 */
export const inboxLine = (inApp: InterviewNotice["inApp"]): string | null =>
  inApp === "created"
    ? "A notice is in their ApproveHR inbox."
    : inApp === "no_account"
      ? "They have no sign-in, so there is no inbox notice."
      : null;

const names = (people: readonly (string | null)[]): string => {
  const list = people.map((p) => p ?? "Somebody");
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} and ${String(list.length - 2)} more`;
};

const STATUS_PHRASE: Record<NoticeStatus, string> = {
  NOT_ASKED: "not asked",
  PENDING: "queued",
  SENDING: "queued",
  SENT: "sent",
  SKIPPED: "skipped",
  FAILED: "failed",
};

/**
 * One sentence per group of people with the same answer: the candidate, then the
 * panelists, each with what the API said about them.
 */
export function outcomeLines(
  outcome: ChangeOutcome,
): { tone: NoticeLine["tone"]; text: string }[] {
  const groups = new Map<string, InterviewNotice[]>();
  for (const notice of outcome.notices) {
    const key = [
      notice.audience,
      STATUS_PHRASE[notice.status],
      notice.note ?? "",
      notice.inApp ?? "",
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), notice]);
  }
  const lines: { tone: NoticeLine["tone"]; text: string }[] = [];
  const ordered = [...groups.values()].sort((a, b) =>
    a[0]?.audience === b[0]?.audience
      ? 0
      : a[0]?.audience === "CANDIDATE"
        ? -1
        : 1,
  );
  for (const group of ordered) {
    const first = group[0];
    if (!first) continue;
    const who =
      first.audience === "CANDIDATE"
        ? (first.recipient ?? "The candidate")
        : group.length === 1
          ? (first.recipient ?? "A panelist")
          : `Panelists (${names(group.map((n) => n.recipient))})`;
    const line = noticeLine(first, () => "");
    const phrase = STATUS_PHRASE[first.status];
    const detail =
      first.status === "SENT" ? "" : line.detail ? ` ${line.detail}` : "";
    const inbox = first.audience === "PANELIST" ? inboxLine(first.inApp) : null;
    lines.push({
      tone: line.tone,
      text: `${who}: ${phrase}.${detail}${inbox ? ` ${inbox}` : ""}`,
    });
  }
  return lines;
}

/**
 * The headline of what a booking, change or cancellation did about messages.
 * `kind` is what was done, so "not asked" can say which message was left unsent.
 */
export function outcomeHeadline(
  outcome: ChangeOutcome,
  done: "booked" | "updated" | "cancelled" | "invited",
): { tone: "success" | "info" | "warning" | "danger"; text: string } {
  const lead =
    done === "booked"
      ? "Interview booked."
      : done === "updated"
        ? "Interview updated."
        : done === "invited"
          ? "Invitation asked for."
          : "Interview cancelled.";
  if (!outcome.asked || outcome.notices.length === 0)
    return { tone: "success", text: `${lead} Nothing was emailed.` };
  const statuses = outcome.notices.map((n) => n.status);
  if (statuses.includes("FAILED"))
    return { tone: "danger", text: `${lead} A message could not be sent.` };
  if (statuses.includes("SKIPPED"))
    return {
      tone: "warning",
      text: `${lead} At least one message was skipped, so it was not sent.`,
    };
  if (statuses.every((s) => s === "SENT"))
    return { tone: "success", text: `${lead} The messages were sent.` };
  return {
    tone: "info",
    text: `${lead} The messages are queued. Queued is not sent: each one's status is on the interview.`,
  };
}

/* ------------------------------------------------------------ the sender, in words */

/**
 * `From: Schull Technologies via ApproveHR. Replies go to people@schull.io.`
 *
 * The mail goes from ApproveHR's own address with the company's name, and the line says
 * so. If the sender's name already says it (the deployment adds "via ApproveHR" itself)
 * it is not said twice.
 */
export function senderLine(sender: {
  name: string;
  replyTo: string | null;
}): string {
  const name = /\bvia\b/i.test(sender.name)
    ? sender.name
    : `${sender.name} via ApproveHR`;
  return sender.replyTo
    ? `From: ${name}. Replies go to ${sender.replyTo}.`
    : `From: ${name}. There is no reply-to address yet.`;
}

/* ---------------------------------------------------------- what they will see */

/**
 * The one line that says what the candidate is about to be told about the time: the
 * day, the time **and the clock it is on**, how long, and where. It is made from the
 * company's clock, so what is typed is what is read.
 */
export function candidateSees(parts: {
  weekday: string;
  date: string;
  time: string;
  zone: string;
  durationMins: number | null;
  location: string | null;
  online: boolean;
}): string {
  const where = parts.location
    ? parts.online
      ? ` at ${parts.location}, and online`
      : ` at ${parts.location}`
    : parts.online
      ? ", online"
      : "";
  const length = parts.durationMins
    ? `, for ${String(parts.durationMins)} minutes`
    : "";
  return `${parts.weekday} ${parts.date} at ${parts.time}, ${parts.zone}${length}${where}.`;
}

/* ----------------------------------------------------------- what a change changes */

/**
 * What differs between an interview and what is being saved, one short line each:
 * "Time: Tue 20 Oct, 10:00 to Wed 21 Oct, 11:00". Nothing for what stayed the same.
 */
export function describeChanges(
  was: {
    kind: string;
    scheduledFor: string;
    durationMins: number;
    location: string | null;
    joinUrl: string | null;
  },
  next: {
    kind: string;
    scheduledFor: string;
    durationMins: number;
    location: string | null;
    joinUrl: string | null;
  },
  when: (iso: string) => string,
  kindLabel: (kind: string) => string,
): string[] {
  const out: string[] = [];
  if (was.kind !== next.kind)
    out.push(`Kind: ${kindLabel(was.kind)} to ${kindLabel(next.kind)}`);
  if (was.scheduledFor !== next.scheduledFor)
    out.push(`Time: ${when(was.scheduledFor)} to ${when(next.scheduledFor)}`);
  if (was.durationMins !== next.durationMins)
    out.push(
      `Length: ${String(was.durationMins)} to ${String(next.durationMins)} minutes`,
    );
  if (was.location !== next.location)
    out.push(
      was.location && next.location
        ? `Place: ${was.location} to ${next.location}`
        : next.location
          ? `Place: ${next.location} added`
          : "Place: removed",
    );
  if (was.joinUrl !== next.joinUrl)
    out.push(
      was.joinUrl && next.joinUrl
        ? "Join link: changed"
        : next.joinUrl
          ? "Join link: added"
          : "Join link: removed",
    );
  return out;
}

/** Whether the candidate has been told, or is about to be, about this interview at all. */
export function candidateWasInvited(
  notices: readonly InterviewNotice[] | null,
): boolean {
  return (notices ?? []).some(
    (n) =>
      n.audience === "CANDIDATE" &&
      n.kind === "INVITE" &&
      (n.status === "SENT" || n.status === "PENDING" || n.status === "SENDING"),
  );
}

/* ------------------------------------------------------------ the log, grouped */

export type NoticeGroup = {
  key: string;
  kind: NoticeKind;
  audience: NoticeAudience;
  /** Everybody who got the same answer, in the order they were asked about. */
  recipients: string[];
  status: NoticeStatus;
  note: string | null;
  at: string | null;
  inApp: InterviewNotice["inApp"];
};

/**
 * Messages about an interview, one row for each kind of message and answer: five
 * panelists who were all queued are one row with five names, not five rows.
 */
export function groupNotices(
  notices: readonly InterviewNotice[],
): NoticeGroup[] {
  const groups = new Map<string, NoticeGroup>();
  for (const notice of notices) {
    const key = [
      notice.kind,
      notice.audience,
      notice.status,
      notice.note ?? "",
      notice.inApp ?? "",
      notice.audience === "CANDIDATE" ? notice.id : "",
    ].join("|");
    const found = groups.get(key);
    if (found) found.recipients.push(notice.recipient ?? "Somebody");
    else
      groups.set(key, {
        key,
        kind: notice.kind,
        audience: notice.audience,
        recipients: [notice.recipient ?? "Somebody"],
        status: notice.status,
        note: notice.note,
        at: notice.at,
        inApp: notice.inApp ?? null,
      });
  }
  return [...groups.values()];
}

/**
 * Whether the candidate has been told the interview is on: an invitation that was sent,
 * or is being sent. This is the API's own meaning of "told", and it decides what a change
 * or a cancellation would send: somebody never told gets the invitation itself, not "it has
 * changed", and gets nothing at all for a cancellation, because there is nothing to cancel.
 * A queued invitation is not yet told: it is replaced by whatever is asked for next.
 */
export function candidateIsTold(
  notices: readonly InterviewNotice[] | null,
): boolean {
  return (notices ?? []).some(
    (n) =>
      n.audience === "CANDIDATE" &&
      n.kind === "INVITE" &&
      (n.status === "SENT" || n.status === "SENDING"),
  );
}

/**
 * Who is told what when an invitation goes out, in words.
 *
 * ## Written here, because the API serves no account of it
 *
 * The API says only *when* each email is sent (`kinds[].when`). What each copy holds is
 * in its contract (the calendar file and the email: §5 of the backend's step A notes), so
 * it is stated here from that, and says nothing the contract does not: the candidate's
 * copy names nobody but the company; a panelist's names the candidate and the panel, and
 * neither carries contact details, pay or a score. If the API ever serves this, delete it.
 */
export const INVITE_EXPLAINER: InviteExplainer = {
  candidate:
    "The day, the start and end and the time zone, where it is or the link to join, who to write to, and a calendar file. It names nobody but your company.",
  panelist:
    "The same, with the candidate's name, the stage and who else is on the panel, where to hand in a scorecard, and their own calendar file. Never contact details, pay or a score.",
};
