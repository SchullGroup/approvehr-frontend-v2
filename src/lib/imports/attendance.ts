import {
  buildDictionary,
  parseImportTime,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The attendance dictionary, and the rules only an attendance import has.
 *
 * The framework's fourth dictionary on this side. No new screen, no new store,
 * no new template writer — `spec.ts`, `mapping.ts`, `check.ts`,
 * `template-file.ts` and `components/imports/` render it exactly as they render
 * employees.
 *
 * ## This is a mirror, and the API's copy wins
 *
 * The API owns this list — `approvehr-api/src/modules/imports/attendance.ts`,
 * `ATTENDANCE_COLUMNS` — and when the API answers, **its copy wins**. The copy
 * here is the same data compiled in, for the one case where that call cannot be
 * made: choosing a file and lining its headings up has no business needing a
 * database. `scripts/verify-template.ts` parses the API's declaration as text
 * and gates the drift rather than describing it.
 *
 * ## What a browser can answer about attendance, and what it cannot
 *
 * Thin, and thinner than most, because nearly every interesting question here
 * is a question about the database:
 *
 * - **Is this person on the staff list**, and are they archived — needs the
 *   directory. This is the big one: a device export identifies people by
 *   whatever the terminal calls them, and whether that matches a staff number
 *   is exactly what cannot be known offline.
 * - **Is that office one of ours** — needs the locations.
 * - **Is this day already on file** — decides whether a row adds a day or
 *   *corrects* one, which is the difference between a create and a recorded
 *   correction against somebody's name.
 * - **Is that month's payroll already settled** — needs the runs, and it is the
 *   warning most worth having.
 *
 * So four things are checked here and they are the four a single row answers on
 * its own: a time that cannot be read, a clock-out before its clock-in, a day
 * that has not happened, and the same person twice on one day. A false negative
 * is the expected direction — this file may lag the API and must never
 * contradict it.
 *
 * ## An attendance file is much larger than the others
 *
 * A month for two hundred people is six thousand rows, against a staff list's
 * one row per person. The cap below is the API's own and the flow already splits
 * a file into parts to respect it, so nothing here needs to change for that —
 * but it is the reason `fileNotes` says how many days the file covers rather
 * than leaving somebody to infer it from a row count in the thousands.
 */

/** Rows per request, as the API caps it. See `entity.ts#MAX_ROWS_PER_BATCH`. */
export const MAX_ROWS_PER_BATCH = 500;

export type AttendanceField =
  | "employee"
  | "date"
  | "clockIn"
  | "clockOut"
  | "location"
  | "note";

const COLUMNS: readonly ColumnSpec<AttendanceField>[] = [
  {
    field: "employee",
    templateExample: "DELETE THIS ROW",
    column: "employee_no",
    aliases: [
      "staff_no",
      "staff_number",
      "employee_id",
      "employee_number",
      "emp_no",
      "emp_id",
      "payroll_no",
      "email",
      "work_email",
      /* What terminals call their own enrolment number. Accepted as an alias
         because a device export is the file this importer exists for — and
         matched against the staff number, because that is the only id this
         product shares with the sheet. Mapping a device's own user numbers to
         people is the ingestion path's job, and the API refuses a row carrying
         one with a sentence that says so. */
      "user_id",
      "userid",
      "badge_no",
      "card_no",
      "ac_no",
    ],
    required: true,
    example: "EMP-0041",
    note: "The staff number, or the person's work email. Not their name — two people can share one.",
  },
  {
    field: "date",
    column: "date",
    aliases: [
      "work_date",
      "attendance_date",
      "day",
      "punch_date",
      "clock_date",
      "date_worked",
    ],
    required: true,
    cell: { kind: "date" },
    example: "2026-09-01",
    note: "The working day. A day that has not happened yet is refused.",
  },
  {
    field: "clockIn",
    column: "clock_in",
    aliases: [
      "time_in",
      "in",
      "in_time",
      "check_in",
      "checkin",
      "start",
      "start_time",
      "first_in",
      "arrival",
    ],
    required: false,
    cell: { kind: "time" },
    example: "08:05",
    note: "When they arrived, 24-hour. Leave blank if the device recorded none.",
    recommended: {
      why: "no clock-in — payroll counts a working day with nothing against it as unpaid, so this day may dock their pay",
      /* The one recommended field here that reaches pay, so the one that lands
         in the "needed to pay them" tier of the fixes step. */
      important: true,
    },
  },
  {
    field: "clockOut",
    column: "clock_out",
    aliases: [
      "time_out",
      "out",
      "out_time",
      "check_out",
      "checkout",
      "end",
      "end_time",
      "last_out",
      "departure",
    ],
    required: false,
    cell: { kind: "time" },
    example: "17:12",
    note: "When they left, 24-hour. Must be after the clock-in.",
    recommended: {
      /* Not `important`: `unpaidDaysFor` counts a working day with no
         *clock-in* as unpaid and never reads the clock-out, so an open shift is
         a timesheet to close rather than a day that pays wrongly. */
      why: "no clock-out — the day shows as an open shift on the timesheet and nobody's hours can be totalled from it",
    },
  },
  {
    field: "location",
    column: "work_location",
    aliases: ["location", "site", "office", "branch", "terminal", "device_location"],
    required: false,
    example: "Ikeja Head Office",
    note: "One of your offices, by name. Must already exist — this never creates one.",
  },
  {
    field: "note",
    column: "note",
    aliases: ["reason", "comment", "remark", "remarks", "correction_note"],
    required: false,
    example: "Terminal export, September",
    note: "Why, for a day you are correcting. A row with none gets a note naming this import.",
  },
];

const NOTE_MAX = 500;

const minutesOf = (time: string): number => {
  const [hour, minute] = time.split(":");
  return Number(hour) * 60 + Number(minute);
};

/** Midnight today, UTC — the same boundary the API compares against. */
const todayUtc = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

/**
 * Read a date cell the way `parseImportDate` does, for the two rules that need
 * the resolved day rather than the text.
 *
 * Deliberately not a second date parser: `check.ts` has already run the
 * declared-cell pass and reported anything unreadable, so this only has to
 * recognise the shape it produced. A cell this cannot read is one the generic
 * engine has already refused, and returning null here simply leaves it alone
 * rather than reporting the same cell twice in two different words.
 */
function isoDayOf(raw: string): string | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  return null;
}

function attendanceRowRules({
  text,
  error,
  tally,
  seen,
}: RowContext<AttendanceField>): void {
  const rawIn = text("clockIn");
  const rawOut = text("clockOut");

  /* A row with neither time records nothing. Refused rather than written as an
     empty day: an attendance entry with no clock-in is indistinguishable from a
     day nobody recorded, and payroll reads both as absence.

     Offline this cannot know whether the day is already on file — where it is,
     the API accepts the row as a location-or-note-only correction. So this is
     the documented false-negative direction in reverse, and the one place this
     file is *stricter* than the API. Said in `fileNotes` rather than left to
     surprise somebody. */
  if (rawIn === "" && rawOut === "") {
    error(
      "clockIn",
      "This row has no clock-in and no clock-out, so there is nothing to record for the day.",
    );
  }

  /* Both times readable and the wrong way round. The same refusal
     `attendance/service.ts#correct` makes — and a night shift crossing midnight
     is two calendar days, which is the roster's business rather than something
     an importer infers from "out is before in". */
  if (rawIn !== "" && rawOut !== "") {
    const parsedIn = parseImportTime(rawIn);
    const parsedOut = parseImportTime(rawOut);
    if (
      parsedIn.ok &&
      parsedOut.ok &&
      minutesOf(parsedOut.value) < minutesOf(parsedIn.value)
    ) {
      error(
        "clockOut",
        `${parsedOut.value} is before the clock-in at ${parsedIn.value}.`,
      );
    }
  }
  if (rawOut === "") tally("openShifts");

  const day = isoDayOf(text("date"));
  if (day) {
    /* A day that has not happened is not a day somebody attended. The same rule
       `countTo` applies in `assemble.ts`, and one a browser can answer for
       itself — the only date question here that does not need the database. */
    if (Date.parse(`${day}T00:00:00.000Z`) > todayUtc()) {
      error("date", `${day} has not happened yet.`);
    }

    /* The same person twice on one day, which is what a raw punch log looks
       like — two taps per person per day. This importer takes the person-day
       shape deliberately, so the refusal points at the row to merge with. */
    const who = text("employee");
    if (who !== "") {
      const first = seen("personDay", `${who.trim().toLowerCase()}|${day}`);
      if (first !== undefined) {
        error(
          "date",
          `${who} already has ${day} on row ${first}. One row per person per day — merge them.`,
        );
      }
    }
  }

  const note = text("note");
  if (note.length > NOTE_MAX) {
    error("note", `A note is at most ${NOTE_MAX} characters.`);
  }
}

/** The batch-level sentences, from what the row rules counted. */
function attendanceFileNotes(counts: Readonly<Record<string, number>>): string[] {
  const notes: string[] = [];
  const openShifts = counts["openShifts"] ?? 0;

  if (openShifts > 0) {
    notes.push(
      `${openShifts} ${openShifts === 1 ? "day has" : "days have"} no clock-out. They import, and show as an open shift until somebody closes them.`,
    );
  }

  /* The four things this check cannot answer, said once rather than implied by
     a clean report. Every one of them is a question about the database, and
     three of them change what a row *does* rather than whether it lands. */
  notes.push(
    "Whether each staff number is somebody on your list is checked when you connect — a device's own user numbers will not match, and those rows are refused with the reason.",
    "Whether a day is already on file is also checked then. A day that is changes from being added to being corrected, recorded against your name with a note.",
    "A month whose payroll is already approved or paid will import and will not change anybody's pay for it. You are told which months those are before anything is written.",
  );
  return notes;
}

/**
 * The attendance dictionary, built.
 *
 * `buildDictionary` puts the two required columns first, so the sheet a customer
 * downloads opens on the person and the day.
 */
export const ATTENDANCE: Dictionary<AttendanceField> = buildDictionary(
  {
    slug: "attendance",
    kind: "ATTENDANCE",
    templateFile: {
      basename: "approvehr-attendance-template",
      sheetName: "Attendance",
    },
    noun: { one: "attendance day", many: "attendance days" },
    /* Two things make the key and neither is printable on its own, so copy
       names the half a person recognises. */
    keyLabel: "staff number",
    rowRules: attendanceRowRules,
    fileNotes: attendanceFileNotes,
    identify: (text) => ({
      key: text("employee") || null,
      /* No name offline: resolving a staff number to a person needs the
         directory, and printing the staff number twice would read as two facts.
         The API fills this in from the row it matched. */
      name: null,
    }),
  },
  COLUMNS,
);

/** The dictionary's own list, in template order, for a screen that needs it. */
export const ATTENDANCE_COLUMNS = ATTENDANCE.columns;

export const HEADING = ATTENDANCE.heading;
