import type { InterviewView } from "./model";

/**
 * Putting an interview into somebody's calendar.
 *
 * ## Links and a file, and nothing else
 *
 * Nothing here talks to Google or Microsoft. An "Add to Google Calendar" or "Add to
 * Outlook" link is an ordinary address that opens the person's own calendar with a
 * form already filled in, and a `.ics` file is a plain text file any calendar opens.
 * The person's calendar is theirs: no account is connected and nothing is read back.
 *
 * ## What goes into one is the caller's choice, not this file's
 *
 * `eventFor` is given the fields the person is allowed to have. A panelist's copy is
 * made from what the API gave a panelist, which is the candidate's name, the role,
 * the time, the place and the link: never a score, a salary or contact details. This
 * file never reaches for more.
 *
 * No React, no state.
 */

export type CalendarEvent = {
  /** Stable across edits, so a changed invitation replaces the entry it changed. */
  uid: string;
  title: string;
  /** Plain text, one line per `\n`. */
  description: string;
  location: string | null;
  joinUrl: string | null;
  /** ISO instants. */
  start: string;
  end: string;
  /** Goes up each time a calendar is told about a change. */
  sequence: number;
  cancelled: boolean;
};

const KIND_TITLE = {
  SCREEN: "Screening interview",
  TECHNICAL: "Technical interview",
  PANEL: "Panel interview",
  FINAL: "Final interview",
} as const;

/**
 * The entry for an interview, as one person is allowed to have it.
 *
 * `audience` only changes the words: a candidate is told it is their interview, a
 * panelist is told it is one they score and where to hand the scorecard in.
 */
export function eventFor(
  interview: Pick<
    InterviewView,
    | "id"
    | "candidateName"
    | "role"
    | "kind"
    | "scheduledFor"
    | "durationMins"
    | "location"
    | "joinUrl"
    | "sequence"
    | "status"
  >,
  audience: "staff" | "panelist" = "staff",
): CalendarEvent {
  const start = new Date(interview.scheduledFor);
  const end = new Date(start.getTime() + interview.durationMins * 60_000);
  const what = KIND_TITLE[interview.kind];
  const lines = [
    `${what}: ${interview.candidateName}${interview.role ? `, ${interview.role}` : ""}.`,
  ];
  if (interview.joinUrl) lines.push(`Join: ${interview.joinUrl}`);
  if (interview.location) lines.push(`Where: ${interview.location}`);
  if (audience === "panelist")
    lines.push(
      "You are invited to score this interview. Hand in your scorecard in ApproveHR, under My interviews.",
    );
  return {
    uid: `interview-${interview.id}@approvehr`,
    title: `${what}: ${interview.candidateName}`,
    description: lines.join("\n"),
    location: interview.location ?? interview.joinUrl,
    joinUrl: interview.joinUrl,
    start: Number.isNaN(start.getTime())
      ? interview.scheduledFor
      : start.toISOString(),
    end: Number.isNaN(end.getTime())
      ? interview.scheduledFor
      : end.toISOString(),
    sequence: interview.sequence,
    cancelled: interview.status === "CANCELLED",
  };
}

/* ------------------------------------------------------------------------ links */

/** `20261020T090000Z`: the form Google and an `.ics` file both read. */
const compact = (iso: string): string =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

/** A form's text field is short; a calendar address that is too long is refused. */
const LINK_TEXT_MAX = 1000;
const clip = (text: string): string =>
  text.length <= LINK_TEXT_MAX ? text : `${text.slice(0, LINK_TEXT_MAX - 1)}…`;

const enc = encodeURIComponent;

/** Opens Google Calendar's "new event" form, filled in. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const parts = [
    "action=TEMPLATE",
    `text=${enc(event.title)}`,
    `dates=${compact(event.start)}/${compact(event.end)}`,
    `details=${enc(clip(event.description))}`,
  ];
  if (event.location) parts.push(`location=${enc(event.location)}`);
  return `https://calendar.google.com/calendar/render?${parts.join("&")}`;
}

/** Opens Outlook's "new event" form, filled in. */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const parts = [
    `path=${enc("/calendar/action/compose")}`,
    "rru=addevent",
    `subject=${enc(event.title)}`,
    `startdt=${enc(new Date(event.start).toISOString())}`,
    `enddt=${enc(new Date(event.end).toISOString())}`,
    `body=${enc(clip(event.description))}`,
  ];
  if (event.location) parts.push(`location=${enc(event.location)}`);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${parts.join("&")}`;
}

/* -------------------------------------------------------------------------- ics */

/** RFC 5545 text: backslash, semicolon, comma and line breaks are escaped. */
const escapeText = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

/** Lines are folded at 75 octets, never in the middle of a character. */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return [line];
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  if (current) out.push(current);
  return out.map((part, index) => (index === 0 ? part : ` ${part}`));
}

/**
 * The calendar file for an interview, made here.
 *
 * Connected, the file comes from the API (an audited route, with the sequence the
 * server keeps), and this is not used. It is what a practice copy downloads, and it
 * says so inside the file, so one cannot be mistaken for a real invitation.
 */
export function buildIcs(
  event: CalendarEvent,
  options: { stamp: Date; demo?: boolean },
): string {
  const { stamp } = options;
  const note =
    options.demo && DEMO_ENABLED
      ? "\nThis is a practice file made in your browser. No invitation was sent by ApproveHR."
      : "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ApproveHR//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.demo ? ["X-APPROVEHR-DEMO:TRUE"] : []),
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${compact(stamp.toISOString())}`,
    `DTSTART:${compact(event.start)}`,
    `DTEND:${compact(event.end)}`,
    `SEQUENCE:${String(event.sequence)}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description + note)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.joinUrl ? [`URL:${event.joinUrl}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}

/** `interview-ada-okafor-2026-10-20.ics`: a name somebody recognises in a downloads folder. */
export function icsFilename(event: CalendarEvent): string {
  const who = event.title
    .replace(/^[^:]*:\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `interview-${who || "event"}-${event.start.slice(0, 10)}.ics`;
}
