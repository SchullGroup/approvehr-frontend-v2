"use client";

import { CheckCircle2, Download, Upload, Users } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Stat,
} from "@/components/ui";
import type { ApplyOutcome, CheckOutcome } from "@/lib/store/imports";

const count = (value: number): string => value.toLocaleString("en-NG");
const people = (value: number): string => (value === 1 ? "person" : "people");

/**
 * What the button says it will do, in the numbers it will do it in.
 *
 * "Add 486 people and update 12" — not "Confirm", not "Import". The single most
 * important string on this screen: it is the last thing somebody reads before
 * five hundred salaries land in a payroll system, and it has to be the sentence
 * they would have written themselves.
 */
export function confirmLabel(toCreate: number, toUpdate: number): string {
  if (toCreate > 0 && toUpdate > 0) {
    return `Add ${count(toCreate)} ${people(toCreate)} and update ${count(toUpdate)}`;
  }
  if (toCreate > 0) return `Add ${count(toCreate)} ${people(toCreate)}`;
  if (toUpdate > 0) return `Update ${count(toUpdate)} ${people(toUpdate)}`;
  return "Nothing to import";
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
}: {
  check: CheckOutcome;
  result: ApplyOutcome | null;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDownload: () => void;
  onAnother: () => void;
}) {
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
              {confirmLabel(check.toCreate, check.toUpdate)}
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  const landed = result.created + result.updated;
  const missed = result.notImported.length;

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
          <Button variant="secondary" size="sm" onClick={onDownload}>
            <Download aria-hidden="true" className="size-3.5" />
            Download the {count(missed)} rows that did not import
          </Button>
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
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <Download aria-hidden="true" className="size-3.5" />
              Download the {count(missed)} rows to fix
            </Button>
          )}
        </Callout>
      )}

      {result.notes.length > 0 && (
        <Card>
          <CardHeader level={2} title="What we did with the awkward parts" />
          <CardBody>
            <ul className="flex flex-col gap-2 text-[0.875rem] text-body">
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
    </div>
  );
}
