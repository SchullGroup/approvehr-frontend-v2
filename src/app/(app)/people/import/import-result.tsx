"use client";

import { useState } from "react";
import { CheckCircle2, Download, RefreshCw, Upload, Users } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Modal,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { ApplyOutcome, CheckOutcome } from "@/lib/store/imports";

const count = (value: number): string => value.toLocaleString("en-NG");
const people = (value: number): string => (value === 1 ? "person" : "people");

/**
 * The confirmation after a clean import.
 *
 * Shown as a modal only when **every** row landed. A partial import keeps the
 * inline treatment it already had — the warning plus the named list of rows that
 * did not go in — because a modal headed "imported" over three failures is the
 * dishonest version of this screen, and "never report a success without the
 * count of what did not land" is one of the four rules this flow was built on.
 *
 * Dismissible, and dismissing leaves the full result on the page behind it. The
 * modal is the acknowledgement, not the record.
 */

/**
 * What the button says it will do, in the numbers it will do it in.
 *
 * "Add 486 people and update 12" — not "Confirm", not "Import". The single most
 * important string on this screen: it is the last thing somebody reads before
 * five hundred salaries land in a payroll system, and it has to be the sentence
 * they would have written themselves.
 */
export function confirmLabel(
  toCreate: number,
  toUpdate: number,
  toSkip = 0,
): string {
  const doing =
    toCreate > 0 && toUpdate > 0
      ? `Add ${count(toCreate)} ${people(toCreate)} and update ${count(toUpdate)}`
      : toCreate > 0
        ? `Add ${count(toCreate)} ${people(toCreate)}`
        : toUpdate > 0
          ? `Update ${count(toUpdate)} ${people(toUpdate)}`
          : "Nothing to import";
  /* And what it will not do. A button that says "Add 47 people" over a file of
     50 is true and incomplete, and the three it is silent about are exactly the
     three somebody finds out about at the first payroll run. */
  return toSkip > 0 ? `${doing}, leave ${count(toSkip)} out` : doing;
}

/**
 * Step four: confirm, then the result.
 *
 * ## Never a success message without the number
 *
 * A partial import reports exactly how many rows did not land, and offers them
 * as a download. "Imported successfully" over 486 of 494 rows is the sentence
 * that gets found out at the first payroll run — eight people missing, nobody
 * told, and no way back to which eight. Every branch below names the shortfall.
 *
 * ## A part that fails is not a file that failed
 *
 * A large file goes up in parts, each written in its own transaction. If part
 * three does not go through, parts one and two are already in — so the result
 * says which rows landed, which did not, and hands back the ones that did not.
 * Pretending the whole thing failed would be as wrong as pretending it worked.
 */
export function ImportResult({
  check,
  result,
  busy,
  onBack,
  onConfirm,
  onDownload,
  onAnother,
  onRetry,
}: {
  check: CheckOutcome;
  result: ApplyOutcome | null;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDownload: () => void;
  onAnother: () => void;
  /**
   * Try again with only the rows that did not land.
   *
   * The loop this closes: 47 of 50 imported and three did not, and until now the
   * only way back was to download the rejects, open them in Excel and start the
   * whole flow again. The 47 are not re-sent, because a second pass at them
   * would be a harmless update and "harmless" is a claim about somebody's salary
   * that nobody needs to test.
   */
  onRetry: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  if (!result) {
    return (
      <Card>
        <CardHeader
          level={2}
          title="Ready to import"
          description={`From ${check.filename}. Nothing has changed yet.`}
        />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="To add" value={count(check.toCreate)} />
            <Stat label="To update" value={count(check.toUpdate)} />
            <Stat
              label="To be skipped"
              value={count(check.toSkip)}
              hint={check.toSkip > 0 ? "these stay in your file" : undefined}
            />
          </div>

          {!check.authoritative ? (
            <Callout tone="warning" title="Importing needs the API">
              This is demo mode. The file has been read and checked as far as a
              browser can, and that is where it stops: writing five hundred
              salaries into this browser would put a staff list in one laptop
              that no payroll run will ever see.
            </Callout>
          ) : (
            check.toSkip > 0 && (
              <Callout tone="info" title={`${count(check.toSkip)} rows will not be imported`}>
                They are still in your file. Download them from the previous
                step, fix them in Excel, and upload that file on its own.
              </Callout>
            )
          )}
        </CardBody>

        <CardFooter>
          <Button variant="ghost" onClick={onBack}>
            Back to the check
          </Button>
          {check.authoritative && (
            <Button
              variant="approve"
              size="lg"
              onClick={onConfirm}
              loading={busy}
              disabled={check.toCreate + check.toUpdate === 0}
            >
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {confirmLabel(check.toCreate, check.toUpdate, check.toSkip)}
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  const landed = result.created + result.updated;
  const missed = result.notImported.length;
  /* The reason beside the row number. Every row that did not land has one, and a
     row with no reason at all is one that was never sent — which is itself the
     reason, and is said rather than left blank. */
  const byRow = new Map(result.problems.map((line) => [line.row, line]));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="People added" value={count(result.created)} />
        <Stat label="People updated" value={count(result.updated)} />
        <Stat
          label="Rows not imported"
          value={count(missed)}
          trend={
            missed > 0
              ? { direction: "down", label: "Still in your file" }
              : { direction: "up", label: "All of them landed" }
          }
        />
        <Stat
          label="Reporting lines set"
          value={count(result.managersLinked)}
          hint="managers matched by staff number or name"
        />
      </div>

      {result.failure ? (
        <Callout
          tone="danger"
          title={`Part ${result.failure.part} of ${result.partsTotal} did not go through`}
        >
          <p className="mb-3">
            {count(landed)} {people(landed)} {landed === 1 ? "was" : "were"} imported
            before it stopped. {count(missed)} rows were not — they are unchanged
            in your file. {result.failure.message}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="accent" size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Try those {count(missed)} again
            </Button>
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <Download aria-hidden="true" className="size-3.5" />
              Download the {count(missed)} rows that did not import
            </Button>
          </div>
        </Callout>
      ) : (
        <Callout
          tone={missed > 0 ? "warning" : "success"}
          title={
            missed > 0
              ? `${count(landed)} imported, ${count(missed)} skipped`
              : `${count(landed)} ${people(landed)} imported`
          }
        >
          <p className={missed > 0 ? "mb-3" : ""}>
            {count(result.created)} added, {count(result.updated)} updated.{" "}
            {missed > 0
              ? `${count(missed)} ${missed === 1 ? "row" : "rows"} did not import and ${missed === 1 ? "is" : "are"} unchanged in your file.`
              : "Every row in the file landed."}
          </p>
          {missed > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="accent" size="sm" onClick={onRetry}>
                <RefreshCw aria-hidden="true" className="size-3.5" />
                Fix those {count(missed)} now
              </Button>
              <Button variant="secondary" size="sm" onClick={onDownload}>
                <Download aria-hidden="true" className="size-3.5" />
                Download the {count(missed)} rows to fix
              </Button>
            </div>
          )}
        </Callout>
      )}

      {missed > 0 && (
        <Card>
          <CardHeader
            level={2}
            title={`The ${count(missed)} ${missed === 1 ? "row" : "rows"} that did not import`}
            description="Named, not counted. Every one of these is still exactly as it was in your file."
          />
          <TableWrap
            className="rounded-none border-0 border-t border-line"
            caption="Rows that did not import"
          >
            <THead>
              <TH className="w-20">Row</TH>
              <TH>Who</TH>
              <TH>Why it did not import</TH>
            </THead>
            <TBody>
              {result.notImported.slice(0, 60).map((row) => {
                const line = byRow.get(row);
                return (
                  <TR key={row}>
                    <TD className="tabular align-top font-medium text-ink">{row}</TD>
                    <TD className="align-top">
                      <span className="text-meta text-ink">
                        {line?.name ?? line?.employeeNo ?? "—"}
                      </span>
                    </TD>
                    <TD className="align-top">
                      <span className="text-meta text-body">
                        {line?.duplicate?.decision === "skip"
                          ? `You chose to leave ${line.duplicate.name} alone.`
                          : (line?.problems.find(
                              (issue) => issue.severity === "error",
                            )?.problem ??
                            "This row was not sent, because an earlier part failed.")}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
          {missed > 60 && (
            <CardBody className="py-3.5 text-meta text-muted">
              The first 60 are listed. Download the file above for all{" "}
              {count(missed)}.
            </CardBody>
          )}
        </Card>
      )}

      {result.notes.length > 0 && (
        <Card>
          <CardHeader level={2} title="What we did with the awkward parts" />
          <CardBody>
            <ul className="flex flex-col gap-2 text-meta text-body">
              {result.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span aria-hidden="true" className="text-faint">
                    &middot;
                  </span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/people" variant="accent">
            <Users aria-hidden="true" className="size-4" />
            See your people
          </ButtonLink>
          <Button variant="secondary" onClick={onAnother}>
            <Upload aria-hidden="true" className="size-4" />
            Import another file
          </Button>
        </CardBody>
      </Card>

      {/* Clean import only — see the note above `ImportResult`. */}
      {result !== null &&
        result.failure === null &&
        result.notImported.length === 0 &&
        !acknowledged && (
          <Modal
            open
            onClose={() => setAcknowledged(true)}
            size="sm"
            title={`${count(result.created + result.updated)} ${people(
              result.created + result.updated,
            )} imported`}
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={onAnother}>
                  Import another file
                </Button>
                <ButtonLink href="/people" variant="accent">
                  View the directory
                </ButtonLink>
              </div>
            }
          >
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-6 text-success-text"
                />
              </span>
              <p className="text-body text-ink">
                {count(result.created)} added and {count(result.updated)} updated
                from {check.filename}.
              </p>
              <p className="text-body-sm text-muted">
                Every row in the file landed.
              </p>
            </div>
          </Modal>
        )}
    </div>
  );
}
