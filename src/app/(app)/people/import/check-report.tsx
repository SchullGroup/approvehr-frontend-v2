"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Download, Info } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { CheckOutcome } from "@/lib/store/imports";

/**
 * Step three: what this file will do, before it does it.
 *
 * The screen the whole flow exists for. Three rules held it together:
 *
 * 1. **Counts first, in three numbers.** Added, updated, skipped. A person
 *    deciding whether to press the button is deciding against those.
 * 2. **Every problem row is addressable.** Row number as the spreadsheet shows
 *    it, the column heading their own file uses, the value that is in the cell,
 *    and what to do about it. "Row 43: date of birth reads 13/13/1990 — there is
 *    no month 13" is a thing somebody can fix; "ValidationError: invalid date"
 *    is a thing somebody escalates.
 * 3. **The problems are downloadable as a CSV.** Fixing 8 rows in the browser is
 *    a form; fixing them in Excel and uploading again is a Tuesday. The download
 *    is their own file, their own columns, their own values, with the row number
 *    and the fix in front.
 *
 * Warnings are separated from errors by what happens next, not by colour alone:
 * an error means the row does not import, a warning means it does and somebody
 * should look. Both say which.
 */

const SHOWN = 60;

export function CheckReport({
  check,
  onBack,
  onDownload,
  onContinue,
  fixes,
  fixCount,
  onFix,
  onRecheck,
  rechecking,
}: {
  check: CheckOutcome;
  onBack: () => void;
  onDownload: () => void;
  onContinue: () => void;
  /**
   * Corrections made here, keyed `row:field`.
   *
   * Until now the only way out of a failed row was to download the rejects, fix
   * them in a spreadsheet and upload the file again — which for one missing
   * phone number in a 500-row file is an absurd amount of work, and is the
   * moment most people give up on an import.
   */
  fixes: Record<string, string>;
  fixCount: number;
  onFix: (row: number, field: string, value: string) => void;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  /* One line per problem rather than per row: a row with three things wrong has
     three fixes, and collapsing them hides two. */
  const lines = useMemo(
    () =>
      check.problems.flatMap((row) =>
        row.problems.map((issue, index) => ({
          key: `${row.row}-${index}-${issue.column}`,
          row: row.row,
          who: row.name ?? row.employeeNo ?? "No name in this row",
          employeeNo: row.employeeNo,
          column: issue.column,
          /* Our canonical field, which is what a correction writes to. Empty for
             a row that was never sent — there is nothing to mend there. */
          field: issue.field,
          value: issue.value,
          problem: issue.problem,
          severity: issue.severity,
        })),
      ),
    [check.problems],
  );

  const errors = lines.filter((line) => line.severity === "error");
  const warnings = lines.filter((line) => line.severity === "warning");
  const ordered = [...errors, ...warnings];
  const visible = showAll ? ordered : ordered.slice(0, SHOWN);
  const skipRows = check.problems.filter((row) => row.action === "skip").length;
  const willImport = check.toCreate + check.toUpdate;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Rows in the file"
          value={check.totalRows.toLocaleString("en-NG")}
          hint={check.filename}
        />
        <Stat
          label={check.authoritative ? "People to add" : "Rows that look right"}
          value={check.toCreate.toLocaleString("en-NG")}
          hint={check.authoritative ? "not on your list yet" : "nothing wrong in the file"}
        />
        <Stat
          label="People to update"
          value={check.authoritative ? check.toUpdate.toLocaleString("en-NG") : "—"}
          hint={
            check.authoritative
              ? "staff number already on your list"
              : "needs the API to know"
          }
        />
        <Stat
          label="Rows to be skipped"
          value={check.toSkip.toLocaleString("en-NG")}
          trend={
            check.toSkip > 0
              ? { direction: "down", label: "Fix and upload again" }
              : { direction: "up", label: "Nothing to fix" }
          }
        />
      </div>

      {!check.authoritative && (
        <Callout tone="warning" title="This is a check of the file, not of your company">
          We read every row and found what the file itself gets wrong — dates,
          amounts, repeated staff numbers, words we do not know. We cannot tell
          you who is already on your list, whether those departments exist, or
          whether the pay fits its grade. That needs the API, and so does the
          import itself.
        </Callout>
      )}

      {check.missing.departments.length > 0 && (
        <Callout tone="warning" title="Some departments do not exist yet">
          <p className="mb-3">
            {check.missing.departments.join(", ")}. Rows naming{" "}
            {check.missing.departments.length === 1 ? "it" : "them"} will be
            skipped until {check.missing.departments.length === 1 ? "it exists" : "they exist"}.
          </p>
          <ButtonLink href="/people/departments" size="sm" variant="secondary">
            Add the departments
          </ButtonLink>
        </Callout>
      )}

      {check.missing.salaryGrades.length > 0 && (
        <Callout tone="warning" title="Some salary grades do not exist yet">
          <p className="mb-3">
            {check.missing.salaryGrades.join(", ")}. Rows naming{" "}
            {check.missing.salaryGrades.length === 1 ? "it" : "them"} will be
            skipped.
          </p>
          <ButtonLink href="/payroll/pay-setup" size="sm" variant="secondary">
            Add the grades
          </ButtonLink>
        </Callout>
      )}

      {check.notes.length > 0 && (
        <Callout tone="info" title="Worth knowing about this file" icon={<Info />}>
          <ul className="flex flex-col gap-1.5">
            {check.notes.map((note) => (
              <li key={note} className="flex gap-2">
                <span aria-hidden="true">&middot;</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Card>
        <CardHeader
          level={2}
          title={
            ordered.length === 0
              ? "Nothing to fix"
              : `${ordered.length.toLocaleString("en-NG")} ${ordered.length === 1 ? "thing" : "things"} to look at`
          }
          description={
            ordered.length === 0
              ? "Every row in this file is ready to import."
              : `${errors.length} will stop a row from importing. ${warnings.length} will import anyway.`
          }
          action={
            skipRows > 0 ? (
              <Button variant="secondary" size="sm" onClick={onDownload}>
                <Download aria-hidden="true" className="size-3.5" />
                Download the {skipRows} {skipRows === 1 ? "row" : "rows"} to fix
              </Button>
            ) : undefined
          }
        />

        {ordered.length > 0 && (
          <>
            {fixCount > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-sunken px-4 py-3">
                <span className="flex-1 text-[0.875rem] text-body">
                  {fixCount === 1
                    ? "1 correction not checked yet."
                    : `${fixCount} corrections not checked yet.`}{" "}
                  Nothing is imported until you check them.
                </span>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={onRecheck}
                  loading={rechecking}
                >
                  Check again
                </Button>
              </div>
            )}

            <TableWrap
              className="rounded-none border-0 border-b border-line"
              caption="Every problem, with the row and column it is in"
            >
              <THead>
                <TH className="w-20">Row</TH>
                <TH>Who</TH>
                <TH>Column in your file</TH>
                <TH>What is in it</TH>
                <TH>What to fix</TH>
                <TH className="w-56">Fix it here</TH>
                <TH>Result</TH>
              </THead>
              <TBody>
                {visible.map((line) => (
                  <TR key={line.key}>
                    <TD className="tabular align-top font-medium text-ink">
                      {line.row}
                    </TD>
                    <TD className="align-top">
                      <span className="block text-[0.875rem] text-ink">
                        {line.who}
                      </span>
                      {line.employeeNo && (
                        <span className="tabular block text-[0.75rem] text-muted">
                          {line.employeeNo}
                        </span>
                      )}
                    </TD>
                    <TD className="align-top">
                      <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.8125rem] text-body">
                        {line.column || "—"}
                      </code>
                    </TD>
                    <TD className="align-top">
                      <span className="text-[0.875rem] text-body break-words">
                        {line.value === null || line.value === ""
                          ? "(empty)"
                          : line.value}
                      </span>
                    </TD>
                    <TD className="align-top">
                      <span className="text-[0.875rem] text-body">
                        {line.problem}
                      </span>
                    </TD>
                    <TD className="align-top">
                      {line.field ? (
                        <Input
                          aria-label={`${line.column || "Value"} for row ${line.row}`}
                          value={fixes[`${line.row}:${line.field}`] ?? ""}
                          placeholder={
                            line.value === null || line.value === ""
                              ? "Type the missing value"
                              : "Type a correction"
                          }
                          onChange={(e) =>
                            onFix(line.row, line.field, e.target.value)
                          }
                        />
                      ) : (
                        /* Nothing to mend: this row was never sent. */
                        <span className="text-[0.8125rem] text-muted">—</span>
                      )}
                    </TD>
                    <TD className="align-top">
                      <Badge
                        tone={
                          fixes[`${line.row}:${line.field}`]
                            ? "info"
                            : line.severity === "error"
                              ? "danger"
                              : "warning"
                        }
                        size="sm"
                      >
                        {/* A pending fix is neither "Skipped" nor "Imports" — it
                            is unknown until the check runs again, and claiming
                            either would be a guess about the API's verdict. */}
                        {fixes[`${line.row}:${line.field}`]
                          ? "Fixed — check again"
                          : line.severity === "error"
                            ? "Skipped"
                            : "Imports"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>

            {ordered.length > visible.length && (
              <CardBody className="py-3.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(true)}
                >
                  Show the other{" "}
                  {(ordered.length - visible.length).toLocaleString("en-NG")}
                </Button>
              </CardBody>
            )}
          </>
        )}

        <CardFooter>
          <Button variant="ghost" onClick={onBack}>
            Back to the columns
          </Button>
          <div className="flex items-center gap-2">
            {skipRows > 0 && (
              <Button variant="secondary" onClick={onDownload}>
                <Download aria-hidden="true" className="size-4" />
                Download the rows to fix
              </Button>
            )}
            <Button
              variant="accent"
              onClick={onContinue}
              disabled={willImport === 0}
            >
              {willImport === 0 ? "Nothing to import" : "Continue"}
              {willImport > 0 && (
                <ArrowRight aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
