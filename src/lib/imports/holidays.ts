import {
  buildDictionary,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The public holiday dictionary.
 *
 * The API owns this list — `approvehr-api/src/modules/imports/holidays.ts` —
 * and `scripts/verify-template.ts` checks the two agree when a backend checkout
 * is beside this repo. This copy is what the template is built from before the
 * API answers, and what the browser checks a file against in demo mode.
 *
 * A date is a day and a month, DD/MM: public holidays are the same list every
 * year, so the year is picked once on the import screen and sent as
 * `context.year` (see the import page's surface). The column says its format in
 * its own heading, and the Excel template refuses anything else in the cell
 * (`checkedDates` below), because a holiday read month first is a day of pay in
 * the wrong week.
 */

export type HolidayField = "name" | "date" | "confirmed";

const YES = new Set([
  "yes",
  "y",
  "true",
  "1",
  "confirmed",
  "proclaimed",
  "gazetted",
]);
const NO = new Set([
  "no",
  "n",
  "false",
  "0",
  "unconfirmed",
  "expected",
  "pending",
  "tbc",
]);

export const HOLIDAY_COLUMNS: readonly ColumnSpec<HolidayField>[] = [
  {
    field: "name",
    templateExample: "DELETE THIS ROW",
    column: "Holiday name",
    aliases: [
      "name",
      "holiday",
      "holiday_name",
      "title",
      "occasion",
      "description",
    ],
    required: true,
    example: "Christmas Day",
    note: "What the day is called, as staff should see it. Up to 120 characters.",
  },
  {
    field: "date",
    column: "Date (DD/MM)",
    aliases: [
      "date",
      "holiday_date",
      "day",
      "on",
      "date_dd_mm",
      "date_dd_mm_yyyy",
    ],
    required: true,
    example: "25/12",
    /* Not a `date` cell: a day and a month is not a whole date. Read by
       `holidayRowRules` here and by the API's own checker. */
    note: "Day, then month, with a slash: 25/12 is 25 December. Two digits each (01/10, not 1/10). The year is the one you pick on the import screen.",
  },
  {
    field: "confirmed",
    column: "Confirmed",
    aliases: ["confirmed", "status", "proclaimed", "gazetted"],
    required: false,
    example: "Yes",
    dropdown: ["Yes", "No"],
    note: "Yes once the government has proclaimed the date. No for a date that is expected but not announced yet, such as Eid. Blank means Yes.",
  },
];

/** The rules a date cell and a required cell cannot express on their own. */
function holidayRowRules(ctx: RowContext<HolidayField>): void {
  const name = ctx.text("name");
  if (name.length > 120) {
    ctx.error(
      "name",
      `That name is ${name.length} characters. Keep it to 120.`,
    );
  }

  const confirmed = ctx.text("confirmed").toLowerCase();
  if (confirmed && !YES.has(confirmed) && !NO.has(confirmed)) {
    ctx.error(
      "confirmed",
      `"${ctx.text("confirmed")}" is not Yes or No. Leave it blank for Yes.`,
    );
  }

  /* The browser's copy of the API's date rule, for demo mode: DD/MM, or a
     whole DD/MM/YYYY. Which day of which year is the API's to say. */
  const date = ctx.text("date");
  const parts = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{4})?$/.exec(date);
  if (date && !parts) {
    ctx.error(
      "date",
      `"${date}" is not a date we can read. Write it as DD/MM, day first: 25/12.`,
    );
  } else if (parts) {
    const day = Number(parts[1]);
    const month = Number(parts[2]);
    if (month < 1 || month > 12) {
      ctx.error(
        "date",
        `"${date}" has no month ${month}. Write it as DD/MM, day first: 25/12.`,
      );
    } else if (
      day < 1 ||
      day > new Date(Date.UTC(2000, month, 0)).getUTCDate()
    ) {
      ctx.error("date", `"${date}" is not a real date.`);
    }
  }
  if (name && date) {
    const first = ctx.seen("holiday", `${date}|${name.toLowerCase()}`);
    if (first !== undefined) {
      ctx.error(
        "name",
        `${name} on ${date} is already on row ${first} of this file. Delete one of the two rows.`,
      );
    }
  }
}

export const HOLIDAYS: Dictionary<HolidayField> = buildDictionary(
  {
    slug: "holidays",
    kind: "PUBLIC_HOLIDAYS",
    templateFile: {
      basename: "approvehr-public-holidays-template",
      sheetName: "Public holidays",
      checkedDates: { date: "DD/MM" },
    },
    noun: { one: "holiday", many: "holidays" },
    /* The API reports each row's date as it read it ("25 Dec 2026") in the
       key slot, so a month-first file shows itself before anything lands. */
    keyLabel: "date",
    rowRules: holidayRowRules,
    identify: (text) => ({
      key: text("date") || null,
      name: text("name") || null,
    }),
  },
  HOLIDAY_COLUMNS,
);
