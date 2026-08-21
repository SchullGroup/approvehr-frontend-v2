"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  imports as api,
  type ApiImportBatch,
  type ApiImportTemplate,
  type ApiRowReport,
  type ImportRow,
} from "@/lib/api/imports";
import { downloadCsv, parseCsv, toCsv, type CsvFile, type CsvRow } from "@/lib/csv";
import { checkMappedRows } from "@/lib/imports/check";
import {
  guessMapping,
  ignoredHeadings,
  isMappingReady,
  mapRows,
  reverseHeadings,
  type Mapping,
} from "@/lib/imports/mapping";
import {
  EMPLOYEE_COLUMNS,
  MAX_ROWS_PER_BATCH,
  type EmployeeField,
} from "@/lib/imports/template";
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
 */

/* --------------------------------------------------------------- the pieces */

/** How much JSON we let one part carry. Under the API's 100kb, with headroom
 *  for the envelope, the filename and UTF-8 characters that cost three bytes. */
const BODY_BUDGET_BYTES = 70_000;

/** Never more than this, whatever the measurement says. Matches the API's cap. */
const MAX_PART_ROWS = MAX_ROWS_PER_BATCH;

/** Below this a part is not worth splitting further; something else is wrong. */
const MIN_PART_ROWS = 5;

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
};

/** One validated part: the rows it covered, and the batch it belongs to. */
export type CheckedPart = {
  index: number;
  batchId: string;
  /** File row numbers, 1-based and inclusive. */
  from: number;
  to: number;
  rows: number;
};

export type CheckOutcome = {
  filename: string;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  /** Only the rows with something to say. The clean ones are the file. */
  problems: RowLine[];
  notes: string[];
  missing: { departments: string[]; salaryGrades: string[] };
  parts: CheckedPart[];
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
  managersLinked: number;
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

/** The API's per-part row numbers to the file's, and its columns to theirs. */
function translate(
  report: ApiRowReport,
  offset: number,
  columns: Record<string, string>,
): RowLine {
  const problem = (
    issue: { row: number; column: string; value: string | null; problem: string },
    severity: Severity,
  ): RowProblem => ({
    row: issue.row + offset,
    column: columns[issue.column] ?? issue.column,
    /* `issue.column` is already our canonical name; `columns` is what turns it
       back into their heading. So the field a fix writes to is free here. */
    field: issue.column,
    value: issue.value,
    problem: issue.problem,
    severity,
  });

  return {
    row: report.row + offset,
    employeeNo: report.employeeNo,
    name: report.name,
    action: report.action,
    problems: [
      ...report.errors.map((issue) => problem(issue, "error")),
      ...report.warnings.map((issue) => problem(issue, "warning")),
    ],
  };
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

export function useEmployeeImport() {
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

  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    void api
      .template(controller.signal)
      .then(setTemplate)
      .catch(() => {
        /* The compiled-in copy covers it. Not worth a message. */
      });
    return () => controller.abort();
  }, [isConnected]);

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
    /* Corrections belong to the file that needed them. Carrying them into a new
       upload would write one spreadsheet's fixes onto another's rows. */
    setFixes({});
    mapped.current = [];

    /* An .xlsx is a zip of XML, and reading it as text produces line noise. The
       message says what to do about it, because "unsupported file type" leaves
       somebody stuck in front of the only file they have. */
    if (/\.(xlsx|xlsm|xls|numbers|ods)$/i.test(chosen.name)) {
      setError(
        "That is a spreadsheet, not a CSV. In Excel: File, then Save As, then choose CSV — then upload that file.",
      );
      return false;
    }

    if (chosen.size > 25_000_000) {
      setError(
        "That file is bigger than 25MB. Split it in two and import each half — each one reports its own numbers.",
      );
      return false;
    }

    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setError("That file could not be read. Try saving it again as CSV.");
      return false;
    }

    const csv = parseCsv(text);
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
    setMapping(guessMapping(csv.headers));
    return true;
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setMapping({});
    setCheck(null);
    setResult(null);
    setFixes({});
    setError(null);
    setProgress(null);
    mapped.current = [];
  }, []);

  /** One column's target. Changing anything invalidates the check. */
  const setColumn = useCallback((heading: string, field: EmployeeField | "") => {
    setMapping((current) => ({ ...current, [heading]: field }));
    setCheck(null);
    setResult(null);
  }, []);

  const resetMapping = useCallback(() => {
    if (!file) return;
    setMapping(guessMapping(file.csv.headers));
    setCheck(null);
    setResult(null);
  }, [file]);

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
    if (!file || !isMappingReady(mapping)) return false;
    setError(null);
    setResult(null);

    /* Mapped from the raw file, then the person's corrections laid back over
       the top. Order matters: mapping first so a re-mapped column is honoured,
       fixes second so they survive the re-map. See `fixes`. */
    const rows = applyFixes(mapRows(file.csv.rows, mapping), fixes);
    mapped.current = rows;
    const columns = reverseHeadings(mapping);

    if (!isConnected) {
      const presentFields = new Set(
        Object.values(mapping).filter((field): field is EmployeeField => field !== ""),
      );
      const local = checkMappedRows(rows, { presentFields });
      setCheck({
        filename: file.name,
        totalRows: local.totalRows,
        toCreate: local.toImport,
        toUpdate: 0,
        toSkip: local.toSkip,
        problems: local.rows
          .filter((row) => row.errors.length > 0 || row.warnings.length > 0)
          .map((row) => translate(row, 0, columns)),
        notes: [...file.csv.notes, ...local.notes],
        missing: { departments: [], salaryGrades: [] },
        parts: [],
        authoritative: false,
      });
      return true;
    }

    const planned = planParts(rows);
    const parts: CheckedPart[] = [];
    const problems: RowLine[] = [];
    const notes = new Set<string>(file.csv.notes);
    const missingDepartments = new Set<string>();
    const missingGrades = new Set<string>();
    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;
    let checked = 0;

    /** One span, splitting on a 413 rather than giving up on the file. */
    const checkSpan = async (start: number, end: number): Promise<void> => {
      const slice = rows.slice(start, end);
      setProgress({
        label:
          planned.length > 1
            ? `Checking rows ${start + 1} to ${end} of ${rows.length}`
            : `Checking ${rows.length} rows`,
        done: checked,
        total: rows.length,
      });

      try {
        const answer = await api.validateEmployees({
          filename: file.name,
          rows: slice,
        });

        parts.push({
          index: parts.length + 1,
          batchId: answer.batchId,
          from: start + 1,
          to: end,
          rows: slice.length,
        });
        toCreate += answer.toCreate;
        toUpdate += answer.toUpdate;
        toSkip += answer.toSkip;
        checked += slice.length;

        for (const report of answer.rows) {
          if (report.errors.length === 0 && report.warnings.length === 0) continue;
          problems.push(translate(report, start, columns));
        }
        answer.notes.forEach((note) => notes.add(note));
        answer.missing.departments.forEach((name) => missingDepartments.add(name));
        answer.missing.salaryGrades.forEach((name) => missingGrades.add(name));
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
    parts.sort((a, b) => a.from - b.from);
    parts.forEach((part, index) => {
      part.index = index + 1;
    });

    const ignored = ignoredHeadings(mapping);
    if (ignored.length > 0) {
      notes.add(
        `You left ${ignored.length} ${ignored.length === 1 ? "column" : "columns"} out: ${ignored.join(", ")}.`,
      );
    }

    setCheck({
      filename: file.name,
      totalRows: rows.length,
      toCreate,
      toUpdate,
      toSkip,
      problems,
      notes: [...notes],
      missing: {
        departments: [...missingDepartments],
        salaryGrades: [...missingGrades],
      },
      parts,
      authoritative: true,
    });
    return true;
  }, [file, mapping, isConnected, fixes]);

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
    setError(null);

    const rows = mapped.current;
    const columns = reverseHeadings(mapping);
    const problems: RowLine[] = [];
    const notes = new Set<string>();
    const notImported: number[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let managersLinked = 0;
    let applied = 0;
    let failure: ApplyOutcome["failure"] = null;

    for (const part of check.parts) {
      setProgress({
        label:
          check.parts.length > 1
            ? `Importing rows ${part.from} to ${part.to} of ${check.totalRows}`
            : `Importing ${check.totalRows} rows`,
        done: part.from - 1,
        total: check.totalRows,
      });

      try {
        const answer = await api.applyEmployees(part.batchId, {
          confirm: true,
          rows: rows.slice(part.from - 1, part.to),
        });
        applied += 1;
        created += answer.created;
        updated += answer.updated;
        skipped += answer.skipped;
        managersLinked += answer.managersLinked;
        answer.notes.forEach((note) => notes.add(note));
        for (const report of answer.skippedRows) {
          const line = translate(report, part.from - 1, columns);
          problems.push(line);
          notImported.push(line.row);
        }
      } catch (thrown) {
        failure = { part: part.index, message: messageOf(thrown) };
        /* This part and everything after it. Said as row numbers, because that
           is what somebody has to go and re-import. */
        for (const rest of check.parts.slice(part.index - 1)) {
          for (let row = rest.from; row <= rest.to; row += 1) notImported.push(row);
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
      managersLinked,
      notes: [...notes],
      problems,
      notImported,
      partsApplied: applied,
      partsTotal: check.parts.length,
      failure,
    });
    return failure === null;
  }, [check, mapping]);

  /* ------------------------------------------------------------- downloads */

  /** The blank template, from the API when it answers and compiled in when not. */
  const downloadTemplate = useCallback(() => {
    if (template) {
      /* The API sends header and example row without a BOM; Excel wants one. */
      downloadCsv(template.filename, `\uFEFF${template.csv}\r\n`);
      return;
    }
    const headers = EMPLOYEE_COLUMNS.map((spec) => spec.column);
    const example: CsvRow = Object.fromEntries(
      EMPLOYEE_COLUMNS.map((spec) => [spec.column, spec.example]),
    );
    downloadCsv("approvehr-employees-template.csv", toCsv(headers, [example]));
  }, [template]);

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

  /** Rows that will be skipped, from the check. */
  const downloadRowsToFix = useCallback(() => {
    if (!check) return;
    downloadRows(
      check.problems.filter((line) => line.action === "skip"),
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
        },
    );
    downloadRows(lines, `not-imported-${file.name}`);
  }, [result, file, downloadRows]);

  return {
    /* state */
    file,
    mapping,
    check,
    result,
    progress,
    error,
    template,
    isConnected,
    ready: file !== null && isMappingReady(mapping),
    /* actions */
    chooseFile,
    clear,
    setColumn,
    resetMapping,
    runCheck,
    runImport,
    fixCell,
    fixes,
    fixCount: Object.keys(fixes).length,
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
export function useImportHistory(limit = 5) {
  const { isConnected } = useSession();
  const [rows, setRows] = useState<ApiImportBatch[]>([]);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const answer = await api.list({ pageSize: limit, kind: "EMPLOYEES" });
        if (!cancelled) setRows(answer.data);
      } catch {
        /* A history panel is not worth an error banner over. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, limit]);

  /* Derived rather than cleared, so signing out of a connected session cannot
     leave somebody else's import history on the screen. */
  return { rows: isConnected ? rows : [] };
}
