import {
  ATTENDANCE_SOURCE_WORD,
  ATTENDANCE_STATUS_WORD,
  DOCUMENT_REQUEST_STATUS_WORD,
  LEAVE_STATUS_WORD,
  ROTA_STATUS_WORD,
  type AsItStood,
} from "@/lib/api/query-ties";
import { CATEGORY_LABEL } from "@/lib/api/documents";

/**
 * What a cited record said, as rows of words.
 *
 * Pure, so the rules a citation is easy to get wrong are tested without rendering one:
 *
 * - **Absent draws no row.** A field the copy did not hold is `null` and has no row, never a
 *   `0`, "None" or "No". A boolean the server did send is a recorded fact and is said either way
 *   ("They had not confirmed receipt" is a statement; a missing flag is nothing).
 * - **A time that is not evidence says so.** A clock-out the system filled in is not a recorded
 *   time, and the row says that beside the time instead of leaving it to read as one.
 * - **Dates are the company's own days.** The caller passes the two formatters (a calendar day and
 *   an instant in the company's zone), so nothing here reads the browser's clock or zone.
 *
 * Every value is a string that goes into a text node. Nothing here makes a link.
 */

export type Formatters = {
  /** A `YYYY-MM-DD` day. */
  day: (day: string) => string;
  /** An instant, in the company's zone. */
  at: (instant: string) => string;
};

export type CitationRow = { label: string; value: string };

export type CitationRendering = {
  rows: CitationRow[];
  /** Sentences that qualify the copy: what it cannot say. Plain text, each its own line. */
  notes: string[];
  /** A policy's wording as it stood. Typed text: shown as text, never as markup or links. */
  wording: string | null;
};

/** The server cuts a policy's wording in the copy at 10,000 characters and says so; its fingerprint covers all of it. */
const POLICY_CUT_NOTE =
  "Only the start of the wording is shown here (it is cut at 10,000 characters). The fingerprint kept with the letter covers all of it.";

const POLICY_HISTORY_NOTE =
  "The handbook keeps no earlier versions, so this is the version in force at that time and not necessarily the wording that applied on the day of the incident.";

export function citationRendering(
  copy: AsItStood,
  format: Formatters,
): CitationRendering {
  const rows: CitationRow[] = [];
  const notes: string[] = [];
  let wording: string | null = null;
  const add = (label: string, value: string | null) => {
    if (value !== null && value.trim() !== "") rows.push({ label, value });
  };

  switch (copy.kind) {
    case "POLICY": {
      add("Section", copy.category);
      if (copy.version !== null) add("Version", String(copy.version));
      if (copy.publishedAt) add("In force since", format.at(copy.publishedAt));
      if (copy.personAcknowledged === true) {
        add(
          "Their acceptance",
          copy.acknowledgedAt
            ? `Accepted this version on ${format.at(copy.acknowledgedAt)}`
            : "Accepted this version",
        );
      } else if (copy.personAcknowledged === false) {
        add("Their acceptance", "Had not accepted this version");
      }
      if (copy.publishedAfterIncident === true) {
        notes.push(
          "This version was published after the incident date, so it may not be the wording that applied on the day.",
        );
      }
      if (copy.withdrawn === true) {
        notes.push("This section has since been withdrawn from the handbook.");
      }
      if (copy.bodyTruncated === true) notes.push(POLICY_CUT_NOTE);
      notes.push(POLICY_HISTORY_NOTE);
      wording = copy.body && copy.body.trim() !== "" ? copy.body : null;
      break;
    }
    case "EQUIPMENT": {
      add(
        "Item",
        [copy.item, copy.tag ? `(${copy.tag})` : null]
          .filter(Boolean)
          .join(" ") || null,
      );
      add("Category", copy.category);
      if (copy.assignedOn) add("Given to them on", format.day(copy.assignedOn));
      add("Condition when given", copy.conditionOut);
      if (copy.returnedOn) add("Handed back on", format.day(copy.returnedOn));
      add("Condition when handed back", copy.conditionBack);
      if (copy.personConfirmedReceipt === true) {
        add(
          "Their confirmation",
          copy.confirmedAt
            ? `Confirmed receipt on ${format.at(copy.confirmedAt)}`
            : "Confirmed receipt",
        );
      } else if (copy.personConfirmedReceipt === false) {
        add("Their confirmation", "Had not confirmed receipt");
      }
      break;
    }
    case "ATTENDANCE_DAY": {
      if (copy.date) add("Day", format.day(copy.date));
      add(
        "The day showed",
        copy.status ? (ATTENDANCE_STATUS_WORD[copy.status] ?? null) : null,
      );
      add("Clocked in", copy.clockIn);
      if (copy.clockOut) {
        add(
          "Clocked out",
          copy.clockOutFilledBySystem === true
            ? `${copy.clockOut} (filled in by the system, so not a recorded time)`
            : copy.clockOut,
        );
      }
      if (copy.lateByMinutes !== null && copy.lateByMinutes > 0)
        add("Late by", minutes(copy.lateByMinutes));
      if (copy.earlyByMinutes !== null && copy.earlyByMinutes > 0)
        add("Left early by", minutes(copy.earlyByMinutes));
      add(
        "How it was recorded",
        copy.source ? (ATTENDANCE_SOURCE_WORD[copy.source] ?? null) : null,
      );
      if (copy.correctedByAdministrator === true)
        add("Corrected", "An administrator corrected this entry");
      add("Where", copy.workLocation);
      break;
    }
    case "LEAVE_REQUEST": {
      if (copy.startDate) {
        add(
          "Dates",
          copy.endDate && copy.endDate !== copy.startDate
            ? `${format.day(copy.startDate)} to ${format.day(copy.endDate)}`
            : format.day(copy.startDate),
        );
      }
      if (copy.days !== null) add("Days", String(copy.days));
      add(
        "Status",
        copy.status ? (LEAVE_STATUS_WORD[copy.status] ?? null) : null,
      );
      break;
    }
    case "ROTA_DAY": {
      if (copy.date) add("Day", format.day(copy.date));
      const times =
        copy.startTime && copy.endTime
          ? `${copy.startTime} to ${copy.endTime}`
          : null;
      add("Shift", [copy.shiftName, times].filter(Boolean).join(", ") || null);
      add(
        "Status",
        copy.status ? (ROTA_STATUS_WORD[copy.status] ?? null) : null,
      );
      break;
    }
    case "DOCUMENT_REQUEST": {
      add("Document", copy.name);
      add("Kind", categoryWord(copy.category));
      if (copy.dueOn) add("Due", format.day(copy.dueOn));
      add(
        "Status",
        copy.status
          ? (DOCUMENT_REQUEST_STATUS_WORD[copy.status] ?? null)
          : null,
      );
      if (copy.requestedAt) add("Asked on", format.at(copy.requestedAt));
      break;
    }
  }

  return { rows, notes, wording };
}

/** The words for a document category, read without a cast from a string the server sent. */
function categoryWord(category: string | null): string | null {
  if (!category) return null;
  const known = Object.entries(CATEGORY_LABEL).find(([id]) => id === category);
  return known ? known[1] : null;
}

const minutes = (count: number): string =>
  `${count} ${count === 1 ? "minute" : "minutes"}`;

/**
 * The line that says what a citation is, by whether the letter has been issued.
 *
 * A draft's copy is a preview and is taken again when the letter is issued; a frozen one is what
 * the record said then and never changes. Both say so, because a reader who takes a preview for
 * the frozen copy would trust a figure that is about to be read again.
 */
export function citationStanding(
  frozen: boolean,
  takenAt: string | null,
  format: Formatters,
): string {
  if (frozen) {
    return takenAt
      ? `As it stood when this letter was issued, ${format.at(takenAt)}. It does not change if the record does.`
      : "As it stood when this letter was issued. It does not change if the record does.";
  }
  return "A preview of what the record says now. It is read again, and frozen, when the letter is issued.";
}
