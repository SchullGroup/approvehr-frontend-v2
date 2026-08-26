/**
 * A minimal .xlsx reader and writer, written rather than installed.
 *
 * Same reasoning as `lib/csv.ts`, which this sits beside: the job is a ZIP
 * container and two well-known XML parts, it is about 300 lines, and the
 * interesting half is what a real spreadsheet does to a naive implementation.
 * The alternative was a dependency, and HANDOVER.md records five CI failures
 * caused by invented dependency ranges — so a range that has to be right, in a
 * file that only needs `TextEncoder` and the platform's own inflate, was the
 * worse trade.
 *
 * ## Why we need it at all
 *
 * The import offers an Excel template. Handing somebody a .xlsx and then
 * refusing to read the file they fill in would be a trap, so both directions
 * exist here or neither does.
 *
 * ## What it does not do
 *
 * No formulas, no styling beyond bold and a text format, no charts, one shared
 * string table on the way in and none on the way out. It reads the *values* a
 * sheet holds and writes cells; anything else in the file is skipped rather than
 * being an error, because a customer's file will contain things we do not need
 * and refusing it over a pivot table would be absurd.
 *
 * ## The three things that were got wrong first
 *
 * - **Cells are sparse.** A row with nothing in column C has no `<c r="C4">` at
 *   all — it is not an empty element. Reading cells positionally rather than by
 *   their `r` reference shifts every value after the gap into the wrong column,
 *   which in a payroll import puts somebody's account number in their TIN.
 * - **Dates are numbers.** `28/04/2021` in a General-formatted column is stored
 *   as `44314`, and only the cell's number format says it is a date. Without
 *   that lookup the importer sees a five-digit integer and says so, which is a
 *   correct message about a file we generated ourselves. Hence `isDateStyle`.
 * - **Numbers are lossy.** `0803...` in a numeric cell has already lost its
 *   leading zero before we see it, and 10-digit NUBANs get rendered as
 *   `9.4776E+09`. Nothing here can recover that, which is why the template we
 *   write formats every column as text: the fix is upstream of the file.
 */

/* --------------------------------------------------------------------- crc32 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ (bytes[i] as number)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------- writing */

const encoder = new TextEncoder();

type ZipEntry = { name: string; bytes: Uint8Array };

/**
 * A ZIP with every entry **stored**, not deflated.
 *
 * Method 0 is part of the format and every spreadsheet application reads it.
 * The cost is size — a template is a few kilobytes either way — and what it buys
 * is that this file needs no compressor, so it behaves identically in a browser,
 * in Node, and in the verification script, with no stream plumbing.
 *
 * Timestamps are fixed at 1980-01-01 rather than `now`, so writing the same
 * template twice produces byte-identical files. A template that differs on
 * every download is one nobody can diff or cache.
 */
function zip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); /* version needed */
    localView.setUint16(6, 0, true); /* flags */
    localView.setUint16(8, 0, true); /* stored */
    localView.setUint16(10, 0, true); /* time */
    localView.setUint16(12, 0x0021, true); /* date: 1980-01-01 */
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);

    chunks.push(local, entry.bytes);

    const dir = new Uint8Array(46 + name.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(4, 20, true);
    dirView.setUint16(6, 20, true);
    dirView.setUint16(8, 0, true);
    dirView.setUint16(10, 0, true);
    dirView.setUint16(12, 0, true);
    dirView.setUint16(14, 0x0021, true);
    dirView.setUint32(16, crc, true);
    dirView.setUint32(20, size, true);
    dirView.setUint32(24, size, true);
    dirView.setUint16(28, name.length, true);
    dirView.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + size;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total =
    chunks.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...chunks, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** XML text. The five predefined entities and nothing clever. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0 → A, 25 → Z, 26 → AA. Spreadsheet columns are base-26 with no zero. */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** 0 → 0, "A" → 0, "AA" → 26. The inverse, for reading a cell reference. */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

export type SheetSpec = {
  /** Tab name. Excel refuses `[]*?/\:` and anything over 31 characters. */
  name: string;
  /** Rows of cells. Everything is written as text — see the header. */
  rows: readonly (readonly string[])[];
  /** Rows to render bold, by index. The header row, normally. */
  boldRows?: readonly number[];
  /** Column widths in characters, in order. Missing ones get a default. */
  widths?: readonly number[];
  /** Freeze the first row so a long file keeps its headings on screen. */
  freezeFirstRow?: boolean;
  /**
   * Present but not shown in the tab bar.
   *
   * For a sheet that exists only to hold the option lists a dropdown points
   * at — nobody fills it in, and Excel refuses a validation whose source
   * range is on a sheet that has been deleted, so it has to exist somewhere.
   * Hidden rather than a card in the guide sheet, because the guide already
   * says which values are accepted in prose; this is the machine's copy of
   * the same list, not a second explanation for a person to read.
   */
  hidden?: boolean;
  /**
   * Dropdown cells on this sheet, each pointing at a column of options on
   * another sheet rather than an inline list.
   *
   * A `formula1="\"A,B,C\""` inline list is capped at 255 characters by
   * Excel itself, and the 37 Nigerian states alone are past that — so every
   * dropdown here is a range reference, which has no such limit and is the
   * form Excel itself writes when a person builds one by hand.
   */
  validations?: readonly {
    /** 0-based column index on *this* sheet that gets the dropdown. */
    column: number;
    /** The sheet the option list lives on. */
    optionsSheet: string;
    /** How many options that sheet's column holds, starting at its row 1. */
    optionCount: number;
    /** 0-based column index on the options sheet. Defaults to the same column. */
    optionsColumn?: number;
    /** Last data row the dropdown applies to. A generous ceiling, not a count. */
    lastRow?: number;
  }[];
};

const SHEET_NAME_LIMIT = 31;

/** Excel's own rules, applied here rather than discovered on opening the file. */
const safeSheetName = (name: string): string =>
  name.replace(/[[\]*?/\\:]/g, " ").slice(0, SHEET_NAME_LIMIT) || "Sheet";

function sheetXml(sheet: SheetSpec): string {
  const bold = new Set(sheet.boldRows ?? []);
  const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 1);

  const cols = Array.from({ length: width }, (_, index) => {
    const characters = sheet.widths?.[index] ?? 18;
    /* `s="2"` is the text format. Applied to the whole column so that anything
       typed into it later stays as typed: a NUBAN keeps its leading zero and a
       date stays `28/04/2021` instead of becoming the number 44314. */
    return `<col min="${index + 1}" max="${index + 1}" width="${characters}" customWidth="1" style="2"/>`;
  }).join("");

  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const number = rowIndex + 1;
      const style = bold.has(rowIndex) ? ' s="1"' : ' s="2"';
      const written = cells
        .map((value, columnIdx) => {
          if (value === "") return "";
          const reference = `${columnName(columnIdx)}${number}`;
          const space = value !== value.trim() ? ' xml:space="preserve"' : "";
          return `<c r="${reference}" t="inlineStr"${style}><is><t${space}>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${number}">${written}</row>`;
    })
    .join("");

  const view = sheet.freezeFirstRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : "";

  const validations = dataValidationsXml(sheet.validations);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(width - 1)}${Math.max(1, sheet.rows.length)}"/>${view}<cols>${cols}</cols><sheetData>${rows}</sheetData>${validations}</worksheet>`;
}

/** A sheet reference for a formula. Always quoted — cheap, and never wrong. */
const sheetRef = (name: string): string => `'${name.replace(/'/g, "''")}'`;

/**
 * `<dataValidations>`, one `<dataValidation>` per dropdown column.
 *
 * Every one is a range reference to another sheet's column, never an inline
 * `formula1="\"A,B,C\""` list — Excel caps an inline list at 255 characters,
 * which the 37 Nigerian states alone exceed. A range has no such limit and is
 * the form Excel itself writes when a person builds a dropdown by hand.
 *
 * The range covers rows 2 to `lastRow` (default a few thousand): the header
 * row is never validated, and the ceiling is generous rather than counted,
 * because nobody has told us how many rows somebody will eventually paste in.
 */
function dataValidationsXml(
  validations: SheetSpec["validations"],
): string {
  if (!validations || validations.length === 0) return "";
  const entries = validations
    .map((v) => {
      const optionsCol = columnName(v.optionsColumn ?? v.column);
      const lastRow = v.lastRow ?? 5000;
      const sqref = `${columnName(v.column)}2:${columnName(v.column)}${lastRow}`;
      const source = `${sheetRef(v.optionsSheet)}!$${optionsCol}$1:$${optionsCol}$${v.optionCount}`;
      return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${sqref}"><formula1>${escapeXml(source)}</formula1></dataValidation>`;
    })
    .join("");
  return `<dataValidations count="${validations.length}">${entries}</dataValidations>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/**
 * A workbook, as bytes.
 *
 * Every cell is an inline string. There is no shared string table on purpose:
 * it is an optimisation for repeated values in a large file, and this writes
 * templates measured in dozens of rows.
 */
export function writeXlsx(sheets: readonly SheetSpec[]): Uint8Array {
  const named = sheets.map((sheet, index) => ({
    ...sheet,
    name: safeSheetName(sheet.name || `Sheet${index + 1}`),
  }));

  const overrides = named
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");

  const sheetTags = named
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}"${sheet.hidden ? ' state="hidden"' : ""} r:id="rId${index + 1}"/>`,
    )
    .join("");

  const sheetRels = named
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");

  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      bytes: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      bytes: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      bytes: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      bytes: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: "xl/styles.xml", bytes: encoder.encode(STYLES_XML) },
    ...named.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      bytes: encoder.encode(sheetXml(sheet)),
    })),
  ];

  return zip(entries);
}

/**
 * Hand a workbook to the browser as a download.
 *
 * Client-only — it touches `document` — and kept beside the writer for the same
 * reason `downloadCsv` lives beside `toCsv`.
 */
export function downloadXlsx(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked next tick: Safari cancels a download whose URL disappears in the
     same frame as the click. Same note as `downloadCsv`. */
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------- reading */

const decoder = new TextDecoder();

type ArchiveEntry = { method: number; start: number; length: number };

/**
 * The central directory, read backwards from the end-of-directory record.
 *
 * Backwards because that is the only way: a ZIP's index is at the end, which is
 * what lets one be written as a stream. The comment field means the record is
 * not necessarily the last 22 bytes, so it is searched for.
 */
function readArchive(bytes: Uint8Array): Map<string, ArchiveEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");

  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries = new Map<string, ArchiveEntry>();

  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );

    /* The local header repeats the name and may carry a different extra field,
       so the data offset has to be measured there rather than assumed. */
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;

    entries.set(name, { method, start, length: compressed });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readPart(
  bytes: Uint8Array,
  entries: Map<string, ArchiveEntry>,
  name: string,
): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const raw = bytes.subarray(entry.start, entry.start + entry.length);
  if (entry.method === 0) return decoder.decode(raw);
  if (entry.method === 8) return decoder.decode(await inflate(raw));
  throw new Error(`unsupported compression ${entry.method}`);
}

/** XML text back to a string. Numeric references included, since Excel writes them. */
export function unescapeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    const named: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
    };
    return named[code] ?? whole;
  });
}

/** Every `<t>` inside one element, joined. Rich text is runs of them. */
function textOf(xml: string): string {
  const parts = xml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? [];
  return parts
    .map((part) => unescapeXml(part.replace(/^<t(?:\s[^>]*)?>/, "").replace(/<\/t>$/, "")))
    .join("");
}

/** The shared string table, in order. `t="s"` cells index into it. */
function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const items = xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>|<si\s*\/>/g) ?? [];
  return items.map((item) => textOf(item));
}

/**
 * Which cell styles mean "this number is a date".
 *
 * 14–22 and 45–47 are the built-in date and time formats. Anything custom
 * (numFmtId 164 and up) is judged by its format code: a `y`, `d`, or a month
 * `m` makes it a date. Literal text inside a format is quoted or escaped, and
 * is stripped first so a format like `"Day "0` is not read as a date.
 */
function readDateStyles(xml: string | null): Set<number> {
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;

  const custom = new Map<number, string>();
  for (const match of xml.matchAll(
    /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g,
  )) {
    custom.set(Number(match[1]), unescapeXml(match[2] ?? ""));
  }

  const builtInDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47);
  const customIsDate = (code: string) => {
    const bare = code.replace(/"[^"]*"/g, "").replace(/\\./g, "");
    return /[yd]/i.test(bare) || /m{3,}/i.test(bare) || /\bm\b/i.test(bare);
  };

  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const xfs = cellXfs.match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) ?? [];
  xfs.forEach((xf, index) => {
    const id = Number(/numFmtId="(\d+)"/.exec(xf)?.[1] ?? "0");
    const code = custom.get(id);
    if (builtInDate(id) || (code !== undefined && customIsDate(code))) {
      dateStyles.add(index);
    }
  });
  return dateStyles;
}

/**
 * A spreadsheet serial number to `YYYY-MM-DD`.
 *
 * Day 1 is 1 January 1900 and the format believes 1900 was a leap year, so
 * serials above 60 are one day ahead of reality — which is why the epoch below
 * is 30 December 1899 rather than the 31st. Serials of 60 or less are before
 * that fiction and are returned as the raw number instead of being silently
 * shifted a day: nobody's employment dates are in February 1900, and a wrong
 * date is worse than a number somebody has to look at.
 */
export function serialToDate(serial: number, date1904: boolean): string | null {
  if (!date1904 && serial <= 60) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const whole = Math.floor(serial);
  const date = new Date(epoch + whole * 86_400_000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export type XlsxSheet = {
  name: string;
  /** Rows of strings, rectangular, in the sheet's own order. */
  grid: string[][];
  /** Absent from the tab bar — Excel still opens it, just does not show it. */
  hidden: boolean;
  /** Every dropdown cell on this sheet, by the column it sits in. */
  dataValidations: readonly { column: number; source: string }[];
};

export type XlsxFile = {
  sheets: XlsxSheet[];
  /** Anything worth telling the user about how we read it. */
  notes: string[];
};

/**
 * Read a workbook's values.
 *
 * Every sheet, because a customer's staff list is not reliably the first tab —
 * the caller picks. Values only: formulas come back as their cached result,
 * which is what the file says the answer is.
 */
export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<XlsxFile> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = readArchive(bytes);

  const workbook = await readPart(bytes, entries, "xl/workbook.xml");
  if (!workbook) throw new Error("no workbook");

  const rels = await readPart(bytes, entries, "xl/_rels/workbook.xml.rels");
  const shared = readSharedStrings(
    await readPart(bytes, entries, "xl/sharedStrings.xml"),
  );
  const dateStyles = readDateStyles(await readPart(bytes, entries, "xl/styles.xml"));
  const date1904 = /date1904="(1|true)"/.test(workbook);

  /* Sheet name to part path, through the relationship id. Sheets are not
     reliably `sheet1.xml`, `sheet2.xml` — a file that has had a tab deleted
     keeps the old numbering, and reading by position opens the wrong one. */
  const targets = new Map<string, string>();
  for (const match of (rels ?? "").matchAll(/<Relationship\b[^>]*\/>/g)) {
    const tag = match[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ""));
  }

  const notes: string[] = [];
  const sheets: XlsxSheet[] = [];

  for (const match of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = match[0];
    const name = unescapeXml(/name="([^"]*)"/.exec(tag)?.[1] ?? "Sheet");
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    const target = rid ? targets.get(rid) : undefined;
    const xml = target ? await readPart(bytes, entries, `xl/${target}`) : null;
    if (!xml) continue;
    sheets.push({
      name,
      grid: gridOf(xml, shared, dateStyles, date1904, notes),
      hidden: /state="hidden"/.test(tag),
      dataValidations: dataValidationsOf(xml),
    });
  }

  if (sheets.length === 0) throw new Error("no sheets");
  return { sheets, notes };
}

/**
 * Every `<dataValidation>` on a sheet, read back for the round trip a test
 * needs — the column it sits in, and the source range as written.
 *
 * Only the first column of `sqref` is kept: this reader only ever has to
 * recognise what this writer produces, and every dropdown here is written
 * against exactly one column.
 */
function dataValidationsOf(
  xml: string,
): { column: number; source: string }[] {
  const found: { column: number; source: string }[] = [];
  for (const match of xml.matchAll(
    /<dataValidation\b([^>]*)>\s*<formula1>([\s\S]*?)<\/formula1>/g,
  )) {
    const attributes = match[1] ?? "";
    const sqref = /sqref="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const letters = /^([A-Za-z]+)/.exec(sqref)?.[1];
    if (!letters) continue;
    found.push({
      column: columnIndex(letters),
      source: unescapeXml(match[2] ?? ""),
    });
  }
  return found;
}

/** One worksheet's XML to a rectangular grid of strings. */
function gridOf(
  xml: string,
  shared: readonly string[],
  dateStyles: ReadonlySet<number>,
  date1904: boolean,
  notes: string[],
): string[][] {
  const rows = new Map<number, Map<number, string>>();
  let widest = 0;
  let convertedDates = 0;

  for (const rowMatch of xml.matchAll(
    /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g,
  )) {
    const attributes = rowMatch[1] ?? rowMatch[3] ?? "";
    const body = rowMatch[2] ?? "";
    const declared = Number(/\br="(\d+)"/.exec(attributes)?.[1] ?? "0");
    const rowNumber = declared > 0 ? declared : rows.size + 1;
    const cells = new Map<number, string>();

    for (const cellMatch of body.matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g,
    )) {
      const cellAttributes = cellMatch[1] ?? cellMatch[3] ?? "";
      const inner = cellMatch[2] ?? "";
      const reference = /\br="([A-Za-z]+)(\d+)"/.exec(cellAttributes);
      if (!reference) continue;
      const column = columnIndex(reference[1] as string);

      const type = /\bt="([^"]+)"/.exec(cellAttributes)?.[1] ?? "n";
      const style = Number(/\bs="(\d+)"/.exec(cellAttributes)?.[1] ?? "-1");
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];

      let value = "";
      if (type === "s") {
        value = shared[Number(raw ?? "-1")] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(inner);
      } else if (type === "str") {
        value = unescapeXml(raw ?? "");
      } else if (type === "b") {
        value = raw === "1" ? "true" : "false";
      } else if (type === "e") {
        /* `#REF!` and friends. Kept verbatim: the cell really does say that, and
           blanking it would hide a broken formula in a salary column. */
        value = unescapeXml(raw ?? "");
      } else if (raw !== undefined && raw !== "") {
        const numeric = Number(raw);
        const asDate =
          dateStyles.has(style) && Number.isFinite(numeric)
            ? serialToDate(numeric, date1904)
            : null;
        if (asDate) {
          value = asDate;
          convertedDates += 1;
        } else {
          value = unescapeXml(raw);
        }
      }

      if (value !== "") cells.set(column, value);
      if (column + 1 > widest) widest = column + 1;
    }
    rows.set(rowNumber, cells);
  }

  if (convertedDates > 0) {
    notes.push(
      `${convertedDates} ${convertedDates === 1 ? "cell was" : "cells were"} stored as a date rather than as text. We read ${convertedDates === 1 ? "it" : "them"} as the date the spreadsheet shows.`,
    );
  }

  const highest = Math.max(0, ...rows.keys());
  const grid: string[][] = [];
  for (let number = 1; number <= highest; number += 1) {
    const cells = rows.get(number);
    const row: string[] = [];
    for (let column = 0; column < widest; column += 1) {
      row.push(cells?.get(column) ?? "");
    }
    grid.push(row);
  }
  return grid;
}

/** True for a file extension this module can read. */
export const isXlsxName = (name: string): boolean => /\.xlsx$/i.test(name);
