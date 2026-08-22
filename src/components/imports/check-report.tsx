"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Download, Info } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Input,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { Dictionary } from "@/lib/imports/spec";
import type { ImportPrerequisite } from "@/lib/imports/surface";
import { needsDecision, type CheckOutcome, type RowLine } from "@/lib/store/imports";

/** "person" → "People". The noun starts a stat label often enough to earn this. */
const capitalise = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Step three: what this file will do, before it does it. Entity-agnostic — the
 * words for one row and the things a row can refer to both come off its inputs.
 *
 * The screen the whole flow exists for. Four rules hold it together, and the
 * fourth is the one that was missing:
 *
 * 1. **Counts first.** Added, updated, not importing, flagged. A person deciding
 *    whether to press the button is deciding against those four numbers.
 * 2. **Every problem row is addressable.** Row number as the spreadsheet shows
 *    it, the column heading their own file uses, the value that is in the cell,
 *    and what to do about it. "Row 43: date of birth reads 13/13/1990 — there is
 *    no month 13" is a thing somebody can fix; "ValidationError: invalid date"
 *    is a thing somebody escalates.
 * 3. **Fixable here, or in Excel, whichever suits.** Every reported cell has an
 *    input beside it, and the whole set is still downloadable as their own file.
 *    One missing phone number in a 500-row file is not a reason to go back to a
 *    spreadsheet, and two hundred of them are not a reason to stay here.
 * 4. **The three kinds of unfinished business are kept apart**, because they end
 *    differently. A **problem** stops a row. A **duplicate** is a question only
 *    the customer can answer, and the row waits until they do. A **missing
 *    detail** stops nothing and is a list somebody has to have read — which is
 *    what the acknowledgement is for, and why it is a checkbox rather than a
 *    sentence nobody has to look at.
 */

const SHOWN = 60;

type Props = {
  dictionary: Dictionary<string>;
  /**
   * One entry per key `check.missing` can carry.
   *
   * A key with no entry still renders its names, with no link — naming what is
   * missing matters more than knowing where to fix it.
   */
  prerequisites: Readonly<Record<string, ImportPrerequisite>>;
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
  /** True when a correction has been typed since this check ran. */
  unchecked: boolean;
  decisions: Record<number, "skip" | "update">;
  onDecide: (row: number, action: "skip" | "update") => void;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
};

export function CheckReport({
  dictionary,
  prerequisites,
  check,
  onBack,
  onDownload,
  onContinue,
  fixes,
  fixCount,
  onFix,
  onRecheck,
  rechecking,
  unchecked,
  decisions,
  onDecide,
  acknowledged,
  onAcknowledge,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  /* Rows waiting on an answer get their own card, so they stay out of the
     problem list — the same row appearing twice, once with a "type a correction"
     box beside it, would suggest a typo is what is wrong with it. */
  const duplicates = useMemo(
    () => check.problems.filter((row) => row.duplicate !== null),
    [check.problems],
  );
  const undecided = duplicates.filter(needsDecision);
  const flaggedRows = useMemo(
    () => check.problems.filter((row) => row.missing.length > 0),
    [check.problems],
  );

  /* One line per problem rather than per row: a row with three things wrong has
     three fixes, and collapsing them hides two. */
  const lines = useMemo(
    () =>
      check.problems
        .filter((row) => !needsDecision(row))
        .flatMap((row) =>
          row.problems.map((issue, index) => ({
            key: `${row.row}-${index}-${issue.column}`,
            row: row.row,
            who: row.name ?? row.employeeNo ?? "No name in this row",
            employeeNo: row.employeeNo,
            column: issue.column,
            /* Our canonical field, which is what a correction writes to. Empty
               for a row that was never sent — there is nothing to mend there. */
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

  /**
   * The one thing stopping the next step, if anything is.
   *
   * A single value rather than a disabled button and a hope: whatever is in the
   * way gets its name on the button, so nobody has to hunt up the page for the
   * reason they cannot carry on.
   */
  const blocker = unchecked
    ? ({
        kind: "fixes",
        label: `Check the ${fixCount === 1 ? "correction" : `${fixCount} corrections`}`,
      } as const)
    : undecided.length > 0
      ? ({
          kind: "duplicates",
          label: `${undecided.length} still to answer above`,
        } as const)
      : flaggedRows.length > 0 && !acknowledged
        ? ({ kind: "acknowledge", label: "Tick the box above to carry on" } as const)
        : willImport === 0
          ? ({ kind: "nothing", label: "Nothing to import" } as const)
          : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={
            check.rowsChecked < check.totalRows ? "Rows checked" : "Rows in the file"
          }
          value={check.rowsChecked.toLocaleString("en-NG")}
          hint={
            check.rowsChecked < check.totalRows
              ? `of ${check.totalRows.toLocaleString("en-NG")} in ${check.filename}`
              : check.filename
          }
        />
        <Stat
          label={
            check.authoritative
              ? `${capitalise(dictionary.noun.many)} to add`
              : "Rows that look right"
          }
          value={check.toCreate.toLocaleString("en-NG")}
          hint={
            check.authoritative ? "not on your list yet" : "nothing wrong in the file"
          }
        />
        <Stat
          label={`${capitalise(dictionary.noun.many)} to update`}
          value={check.authoritative ? check.toUpdate.toLocaleString("en-NG") : "—"}
          hint={
            check.authoritative
              ? "already on your list, matched to this row"
              : "needs the API to know"
          }
        />
        <Stat
          label="Rows not importing"
          value={check.toSkip.toLocaleString("en-NG")}
          trend={
            check.toSkip > 0
              ? { direction: "down", label: "Fix them here, or in your file" }
              : { direction: "up", label: "Nothing to fix" }
          }
        />
      </div>

      {/*
        Was a warning headed "This is a check of the file, not of your company",
        explaining at length what a browser-only check cannot know.

        Removed at the product owner's request, and it costs nothing: it only
        ever rendered in demo mode, which does not exist in a production build,
        and step four already refuses the import outright with the same reason in
        one sentence. Four paragraphs of caveat above the actual findings pushed
        the thing somebody came to read below the fold.
      */}
      {/* One callout per kind of thing the file named that does not exist yet.
          Driven by what the check returned rather than by a fixed pair, so an
          entity with three such lists gets three without editing this file. */}
      {Object.entries(check.missing)
        .filter(([, names]) => names.length > 0)
        .map(([kind, names]) => {
          const detail = prerequisites[kind];
          return (
            <Callout
              key={kind}
              tone="warning"
              title={detail?.title ?? `Some ${kind} do not exist yet`}
            >
              <p className={detail?.action ? "mb-3" : undefined}>
                {names.join(", ")}. Rows naming{" "}
                {names.length === 1 ? "it" : "them"}{" "}
                {detail?.consequence ?? "will be skipped."}
              </p>
              {detail?.action && (
                <ButtonLink href={detail.action.href} size="sm" variant="secondary">
                  {detail.action.label}
                </ButtonLink>
              )}
            </Callout>
          );
        })}

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

      {duplicates.length > 0 && (
        <Duplicates
          dictionary={dictionary}
          rows={duplicates}
          decisions={decisions}
          onDecide={onDecide}
          undecided={undecided.length}
        />
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
              ? "Every row that was checked is ready to import."
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
                <span className="flex-1 text-meta text-body">
                  {unchecked ? (
                    <>
                      {fixCount === 1
                        ? "1 correction not checked yet."
                        : `${fixCount} corrections not checked yet.`}{" "}
                      Nothing is imported until you check them.
                    </>
                  ) : (
                    <>
                      {fixCount === 1
                        ? "1 correction is in this check."
                        : `All ${fixCount} corrections are in this check.`}{" "}
                      Your own file is untouched.
                    </>
                  )}
                </span>
                <Button
                  variant={unchecked ? "accent" : "secondary"}
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
                {visible.map((line) => {
                  const pending =
                    Boolean(fixes[`${line.row}:${line.field}`]) && unchecked;
                  return (
                    <TR key={line.key}>
                      <TD className="tabular align-top font-medium text-ink">
                        {line.row}
                      </TD>
                      <TD className="align-top">
                        <span className="block text-meta text-ink">
                          {line.who}
                        </span>
                        {line.employeeNo && (
                          <span className="tabular block text-meta text-muted">
                            {line.employeeNo}
                          </span>
                        )}
                      </TD>
                      <TD className="align-top">
                        <code className="rounded bg-sunken px-1.5 py-0.5 text-meta text-body">
                          {line.column || "—"}
                        </code>
                      </TD>
                      <TD className="align-top">
                        <span className="text-meta text-body break-words">
                          {line.value === null || line.value === ""
                            ? "(empty)"
                            : line.value}
                        </span>
                      </TD>
                      <TD className="align-top">
                        <span className="text-meta text-body">
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
                          <span className="text-meta text-muted">—</span>
                        )}
                      </TD>
                      <TD className="align-top">
                        <Badge
                          tone={
                            pending
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
                          {pending
                            ? "Fixed — check again"
                            : line.severity === "error"
                              ? "Skipped"
                              : "Imports"}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>

            {ordered.length > visible.length && (
              <CardBody className="py-3.5">
                <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                  Show the other{" "}
                  {(ordered.length - visible.length).toLocaleString("en-NG")}
                </Button>
              </CardBody>
            )}
          </>
        )}

        {flaggedRows.length > 0 && (
          <Flagged
            dictionary={dictionary}
            rows={flaggedRows}
            acknowledged={acknowledged}
            onAcknowledge={onAcknowledge}
          />
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
              onClick={blocker?.kind === "fixes" ? onRecheck : onContinue}
              loading={rechecking}
              disabled={blocker !== null && blocker.kind !== "fixes"}
            >
              {blocker ? blocker.label : "Continue"}
              {blocker === null && (
                <ArrowRight aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Rows that look like somebody already on file, with the two answers.
 *
 * Skip or update, per row, chosen by the customer. Deciding for them is the one
 * thing this must not do: creating a second record for one person and dropping a
 * row on suspicion are both wrong, and the file cannot say which this is.
 *
 * The evidence is shown rather than summarised — what matched, and the value
 * that matched — because "possible duplicate" is a verdict nobody can check and
 * "same work email: ada@company.com" is a fact they can.
 */
function Duplicates({
  dictionary,
  rows,
  decisions,
  onDecide,
  undecided,
}: {
  dictionary: Dictionary<string>;
  rows: readonly RowLine[];
  decisions: Record<number, "skip" | "update">;
  onDecide: (row: number, action: "skip" | "update") => void;
  undecided: number;
}) {
  return (
    <Card>
      <CardHeader
        level={2}
        title={
          undecided > 0
            ? `${undecided} ${undecided === 1 ? "row" : "rows"} might already be on your list`
            : "Every possible duplicate is answered"
        }
        description={
          undecided > 0
            ? "Found by work email, or by name and date of birth. Nothing happens to these until you say which."
            : "These will do what you chose. Change any of them before you carry on."
        }
      />
      <TableWrap
        className="rounded-none border-0 border-t border-line"
        caption="Rows that look like somebody already on your list"
      >
        <THead>
          <TH className="w-20">Row</TH>
          <TH>In your file</TH>
          <TH>Already on your list</TH>
          <TH>Matched on</TH>
          <TH className="w-72">What should we do?</TH>
        </THead>
        <TBody>
          {rows.map((row) => {
            const match = row.duplicate;
            if (!match) return null;
            const chosen = decisions[row.row] ?? match.decision;
            return (
              <TR key={row.row}>
                <TD className="tabular align-top font-medium text-ink">{row.row}</TD>
                <TD className="align-top">
                  <span className="block text-meta text-ink">
                    {row.name ?? "No name in this row"}
                  </span>
                  {row.employeeNo && (
                    <span className="tabular block text-meta text-muted">
                      {row.employeeNo}
                    </span>
                  )}
                </TD>
                <TD className="align-top">
                  <span className="block text-meta text-ink">{match.name}</span>
                  <span className="tabular block text-meta text-muted">
                    {match.employeeNo}
                    {match.archived ? " · archived" : ""}
                  </span>
                </TD>
                <TD className="align-top">
                  <span className="block text-meta text-muted">
                    {match.on === "email"
                      ? "Same work email"
                      : "Same name and date of birth"}
                  </span>
                  <span className="block text-meta text-body break-words">
                    {match.value}
                  </span>
                </TD>
                <TD className="align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={chosen === "update" ? "accent" : "secondary"}
                      onClick={() => onDecide(row.row, "update")}
                    >
                      Update them
                    </Button>
                    <Button
                      size="sm"
                      variant={chosen === "skip" ? "accent" : "secondary"}
                      onClick={() => onDecide(row.row, "skip")}
                    >
                      Leave them alone
                    </Button>
                  </div>
                  <p className="mt-1.5 text-meta leading-relaxed text-muted">
                    {chosen === "update"
                      ? `This row goes onto ${match.name}'s record. They keep the ${dictionary.keyLabel} they already have, ${match.employeeNo}.`
                      : chosen === "skip"
                        ? "This row is not imported, and nothing about them changes."
                        : "Updating writes this row onto their record. Leaving them alone imports nothing from this row."}
                  </p>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </TableWrap>
    </Card>
  );
}

/**
 * The "important" list: people who import with something payroll will want.
 *
 * This is the user's own words — *it shows under important that this user's
 * detail is missing* — and the design follows from what it is for. It does not
 * block, because refusing the record does not produce the bank account. It names
 * every person, because a count is not something anybody can act on. And it is
 * acknowledged with a real checkbox, because the alternative for the two
 * hundredth row of a five hundred row file is a warning nobody reads.
 */
function Flagged({
  dictionary,
  rows,
  acknowledged,
  onAcknowledge,
}: {
  dictionary: Dictionary<string>;
  rows: readonly RowLine[];
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 20);

  return (
    <div className="border-t border-line">
      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text [&>svg]:size-4"
        >
          <AlertTriangle />
        </span>
        <div className="min-w-0">
          <h3 className="text-body-sm font-semibold text-ink">
            Important: {rows.length}{" "}
            {rows.length === 1
              ? `${dictionary.noun.one} is`
              : `${dictionary.noun.many} are`}{" "}
            missing a detail payroll will ask for
          </h3>
          <p className="mt-1 max-w-2xl text-meta leading-relaxed text-muted">
            They will still be imported. None of this stops a record from being
            created and nothing is invented to fill the gap — but each one comes
            back at a payroll run, so it is worth knowing now rather than then.
          </p>
        </div>
      </div>

      <TableWrap
        className="mt-4 rounded-none border-0 border-t border-line"
        caption={`Rows that import with a detail missing`}
      >
        <THead>
          <TH className="w-20">Row</TH>
          <TH>Who</TH>
          <TH>What is missing, and what it costs</TH>
        </THead>
        <TBody>
          {visible.map((row) => (
            <TR key={row.row}>
              <TD className="tabular align-top font-medium text-ink">{row.row}</TD>
              <TD className="align-top">
                <span className="block text-meta text-ink">
                  {row.name ?? "No name in this row"}
                </span>
                {row.employeeNo && (
                  <span className="tabular block text-meta text-muted">
                    {row.employeeNo}
                    {row.employeeNoGenerated ? " · number generated" : ""}
                  </span>
                )}
              </TD>
              <TD className="align-top">
                <ul className="flex flex-col gap-1">
                  {row.missing.map((item) => (
                    <li key={item.field} className="text-meta text-body">
                      <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                        {item.column}
                      </code>{" "}
                      {item.why}
                    </li>
                  ))}
                </ul>
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>

      <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
        {rows.length > visible.length && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show the other {(rows.length - visible.length).toLocaleString("en-NG")}
          </Button>
        )}
        <Checkbox
          label={`I have read this list of ${rows.length}`}
          description={`These can be filled in afterwards, on each ${dictionary.noun.one}'s record — or by importing the same file again with the columns added.`}
          checked={acknowledged}
          onChange={(event) => onAcknowledge(event.currentTarget.checked)}
        />
      </div>
    </div>
  );
}
