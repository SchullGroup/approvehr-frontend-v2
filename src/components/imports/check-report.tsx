"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Download } from "lucide-react";
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
  SegmentedControl,
  Stat,
  StepIndicator,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
} from "@/components/ui";
import type { Dictionary } from "@/lib/imports/spec";
import type { ImportPrerequisite } from "@/lib/imports/surface";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import type { CheckOutcome, RowLine } from "@/lib/store/imports";

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
  onDecideAll: (rows: readonly number[], action: "skip" | "update") => void;
  onSeedDecisions: (rows: readonly number[]) => void;
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
  onDecideAll,
  onSeedDecisions,
  acknowledged,
  onAcknowledge,
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
  /* Only a field a payroll run would treat as a blocker earns the read-it-
     first gate below — see `Flagged`'s own note. An asset's serial number or
     a department's cost centre never sets `important`, so a file of nothing
     but those never asks for the tick, and the step completes on its own. */
  const flaggedNeedsAck = flaggedRows.some((row) =>
    row.missing.some((item) => item.important),
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
   * Two sub-steps rather than one long page: the problems that need a
   * decision or a correction, then — separately — the people who are
   * importing anyway with something payroll will want later.
   *
   * They were one scrolling page and the product owner's own words were
   * "going in circles": a duplicate to answer, sixty rows to fix and two
   * hundred names on a list nobody blocks on all competed for the same
   * screen, so pressing the one button at the bottom meant re-reading all of
   * it to find out which part it was even about. Splitting them is what
   * "click and see" asks for — each sub-step is answerable on its own, and
   * the rail says which one still has something outstanding.
   */
  const substeps = useStepper([
    {
      id: "problems",
      label: "Problems",
      hint:
        ordered.length === 0
          ? "Nothing to fix"
          : `${skipRows.toLocaleString("en-NG")} to fix`,
      isComplete:
        ordered.length === 0 || (!unchecked && pendingDuplicates.length === 0),
    },
    {
      id: "flagged",
      label: "Missing details",
      hint:
        flaggedRows.length === 0
          ? "Nothing missing"
          : `${flaggedRows.length.toLocaleString("en-NG")} to read`,
      isComplete: flaggedRows.length === 0 || !flaggedNeedsAck || acknowledged,
    },
  ]);

  /**
   * The one thing stopping the *problems* sub-step, if anything is.
   *
   * A single value rather than a disabled button and a hope: whatever is in
   * the way gets its name on the button, so nobody has to hunt up the page
   * for the reason they cannot carry on. The flagged-acknowledgement gate is
   * not here any more — it belongs to the sub-step that shows the list it is
   * acknowledging.
   *
   * A duplicate answer given here is exactly as unsent as a typed correction
   * — both change what a recheck would report, and applying either without
   * one would send the API an answer the batch was never fingerprinted
   * against. So the two share one blocker and one button: "Recheck &
   * continue" fires the same recheck whichever (or both) is why it is
   * showing, and the label says which.
   */
  const problemsBlocker =
    unchecked || pendingDuplicates.length > 0
      ? ({
          kind: "fixes",
          label: `Recheck & continue (${[
            fixCount > 0 ? `${fixCount} ${fixCount === 1 ? "fix" : "fixes"}` : null,
            pendingDuplicates.length > 0
              ? `${pendingDuplicates.length} duplicate ${pendingDuplicates.length === 1 ? "answer" : "answers"}`
              : null,
          ]
            .filter(Boolean)
            .join(", ")})`,
        } as const)
      : willImport === 0
        ? ({ kind: "nothing", label: "Nothing to import" } as const)
        : null;

  /** Where "Continue" on the problems sub-step goes: on if there is
   *  something to read there, straight through to the real next step
   *  otherwise — an empty "nothing here" screen is not a second step. */
  const afterProblems = () => {
    if (flaggedRows.length > 0) substeps.goTo(1);
    else onContinue();
  };

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

      <StepIndicator
        steps={substeps.steps}
        index={substeps.index}
        furthest={substeps.furthest}
        onStepSelect={(n) => substeps.goTo(n)}
      />

      {substeps.index === 0 && (
        <>
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
                                      line.value === null || line.value === ""
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
                  onClick={
                    problemsBlocker?.kind === "fixes"
                      ? onRecheck
                      : afterProblems
                  }
                  loading={rechecking}
                  disabled={
                    problemsBlocker !== null && problemsBlocker.kind !== "fixes"
                  }
                >
                  {problemsBlocker ? problemsBlocker.label : "Continue"}
                  {problemsBlocker === null && (
                    <ArrowRight aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </>
      )}

      {substeps.index === 1 && (
        <Card>
          <Flagged
            dictionary={dictionary}
            rows={flaggedRows}
            acknowledged={acknowledged}
            onAcknowledge={onAcknowledge}
          />
          <CardFooter>
            <Button variant="ghost" onClick={() => substeps.goTo(0)}>
              Back to problems
            </Button>
            <Button
              variant="accent"
              onClick={onContinue}
              disabled={flaggedRows.length > 0 && flaggedNeedsAck && !acknowledged}
            >
              {flaggedRows.length > 0 && flaggedNeedsAck && !acknowledged
                ? "Tick the box above to carry on"
                : "Continue"}
              {(flaggedRows.length === 0 || !flaggedNeedsAck || acknowledged) && (
                <ArrowRight aria-hidden="true" className="size-4" />
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
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

/**
 * The "important" list: people who import with something payroll will want.
 *
 * This is the user's own words — *it shows under important that this user's
 * detail is missing* — and the design follows from what it is for. It does not
 * block, because refusing the record does not produce the bank account. It names
 * every person, because a count is not something anybody can act on. And it is
 * acknowledged with a real checkbox, because the alternative for the two
 * hundredth row of a five hundred row file is a warning nobody reads.
 *
 * ## Two tiers, not one long table
 *
 * "A missing bank account" and "a missing TIN" both land here, and they are not
 * the same kind of gap: the first is why a payroll run refuses to pay somebody
 * at all (`missing_pay` / `missing_bank_account`, both BLOCKER-shaped once a
 * run actually reaches them); the second only leaves a schedule or a filing
 * incomplete, and the person is paid correctly regardless. Flattening both into
 * one list is how "important" stops meaning anything on the two-hundredth row.
 * `ColumnSpec.recommended.important` is the one declaration this reads, so a
 * field's tier cannot drift from what the payroll run itself would say about it.
 *
 * The important tier is where this opens if it has anything in it — required
 * comes first — and "Add the rest later" is what moves on to the tier that
 * genuinely can wait. A person can appear in both: their gaps are split by
 * field, not the person set by person.
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
  const important = useMemo(() => importantOnly(rows), [rows]);
  const later = useMemo(() => laterOnly(rows), [rows]);
  const [tier, setTier] = useState<"important" | "later">(
    important.length > 0 ? "important" : "later",
  );
  const shown = tier === "important" ? important : later;

  const [showAllImportant, setShowAllImportant] = useState(false);
  const [showAllLater, setShowAllLater] = useState(false);
  const showAll = tier === "important" ? showAllImportant : showAllLater;
  const setShowAll = tier === "important" ? setShowAllImportant : setShowAllLater;
  const visible = showAll ? shown : shown.slice(0, 20);

  /* Only `missing_pay` and `missing_bank_account` on the employee dictionary
     ever mark a field `important` — everything else (an asset's serial
     number, a department's cost centre) is always in `later`. That is the
     one place this list genuinely blocks a payment, so it is the only case
     that earns the amber "important" framing and the read-it-first gate
     below. A file with nothing in that tier gets one plain, unforced list —
     matching what it actually is: nothing stops the import, and here is
     what is missing, once, not held up as a decision to make. */
  const anyImportant = important.length > 0;

  return (
    <div>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        {anyImportant && (
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text [&>svg]:size-4"
          >
            <AlertTriangle />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-body-sm font-semibold text-ink">
            {anyImportant
              ? `Important: ${rows.length} ${
                  rows.length === 1
                    ? `${dictionary.noun.one} is`
                    : `${dictionary.noun.many} are`
                } missing something needed to pay them`
              : `${rows.length} ${
                  rows.length === 1 ? dictionary.noun.one : dictionary.noun.many
                } ${rows.length === 1 ? "is" : "are"} missing an optional detail`}
          </h3>
          <p className="mt-1 max-w-2xl text-meta leading-relaxed text-muted">
            {anyImportant
              ? "They will still be imported, and nothing is invented to fill the gap — but a payroll run cannot pay somebody without these, so it is worth knowing now rather than then."
              : `Every ${dictionary.noun.one} still imports. These can be filled in later, on the record or by importing the file again.`}
          </p>
        </div>
      </div>

      {important.length > 0 && later.length > 0 && (
        <div className="border-t border-line px-4 pt-4 sm:px-5">
          <SegmentedControl
            label="Which kind of gap to show"
            value={tier}
            onChange={setTier}
            options={[
              {
                value: "important",
                label: `Needed to pay them (${important.length})`,
              },
              { value: "later", label: `Add later (${later.length})` },
            ]}
          />
        </div>
      )}

      {anyImportant && (
        <p className="px-4 pt-4 text-meta text-muted sm:px-5">
          {tier === "important"
            ? "A payroll run cannot pay these people at all without one of these — set it now, or exclude them from a run until it is there."
            : "These leave a schedule or a filing incomplete, never the payment itself. Fine to come back to."}
        </p>
      )}

      <TableWrap
        className="mt-3 rounded-none border-0 border-t border-line"
        caption={
          tier === "important"
            ? "Rows importing with no way to pay them yet"
            : "Rows that import with a detail missing"
        }
      >
        <THead>
          <TH className="w-20">Row</TH>
          <TH>Who</TH>
          <TH>What is missing, and what it costs</TH>
        </THead>
        <TBody>
          {visible.map((row) => (
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

      <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
        {shown.length > visible.length && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show the other{" "}
            {(shown.length - visible.length).toLocaleString("en-NG")}
          </Button>
        )}
        {tier === "important" && later.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTier("later")}
          >
            Next: what can wait ({later.length})
          </Button>
        ) : (
          anyImportant && (
            <Checkbox
              label={`I have read this list of ${rows.length}`}
              description={`These can be filled in afterwards, on each ${dictionary.noun.one}'s record — or by importing the same file again with the columns added.`}
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.currentTarget.checked)}
            />
          )
        )}
      </div>
    </div>
  );
}
