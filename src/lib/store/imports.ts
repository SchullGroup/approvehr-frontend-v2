"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  imports as api,
  type ApiApplyExtras,
  type ApiDuplicateCounts,
  type ApiDuplicateDecision,
  type ApiDuplicateMatch,
  type ApiImportBatch,
  type ApiImportTemplate,
  type ApiMissingField,
  type ApiRowReport,
  type ImportRow,
} from "@/lib/api/imports";
import {
  downloadCsv,
  fileFromRecords,
  parseCsv,
  toCsv,
  type CsvFile,
  type CsvRow,
} from "@/lib/csv";
import { checkMappedRows } from "@/lib/imports/check";
import { EMPLOYEES, MAX_ROWS_PER_BATCH } from "@/lib/imports/employees";
import {
  guessMapping,
  ignoredHeadings,
  isMappingReady,
  mapRows,
  reverseHeadings,
  type Mapping,
} from "@/lib/imports/mapping";
import type { Dictionary } from "@/lib/imports/spec";
import {
  buildTemplateFiles,
  columnsFromApi,
  columnsFromDictionary,
  type TemplateColumn,
} from "@/lib/imports/template-file";
import { downloadXlsx, isXlsxName, readXlsx } from "@/lib/xlsx";
import { useSession } from "./session";

/**
 * The import, end to end.
 *
 * Four steps, and the whole point is that nobody uploads 500 salaries blind:
 * choose a file, match its columns, **check**, then confirm what will happen in
 * numbers. Everything below serves the third step, because that is the one that
 * makes the fourth safe.
 *
 * ## The file is split, and the split is measured rather than guessed
 *
 * The API takes rows as JSON, and `express.json` is capped at 100kb — which a
 * fully populated employee file reaches somewhere around 250 rows. Guessing a
 * row count would mean either wasting requests on thin files or 413ing on fat
 * ones, so `planParts` measures the rows it actually has and fits each part
 * under a byte budget. A 413 anyway — one part of unusually long values — halves
 * that part and retries, so the ceiling is discovered rather than assumed.
 *
 * Every part is its own validate/apply pair with its own honest counts, and the
 * screen aggregates them into one set of numbers. A 10,000-row file is a normal
 * case, not an error case.
 *
 * ## Row numbers are the file's, always
 *
 * The API numbers rows inside the part it was given, so part three's first row
 * is its row 1. Every number is rebased here to the row the spreadsheet shows,
 * because "row 43" that is not row 43 in Excel is worse than no row number.
 *
 * ## Columns are named as the file named them
 *
 * We post the template's headings (see `lib/imports/mapping.ts`), so the API's
 * problems name *our* column. `translate` puts their own heading back — a person
 * told to fix `gross_monthly` in a file whose column is called `salary` has been
 * given a puzzle instead of an instruction.
 *
 * ## Demo mode
 *
 * Choosing and matching work offline; they are file work. Checking and importing
 * do not, and they say so instead of pretending — the check falls back to what
 * the browser can settle from the file alone (`lib/imports/check.ts`) and the
 * import refuses. Writing 500 employees into localStorage would demo a product
 * we are not selling.
 *
 * ## One hook, many entities
 *
 * `useImport(dictionary)` is the whole flow and knows nothing about employees.
 * Everything entity-specific — the columns, which of them are dates, the words
 * for one row, the URL segment — comes off the dictionary, so a second
 * importable entity is `useImport(THAT_DICTIONARY)` and no new store.
 * `useEmployeeImport()` is the binding for the one that exists.
 */

/* --------------------------------------------------------------- the pieces */

/** How much JSON we let one part carry. Under the API's 100kb, with headroom
 *  for the envelope, the filename and UTF-8 characters that cost three bytes. */
const BODY_BUDGET_BYTES = 70_000;

/** Never more than this, whatever the measurement says. Matches the API's cap. */
const MAX_PART_ROWS = MAX_ROWS_PER_BATCH;

/** Below this a part is not worth splitting further; something else is wrong. */
const MIN_PART_ROWS = 5;

/**
 * The entity-specific counts an apply response may carry.
 *
 * Derived from `ApiApplyExtras` by the compiler rather than written twice, so a
 * fourth entity adding a count to that type gets summed here without anybody
 * remembering to. The list is what the loop reads; which of them a screen shows
 * is `ImportSurface.linkedStats`.
 */
const EXTRA_KEYS = [
  "managersLinked",
  "handedOver",
  "kindsAdded",
  "parentsLinked",
  "headsSet",
] as const satisfies readonly (keyof ApiApplyExtras)[];

export type LoadedFile = {
  name: string;
  size: number;
  csv: CsvFile;
};

export type Severity = "error" | "warning";

/** One problem, with the file's own column name and the file's own row number. */
export type RowProblem = {
  row: number;
  column: string;
  /**
   * Our canonical field, as against `column`, which is their heading.
   *
   * Both are needed and for different readers. `column` is what the person sees
   * — telling somebody the problem is in `taxState` when their spreadsheet says
   * "State of Tax" is unhelpful. `field` is what a fix has to be written back
   * to, and without it the report can only describe a problem, never mend one.
   *
   * That was the gap: the only route out of a failed row was to download the
   * rejects, edit them in a spreadsheet and upload again.
   */
  field: string;
  value: string | null;
  problem: string;
  severity: Severity;
};

/** One row's verdict, flattened so a table can render it without branching. */
export type RowLine = {
  row: number;
  employeeNo: string | null;
  name: string | null;
  action: "create" | "update" | "skip";
  problems: RowProblem[];
  /** Somebody on file this row looks like. The caller decides, not us. */
  duplicate: ApiDuplicateMatch | null;
  /** Recommended fields left empty. Flagged, never blocking. */
  missing: ApiMissingField[];
  /** True when the staff number was generated because the file had none. */
  employeeNoGenerated: boolean;
};

/**
 * One validated part: the rows it covered, and the batch it belongs to.
 *
 * `rowNumbers` rather than a from/to span, because the rows a part carries are
 * not always contiguous. Re-submitting only the three rows that failed sends
 * rows 12, 47 and 300 in one request, and every row number the report shows has
 * to stay the number Excel shows — a report that renumbered them to 1, 2, 3
 * would be worse than no row numbers at all.
 */
export type CheckedPart = {
  index: number;
  batchId: string;
  /** File row numbers, in the order they were sent. */
  rowNumbers: number[];
};

export type CheckOutcome = {
  filename: string;
  /** Rows in the file. */
  totalRows: number;
  /** Rows actually sent to be checked, which is fewer after a re-submission. */
  rowsChecked: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  /** Only the rows with something to say. The clean ones are the file. */
  problems: RowLine[];
  notes: string[];
  /**
   * Named things the file refers to that do not exist yet, by kind.
   *
   * `{ departments: [...], salaryGrades: [...] }` for employees. A map rather
   * than named fields because what a row can refer to is the entity's business;
   * the screen renders one callout per key from its own surface descriptor.
   */
  missing: Record<string, string[]>;
  parts: CheckedPart[];
  /** Rows that look like somebody on file, split by what has been decided. */
  duplicates: ApiDuplicateCounts;
  /** People who would import with a recommended field empty. */
  flagged: number;
  /**
   * A company-level fact: the organisation has no PAYE state of its own, and
   * at least one row in this file had no `tax_state` cell to fall back from
   * it either. Every such row fails identically, so the screen says so once,
   * with a link to the one place it is fixed, instead of repeating the same
   * sentence per row.
   */
  missingOrgTaxState: boolean;
  /**
   * How many corrections had been made when this check ran.
   *
   * The comparison against the live count is what tells the screen whether the
   * report in front of somebody still describes the rows that would be sent. A
   * fix typed after a check is a fix the API has not seen, and confirming on the
   * strength of the old report would import the unmended row while the screen
   * showed it as mended.
   */
  fixCount: number;
  /**
   * False when this was the browser's own file check.
   *
   * The screen must say so: an unauthoritative check cannot know who is new,
   * which departments exist, or whether pay fits its grade.
   */
  authoritative: boolean;
};

export type ApplyOutcome = {
  created: number;
  updated: number;
  skipped: number;
  /**
   * Counts only this entity's writer could report, summed over the parts.
   *
   * `managersLinked` for people; `handedOver` and `kindsAdded` for equipment. A
   * map because the driver spreads an entity's own counts flat onto the response
   * and the screen renders whichever ones its surface names — and a key that no
   * part reported stays **absent** rather than summing to zero, because zero
   * handovers on an employee import is not a fact, it is a question nobody
   * asked.
   */
  extras: Record<string, number>;
  notes: string[];
  /** The rows that did not land, with the reason. */
  problems: RowLine[];
  /** File row numbers that were not imported, for the download. */
  notImported: number[];
  partsApplied: number;
  partsTotal: number;
  /** Set when a part did not go through at all. Named, never rounded away. */
  failure: { part: number; message: string } | null;
};

export type Progress = { label: string; done: number; total: number };

/* ------------------------------------------------------------------ helpers */

const encoder = new TextEncoder();

/**
 * Row spans that each fit the body budget.
 *
 * Measured on a sample rather than the whole file: 200 rows is plenty to size an
 * average and stringifying 10,000 twice is not. Returns spans of row indexes,
 * not the rows themselves, because validate and apply must send byte-identical
 * parts — the API fingerprints what it checked and refuses anything else.
 */
export function planParts(rows: readonly ImportRow[]): { start: number; end: number }[] {
  if (rows.length === 0) return [];

  const sample = rows.slice(0, 200);
  const bytes = sample.reduce(
    (total, row) => total + encoder.encode(JSON.stringify(row)).length + 1,
    0,
  );
  const average = Math.max(1, Math.ceil(bytes / sample.length));
  const perPart = Math.min(
    MAX_PART_ROWS,
    Math.max(MIN_PART_ROWS, Math.floor(BODY_BUDGET_BYTES / average)),
  );

  const parts: { start: number; end: number }[] = [];
  for (let start = 0; start < rows.length; start += perPart) {
    parts.push({ start, end: Math.min(rows.length, start + perPart) });
  }
  return parts;
}

/**
 * The API's per-part row numbers to the file's, and its columns to theirs.
 *
 * `rowNumbers` is the part's own list, so `report.row` — 1-based within what was
 * sent — is an index into it. A part is not necessarily a contiguous span: after
 * a partial import somebody re-submits the three rows that failed, and those
 * rows keep the numbers their spreadsheet shows.
 */
function translate(
  report: ApiRowReport,
  rowNumbers: readonly number[],
  columns: Record<string, string>,
): RowLine {
  const fileRow = (sentRow: number): number => rowNumbers[sentRow - 1] ?? sentRow;
  const problem = (
    issue: { row: number; column: string; value: string | null; problem: string },
    severity: Severity,
  ): RowProblem => ({
    row: fileRow(issue.row),
    column: columns[issue.column] ?? issue.column,
    /* `issue.column` is already our canonical name; `columns` is what turns it
       back into their heading. So the field a fix writes to is free here. */
    field: issue.column,
    value: issue.value,
    problem: issue.problem,
    severity,
  });

  return {
    row: fileRow(report.row),
    employeeNo: report.employeeNo,
    name: report.name,
    action: report.action,
    problems: [
      ...report.errors.map((issue) => problem(issue, "error")),
      ...report.warnings.map((issue) => problem(issue, "warning")),
    ],
    duplicate: report.duplicate,
    missing: report.missing,
    employeeNoGenerated: report.employeeNoGenerated,
  };
}


/**
 * The decisions that belong to one part, renumbered to that part's own rows.
 *
 * The API numbers the rows it was handed from 1, so a decision about file row
 * 300 has to arrive as row 4 of the part that carries it. Getting this wrong
 * would apply an answer about one person to another one, which is why it is a
 * named function with the arithmetic in one place rather than inline.
 */
function decisionsFor(
  rowNumbers: readonly number[],
  decisions: Readonly<Record<number, "skip" | "update">>,
): ApiDuplicateDecision[] {
  const list: ApiDuplicateDecision[] = [];
  rowNumbers.forEach((number, index) => {
    const action = decisions[number];
    if (action) list.push({ row: index + 1, action });
  });
  return list;
}

/**
 * Lays the person's corrections back over freshly mapped rows.
 *
 * Keys are `row:field`, where `row` is the file's own 1-based row number. The
 * mapped array is 0-based over the same rows, so the index is `row - 1`. A key
 * naming a row the file no longer has is skipped rather than trusted — the file
 * can be swapped underneath a stale fix, and guessing would write somebody
 * else's correction onto this person.
 *
 * Returns the same array it was given, mutated. The caller has just built it and
 * nothing else holds a reference, so copying up to 10,000 rows to be tidy would
 * cost real memory for no safety.
 */
function applyFixes(
  rows: ImportRow[],
  fixes: Record<string, string>,
): ImportRow[] {
  for (const [key, value] of Object.entries(fixes)) {
    const separator = key.indexOf(":");
    if (separator < 0) continue;

    const row = Number(key.slice(0, separator));
    const field = key.slice(separator + 1);
    if (!Number.isInteger(row) || field === "") continue;

    const target = rows[row - 1];
    if (!target) continue;

    (target as unknown as Record<string, string | null>)[field] = value;
  }
  return rows;
}

const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "Something went wrong. Nothing was imported.";

/* --------------------------------------------------------------------- hook */

export function useImport(dictionary: Dictionary<string>) {
  const { isConnected } = useSession();

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [check, setCheck] = useState<CheckOutcome | null>(null);
  const [result, setResult] = useState<ApplyOutcome | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<ApiImportTemplate | null>(null);

  /* The mapped rows, kept out of state on purpose: they are up to 10,000
     objects, nothing renders them directly, and a re-render per part while
     importing would copy the lot. */
  const mapped = useRef<ImportRow[]>([]);

  /**
   * Cells the person has corrected here rather than in their spreadsheet.
   *
   * Keyed `row:field`. Small by nature — it holds the handful of cells a report
   * complained about, not the file — so unlike `mapped` it is safe in state, and
   * it needs to be in state because the inputs rendering it must re-render.
   *
   * This is the **only** home for a correction, and that is load-bearing.
   *
   * The obvious implementation writes the mended value into `mapped.current`.
   * It does not work: `runCheck` rebuilds that array with
   * `mapRows(file.csv.rows, mapping)` on every run, so an in-place write is
   * discarded by the very next check. The person would type a correction, press
   * check, and watch the same error come back — a fix that looks applied and is
   * not, which is worse than no fix button at all.
   *
   * So corrections live here and `runCheck` re-applies them after mapping. The
   * raw file stays the raw file, and re-running is idempotent.
   */
  const [fixes, setFixes] = useState<Record<string, string>>({});

  /**
   * Records a correction to one cell.
   *
   * `row` is the file's own 1-based row number, as reported. `translate` builds
   * that as `report.row + start`, where `start` is the slice's index into the
   * mapped rows and `report.row` is 1-based within the slice — so the index
   * back into the mapped rows is `row - 1`. That arithmetic is applied in
   * `applyFixes` rather than here, in one place, because writing a correction
   * onto the wrong person's row would be the worst possible outcome of a
   * feature meant to prevent bad data.
   */
  const fixCell = useCallback((row: number, field: string, value: string) => {
    const trimmed = value.trim();

    setFixes((prior) => {
      const key = `${row}:${field}`;
      if (trimmed === "") {
        /* Clearing a correction is not the same as correcting to empty: drop it
           from the record so the count reflects real fixes. */
        if (!(key in prior)) return prior;
        const rest = { ...prior };
        delete rest[key];
        return rest;
      }
      return { ...prior, [key]: trimmed };
    });
  }, []);

  /**
   * What to do about a row that looks like somebody already on file.
   *
   * Keyed by the file's own row number, and sent as part of the check — the API
   * folds the decisions into the fingerprint, so a batch checked with "skip" and
   * applied with "update" is refused rather than quietly landing the other one.
   *
   * Every duplicate row gets an entry here — `update`, by default, the moment
   * the check reveals it (see the seeding effect in `CheckReport`). There is
   * no "undecided" state any more: the customer's job is to opt specific
   * people OUT, not to answer for every one of them, which is what made this
   * screen one click per row instead of one click for the file. A row is only
   * ever absent from this map before its first check, or after `chooseFile`
   * clears it for a new one.
   */
  const [decisions, setDecisions] = useState<Record<number, "skip" | "update">>({});

  const decide = useCallback((row: number, action: "skip" | "update") => {
    setDecisions((prior) => ({ ...prior, [row]: action }));
  }, []);

  /** The same answer for every row given — the "select all" / "clear all" action. */
  const decideAll = useCallback(
    (rows: readonly number[], action: "skip" | "update") => {
      setDecisions((prior) => {
        const next = { ...prior };
        for (const row of rows) next[row] = action;
        return next;
      });
    },
    [],
  );

  /**
   * Fills in "update" for rows a person has not touched, without disturbing
   * one they have. Called once a check reveals which rows are duplicates, so
   * the default is "update" from the first render of the report rather than
   * a blank the customer has to fill in themselves — and called again after
   * every recheck, where it is a no-op for rows already decided and a fresh
   * default for any new duplicate the recheck turned up.
   */
  const seedDecisions = useCallback((rows: readonly number[]) => {
    setDecisions((prior) => {
      let changed = false;
      const next = { ...prior };
      for (const row of rows) {
        if (!(row in next)) {
          next[row] = "update";
          changed = true;
        }
      }
      return changed ? next : prior;
    });
  }, []);

  /**
   * Whether the flagged list has been read.
   *
   * Not a formality. The list is people who will be in the directory with
   * something payroll needs missing, and the alternative to an acknowledgement
   * is a warning nobody has to look at — which for the two hundredth row of a
   * five hundred row file is the same as no warning at all.
   */
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledge = useCallback((value: boolean) => setAcknowledged(value), []);

  /**
   * Which of the file's rows to send, by row number, or null for all of them.
   *
   * Set after a partial import so the second attempt carries only the rows that
   * did not land. Row *numbers* rather than a new file, because everything the
   * report says is addressed by the number the spreadsheet shows and rebuilding
   * a smaller file would renumber them.
   */
  const [selection, setSelection] = useState<number[] | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    void api
      .template(dictionary.slug, controller.signal)
      .then(setTemplate)
      .catch(() => {
        /* The compiled-in copy covers it. Not worth a message. */
      });
    return () => controller.abort();
  }, [dictionary.slug, isConnected]);

  /**
   * Reads and parses the file. Everything downstream resets.
   *
   * Answers whether it worked, so the screen can move to the next step without
   * waiting a render for state it just set.
   */
  const chooseFile = useCallback(async (chosen: File): Promise<boolean> => {
    setError(null);
    setCheck(null);
    setResult(null);
    /* Corrections, answers and any re-submission belong to the file that needed
       them. Carrying them into a new upload would write one spreadsheet's fixes
       onto another's rows. */
    setFixes({});
    setDecisions({});
    setAcknowledged(false);
    setSelection(null);
    mapped.current = [];

    if (chosen.size > 25_000_000) {
      setError(
        "That file is bigger than 25MB. Split it in two and import each half — each one reports its own numbers.",
      );
      return false;
    }

    /* The older binary formats, and the two that are not spreadsheets we can
       open. `.xls` is a completely different container from `.xlsx` and `.numbers`
       is a package; both convert in one menu item, and the message says which. */
    if (/\.(xls|xlsm|xlsb|numbers|ods)$/i.test(chosen.name)) {
      setError(
        "We can read .xlsx and .csv. In Excel or Numbers: File, then Save As or Export, and choose Excel Workbook (.xlsx) or CSV — then upload that.",
      );
      return false;
    }

    let csv: CsvFile;
    if (isXlsxName(chosen.name)) {
      /* An Excel file, which is what our own template hands them. Reading it is
         not a nicety: offering a .xlsx template and then refusing .xlsx uploads
         would be a trap of our own making. */
      try {
        const workbook = await readXlsx(await chosen.arrayBuffer());
        /* The first sheet with more than a heading row in it. A workbook whose
           first tab is a cover note is common, and so is our own template's
           second tab — picking sheet one blindly imports the guide. */
        const useful =
          workbook.sheets.find((sheet) => sheet.grid.length > 1) ?? workbook.sheets[0];
        if (!useful) {
          setError("There are no sheets in that workbook.");
          return false;
        }
        const notes = [...workbook.notes];
        if (workbook.sheets.length > 1) {
          notes.push(
            `That workbook has ${workbook.sheets.length} sheets. We read "${useful.name}" — the first one with rows in it.`,
          );
        }
        csv = fileFromRecords(useful.grid, { notes });
      } catch {
        setError(
          "That .xlsx could not be opened. If it came from another system, open it in Excel and save it again — or save it as CSV and upload that.",
        );
        return false;
      }
    } else {
      let text: string;
      try {
        text = await chosen.text();
      } catch {
        setError("That file could not be read. Try saving it again as CSV.");
        return false;
      }
      csv = parseCsv(text);
    }

    if (csv.headers.length === 0) {
      setError("That file is empty — there is no heading row in it.");
      return false;
    }
    if (csv.rows.length === 0) {
      setError(
        "That file has headings but nobody in it. Check you saved the sheet the data is on.",
      );
      return false;
    }

    setFile({ name: chosen.name, size: chosen.size, csv });
    setMapping(guessMapping(dictionary, csv.headers));
    return true;
  }, [dictionary]);

  /**
   * Pick up a past import from the rows it was checked against.
   *
   * The same landing point as choosing a file — mapping guessed, step two —
   * rather than jumping to the report, and that is deliberate: the rows are
   * re-checked from scratch against today's data, so a department somebody
   * created since, or a rule that has changed, applies. Resuming to a stored
   * verdict would show a report that is no longer true.
   *
   * The records are rebuilt into a `CsvFile` so every later step — the
   * mapping, the corrections, the rows-to-fix download — reads the same shape
   * it does for an upload and none of them needs to know this file came from
   * the API rather than a disk.
   */
  const resumeFrom = useCallback(
    async (batchId: string): Promise<boolean> => {
      setError(null);
      setCheck(null);
      setResult(null);
      setFixes({});
      setDecisions({});
      setAcknowledged(false);
      setSelection(null);
      mapped.current = [];

      let answer: Awaited<ReturnType<typeof api.rows>>;
      try {
        answer = await api.rows(batchId);
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "That import could not be opened. Upload the file again.",
        );
        return false;
      }

      const headers = Object.keys(answer.rows[0] ?? {});
      if (headers.length === 0) {
        setError("That import kept no columns, so there is nothing to pick up.");
        return false;
      }

      const csv = fileFromRecords([
        headers,
        ...answer.rows.map((row) =>
          headers.map((header) => {
            const value = row[header];
            return value === null || value === undefined ? "" : String(value);
          }),
        ),
      ]);
      /* Size is the file's own byte count everywhere else and there is no file
         here. Zero rather than a guess: nothing reads it except the 25MB
         refusal, which this path has already passed by being stored. */
      setFile({ name: answer.filename, size: 0, csv });
      setMapping(guessMapping(dictionary, csv.headers));
      return true;
    },
    [dictionary],
  );

  const clear = useCallback(() => {
    setFile(null);
    setMapping({});
    setCheck(null);
    setResult(null);
    setFixes({});
    setDecisions({});
    setAcknowledged(false);
    setSelection(null);
    setError(null);
    setProgress(null);
    mapped.current = [];
  }, []);

  /** One column's target. Changing anything invalidates the check. */
  const setColumn = useCallback((heading: string, field: string) => {
    setMapping((current) => ({ ...current, [heading]: field }));
    setCheck(null);
    setResult(null);
  }, []);

  const resetMapping = useCallback(() => {
    if (!file) return;
    setMapping(guessMapping(dictionary, file.csv.headers));
    setCheck(null);
    setResult(null);
  }, [dictionary, file]);

  /* ------------------------------------------------------------- step three */

  /**
   * Check the rows. Writes nothing to anybody's record.
   *
   * The parts are validated one at a time rather than in parallel: five
   * concurrent requests would each create a batch and the progress line could
   * not honestly say which part it was on, and the API is doing per-row database
   * work that gains nothing from being asked to do five at once.
   */
  const runCheck = useCallback(async (): Promise<boolean> => {
    if (!file || !isMappingReady(dictionary, mapping)) return false;
    setError(null);
    setResult(null);
    /* A new check produces a new flagged list, so an acknowledgement of the old
       one no longer describes anything on screen. Cheap to re-tick, and the
       alternative is somebody carrying on past a list they have not seen. */
    setAcknowledged(false);

    /* Mapped from the raw file, then the person's corrections laid back over
       the top. Order matters: mapping first so a re-mapped column is honoured,
       fixes second so they survive the re-map. See `fixes`. */
    const rows = applyFixes(mapRows(dictionary, file.csv.rows, mapping), fixes);
    mapped.current = rows;
    const columns = reverseHeadings(dictionary, mapping);
    const fixCount = Object.keys(fixes).length;

    /* The row numbers to send, and the payload built from them. After a partial
       import that is only the rows that did not land; otherwise it is the file.
       Row *numbers* are the unit throughout, because every message the report
       prints names one and it has to be the number Excel shows. */
    const numbers = (selection ?? rows.map((_row, index) => index + 1)).filter(
      (number) => rows[number - 1] !== undefined,
    );
    const payload = numbers.map((number) => rows[number - 1] as ImportRow);

    if (!isConnected) {
      const presentFields = new Set(
        Object.values(mapping).filter((field) => field !== ""),
      );
      const local = checkMappedRows(dictionary, payload, { presentFields });
      setCheck({
        filename: file.name,
        totalRows: rows.length,
        rowsChecked: payload.length,
        toCreate: local.toImport,
        toUpdate: 0,
        toSkip: local.toSkip,
        problems: local.rows
          .filter(
            (row) =>
              row.errors.length > 0 ||
              row.warnings.length > 0 ||
              row.missing.length > 0,
          )
          .map((row) => translate(row, numbers, columns)),
        notes: [...file.csv.notes, ...local.notes],
        /* Nothing offline can say which departments exist, so there is no key
           here rather than two empty lists. Absent, not zero. */
        missing: {},
        parts: [],
        /* Offline nothing can be matched against the directory, so there is
           nothing to decide. Said on screen rather than shown as a zero. */
        duplicates: { undecided: 0, skipping: 0, updating: 0 },
        flagged: local.flagged,
        /* Nothing offline knows the organisation's own tax state either. */
        missingOrgTaxState: false,
        fixCount,
        authoritative: false,
      });
      return true;
    }

    const planned = planParts(payload);
    const parts: CheckedPart[] = [];
    const problems: RowLine[] = [];
    const notes = new Set<string>(file.csv.notes);
    /* One set per kind of thing the file named that does not exist yet, keyed
       exactly as the API keyed it. The screen turns a key into a callout. */
    const missing = new Map<string, Set<string>>();
    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;
    let flagged = 0;
    /* True the moment any part hits it — a company-level fact stays true once
       any row in the file has actually needed the fallback and found none. */
    let missingOrgTaxState = false;
    const duplicates: ApiDuplicateCounts = {
      undecided: 0,
      skipping: 0,
      updating: 0,
    };
    let checked = 0;

    /** One span, splitting on a 413 rather than giving up on the file. */
    const checkSpan = async (start: number, end: number): Promise<void> => {
      const slice = payload.slice(start, end);
      const rowNumbers = numbers.slice(start, end);
      setProgress({
        label:
          planned.length > 1
            ? `Checking rows ${rowNumbers[0]} to ${rowNumbers[rowNumbers.length - 1]} of ${payload.length}`
            : `Checking ${payload.length} rows`,
        done: checked,
        total: payload.length,
      });

      try {
        const answer = await api.validate(dictionary.slug, {
          filename: file.name,
          rows: slice,
          decisions: decisionsFor(rowNumbers, decisions),
        });

        parts.push({ index: parts.length + 1, batchId: answer.batchId, rowNumbers });
        toCreate += answer.toCreate;
        toUpdate += answer.toUpdate;
        toSkip += answer.toSkip;
        flagged += answer.flagged;
        if (answer.missingOrgTaxState) missingOrgTaxState = true;
        duplicates.undecided += answer.duplicates.undecided;
        duplicates.skipping += answer.duplicates.skipping;
        duplicates.updating += answer.duplicates.updating;
        checked += slice.length;

        for (const report of answer.rows) {
          /* A row with a duplicate or a missing detail has something to say even
             when nothing is wrong with it — those are the two lists this screen
             exists to show. */
          if (
            report.errors.length === 0 &&
            report.warnings.length === 0 &&
            report.duplicate === null &&
            report.missing.length === 0
          ) {
            continue;
          }
          problems.push(translate(report, rowNumbers, columns));
        }
        answer.notes.forEach((note) => notes.add(note));
        for (const [kind, names] of Object.entries(answer.missing)) {
          const set = missing.get(kind) ?? new Set<string>();
          missing.set(kind, set);
          names.forEach((name) => set.add(name));
        }
        if (answer.unmappedColumns.length > 0) {
          notes.add(
            `These columns were not imported: ${answer.unmappedColumns.join(", ")}.`,
          );
        }
      } catch (thrown) {
        const tooLarge = thrown instanceof ApiError && thrown.status === 413;
        const half = Math.floor((end - start) / 2);
        if (!tooLarge || half < MIN_PART_ROWS) throw thrown;
        /* One part of unusually long values. Halve it and carry on — the file
           is fine, our guess at how much of it fits in one request was not. */
        await checkSpan(start, start + half);
        await checkSpan(start + half, end);
      }
    };

    try {
      for (const span of planned) await checkSpan(span.start, span.end);
    } catch (thrown) {
      setProgress(null);
      setError(messageOf(thrown));
      return false;
    }

    setProgress(null);
    problems.sort((a, b) => a.row - b.row);
    parts.sort((a, b) => (a.rowNumbers[0] ?? 0) - (b.rowNumbers[0] ?? 0));
    parts.forEach((part, index) => {
      part.index = index + 1;
    });

    const ignored = ignoredHeadings(mapping);
    if (ignored.length > 0) {
      notes.add(
        `You left ${ignored.length} ${ignored.length === 1 ? "column" : "columns"} out: ${ignored.join(", ")}.`,
      );
    }
    if (payload.length < rows.length) {
      notes.add(
        `This check covered ${payload.length} of the ${rows.length} rows in the file — the ones that did not import last time. The rest are already in.`,
      );
    }

    setCheck({
      filename: file.name,
      totalRows: rows.length,
      rowsChecked: payload.length,
      toCreate,
      toUpdate,
      toSkip,
      problems,
      notes: [...notes],
      missing: Object.fromEntries(
        [...missing.entries()].map(([kind, names]) => [kind, [...names]]),
      ),
      parts,
      duplicates,
      flagged,
      missingOrgTaxState,
      fixCount,
      authoritative: true,
    });
    return true;
  }, [dictionary, file, mapping, isConnected, fixes, decisions, selection]);

  /* -------------------------------------------------------------- step four */

  /**
   * Apply the checked rows. The only call that writes.
   *
   * Stops at the first part that does not go through, and says which one. The
   * alternative — pressing on through a network failure — turns one clear
   * sentence ("parts one and two landed, part three did not") into four failed
   * requests and a result nobody can act on. Whatever landed, landed: the API
   * writes each part in a transaction, so there is no half-part.
   */
  const runImport = useCallback(async (): Promise<boolean> => {
    if (!check || !check.authoritative || check.parts.length === 0) return false;
    /* A correction typed after the check is a correction the API has not seen.
       Applying now would import the unmended row while the screen showed it as
       mended — so this refuses, and the screen offers the re-check instead. */
    if (Object.keys(fixes).length !== check.fixCount) return false;
    setError(null);

    const rows = mapped.current;
    const columns = reverseHeadings(dictionary, mapping);
    const problems: RowLine[] = [];
    const notes = new Set<string>();
    const notImported: number[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const extras: Record<string, number> = {};
    let applied = 0;
    let failure: ApplyOutcome["failure"] = null;

    let sent = 0;
    for (const part of check.parts) {
      const first = part.rowNumbers[0] ?? 0;
      const last = part.rowNumbers[part.rowNumbers.length - 1] ?? 0;
      setProgress({
        label:
          check.parts.length > 1
            ? `Importing rows ${first} to ${last} of ${check.rowsChecked}`
            : `Importing ${check.rowsChecked} rows`,
        /* Rows finished, counted rather than estimated from the part index —
           parts are not all the same size once a 413 has halved one. */
        done: sent,
        total: check.rowsChecked,
      });

      try {
        const answer = await api.apply(dictionary.slug, part.batchId, {
          confirm: true,
          rows: part.rowNumbers.map((number) => rows[number - 1] as ImportRow),
          decisions: decisionsFor(part.rowNumbers, decisions),
        });
        applied += 1;
        sent += part.rowNumbers.length;
        created += answer.created;
        updated += answer.updated;
        skipped += answer.skipped;
        /* Only the keys this answer actually carried. Seeding them at zero would
           turn "not applicable to this entity" into a reported count of none. */
        for (const key of EXTRA_KEYS) {
          const value = answer[key];
          if (typeof value === "number") extras[key] = (extras[key] ?? 0) + value;
        }
        answer.notes.forEach((note) => notes.add(note));
        for (const report of answer.skippedRows) {
          const line = translate(report, part.rowNumbers, columns);
          problems.push(line);
          notImported.push(line.row);
        }
      } catch (thrown) {
        failure = { part: part.index, message: messageOf(thrown) };
        /* This part and everything after it. Said as row numbers, because that
           is what somebody has to go and re-import. */
        for (const rest of check.parts.slice(part.index - 1)) {
          notImported.push(...rest.rowNumbers);
        }
        break;
      }
    }

    setProgress(null);
    problems.sort((a, b) => a.row - b.row);
    notImported.sort((a, b) => a - b);

    setResult({
      created,
      updated,
      skipped,
      extras,
      notes: [...notes],
      problems,
      notImported: [...new Set(notImported)],
      partsApplied: applied,
      partsTotal: check.parts.length,
      failure,
    });
    return failure === null;
  }, [check, dictionary, mapping, fixes, decisions]);

  /**
   * Try again with only the rows that did not land.
   *
   * The loop this closes: 47 of 50 imported, three did not, and until now the
   * only way back was to download the rejects, open them in Excel and start
   * over. The rows keep their own numbers, the 47 that landed are not sent again
   * — a second attempt at them would be a harmless update, but "harmless" is a
   * claim about somebody's salary that nobody needs to test.
   */
  const retryNotImported = useCallback((): boolean => {
    if (!result || result.notImported.length === 0) return false;
    setSelection([...result.notImported]);
    setResult(null);
    setCheck(null);
    setAcknowledged(false);
    setError(null);
    return true;
  }, [result]);

  /* ------------------------------------------------------------- downloads */

  /**
   * The blank template, in either format.
   *
   * Built here rather than taken from the API's `csv` field, even when the API
   * answers. The API sends the *dictionary* and this builds the file from it, so
   * the CSV and the workbook are one code path with one set of headings, one
   * legend and one example row. Two builders would drift, and the file a
   * customer fills in is the last place that can afford to.
   */
  const templateColumns = useCallback((): TemplateColumn[] => {
    if (!template) return columnsFromDictionary(dictionary);
    return columnsFromApi(template.columns, dictionary);
  }, [dictionary, template]);

  const downloadTemplate = useCallback(
    (format: "csv" | "xlsx" = "xlsx") => {
      const files = buildTemplateFiles(templateColumns(), {
        basename: dictionary.templateFile.basename,
        sheetName: dictionary.templateFile.sheetName,
        ...(template?.legend ? { legend: template.legend } : {}),
        ...(template?.matching ? { matching: template.matching } : {}),
      });
      if (format === "csv") downloadCsv(files.csvFilename, files.csv);
      else downloadXlsx(files.xlsxFilename, files.xlsx);
    },
    [dictionary, template, templateColumns],
  );

  /**
   * The rows that need fixing, as their own CSV.
   *
   * Their original columns and their original values — this is their file, minus
   * the rows that were fine — with the row number and the fix in front. That is
   * how this actually gets done: fix in Excel, upload again. The two extra
   * columns match nothing, so a re-import ignores them.
   */
  const downloadRows = useCallback(
    (lines: readonly RowLine[], filename: string) => {
      if (!file || lines.length === 0) return;
      const headers = ["problem_row", "what_to_fix", ...file.csv.headers];
      const rows: CsvRow[] = lines.map((line) => {
        const original = file.csv.rows[line.row - 1] ?? {};
        return {
          ...original,
          problem_row: String(line.row),
          what_to_fix:
            line.problems
              .filter((issue) => issue.severity === "error")
              .map((issue) => `${issue.column}: ${issue.problem}`)
              .join(" | ") || "Not imported.",
        };
      });
      downloadCsv(filename, toCsv(headers, rows));
    },
    [file],
  );

  /**
   * Rows that will be skipped, from the check.
   *
   * A duplicate somebody chose to leave alone is not in it. That row is not
   * broken and there is nothing to mend in a spreadsheet — putting it in a file
   * called "rows to fix" would send somebody looking for a problem that is
   * actually a decision they already made.
   */
  const downloadRowsToFix = useCallback(() => {
    if (!check) return;
    downloadRows(
      check.problems.filter(
        (line) => line.action === "skip" && line.duplicate?.decision !== "skip",
      ),
      `rows-to-fix-${check.filename}`,
    );
  }, [check, downloadRows]);

  /** Rows that did not land, from the result. Includes anything not attempted. */
  const downloadNotImported = useCallback(() => {
    if (!result || !file) return;
    const byRow = new Map(result.problems.map((line) => [line.row, line]));
    const lines: RowLine[] = result.notImported.map(
      (row) =>
        byRow.get(row) ?? {
          row,
          employeeNo: null,
          name: null,
          action: "skip",
          problems: [
            {
              row,
              column: "",
              /* No field: the row was never sent, so nothing about it is wrong
                 and there is no cell to mend. The report renders no fix input
                 for an empty field, which is the correct outcome — offering one
                 would invite somebody to "fix" a row that only needs sending. */
              field: "",
              value: null,
              problem: "This row was not sent, because an earlier part failed.",
              severity: "error" as const,
            },
          ],
          duplicate: null,
          missing: [],
          employeeNoGenerated: false,
        },
    );
    downloadRows(lines, `not-imported-${file.name}`);
  }, [result, file, downloadRows]);

  return {
    /* state */
    dictionary,
    file,
    mapping,
    check,
    result,
    progress,
    error,
    template,
    isConnected,
    ready: file !== null && isMappingReady(dictionary, mapping),
    /* Rows left over from a partial import, when this is a second attempt. */
    selection,
    /* actions */
    chooseFile,
    resumeFrom,
    clear,
    setColumn,
    resetMapping,
    runCheck,
    runImport,
    retryNotImported,
    fixCell,
    fixes,
    fixCount: Object.keys(fixes).length,
    /**
     * True when a correction has been typed since the check ran.
     *
     * The screen uses it to make the re-check the primary action and to refuse
     * the confirmation, because the report on display no longer describes the
     * rows that would be sent.
     */
    unchecked: check !== null && Object.keys(fixes).length !== check.fixCount,
    decisions,
    decide,
    decideAll,
    seedDecisions,
    acknowledged,
    acknowledge,
    downloadTemplate,
    downloadRowsToFix,
    downloadNotImported,
    dismissError: useCallback(() => setError(null), []),
  };
}

/* ------------------------------------------------------------------ history */

/**
 * Past imports. Read-only, and empty rather than invented in demo mode.
 *
 * Every `setState` here happens after an `await`, which is the difference
 * between synchronising with an external system and cascading a render — see
 * `lib/store/departments.ts` for the same shape. Nothing sets a loading flag,
 * because the panel this feeds does not exist until there is something in it.
 */
export function useImportHistory(kind: string, limit = 5) {
  const { isConnected } = useSession();
  const [rows, setRows] = useState<ApiImportBatch[]>([]);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        /* `order` defaults to ascending on the API — "imports before this one"
           means the most recent ones, not the oldest batch this company ever
           ran, so this has to ask for the sort it needs rather than take the
           default. */
        const answer = await api.list({
          pageSize: limit,
          kind,
          sort: "createdAt",
          order: "desc",
        });
        if (!cancelled) setRows(answer.data);
      } catch {
        /* A history panel is not worth an error banner over. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, kind, limit]);

  /**
   * A past batch's own row report, fetched on demand rather than carried in
   * the list — `GET /imports` is deliberately light (one row per batch), and
   * a customer with hundreds of imports should not pay for every one of their
   * row reports on a screen that shows five.
   *
   * What this cannot do: re-apply the rows. The batch stores the *report* —
   * row, column, problem — not the original file, so there is nothing to
   * resubmit from history alone. This is for reading what went wrong; fixing
   * it still means re-uploading the file, which by now may check very
   * differently than it did.
   */
  const getDetail = useCallback((batchId: string) => api.get(batchId), []);

  /* Derived rather than cleared, so signing out of a connected session cannot
     leave somebody else's import history on the screen. */
  return { rows: isConnected ? rows : [], getDetail };
}

/**
 * The employee import.
 *
 * The one binding that exists today. A second entity is one more line like it,
 * pointed at its own dictionary — no second store and no second screen.
 */
export const useEmployeeImport = () => useImport(EMPLOYEES);
