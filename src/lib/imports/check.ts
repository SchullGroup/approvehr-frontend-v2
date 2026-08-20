import type { ApiRowIssue, ApiRowReport, ImportRow } from "@/lib/api/imports";
import {
  EMPLOYMENT_STATUS_WORDS,
  EMPLOYMENT_TYPE_WORDS,
  GENDER_WORDS,
  HEADING,
  REQUIRED_FIELDS,
  normalizeKey,
  resolveTaxState,
  type EmployeeField,
} from "./template";

/**
 * The file check, in the browser.
 *
 * ## What this is for, and what it is not
 *
 * The API's check is the authoritative one and the only one that runs when the
 * API is reachable. This is the demo-mode substitute, and it is deliberately
 * narrower: **it only asks questions whose answer is in the file.** Is that a
 * date? Is that an amount? Does the same staff number appear twice? Is
 * `employment_type` a word we know?
 *
 * It never guesses at the ones that need the database — whether a staff number
 * is already yours, whether that department exists, whether the pay sits inside
 * its grade's band, whether a manager can be resolved. The screen says so out
 * loud rather than implying a clean file will import cleanly, and the import
 * itself refuses to run without the API. A demo that faked writing 500 salaries
 * into localStorage would teach the wrong thing about what this product does.
 *
 * ## The drift risk, and why the checks were chosen the way they were
 *
 * This mirrors logic in `approvehr-api/src/modules/imports/service.ts`, which is
 * one copy too many — the same trade HANDOVER.md records for the payroll engine.
 * The mitigation is the direction of the errors. Every check here is one where
 * the file alone settles it, so a false *positive* is close to impossible; a
 * false negative — something this misses and the API catches — is expected and
 * harmless, because the API runs before anything is written. If you change the
 * API's rules, this file is allowed to lag. It is not allowed to contradict.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

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

  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(text)) {
    return bad(
      `"${text}" has a two-digit year. Write the year in full — 2021, not 21.`,
    );
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
 * A written amount to integer kobo, without a float touching it.
 *
 * The naira sign, NGN, thousands separators and spaces are stripped, because
 * that is how a spreadsheet formats money. Anything else is refused rather than
 * salvaged: three decimal places is not a rounding opportunity, it is a column
 * that does not hold naira. The kobo are assembled from the two halves of the
 * string rather than by multiplying a parsed float by 100, which is where
 * `162632.29 * 100 = 16263228.999999998` comes from.
 */
export function parseImportMoneyKobo(raw: string): Parsed<number> {
  /* A non-breaking space is what a copy-paste from a web page leaves behind. */
  let text = raw.replace(/\u00a0/g, " ").trim();

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
  if (negative) return bad(`"${raw}" is negative. Monthly pay cannot be.`);

  const kobo = Number(whole) * 100 + Number(`${decimals}00`.slice(0, 2));
  if (kobo <= 0) return bad("Monthly pay has to be more than zero.");
  if (kobo > 90_000_000_000) {
    return bad(
      `${(kobo / 100).toLocaleString("en-NG")} naira a month is implausible. Check the amount.`,
    );
  }
  return { ok: true, value: kobo };
}

/* ------------------------------------------------------------------- checks */

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Case- and space-insensitive, the way the API matches a staff number. */
const noKey = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "");

export type LocalCheckResult = {
  totalRows: number;
  /** Rows with nothing wrong. Not "to create": only the API knows who is new. */
  toImport: number;
  toSkip: number;
  rows: ApiRowReport[];
  notes: string[];
};

/**
 * Check mapped rows against the file's own evidence.
 *
 * `presentFields` is what the mapping produced, and it is the difference between
 * "this cell is empty" and "this file has no such column" — two problems with
 * two different fixes, and telling somebody to fill in a cell that does not
 * exist is the sort of message that makes people give up.
 */
export function checkMappedRows(
  rows: readonly ImportRow[],
  options: {
    presentFields: ReadonlySet<EmployeeField>;
    /** Row numbers as the file has them, so a multi-part check still lines up. */
    firstRowNumber?: number;
  },
): LocalCheckResult {
  const { presentFields, firstRowNumber = 1 } = options;
  const reports: ApiRowReport[] = [];
  const seen = new Map<string, number>();
  let ambiguousDates = 0;
  let inactiveRows = 0;
  let typeDisagreements = 0;

  rows.forEach((row, index) => {
    const rowNumber = firstRowNumber + index;
    const errors: ApiRowIssue[] = [];
    const warnings: ApiRowIssue[] = [];

    const text = (field: EmployeeField): string => {
      const value = row[HEADING[field]];
      return value === undefined || value === null ? "" : String(value).trim();
    };
    const issue = (field: EmployeeField, problem: string): ApiRowIssue => ({
      row: rowNumber,
      column: HEADING[field],
      value: text(field) || null,
      problem,
    });

    for (const field of REQUIRED_FIELDS) {
      if (text(field) !== "") continue;
      errors.push(
        issue(
          field,
          presentFields.has(field)
            ? `This cell is empty and ${HEADING[field]} is needed for every person.`
            : `This file has no ${HEADING[field]} column. Match one on the previous step, or add it to the file.`,
        ),
      );
    }

    const employeeNo = text("employeeNo");
    if (employeeNo !== "") {
      const key = noKey(employeeNo);
      const first = seen.get(key);
      if (first !== undefined) {
        errors.push(
          issue(
            "employeeNo",
            `${employeeNo} is already used on row ${first}. Two people cannot share a staff number — change one of them.`,
          ),
        );
      } else {
        seen.set(key, rowNumber);
      }
    }

    for (const field of ["dateOfBirth", "startDate", "endDate"] as const) {
      const value = text(field);
      if (value === "") continue;
      const parsed = parseImportDate(value);
      if (!parsed.ok) errors.push(issue(field, parsed.problem));
      else if (parsed.value.ambiguous) ambiguousDates += 1;
    }

    const gross = text("grossMonthly");
    if (gross !== "") {
      const parsed = parseImportMoneyKobo(gross);
      if (!parsed.ok) errors.push(issue("grossMonthly", parsed.problem));
    }

    const frequency = text("payFrequency");
    if (frequency !== "" && !/^(monthly|month|permonth|monthlypay)$/.test(normalizeKey(frequency))) {
      errors.push(
        issue(
          "payFrequency",
          `This says "${frequency}". The pay column has to be a monthly figure — we will not divide a yearly one by twelve and guess.`,
        ),
      );
    }

    const type = text("employmentType");
    const resolvedType = type === "" ? null : EMPLOYMENT_TYPE_WORDS[normalizeKey(type)];
    if (type !== "" && !resolvedType) {
      errors.push(
        issue(
          "employmentType",
          `We do not know what "${type}" means. Use full_time, part_time, contract, intern or nysc.`,
        ),
      );
    }

    const workType = text("workType");
    const resolvedWorkType =
      workType === "" ? null : EMPLOYMENT_TYPE_WORDS[normalizeKey(workType)];
    if (resolvedType && resolvedWorkType && resolvedType !== resolvedWorkType) {
      typeDisagreements += 1;
      warnings.push(
        issue(
          "workType",
          `This says "${workType}" and employment_type says "${type}". We use employment_type.`,
        ),
      );
    }

    const status = text("status");
    if (status !== "") {
      const resolved = EMPLOYMENT_STATUS_WORDS[normalizeKey(status)];
      if (!resolved) {
        errors.push(
          issue(
            "status",
            `We do not know what "${status}" means. Use active, on_leave, suspended, onboarding or exited.`,
          ),
        );
      } else if (normalizeKey(status) === "inactive") {
        inactiveRows += 1;
      }
    }

    const taxState = text("taxState");
    if (taxState !== "" && !resolveTaxState(taxState)) {
      errors.push(
        issue(
          "taxState",
          `"${taxState}" is not one of the 36 states or FCT. This is where their PAYE is filed, not where they are from.`,
        ),
      );
    }

    const email = text("email");
    if (email !== "" && !EMAIL.test(email)) {
      errors.push(
        issue("email", `"${email}" cannot be an email address. Check for a typo.`),
      );
    }

    const account = text("bankAccount");
    if (account !== "" && !/^\d{10}$/.test(account.replace(/[\s-]/g, ""))) {
      warnings.push(
        issue(
          "bankAccount",
          `"${account}" is not a 10-digit account number. They will import, but payroll cannot pay into it.`,
        ),
      );
    }

    const pin = text("pensionPin");
    if (pin !== "" && !/^pen\d{9,12}$/i.test(pin.replace(/[\s-]/g, ""))) {
      warnings.push(
        issue(
          "pensionPin",
          `"${pin}" is not in PenCom's format — PEN then 9 to 12 digits. They will import, but the pension schedule will be refused.`,
        ),
      );
    }

    const tin = text("tin");
    if (tin !== "" && !/^\d{10}$/.test(tin.replace(/[\s-]/g, ""))) {
      warnings.push(
        issue("tin", `"${tin}" is not a 10-digit FIRS number. They will import.`),
      );
    }

    const gender = text("gender");
    if (gender !== "" && !GENDER_WORDS[normalizeKey(gender)]) {
      warnings.push(
        issue("gender", `We do not recognise "${gender}", so we left it blank.`),
      );
    }

    reports.push({
      row: rowNumber,
      employeeNo: employeeNo || null,
      name: [text("firstName"), text("lastName")].filter(Boolean).join(" ") || null,
      /* No "update" here: whether this person is already on file is a database
         question, and this check does not have a database. */
      action: errors.length > 0 ? "skip" : "create",
      errors,
      warnings,
    });
  });

  const notes: string[] = [];
  if (ambiguousDates > 0) {
    notes.push(
      `${ambiguousDates} ${ambiguousDates === 1 ? "date could" : "dates could"} be read two ways — 03/04/2021 is either 3 April or 4 March. We read the day first.`,
    );
  }
  if (inactiveRows > 0) {
    notes.push(
      `${inactiveRows} ${inactiveRows === 1 ? "person is" : "people are"} marked "inactive". We record that as suspended, not as having left — nobody gave a leaving date.`,
    );
  }
  if (typeDisagreements > 0) {
    notes.push(
      `${typeDisagreements} ${typeDisagreements === 1 ? "row has" : "rows have"} employment_type and work_type saying different things. We use employment_type.`,
    );
  }

  const toSkip = reports.filter((report) => report.action === "skip").length;
  return {
    totalRows: rows.length,
    toImport: rows.length - toSkip,
    toSkip,
    rows: reports,
    notes,
  };
}
