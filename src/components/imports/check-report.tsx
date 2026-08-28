"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { cn } from "@/lib/cn";
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
  Disclosure,
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
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import type { CheckOutcome, RowLine } from "@/lib/store/imports";
import { confirmLabel } from "./import-result";

/** "person" → "People". The noun starts a stat label often enough to earn this. */
const capitalise = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A one- or two-word label for the row in its collapsed state.
 *
 * The full sentence — "There is no department called...", "Rent cannot be
 * negative" — is still the thing that actually helps somebody fix a row, and
 * it still renders, just behind a click rather than in front of every one of
 * sixty rows at once. This is only ever the thing scanned first.
 */
function shortReason(problem: string, value: string | null): string {
  if (value === null || value === "") return "Missing";
  if (/already (on row|been)|repeats|two rows cannot be/i.test(problem))
    return "Duplicate";
  if (
    /does not exist|no .* called|not one of|not a real|not recognise/i.test(
      problem,
    )
  )
    return "No match";
  if (/before the start date|loops back|ends before it starts/i.test(problem))
    return "Conflict";
  if (/twelve times|outside/i.test(problem)) return "Out of range";
  return "Invalid";
}

/**
 * Step three: what this file will do, before it does it — and the step that
 * submits it. Entity-agnostic — the words for one row and the things a row can
 * refer to both come off its inputs.
 *
 * The screen the whole flow exists for. Four rules hold it together:
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
 *    spreadsheet, and two hundred of them are not a reason to stay here. The
 *    same is true of an optional detail merely missing — see `OptionalDetails`.
 * 4. **The three kinds of unfinished business are kept apart**, because they end
 *    differently. A **problem** stops a row. A **duplicate** is a question only
 *    the customer can answer, and the row waits until they do. A **missing
 *    detail** stops nothing, costs nothing to skip today, and is grouped by
 *    field further down the same page rather than gated behind its own step —
 *    there used to be a second step and a checkbox for this, and both asked to
 *    be read rather than acted on, which a fixable list should not have to.
 *
 * One page, not two: this used to hand off to a "ready to import?" step once
 * everything above was in order. It never said anything this step's own counts
 * had not already said, so the button at the bottom of this page now submits
 * directly — see `onConfirm`.
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
  /** Shown only in demo mode, when there is no real check to act on. */
  refusalWithoutApi: string;
  onBack: () => void;
  onDownload: () => void;
  /**
   * Corrections made here, keyed `row:field`.
   *
   * Until now the only way out of a failed row was to download the rejects, fix
   * them in a spreadsheet and upload the file again — which for one missing
   * phone number in a 500-row file is an absurd amount of work, and is the
   * moment most people give up on an import. The same map takes a value typed
   * for an optional detail further down the page — one mechanism, wherever the
   * row+field pair came from.
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
  onDecideAll: (rows: readonly number[], action: "skip" | "update") => void;
  onSeedDecisions: (rows: readonly number[]) => void;
  /** Submits the import — the whole reason this step now has one button, not two steps. */
  onConfirm: () => void;
  confirming: boolean;
};

export function CheckReport({
  dictionary,
  prerequisites,
  check,
  refusalWithoutApi,
  onBack,
  onDownload,
  fixes,
  fixCount,
  onFix,
  onRecheck,
  rechecking,
  unchecked,
  decisions,
  onDecide,
  onDecideAll,
  onSeedDecisions,
  onConfirm,
  confirming,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const canManageSettings = useCan("MANAGE_SETTINGS");
  const departmentsApi = useDepartments();
  const [creatingDepartments, setCreatingDepartments] = useState(false);
  const [createDepartmentsError, setCreateDepartmentsError] = useState<
    string | null
  >(null);

  /**
   * One click instead of one correction typed per row. A file that names
   * "Machine Shop" on eight different rows is one missing department, not
   * eight — creating it here and rechecking clears all eight at once.
   *
   * Never refuses on one name failing (a race with somebody else creating the
   * same department, most likely) — it creates what it still can and lets the
   * recheck report whatever, if anything, is still missing.
   */
  const createMissingDepartments = async (names: readonly string[]) => {
    setCreatingDepartments(true);
    setCreateDepartmentsError(null);
    const results = await Promise.allSettled(
      names.map((name) => departmentsApi.create({ name })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setCreatingDepartments(false);
    if (failed > 0) {
      setCreateDepartmentsError(
        failed === names.length
          ? "Could not create any of them. Try again, or add them from Departments."
          : `Created ${names.length - failed} of ${names.length}. The rest may already exist, or something went wrong — check Departments.`,
      );
    }
    await onRecheck();
  };

  /**
   * Which lines have had their open/closed state clicked away from its
   * default, tracked as a set of keys rather than a set of open rows so it
   * survives a re-check — the keys change (`row-index-column`), and a set of
   * "open" rows would silently re-collapse everything on every recheck.
   *
   * A row missing a value opens by default: there is no sentence to hide
   * behind a click, and the whole point of stopping there is to type the
   * value in. A row with a wrong value stays collapsed — that one does have a
   * sentence worth summarising first. `isOpenByDefault` and `toggled` combine
   * with XOR, so a click always flips the row whichever state it started in.
   */
  const isOpenByDefault = (line: { value: string | null }): boolean =>
    line.value === null || line.value === "";
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* Rows that look like somebody already on file get their own card, so they
     stay out of the problem list — the same row appearing twice, once with a
     "type a correction" box beside it, would suggest a typo is what is wrong
     with it. Always, not only while undecided: the Duplicates card is where
     these are answered, whatever the answer currently is. */
  const duplicates = useMemo(
    () => check.problems.filter((row) => row.duplicate !== null),
    [check.problems],
  );

  /**
   * Every duplicate defaults to "update" the moment the check reveals it, so
   * the customer's job is opting specific people OUT rather than answering
   * for every one of them. Seeded once per check — a row already decided,
   * including one just set to "skip", is never overwritten; a duplicate a
   * recheck turns up for the first time gets the same default the others
   * already have.
   */
  useEffect(() => {
    if (duplicates.length > 0) onSeedDecisions(duplicates.map((row) => row.row));
  }, [duplicates, onSeedDecisions]);

  /**
   * Duplicates whose answer has not been through a check yet.
   *
   * `row.duplicate.decision` is the API's own echo of whatever decision that
   * row's *last check* carried — `null` until one has. Comparing it against
   * the live `decisions` map is what tells the difference between "answered,
   * and the report already reflects it" and "answered here, on screen, and
   * not sent yet" — the same distinction `fixes` versus `fixCount` draws for
   * a typed correction. Approving here without a recheck would apply an
   * answer the batch was never fingerprinted against, which is exactly what
   * that fingerprint exists to refuse.
   */
  const pendingDuplicates = duplicates.filter(
    (row) => (decisions[row.row] ?? null) !== row.duplicate!.decision,
  );

  const flaggedRows = useMemo(
    () => check.problems.filter((row) => row.missing.length > 0),
    [check.problems],
  );

  /* One line per problem rather than per row: a row with three things wrong has
     three fixes, and collapsing them hides two. Duplicates are excluded here
     unconditionally — they always have their own card, decided or not. */
  const lines = useMemo(
    () =>
      check.problems
        .filter((row) => row.duplicate === null)
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
   * The one thing stopping the final button, if anything is.
   *
   * A single value rather than a disabled button and a hope: whatever is in
   * the way gets its name on the button, so nobody has to hunt up the page
   * for the reason they cannot carry on.
   *
   * A duplicate answer given here is exactly as unsent as a typed correction
   * — both change what a recheck would report, and applying either without
   * one would send the API an answer the batch was never fingerprinted
   * against. So the two share one blocker and one button: "Recheck &
   * continue" fires the same recheck whichever (or both) is why it is
   * showing, and the label says which. Once neither is outstanding, the same
   * button becomes the one that actually submits — see `onConfirm`.
   */
  const recheckBlocker =
    unchecked || pendingDuplicates.length > 0
      ? {
          label: `Recheck & continue (${[
            fixCount > 0 ? `${fixCount} ${fixCount === 1 ? "fix" : "fixes"}` : null,
            pendingDuplicates.length > 0
              ? `${pendingDuplicates.length} duplicate ${pendingDuplicates.length === 1 ? "answer" : "answers"}`
              : null,
          ]
            .filter(Boolean)
            .join(", ")})`,
        }
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={
            check.rowsChecked < check.totalRows
              ? "Rows checked"
              : "Rows in the file"
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
            check.authoritative
              ? "not on your list yet"
              : "nothing wrong in the file"
          }
        />
        <Stat
          label={`${capitalise(dictionary.noun.many)} to update`}
          value={
            check.authoritative ? check.toUpdate.toLocaleString("en-NG") : "—"
          }
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
      {/* PAYE state is recommended, not required — same footing as gross
          monthly. A row with no tax_state cell still imports; it just has no
          state for filing until the company sets a default or somebody adds
          one to the record later. This is one company-level note, not one
          sentence per row, so a file of 300 rows without the column reads as
          one thing to do rather than 300 unrelated warnings. */}
      {check.missingOrgTaxState && (
        <Callout tone="warning" title="Your company has no default PAYE state">
          <p className="mb-3">
            Rows below with no <code className="text-meta">tax_state</code>{" "}
            cell will still import — their tax is deducted correctly either
            way. Only the state filing for it is left incomplete until you set
            a default in Settings, or add one to each record later.
          </p>
          <ButtonLink href="/settings/company" size="sm" variant="secondary">
            Set it in Settings
          </ButtonLink>
        </Callout>
      )}

      {/* One callout per kind of thing the file named that does not exist yet.
          Driven by what the check returned rather than by a fixed pair, so an
          entity with three such lists gets three without editing this file. */}
      {Object.entries(check.missing)
        .filter(([, names]) => names.length > 0)
        .map(([kind, names]) => {
          const detail = prerequisites[kind];
          /* Departments are the one prerequisite this screen can create
             itself — a name is all `POST /departments` needs. Everything
             else still only gets a link, because a salary grade needs a
             pay band nobody typed here. */
          const canCreateHere = kind === "departments" && canManageSettings;
          return (
            <Callout
              key={kind}
              tone="warning"
              title={detail?.title ?? `Some ${kind} do not exist yet`}
            >
              <p className="mb-3">
                {names.join(", ")}. Rows naming{" "}
                {names.length === 1 ? "it" : "them"}{" "}
                {detail?.consequence ?? "will be skipped."}
              </p>
              {createDepartmentsError && kind === "departments" && (
                <p className="mb-3 text-meta text-danger-text">
                  {createDepartmentsError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {canCreateHere && (
                  <Button
                    size="sm"
                    variant="accent"
                    loading={creatingDepartments}
                    onClick={() => void createMissingDepartments(names)}
                  >
                    Create all {names.length} now
                  </Button>
                )}
                {detail?.action && (
                  <ButtonLink
                    href={detail.action.href}
                    size="sm"
                    variant="secondary"
                  >
                    {detail.action.label}
                  </ButtonLink>
                )}
              </div>
            </Callout>
          );
        })}

      {duplicates.length > 0 && (
        <Duplicates
          dictionary={dictionary}
          rows={duplicates}
          decisions={decisions}
          onDecide={onDecide}
          onDecideAll={onDecideAll}
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
                    Download the {skipRows} {skipRows === 1 ? "row" : "rows"} to
                    fix
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
                      {unchecked ? "Recheck & continue" : "Check again"}
                    </Button>
                  </div>
                )}

                <TableWrap
                  className="rounded-none border-0 border-b border-line"
                  caption="Every problem, with the row and column it is in — click a row to fix it"
                >
                  <THead>
                    <TH className="w-20">Row</TH>
                    <TH>Who</TH>
                    <TH>Column</TH>
                    <TH>Issue</TH>
                    <TH>Result</TH>
                  </THead>
                  <TBody>
                    {visible.map((line) => {
                      const pending =
                        Boolean(fixes[`${line.row}:${line.field}`]) &&
                        unchecked;
                      const open =
                        isOpenByDefault(line) !== toggled.has(line.key);
                      /* The dictionary's own `example` — the same realistic
                         value the downloaded template prints in this column —
                         doubles as the format hint here. A blank input asking
                         for "a date" leaves the shape of it to guesswork; one
                         placeholdered "28/04/2021" shows day-first, four-digit
                         years and the separator all at once. */
                      const fieldExample = line.field
                        ? dictionary.byField.get(line.field)?.example
                        : undefined;
                      return (
                        <Fragment key={line.key}>
                          <TR
                            interactive
                            onClick={() => toggle(line.key)}
                            aria-expanded={open}
                          >
                            <TD className="tabular font-medium text-ink">
                              {line.row}
                            </TD>
                            <TD>
                              <span className="block text-meta text-ink">
                                {line.who}
                              </span>
                              {line.employeeNo && (
                                <span className="tabular block text-meta text-muted">
                                  {line.employeeNo}
                                </span>
                              )}
                            </TD>
                            <TD>
                              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta text-body">
                                {line.column || "—"}
                              </code>
                            </TD>
                            <TD>
                              <span className="text-meta text-body">
                                {shortReason(line.problem, line.value)}
                              </span>
                            </TD>
                            <TD>
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
                          {open && (
                            <TR className="bg-sunken/60">
                              <TD colSpan={5} className="py-4">
                                <p className="text-meta text-body">
                                  {line.problem}
                                </p>
                                {line.value !== null && line.value !== "" && (
                                  <p className="mt-1 text-meta text-muted">
                                    In your file:{" "}
                                    <span className="text-body">
                                      {line.value}
                                    </span>
                                  </p>
                                )}
                                {line.field ? (
                                  <Input
                                    className="mt-2.5 max-w-sm"
                                    aria-label={`${line.column || "Value"} for row ${line.row}`}
                                    value={
                                      fixes[`${line.row}:${line.field}`] ?? ""
                                    }
                                    placeholder={
                                      fieldExample
                                        ? `e.g. ${fieldExample}`
                                        : line.value === null || line.value === ""
                                          ? "Type the missing value"
                                          : "Type a correction"
                                    }
                                    onChange={(e) =>
                                      onFix(
                                        line.row,
                                        line.field,
                                        e.target.value,
                                      )
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  /* Nothing to mend: this row was never sent. */
                                  <p className="mt-1 text-meta text-muted">
                                    This row was never sent, so there is nothing
                                    to fix here.
                                  </p>
                                )}
                              </TD>
                            </TR>
                          )}
                        </Fragment>
                      );
                    })}
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
                      {(ordered.length - visible.length).toLocaleString(
                        "en-NG",
                      )}
                    </Button>
                  </CardBody>
                )}
              </>
            )}
          </Card>

      {flaggedRows.length > 0 && (
        <Card>
          <OptionalDetails
            dictionary={dictionary}
            rows={flaggedRows}
            fixes={fixes}
            onFix={onFix}
          />
        </Card>
      )}

      {DEMO_ENABLED && !check.authoritative && (
        <Callout tone="warning" title="Importing needs the API">
          {refusalWithoutApi}
        </Callout>
      )}

      <Card>
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
              variant={recheckBlocker ? "accent" : "approve"}
              size="lg"
              onClick={recheckBlocker ? onRecheck : onConfirm}
              loading={rechecking || confirming}
              disabled={
                !recheckBlocker &&
                (willImport === 0 || !check.authoritative)
              }
            >
              {!recheckBlocker && <CheckCircle2 aria-hidden="true" className="size-4" />}
              {recheckBlocker
                ? recheckBlocker.label
                : willImport === 0
                  ? "Nothing to import"
                  : confirmLabel(dictionary.noun, check.toCreate, check.toUpdate, check.toSkip)}
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
 * Every row defaults to **update** the moment it is found, checkbox already
 * ticked — the product owner's own words were that answering one row at a
 * time, sixty rows deep in a file, is too slow to be worth doing. Opting a
 * person OUT is one click; nothing here is hidden or silent, because the row
 * stays on screen, ticked or not, until "Recheck & continue" is pressed —
 * there is no moment where a choice is made without it being visible and
 * changeable first.
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
  onDecideAll,
}: {
  dictionary: Dictionary<string>;
  rows: readonly RowLine[];
  decisions: Record<number, "skip" | "update">;
  onDecide: (row: number, action: "skip" | "update") => void;
  onDecideAll: (rows: readonly number[], action: "skip" | "update") => void;
}) {
  const rowNumbers = rows.map((row) => row.row);
  const updatingCount = rowNumbers.filter(
    (number) => decisions[number] !== "skip",
  ).length;
  const allUpdating = updatingCount === rowNumbers.length;
  const noneUpdating = updatingCount === 0;

  return (
    <Card>
      <CardHeader
        level={2}
        title={`${rows.length} ${rows.length === 1 ? "row" : "rows"} might already be on your list`}
        description={`Found by work email, or by name and date of birth. ${updatingCount} of ${rows.length} will update the matching record — untick the ones you'd rather leave alone.`}
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
          <TH className="w-56">
            <Checkbox
              label="Update"
              checked={allUpdating}
              indeterminate={!allUpdating && !noneUpdating}
              onChange={() =>
                onDecideAll(rowNumbers, allUpdating ? "skip" : "update")
              }
            />
          </TH>
        </THead>
        <TBody>
          {rows.map((row) => {
            const match = row.duplicate;
            if (!match) return null;
            const willUpdate = decisions[row.row] !== "skip";
            return (
              <TR key={row.row}>
                <TD className="tabular align-top font-medium text-ink">
                  {row.row}
                </TD>
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
                  <Checkbox
                    label="Update them"
                    checked={willUpdate}
                    onChange={(event) =>
                      onDecide(row.row, event.target.checked ? "update" : "skip")
                    }
                  />
                  <p className="mt-1.5 text-meta leading-relaxed text-muted">
                    {willUpdate
                      ? `This row goes onto ${match.name}'s record. They keep the ${dictionary.keyLabel} they already have, ${match.employeeNo}.`
                      : "Left alone — this row is not imported, and nothing about them changes."}
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

/** One row narrowed to only the missing items one tier cares about. */
type TieredRow = Pick<
  RowLine,
  "row" | "name" | "employeeNo" | "employeeNoGenerated"
> & { missing: RowLine["missing"] };

/** Only the missing items that stop a payroll run from paying somebody at all. */
const importantOnly = (rows: readonly RowLine[]): TieredRow[] =>
  rows
    .map((row) => ({
      ...row,
      missing: row.missing.filter((item) => item.important),
    }))
    .filter((row) => row.missing.length > 0);

/** Everything recommended that is not that — a schedule or a filing, not a payment. */
const laterOnly = (rows: readonly RowLine[]): TieredRow[] =>
  rows
    .map((row) => ({
      ...row,
      missing: row.missing.filter((item) => !item.important),
    }))
    .filter((row) => row.missing.length > 0);

/** Every affected row for one missing field, so it can be fixed as one group. */
type FieldGroup = {
  field: string;
  column: string;
  example: string | undefined;
  people: { row: number; who: string; why: string }[];
};

/** `later` rows, regrouped by field rather than by row — see `OptionalDetails`. */
function groupByField(
  rows: readonly TieredRow[],
  dictionary: Dictionary<string>,
): FieldGroup[] {
  const groups = new Map<string, FieldGroup>();
  for (const row of rows) {
    const who = row.name ?? row.employeeNo ?? "No name in this row";
    for (const item of row.missing) {
      const person = { row: row.row, who, why: item.why };
      const existing = groups.get(item.field);
      if (existing) existing.people.push(person);
      else
        groups.set(item.field, {
          field: item.field,
          column: item.column,
          example: dictionary.byField.get(item.field)?.example,
          people: [person],
        });
    }
  }
  return [...groups.values()];
}

/**
 * Everything a row is missing that will not stop it importing.
 *
 * Split into the same two tiers the payroll run itself would recognise
 * (`ColumnSpec.recommended.important`, so this cannot drift from what the run
 * actually enforces), rendered two different ways because they need different
 * things from whoever is looking at them:
 *
 * - **Needed to pay them** (`missing_pay` / `missing_bank_account`) is shown
 *   plainly, every row named — a count is not something anybody can act on,
 *   and fixing this one takes more than a text box (a real bank-details form),
 *   so this tier only ever points at where to go, never asks for a value here.
 * - **Everything else** (a TIN, a pension PIN, an annual rent figure) is a
 *   single value each, so it is grouped by field — one thing to open, not one
 *   row at a time — and typing a value writes straight into the same `fixes`
 *   map the Problems table above uses. No acknowledgement either: nothing
 *   here blocks a payment, so there is nothing to make somebody confirm they
 *   read before they can carry on.
 */
function OptionalDetails({
  dictionary,
  rows,
  fixes,
  onFix,
}: {
  dictionary: Dictionary<string>;
  rows: readonly RowLine[];
  fixes: Record<string, string>;
  onFix: (row: number, field: string, value: string) => void;
}) {
  const important = useMemo(() => importantOnly(rows), [rows]);
  const later = useMemo(() => laterOnly(rows), [rows]);
  const groups = useMemo(() => groupByField(later, dictionary), [later, dictionary]);
  const [showAllImportant, setShowAllImportant] = useState(false);
  const visibleImportant = showAllImportant ? important : important.slice(0, 20);

  return (
    <div className="flex flex-col">
      {important.length > 0 && (
        <div className="flex flex-col">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text [&>svg]:size-4"
            >
              <AlertTriangle />
            </span>
            <h3 className="text-body-sm font-semibold text-ink">
              {`${important.length} ${
                important.length === 1
                  ? `${dictionary.noun.one} is`
                  : `${dictionary.noun.many} are`
              } missing something needed to pay them`}
            </h3>
          </div>

          <TableWrap
            className="rounded-none border-0 border-t border-line"
            caption="Rows importing with no way to pay them yet"
          >
            <THead>
              <TH className="w-20">Row</TH>
              <TH>Who</TH>
              <TH>What is missing, and what it costs</TH>
            </THead>
            <TBody>
              {visibleImportant.map((row) => (
                <TR key={row.row}>
                  <TD className="tabular align-top font-medium text-ink">
                    {row.row}
                  </TD>
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

          {important.length > visibleImportant.length && (
            <div className="px-4 py-3 sm:px-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllImportant(true)}
              >
                Show the other{" "}
                {(important.length - visibleImportant.length).toLocaleString(
                  "en-NG",
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div
          className={cn(
            "flex flex-col gap-3 p-4 sm:p-5",
            important.length > 0 && "border-t border-line",
          )}
        >
          <div>
            <h3 className="text-body-sm font-semibold text-ink">
              {`${later.length} ${
                later.length === 1 ? dictionary.noun.one : dictionary.noun.many
              } missing an optional detail`}
            </h3>
            <p className="mt-1 text-meta text-muted">
              Every {dictionary.noun.one} still imports. Open a field below to
              fill it in now, or leave it for the record later.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <Disclosure
                key={group.field}
                title={group.column}
                meta={
                  <Badge size="sm">
                    {group.people.length.toLocaleString("en-NG")}
                  </Badge>
                }
              >
                <ul className="flex flex-col gap-3">
                  {group.people.map((person) => (
                    <li
                      key={person.row}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="tabular block text-meta text-muted">
                          Row {person.row}
                        </span>
                        <span className="block text-meta text-ink">
                          {person.who}
                        </span>
                      </div>
                      <Input
                        className="max-w-xs flex-1"
                        aria-label={`${group.column} for row ${person.row}`}
                        value={fixes[`${person.row}:${group.field}`] ?? ""}
                        placeholder={
                          group.example ? `e.g. ${group.example}` : "Type the value"
                        }
                        onChange={(e) =>
                          onFix(person.row, group.field, e.target.value)
                        }
                      />
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
