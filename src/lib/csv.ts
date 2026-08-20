/**
 * A CSV reader and writer, written rather than installed.
 *
 * Not because a dependency would be wrong in principle — because the whole job
 * is about 150 lines of state machine and the interesting part is what a real
 * Nigerian payroll spreadsheet does to a naive one. Every case below was found
 * in a file somebody exported from Excel, not invented:
 *
 * - **A BOM.** Excel writes a byte-order mark at the start of a UTF-8 CSV. Left
 *   in, the first heading is `employee_no` with an invisible character on the
 *   front, so it matches nothing, so the whole first column fails to import in
 *   silence.
 * - **Quoted fields containing the delimiter.** `"Ikeja, Lagos"` is one cell.
 * - **Quoted fields containing newlines.** An address typed with Alt+Enter in
 *   Excel is one cell spanning two lines, and a line-splitting parser turns a
 *   500-row file into 530 rows, 30 of them nonsense.
 * - **Doubled quotes.** `"Bola ""BJ"" Ahmed"` is one cell reading `Bola "BJ" Ahmed`.
 * - **A semicolon delimiter.** Excel writes the operating system's list
 *   separator, so a machine set to a European locale exports semicolons. One
 *   column named `employee_no;first_name;last_name` is the symptom.
 * - **Ragged rows.** A trailing comma, or a row with more cells than headings.
 * - **Duplicate and empty headings.** Both happen; neither should lose a column.
 *
 * ## What this deliberately does not do
 *
 * It does not convert types. Every cell comes out a string, including money and
 * dates. A parser that helpfully turned `162,632.00` into a number would put a
 * float in the path of a salary, and `03/04/2021` into a `Date` would guess at
 * the month. Both decisions belong to code that knows what the column means —
 * see `lib/imports/check.ts` and the API's own parsers.
 *
 * It also does not trim cell values. The import maps and trims on the way to the
 * API; keeping the file's bytes here is what lets us hand back a "rows to fix"
 * download that is the user's own file, not our re-rendering of it.
 */

export type CsvRow = Record<string, string>;

export type CsvFile = {
  /** Column headings, in file order, after naming the empty ones. */
  headers: string[];
  /** Data rows keyed by heading. Values untrimmed, exactly as in the file. */
  rows: CsvRow[];
  /** The same data rows as arrays, for writing a row back out unchanged. */
  records: string[][];
  delimiter: string;
  /** Plain-language account of anything we had to fix. Show these to the user. */
  notes: string[];
};

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Which character separates the cells.
 *
 * Counted on the first record only, honouring quotes, so `"Ikeja, Lagos"` in a
 * semicolon file does not vote for a comma. Comma wins any tie, because comma is
 * what a Nigerian Excel writes and a one-column file has no evidence either way.
 */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(
    CANDIDATE_DELIMITERS.map((d) => [d, 0]),
  );
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") break;
    const seen = counts.get(ch);
    if (seen !== undefined) counts.set(ch, seen + 1);
  }

  let best = ",";
  let bestCount = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const count = counts.get(delimiter) ?? 0;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The state machine. Text in, records out, nothing interpreted.
 *
 * A quote opens a quoted field **only at the start of a field**, so `5" pipe`
 * in an unquoted cell stays a literal quote rather than swallowing the rest of
 * the file. A file that ends inside a quoted value keeps what it has: refusing
 * to read 499 good rows because the 500th is truncated would be the wrong trade.
 */
export function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      started = true;
      continue;
    }
    if (ch === delimiter) {
      endField();
      started = true;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRecord();
      continue;
    }
    if (ch === "\n") {
      endRecord();
      continue;
    }
    field += ch;
    started = true;
  }

  if (started || field !== "" || record.length > 0) endRecord();
  return records;
}

/** True for a record that is a blank line rather than a row of empty cells. */
const isBlankLine = (record: string[]): boolean =>
  record.length <= 1 && (record[0] ?? "").trim() === "";

/**
 * Parse a whole file: headings, then rows keyed by heading.
 *
 * Row order is the file's order and is never re-sorted — every problem the
 * import reports is addressed by a row number, and a row number that does not
 * match what Excel shows is worse than no row number at all.
 */
export function parseCsv(
  text: string,
  options: { delimiter?: string } = {},
): CsvFile {
  const notes: string[] = [];

  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  /* A BOM can also survive in the middle of a concatenated export. It is never
     part of a value, so it goes wherever it is found. */
  if (body.includes("\uFEFF")) body = body.replace(/\uFEFF/g, "");

  const delimiter = options.delimiter ?? detectDelimiter(body);
  if (delimiter !== ",") {
    notes.push(
      `The cells in this file are separated by ${nameOf(delimiter)}, not commas. We read it that way.`,
    );
  }

  const all = parseCsvRecords(body, delimiter);
  const headerRecord = all.find((record) => !isBlankLine(record));
  if (!headerRecord) {
    return { headers: [], rows: [], records: [], delimiter, notes };
  }

  const dataRecords = all.slice(all.indexOf(headerRecord) + 1);
  const kept = dataRecords.filter((record) => !isBlankLine(record));
  const blanks = dataRecords.length - kept.length;
  if (blanks > 0) {
    notes.push(
      `${blanks} blank ${blanks === 1 ? "line" : "lines"} in the file, skipped.`,
    );
  }

  /* Headings are trimmed — ` first_name` and `first_name` are the same column
     to everyone except a string comparison. Values are not: see the file header. */
  const width = kept.reduce(
    (max, record) => Math.max(max, record.length),
    headerRecord.length,
  );
  const headers = nameHeaders(
    headerRecord.map((h) => h.trim()),
    width,
    notes,
  );

  const rows: CsvRow[] = [];
  const records: string[][] = [];
  let ragged = 0;

  for (const record of kept) {
    if (record.length !== headerRecord.length) ragged += 1;
    const row: CsvRow = {};
    headers.forEach((heading, index) => {
      row[heading] = record[index] ?? "";
    });
    rows.push(row);
    records.push(record);
  }

  if (ragged > 0) {
    notes.push(
      `${ragged} ${ragged === 1 ? "row has" : "rows have"} a different number of cells than the heading row. Missing cells are read as empty.`,
    );
  }

  return { headers, rows, records, delimiter, notes };
}

/**
 * Every column gets a usable, unique name.
 *
 * An unnamed column is named after its position rather than dropped, because a
 * spreadsheet with a blank heading over a column full of salaries still has the
 * salaries in it, and the mapping step can only offer a column it can name. A
 * repeated heading gets a numbered suffix for the same reason — Excel is happy
 * with two columns called `phone` and only one of them would survive a
 * last-wins object.
 */
function nameHeaders(raw: string[], width: number, notes: string[]): string[] {
  const headers: string[] = [];
  const used = new Set<string>();
  let unnamed = 0;
  let duplicated = 0;

  for (let index = 0; index < width; index += 1) {
    let name = (raw[index] ?? "").trim();
    if (name === "") {
      name = `column_${index + 1}`;
      unnamed += 1;
    }
    if (used.has(name)) {
      duplicated += 1;
      let suffix = 2;
      while (used.has(`${name} (${suffix})`)) suffix += 1;
      name = `${name} (${suffix})`;
    }
    used.add(name);
    headers.push(name);
  }

  if (unnamed > 0) {
    notes.push(
      `${unnamed} ${unnamed === 1 ? "column has" : "columns have"} no heading. We named ${unnamed === 1 ? "it" : "them"} after ${unnamed === 1 ? "its" : "their"} position — column_3 is the third column.`,
    );
  }
  if (duplicated > 0) {
    notes.push(
      `${duplicated} heading${duplicated === 1 ? "" : "s"} appear more than once. The repeats are numbered, so no column is lost.`,
    );
  }
  return headers;
}

function nameOf(delimiter: string): string {
  if (delimiter === ";") return "semicolons";
  if (delimiter === "\t") return "tabs";
  if (delimiter === "|") return "pipes";
  return "commas";
}

/* ------------------------------------------------------------------ writing */

/**
 * One cell, quoted when it has to be.
 *
 * Leading and trailing spaces are quoted too. Without it, a re-imported file
 * loses them, and ` 0803...` becoming `0803...` is a change the user did not
 * make to data they are about to be paid against.
 */
export function csvCell(value: string): string {
  if (value === "") return "";
  const needsQuotes =
    /["\n\r,;\t|]/.test(value) || value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Rows out to CSV text.
 *
 * Leads with a BOM by default, because the file is going straight back into
 * Excel and without one Excel reads UTF-8 as Windows-1252 — which turns ₦ into
 * mojibake in a file about salaries. `parseCsv` strips it again on the way back.
 */
export function toCsv(
  headers: string[],
  rows: readonly CsvRow[],
  options: { bom?: boolean } = {},
): string {
  const { bom = true } = options;
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((heading) => csvCell(row[heading] ?? "")).join(","));
  }
  /* CRLF, which is what every spreadsheet on Windows expects. */
  return `${bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}

/**
 * Hand a CSV to the browser as a download.
 *
 * Client-only: it touches `document`. Kept here beside `toCsv` because every
 * caller that builds one immediately wants to save it, and a second helper file
 * for six lines would be worse.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked on the next tick rather than immediately: Safari has cancelled the
     download when the URL disappears in the same frame as the click. */
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
