import type { ImportCell, ImportRow } from "@/lib/api/imports";

/**
 * The importer's column machinery, with no entity in it.
 *
 * One machine, many dictionaries. Everything here is true of importing
 * *anything* from a spreadsheet somebody else wrote: how a heading is matched,
 * how a written date or amount is read, which columns lead the template. What is
 * being imported lives in a dictionary beside it — `employees.ts` is the first
 * one — and a second importable entity is a dictionary plus a validate/apply
 * pair on the API, not another screen.
 *
 * This file mirrors `approvehr-api/src/modules/imports/columns.ts`. The API owns
 * the dictionary and **its copy wins whenever it answers**: the template payload
 * from `GET /imports/template/:entity` is what the screen renders and what the
 * downloaded file is built from. The copy here is what makes the first two steps
 * — choose a file, match its columns — work with no API at all, which they must,
 * because reading a CSV and lining its headings up against a list has no
 * business needing a database (see HANDOVER.md on demo mode).
 */

export type { ImportCell, ImportRow };

/** Lowercase, letters and digits only. `Employee ID` and `employee_id` agree. */
export const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ------------------------------------------------------------------ parsers */

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

const bad = (problem: string): Parsed<never> => ({ ok: false, problem });

const DATE_FORMATS = "Use DD/MM/YYYY or YYYY-MM-DD.";

/**
 * A written date, day first.
 *
 * Both DD/MM/YYYY and YYYY-MM-DD, and **no `new Date(text)` fallback** — that is
 * the thing that reads 04/28/2021 as a date in a different month, or produces
 * something plausible on one browser and an Invalid Date on another. A date where
 * both numbers are 12 or less is read day-first and counted, because 03/04/2021
 * is either 3 April or 4 March and the file does not say which.
 *
 * A two-digit year is completed, not refused — 00–68 to 20XX, 69–99 to 19XX,
 * the same Excel/POSIX pivot the API's copy uses. See the note on
 * `approvehr-api/src/modules/imports/columns.ts#parseDate` for why this one
 * case is safe to complete where day/month order is not: the day/month bounds
 * check and the caller's own age-plausibility check on a date of birth still
 * catch a pivot that produced nonsense.
 */
export function parseImportDate(
  raw: string,
): Parsed<{ iso: string; ambiguous: boolean }> {
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (iso) {
    return build(Number(iso[1]), Number(iso[2]), Number(iso[3]), false, text);
  }

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    return build(Number(dmy[3]), month, day, day <= 12 && month <= 12, text);
  }

  const dmyShort = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(text);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const month = Number(dmyShort[2]);
    const shortYear = Number(dmyShort[3]);
    const year = shortYear <= 68 ? 2000 + shortYear : 1900 + shortYear;
    return build(year, month, day, day <= 12 && month <= 12, text);
  }

  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    return bad(
      `"${text}" is a spreadsheet's internal date number, not a date. Format that column as a date and save the file again.`,
    );
  }

  return bad(`"${text}" is not a date we can read. ${DATE_FORMATS}`);
}

function build(
  year: number,
  month: number,
  day: number,
  ambiguous: boolean,
  text: string,
): Parsed<{ iso: string; ambiguous: boolean }> {
  if (month < 1 || month > 12) {
    return bad(`"${text}" — there is no month ${month}. ${DATE_FORMATS}`);
  }
  if (day < 1 || day > 31) {
    return bad(`"${text}" — there is no day ${day}. ${DATE_FORMATS}`);
  }
  /* UTC, because a date of birth is a calendar fact rather than an instant. */
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    /* 31/02 parses arithmetically and rolls into March. Catching the rollover is
       the only way to refuse a day that does not exist. */
    return bad(`"${text}" is not a real date — that month has no day ${day}.`);
  }
  return {
    ok: true,
    value: { iso: date.toISOString().slice(0, 10), ambiguous },
  };
}

/**
 * A clock time out of whatever a device wrote. Returns `HH:MM`, 24-hour.
 *
 * The API's `parseTime` character for character — `verify-template.ts` asserts
 * the two dictionaries agree about which columns are times, and this is the
 * parser behind that declaration on the offline side. If the API's changes,
 * change this with it.
 *
 * Accepts `08:03`, `8:03`, `08:03:47` (seconds read and dropped — a punch is a
 * minute on a timesheet), `2026-09-01 08:03:12` and its `T` form (the date half
 * ignored: the row's own date column is the authority on the day), `8.03` as a
 * European separator, and `8:03 AM` / `8:03 pm`.
 *
 * A **bare number** is refused rather than guessed at. `830` could be 08:30,
 * Excel hands over `0.3541` for a cell it decided was a time, and a device might
 * write `83000` meaning 08:30:00 — three readings, all plausible, and the wrong
 * one moves somebody's hours by hours. `parseImportDate` completes a two-digit
 * year silently because every reading of `26` lands on one day; there is no
 * equivalent here.
 */
export function parseImportTime(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === "") return { ok: false, problem: "This cell is empty." };

  const meridiem = /\b([ap])\.?m\.?$/i.exec(text);
  const body = meridiem ? text.slice(0, meridiem.index).trim() : text;

  const withoutDate = /^\d{4}-\d{1,2}-\d{1,2}[T ](.+)$/.exec(body);
  const clock = (withoutDate?.[1] ?? body).trim();

  const parts = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(clock);
  if (!parts) {
    return {
      ok: false,
      problem:
        "This is not a time we can read. Use HH:MM on a 24-hour clock — 08:30, or 17:05.",
    };
  }

  let hour = Number(parts[1]);
  const minute = Number(parts[2]);

  if (meridiem) {
    const isPm = meridiem[1]?.toLowerCase() === "p";
    if (hour < 1 || hour > 12) {
      return { ok: false, problem: `${clock} is not an hour on a 12-hour clock.` };
    }
    if (hour === 12) hour = isPm ? 12 : 0;
    else if (isPm) hour += 12;
  }

  if (hour > 23) return { ok: false, problem: `There is no ${String(hour)} o'clock.` };
  if (minute > 59) {
    return { ok: false, problem: `${String(minute)} is not a number of minutes.` };
  }

  return {
    ok: true,
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * A written amount to integer kobo, without a float touching it.
 *
 * The naira sign, NGN, thousands separators and spaces are stripped, because
 * that is how a spreadsheet formats money. Anything else is refused rather than
 * salvaged: three decimal places is not a rounding opportunity, it is a column
 * that does not hold naira. The kobo are assembled from the two halves of the
 * string rather than by multiplying a parsed float by 100, which is where
 * `162632.29 * 100 = 16263228.999999998` comes from.
 */
export function parseImportMoneyKobo(
  raw: string,
  options: { zeroAllowed?: boolean; subject?: string } = {},
): Parsed<number> {
  const { zeroAllowed = false, subject = "Monthly pay" } = options;
  /* A non-breaking space is what a copy-paste from a web page leaves behind. */
  let text = raw.replace(/ /g, " ").trim();

  let negative = false;
  /* Accounting parentheses mean negative. Recognised so the error can say so. */
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  text = text
    .replace(/ngn|naira|₦/gi, "")
    .replace(/^n(?=\s*[\d.])/i, "")
    .replace(/[,\s_'’]/g, "");

  if (text === "") return bad("There is no amount in this cell.");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return bad(`"${raw}" is not an amount. Write it as 162,632.00 or 162632.`);
  }

  const [whole = "0", decimals = ""] = text.split(".");
  if (decimals.length > 2) {
    return bad(
      `"${raw}" has more than two decimal places. Naira goes to the kobo and no further.`,
    );
  }
  if (negative) return bad(`"${raw}" is negative. ${subject} cannot be.`);

  const kobo = Number(whole) * 100 + Number(`${decimals}00`.slice(0, 2));
  /* Zero is refused for a salary and allowed for a declared rent: "I pay no
     rent" is something somebody said, while a salary of nothing is a cell
     nobody filled in. Same rule as the API's parser, and the rule itself is
     declared on the column rather than passed in at each call site. */
  if (kobo < 0 || (kobo === 0 && !zeroAllowed)) {
    return bad(`${subject} has to be more than zero.`);
  }
  if (kobo > 90_000_000_000) {
    return bad(
      `${(kobo / 100).toLocaleString("en-NG")} naira a month is implausible. Check the amount.`,
    );
  }
  return { ok: true, value: kobo };
}

/* ------------------------------------------------------------------ columns */

/**
 * What kind of value a column holds, declared on the column itself.
 *
 * The two that carry real risk are here and nothing else is: a written date and
 * a written amount are where a spreadsheet silently becomes a wrong number.
 * Word lists — employment type, status, gender — need a different message and a
 * different severity per field, so they stay in the entity's own rules, which
 * are allowed to be prose. The API sends this on every template column, so the
 * browser and the API cannot disagree about which columns are dates.
 */
export type CellKind =
  | { kind: "date" }
  /**
   * A clock time on the row's own day. `HH:MM`, 24-hour, once read.
   *
   * Mirrors the API's own kind. Separate from `date` rather than a flag on it,
   * because `parseImportDate` **discards** any time it is handed and every
   * caller depends on that — a cell holding `08:03` is not a date at all.
   *
   * The generic engine in `check.ts` has to branch on this explicitly. Without
   * a branch a time cell falls through to the money parser and a customer is
   * told their clock-in is not a valid amount.
   */
  | { kind: "time" }
  | { kind: "money"; zeroAllowed?: boolean; subject?: string };

/**
 * Optional, but its absence is reported rather than ignored.
 *
 * The three kinds of column are what makes "is this import finished" a question
 * with an answer: `required` refuses the row, `recommended` imports the record
 * onto a list somebody has to come back to, and neither is what an ordinary
 * optional column does. `feature` is the `OrgFeatures` flag that decides whether
 * this company is asked for it at all — a company that turned pension setup off
 * is not nagged for RSA PINs here, because the single-record form has stopped
 * asking too.
 *
 * `important` is what splits the Fixes step's missing-details list into "needed
 * to pay them" and "add later" — true only for the fields a payroll run cannot
 * pay somebody without at all (a missing salary, a missing account number),
 * mirroring which ones the API raises as a BLOCKER rather than a WARNING.
 * Absent means false.
 */
export type Recommendation = {
  feature?: "taxSetup" | "pensionSetup" | "bankDetails";
  why: string;
  important?: boolean;
};

export type ColumnSpec<Field extends string = string> = {
  field: Field;
  /** The heading the template prints, and the name we send the API. */
  column: string;
  /** Other headings that mean the same thing, in priority order. */
  aliases: readonly string[];
  required: boolean;
  example: string;
  /** What has to be in it, in one line. */
  note: string;
  recommended?: Recommendation;
  /** A date or an amount, when it is one. Absent means plain text. */
  cell?: CellKind;
  /**
   * What the *template* prints in its example row.
   *
   * The dictionary's examples are realistic on purpose — they show the shape of
   * a value — so a template whose example row looks like a real record is a
   * template somebody imports by accident. This is the giveaway, and it is
   * declared on the column so the API can send it and the file cannot be built
   * without it.
   */
  templateExample?: string;
  /**
   * The exact values this column accepts, when it is a fixed, universal
   * vocabulary — so the downloaded Excel template can turn the column into a
   * real dropdown cell. Deliberately narrow: a company's own departments or
   * salary grades are not this — see the API's `MIGRATION_ONLY_COLUMNS`
   * header for why those were removed from the importer rather than given a
   * dropdown. Absent means plain text.
   */
  dropdown?: readonly string[];
};

/**
 * A built dictionary: the columns in template order, plus everything derived.
 *
 * `buildDictionary` is the only way to make one, which is what keeps the
 * template, the matcher, the check and the API's response reading one list.
 */
export type Dictionary<Field extends string = string> = {
  /** The URL segment and the API's word for this entity: `employees`. */
  slug: string;
  /** The `ImportKind` this entity's batches are recorded under. */
  kind: string;
  /** What the downloaded file is called, and what its first sheet is called. */
  templateFile: { basename: string; sheetName: string };
  /** What one row is. Every count sentence on the screen uses these. */
  noun: { one: string; many: string };
  /** What the match key is called in copy: "staff number". */
  keyLabel: string;
  /**
   * Every column, **required first, then recommended, then the rest.**
   *
   * Ordered here rather than in the declaration, so the declaration stays
   * grouped by subject — identity, then contact, then pay — while the file a
   * customer fills in leads with the columns they cannot leave out. A dictionary
   * that grows a required column gets it in the right place without anybody
   * remembering to move it.
   */
  columns: readonly ColumnSpec<Field>[];
  lookup: ReadonlyMap<string, { field: Field; priority: number }>;
  byField: ReadonlyMap<Field, ColumnSpec<Field>>;
  requiredFields: readonly Field[];
  recommended: readonly ColumnSpec<Field>[];
  heading: Readonly<Record<Field, string>>;
  /**
   * Rules the file alone can settle that are not properties of one cell.
   *
   * A word list, two columns that disagree, the same email on two rows. The
   * browser-side check runs these after the declared cell checks; everything
   * that needs the database is the API's and is never guessed at here.
   */
  rowRules?: RowRules<Field>;
  /** Batch-level sentences built from what the row rules counted. */
  fileNotes?: (counts: Readonly<Record<string, number>>) => string[];
  /**
   * How a row names itself in a report.
   *
   * Every report line shows a key and a name, and which columns those are is the
   * entity's business — a person is a first and a last name, an asset is a serial
   * and a model. Absent means the report shows the row number alone, which is
   * honest rather than blank.
   */
  identify?: (text: (field: Field) => string) => {
    key: string | null;
    name: string | null;
  };
};

/** What a row rule is handed. Everything it needs and nothing it does not. */
export type RowContext<Field extends string> = {
  /** The file's own row number. */
  row: number;
  /** A cell's trimmed value, or "" when empty or absent. */
  text: (field: Field) => string;
  /** Stops the row. */
  error: (field: Field, problem: string) => void;
  /** Imports anyway; somebody should look. */
  warn: (field: Field, problem: string) => void;
  /** Bumps a named count, for `fileNotes` to turn into a sentence. */
  tally: (name: string) => void;
  /**
   * First row each value of a named key was seen on.
   *
   * The in-file duplicate check, which is the half of "is this the same person"
   * that needs no database. `seen("email", key)` returns the earlier row number
   * and records this one when there is none.
   */
  seen: (name: string, key: string) => number | undefined;
};

export type RowRules<Field extends string> = (ctx: RowContext<Field>) => void;

/**
 * Required, then recommended, then everything else — stable inside each tier.
 *
 * `Array.prototype.sort` is stable, so the declaration's own grouping survives
 * within a tier. That is the point: the file leads with what cannot be left out
 * and still reads as a sensible sheet after that.
 */
export function orderColumns<Field extends string>(
  specs: readonly ColumnSpec<Field>[],
): ColumnSpec<Field>[] {
  const tier = (spec: ColumnSpec<Field>): number =>
    spec.required ? 0 : spec.recommended ? 1 : 2;
  return [...specs].sort((a, b) => tier(a) - tier(b));
}

/**
 * Builds a dictionary, and refuses one that cannot be matched unambiguously.
 *
 * Two specs claiming one heading used to be settled by declaration order. That
 * made the *order of the list* part of the matching rules, so reordering it for
 * the template would silently move a column's meaning. Since the order is now
 * derived, the ambiguity has to be refused instead: a duplicate alias across two
 * specs throws here, at module load, where the build finds it.
 *
 * Within one spec, alias order is still priority — that is what makes
 * `job_title` beat `position` — and none of this affects it.
 */
export function buildDictionary<Field extends string>(
  identity: {
    slug: string;
    kind: string;
    templateFile: { basename: string; sheetName: string };
    noun: { one: string; many: string };
    keyLabel: string;
    rowRules?: RowRules<Field>;
    fileNotes?: (counts: Readonly<Record<string, number>>) => string[];
    identify?: Dictionary<Field>["identify"];
  },
  specs: readonly ColumnSpec<Field>[],
): Dictionary<Field> {
  const columns = orderColumns(specs);
  const lookup = new Map<string, { field: Field; priority: number }>();
  const owner = new Map<string, Field>();

  for (const spec of columns) {
    [spec.column, ...spec.aliases].forEach((key, priority) => {
      const normalized = normalizeKey(key);
      const claimed = owner.get(normalized);
      if (claimed !== undefined && claimed !== spec.field) {
        throw new Error(
          `Import dictionary "${identity.slug}": "${key}" is claimed by both ${claimed} and ${spec.field}. One heading cannot mean two things — rename one alias.`,
        );
      }
      if (!lookup.has(normalized)) {
        lookup.set(normalized, { field: spec.field, priority });
        owner.set(normalized, spec.field);
      }
    });
  }

  return {
    slug: identity.slug,
    kind: identity.kind,
    templateFile: identity.templateFile,
    noun: identity.noun,
    keyLabel: identity.keyLabel,
    ...(identity.rowRules ? { rowRules: identity.rowRules } : {}),
    ...(identity.fileNotes ? { fileNotes: identity.fileNotes } : {}),
    ...(identity.identify ? { identify: identity.identify } : {}),
    columns,
    lookup,
    byField: new Map(columns.map((spec) => [spec.field, spec])),
    requiredFields: columns.filter((spec) => spec.required).map((spec) => spec.field),
    recommended: columns.filter((spec) => spec.recommended !== undefined),
    heading: Object.fromEntries(
      columns.map((spec) => [spec.field, spec.column]),
    ) as Record<Field, string>,
  };
}
