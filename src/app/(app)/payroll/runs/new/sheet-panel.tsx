"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button, Callout, Disclosure, Spinner } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { ApiError } from "@/lib/api/client";
import { sheetProblems, type SheetProblem } from "@/lib/api/payroll";
import {
  SHEET_BLANK_RULE,
  buildSheet,
  parseSheet,
  sheetRow,
  summarise,
  type ParsedSheet,
  type SheetRowSource,
} from "@/lib/payroll/adjustment-sheet";
import { usePayrollActions } from "@/lib/store/payroll";

/**
 * The whole payroll, out to a spreadsheet and back.
 *
 * The inline cells beside this are for correcting two or three people while
 * looking at the table. This is for the other way a payroll actually gets
 * worked: somebody has a file from a supervisor, or three hundred rows of
 * overtime that came off a different system, and typing them one cell at a time
 * is not a workflow anybody would use.
 *
 * ## Downloaded filled in
 *
 * Staff number, name, email, phone, department, bank and account number are
 * already in it — enough for a person to be sure a row is about who they think
 * it is — plus the figures the run currently holds. A blank template for three
 * hundred staff is a spreadsheet somebody has to type three hundred names into,
 * in our spelling, in the right order.
 *
 * ## Two states, and nothing between them
 *
 * Pick a file and this reads it in the browser, says what it would change, and
 * waits. Nothing is sent until somebody presses the button that names the
 * count. A file picker that uploaded on selection would apply a payroll to the
 * wrong month on a misclick.
 */
export function SheetPanel({
  runId,
  period,
  sources,
  onApplied,
  /** False on an approved run: the figures are frozen and so is this. */
  editable,
}: {
  runId: string;
  /** `YYYY-MM`, for the filename. */
  period: string;
  sources: readonly SheetRowSource[];
  /**
   * Told what happened, because this component will not be here to say it.
   *
   * Applying rebuilds the run, and the wizard unmounts this whole subtree
   * while it does — so any confirmation held in state here is destroyed
   * before it can be read. The first two attempts put the message inside the
   * reveal and then just outside it; both vanished, because the problem was
   * never where the message sat but which component owned it. It belongs to
   * the wizard, which survives.
   */
  onApplied: (summary: string) => void;
  editable: boolean;
}) {
  const actions = usePayrollActions();
  const input = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<{
    message: string;
    problems: readonly SheetProblem[];
  } | null>(null);

  const byNumber = new Map(sources.map((s) => [s.payslip.employeeNo, s]));

  const download = (kind: "csv" | "xlsx") => {
    const files = buildSheet(sources.map(sheetRow), period);
    if (kind === "csv") downloadCsv(files.csvFilename, files.csv);
    else downloadXlsx(files.xlsxFilename, files.xlsx);
  };

  const read = async (file: File) => {
    setReading(true);
    setRefused(null);
    try {
      const next = await parseSheet(file);
      setParsed(next);
      setFilename(file.name);
    } catch {
      setRefused({
        message:
          "That file could not be read. It needs to be the spreadsheet this " +
          "page downloads — .xlsx or .csv.",
        problems: [],
      });
      setParsed(null);
    } finally {
      setReading(false);
      /* So choosing the same file again after a correction still fires. */
      if (input.current) input.current.value = "";
    }
  };

  const send = async () => {
    if (!parsed) return;
    setSending(true);
    setRefused(null);
    try {
      const outcome = await actions.uploadAdjustments(runId, {
        rows: parsed.rows,
      });
      setParsed(null);
      setFilename(null);
      onApplied(
        outcome.applied.length === 1
          ? "1 person's figures changed"
          : `${String(outcome.applied.length)} people's figures changed`,
      );
    } catch (error) {
      /* The API's own sentence, and its own per-row list. Paraphrasing either
         locally is how the two stop agreeing about the same file. */
      setRefused(
        error instanceof ApiError
          ? { message: error.message, problems: sheetProblems(error.details) }
          : { message: "Something went wrong. Try again.", problems: [] },
      );
    } finally {
      setSending(false);
    }
  };

  const summary = parsed ? summarise(parsed, byNumber) : null;
  const total = summary ? summary.changing + summary.clearing : 0;

  return (
    <div className="flex flex-col gap-3">
      {/*
        A refusal sits OUTSIDE the reveal, because a refusal changes nothing —
        this component is still mounted and still open, and the message has to
        be readable whether or not somebody has since collapsed the panel.

        A *success* is not here at all: it goes to the wizard's toast, because
        applying rebuilds the run and this whole subtree is unmounted while it
        does. See `onApplied`.
      */}
      {refused && (
        <Callout tone="danger" title="That sheet was not applied">
          <p>{refused.message}</p>
          {refused.problems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {refused.problems.map((problem) => (
                <li key={`${String(problem.row)}-${problem.column}`}>
                  <strong className="text-ink">
                    Row {problem.row}, {problem.column}
                  </strong>{" "}
                  — {problem.problem}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2">
            Nothing in the file was applied, so the payroll is exactly as it
            was. Fix those rows and upload it again.
          </p>
        </Callout>
      )}

      <Disclosure
        level={2}
        title="Work this payroll in a spreadsheet"
        meta={`${String(sources.length)} ${sources.length === 1 ? "person" : "people"}, filled in`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-muted">
            Downloads with everybody on this payroll already in it — staff
            number, name, contact, department, bank and account number, plus the
            figures the run holds now. Fill in overtime hours, a bonus, a tax
            figure or a new monthly salary, and upload it back.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => download("xlsx")}
            >
              <Download aria-hidden="true" className="size-4" />
              Download for Excel
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => download("csv")}
            >
              <Download aria-hidden="true" className="size-4" />
              Download as CSV
            </Button>
            {editable && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  aria-label="Upload a filled-in payroll sheet"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void read(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={reading || sending}
                  onClick={() => input.current?.click()}
                >
                  {reading ? (
                    <Spinner size="sm" />
                  ) : (
                    <Upload aria-hidden="true" className="size-4" />
                  )}
                  Upload a filled-in sheet
                </Button>
              </>
            )}
          </div>

          <p className="text-meta text-muted">{SHEET_BLANK_RULE}</p>

          {!editable && (
            <p className="text-body-sm text-muted">
              This payroll is settled, so its figures cannot be changed. The
              download still works — it is a record of what was paid.
            </p>
          )}

          {parsed && summary && (
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-4">
              <p className="text-body-sm font-medium text-ink">
                {filename} — read, not yet applied
              </p>

              {parsed.problems.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-1 text-body-sm text-danger-text">
                    {parsed.problems.map((problem) => (
                      <li key={`${String(problem.row)}-${problem.column}`}>
                        {problem.row > 0 ? `Row ${String(problem.row)}: ` : ""}
                        {problem.problem}
                      </li>
                    ))}
                  </ul>
                  <p className="text-body-sm text-muted">
                    Fix those and choose the file again.
                  </p>
                </>
              ) : (
                <>
                  <ul className="flex flex-col gap-1 text-body-sm text-body">
                    <li>
                      <strong className="tabular text-ink">
                        {summary.changing}
                      </strong>{" "}
                      {summary.changing === 1 ? "person" : "people"} with a
                      figure that moves
                    </li>
                    {summary.clearing > 0 && (
                      <li>
                        <strong className="tabular text-ink">
                          {summary.clearing}
                        </strong>{" "}
                        with a figure taken off, from a cell left empty
                      </li>
                    )}
                    <li className="text-muted">
                      <span className="tabular">{summary.unchanged}</span>{" "}
                      unchanged
                    </li>
                  </ul>

                  <p className="text-meta text-muted">
                    Reading{" "}
                    {parsed.carried.map((column, at) => (
                      <span key={column}>
                        {at > 0 ? ", " : ""}
                        <code className="text-ink">{column}</code>
                      </span>
                    ))}
                    .{" "}
                    {parsed.ignored.length > 0 &&
                      `Ignoring ${parsed.ignored.join(", ")}. `}
                    Every other figure on the payroll is left alone.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={sending || total === 0}
                      onClick={() => void send()}
                    >
                      {sending && <Spinner size="sm" />}
                      {total === 0
                        ? "Nothing in this file changes anything"
                        : `Apply to ${String(total)} ${total === 1 ? "person" : "people"}`}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={sending}
                      onClick={() => {
                        setParsed(null);
                        setFilename(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
