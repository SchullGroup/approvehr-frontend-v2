"use client";

import { useRef, useState } from "react";
import {
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressMeter,
  StepIndicator,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
  type Step,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSession } from "@/lib/store/session";
import { useImport, useImportHistory } from "@/lib/store/imports";
import type { Dictionary } from "@/lib/imports/spec";
import type { ImportSurface } from "@/lib/imports/surface";
import { CheckReport } from "./check-report";
import { ImportResult } from "./import-result";
import { MatchColumns } from "./match-columns";

/**
 * Bring a spreadsheet in. Any spreadsheet, of anything.
 *
 * Onboarding a company means importing their file. The old system has a
 * one-at-a-time form and so did we, which is a week of typing for a company of
 * three hundred — and the reason a migration stalls. The product owner's rule
 * follows from that: **anywhere a user can add several of something, there is a
 * bulk upload with an Excel template.** Which is why this screen takes an
 * `ImportSurface` and knows nothing about employees — a second importable entity
 * is a dictionary, a surface and a validate/apply pair, not a fourth copy of
 * this file.
 *
 * ## Four steps, and the third is the product
 *
 * 1. Choose a file. 2. Match its columns to ours. 3. **Check.** 4. Import.
 *
 * Step three is why the other three exist. Nobody uploads five hundred salaries
 * blind: the check reports what will be created, what will be updated, and every
 * row that will not go in — with its row number, the column, and what to do
 * about it — before anything is written. Nothing on step three touches a record.
 *
 * ## The rules the copy on this screen follows
 *
 * - Say what will happen in numbers, on the button that will do it.
 * - Name the row and the column in the words the file uses.
 * - Never report a success without the count of what did not land.
 * - Offer the failures as a file, because they will be fixed in Excel.
 */
export function ImportFlow({ surface }: { surface: ImportSurface }) {
  const { can, isConnected } = useSession();
  const imp = useImport(surface.dictionary);
  const dictionary = surface.dictionary;
  /* One permission for every import, deliberately: `IMPORT_DATA` exists because
     one careless upload creates or overwrites hundreds of records, and blast
     radius is what a permission is for. It is not per-entity. */
  const allowed = !isConnected || can("IMPORT_DATA");

  /* A count on every step, so nobody is ever guessing what is about to happen
     to their data. Each hint is the number that step is about, and before that
     step has happened it says what it will be about instead. */
  const rows = imp.file?.csv.rows.length ?? 0;
  const matched = imp.file
    ? imp.file.csv.headers.filter((heading) => imp.mapping[heading]).length
    : 0;
  const steps: Step[] = [
    {
      id: "file",
      label: "Download and fill in",
      hint: imp.file
        ? `${rows.toLocaleString("en-NG")} ${rows === 1 ? "row" : "rows"} in ${imp.file.name}`
        : "Our template, or the file you already keep",
      isComplete: imp.file !== null,
    },
    {
      id: "columns",
      label: "Match the columns",
      hint: imp.file
        ? `${matched} of ${imp.file.csv.headers.length} columns matched`
        : "Your headings, whatever they are called",
      isComplete: imp.ready,
    },
    {
      id: "check",
      label: "Fix what is flagged",
      hint: imp.check
        ? `${imp.check.toSkip.toLocaleString("en-NG")} to fix, ${imp.check.flagged.toLocaleString("en-NG")} flagged`
        : "Before anything is saved",
      isComplete: imp.check !== null,
    },
    {
      id: "import",
      label: "Confirm",
      hint: imp.result
        ? `${(imp.result.created + imp.result.updated).toLocaleString("en-NG")} in, ${imp.result.notImported.length.toLocaleString("en-NG")} not`
        : imp.check
          ? `${(imp.check.toCreate + imp.check.toUpdate).toLocaleString("en-NG")} ${dictionary.noun.many}`
          : "One confirmation",
      isComplete: imp.result !== null,
    },
  ];

  /* Every step is entered by doing the one before it, and the two paths that
     drop the file (`clear`) move the rail themselves. So there is no effect
     here keeping the two in step — the thing an effect would be repairing is
     instead not possible. */
  const stepper = useStepper(steps);

  if (!allowed) {
    return (
      <>
        <PageHeader title={surface.title} breadcrumb={[...surface.breadcrumb]} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title={`You do not have permission to import ${dictionary.noun.many}`}
              description="An import can create or overwrite hundreds of pay records, so it is kept to specific people. Ask whoever set up your account to add the import permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={surface.title}
        description={surface.description}
        breadcrumb={[...surface.breadcrumb]}
        meta={
          imp.isConnected || !DEMO_ENABLED ? undefined : (
            <Badge tone="warning" size="sm">
              Demo data, this browser only
            </Badge>
          )
        }
        action={<TemplateButtons onDownload={imp.downloadTemplate} size="sm" />}
      />

      <PageBody className="flex flex-col gap-6">
        <StepIndicator
          steps={steps}
          index={stepper.index}
          furthest={stepper.furthest}
          /* Backwards only. Forwards happens by doing the step, never by
             clicking past it — the rail is not a shortcut around the check. */
          onStepSelect={(n) => {
            if (n < stepper.index) stepper.goTo(n);
          }}
        />

        {imp.error && (
          <Callout tone="danger" title="That did not work">
            {imp.error}
          </Callout>
        )}

        {imp.progress && (
          <Card>
            <CardBody>
              <ProgressMeter
                label={imp.progress.label}
                value={imp.progress.done}
                max={Math.max(1, imp.progress.total)}
                tone="accent"
              />
              <p className="mt-2 text-meta text-muted">
                Large files go up in parts. Each part reports its own numbers.
              </p>
            </CardBody>
          </Card>
        )}

        {stepper.index === 0 && (
          <ChooseFile
            surface={surface}
            filename={imp.file?.name ?? null}
            rows={imp.file?.csv.rows.length ?? 0}
            columns={imp.file?.csv.headers.length ?? 0}
            onFile={async (file) => {
              const ok = await imp.chooseFile(file);
              if (ok) stepper.goTo(1);
            }}
            onTemplate={imp.downloadTemplate}
          />
        )}

        {stepper.index === 1 && imp.file && (
          <MatchColumns
            dictionary={dictionary}
            csv={imp.file.csv}
            mapping={imp.mapping}
            onChange={imp.setColumn}
            onReset={imp.resetMapping}
            onBack={() => {
              imp.clear();
              stepper.goTo(0);
            }}
            busy={imp.progress !== null}
            retrying={imp.selection?.length ?? 0}
            onContinue={async () => {
              const ok = await imp.runCheck();
              if (ok) stepper.goTo(2);
            }}
          />
        )}

        {stepper.index === 2 && imp.check && (
          <CheckReport
            dictionary={dictionary}
            prerequisites={surface.prerequisites}
            unknownWithoutApi={surface.unknownWithoutApi}
            check={imp.check}
            onBack={() => stepper.goTo(1)}
            onDownload={imp.downloadRowsToFix}
            onContinue={() => stepper.goTo(3)}
            /* Answers to "is this the same person?", and the acknowledgement of
               the people who import with a detail missing. Both gate the step:
               see `blocker` in the report. */
            unchecked={imp.unchecked}
            decisions={imp.decisions}
            onDecide={(row, action) => {
              imp.decide(row, action);
            }}
            acknowledged={imp.acknowledged}
            onAcknowledge={imp.acknowledge}
            /* Fixing a cell here and re-checking, rather than downloading the
               rejects and editing them in Excel. `runCheck` re-applies the
               corrections over freshly mapped rows, so pressing this repeatedly
               is safe and the raw file is never altered. */
            fixes={imp.fixes}
            fixCount={imp.fixCount}
            onFix={imp.fixCell}
            onRecheck={() => void imp.runCheck()}
            rechecking={imp.progress !== null}
          />
        )}

        {stepper.index === 3 && imp.check && (
          <ImportResult
            surface={surface}
            check={imp.check}
            result={imp.result}
            busy={imp.progress !== null}
            onBack={() => stepper.goTo(2)}
            onConfirm={() => void imp.runImport()}
            onDownload={imp.downloadNotImported}
            onAnother={() => {
              imp.clear();
              stepper.goTo(0);
            }}
            /* Straight back to the check with only the rows that did not land.
               `retryNotImported` clears the check, so the rail has to move too —
               and it moves to the matching step because the check has to be run
               again before there is anything to confirm. */
            onRetry={() => {
              if (imp.retryNotImported()) stepper.goTo(1);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The template, in the two formats people actually have.
 *
 * Excel first and by default, because that is what a company keeps its staff
 * list in and because the workbook carries the guide sheet the CSV cannot. CSV
 * beside it rather than behind a menu: somebody exporting from an old system, or
 * working in Google Sheets, wants the other one, and one extra button is cheaper
 * than a dropdown they have to open to discover it exists.
 */
function TemplateButtons({
  onDownload,
  size = "md",
}: {
  onDownload: (format: "csv" | "xlsx") => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size={size} onClick={() => onDownload("xlsx")}>
        <Download aria-hidden="true" className="size-4" />
        Template for Excel
      </Button>
      <Button variant="ghost" size={size} onClick={() => onDownload("csv")}>
        <Download aria-hidden="true" className="size-4" />
        CSV
      </Button>
    </div>
  );
}

/**
 * Step one.
 *
 * `FileDrop` from the design system is not used here: it reports `{ id, name,
 * size }` and never hands over the `File`, so there is nothing to read. This
 * needs the bytes.
 */
function ChooseFile({
  surface,
  filename,
  rows,
  columns,
  onFile,
  onTemplate,
}: {
  surface: ImportSurface;
  filename: string | null;
  rows: number;
  columns: number;
  onFile: (file: File) => void | Promise<void>;
  onTemplate: (format: "csv" | "xlsx") => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const history = useImportHistory(surface.dictionary.kind);
  const dictionary: Dictionary<string> = surface.dictionary;
  /* Read off the built dictionary, which is already ordered required, then
     recommended, then the rest — so these two lists and the template's own
     column order cannot disagree about which is which. */
  const required = dictionary.columns.filter((spec) => spec.required);
  const recommended = dictionary.columns.filter(
    (spec) => spec.recommended !== undefined,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            level={2}
            title="Choose your file"
            description="An Excel workbook (.xlsx) or a CSV, from our template or from your old system."
          />
          <CardBody>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) void onFile(dropped);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border border-dashed px-5 py-10 text-center transition-colors duration-150",
                dragging
                  ? "border-accent bg-accent-soft"
                  : "border-line-strong bg-canvas",
              )}
            >
              <span
                aria-hidden="true"
                className="mb-4 flex size-11 items-center justify-center rounded-full bg-sunken text-muted [&>svg]:size-5"
              >
                <UploadCloud aria-hidden="true" />
              </span>
              <p className="text-body-sm font-semibold text-ink">
                Drag your file here
              </p>
              <p className="mt-1.5 max-w-sm text-meta leading-relaxed text-muted">
                Excel or CSV. Your headings can be called anything — you match
                them to ours on the next step.
              </p>
              <Button
                variant="accent"
                className="mt-4"
                onClick={() => input.current?.click()}
              >
                Choose a file
              </Button>
              <input
                ref={input}
                type="file"
                accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const chosen = event.currentTarget.files?.[0];
                  /* Cleared so choosing the same file again still fires. */
                  event.currentTarget.value = "";
                  if (chosen) void onFile(chosen);
                }}
              />
              {filename && (
                <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-meta text-body">
                  <FileSpreadsheet aria-hidden="true" className="size-4 text-muted" />
                  <span className="font-medium text-ink">{filename}</span>
                  <span className="text-muted">
                    {rows.toLocaleString("en-NG")} rows, {columns} columns
                  </span>
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            level={2}
            title="Starting from nothing?"
            description="Every column we can read, an example row, and a sheet explaining each one."
          />
          <CardBody className="flex flex-col gap-4">
            <TemplateButtons onDownload={onTemplate} />
            <div>
              <p className="text-meta font-semibold uppercase tracking-wide text-faint">
                Required — no row imports without {required.length === 1 ? "it" : "these"}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {required.map((spec) => (
                  <li key={spec.field}>
                    <code className="rounded bg-sunken px-1.5 py-0.5 text-meta text-body">
                      {spec.column}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-meta font-semibold uppercase tracking-wide text-faint">
                Recommended — imports, then appears under &ldquo;important&rdquo;
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {recommended.map((spec) => (
                  <li key={spec.field}>
                    <code className="rounded bg-sunken px-1.5 py-0.5 text-meta text-body">
                      {spec.column}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-meta leading-relaxed text-muted">
              The other{" "}
              {dictionary.columns.length - required.length - recommended.length}{" "}
              columns are optional. A column you do not have is left out, and
              left alone on anything we update. {surface.keyNote}
            </p>
          </CardBody>
        </Card>
      </div>

      {history.rows.length > 0 && (
        <Card>
          <CardHeader
            level={2}
            title="Imports before this one"
            description="What each file did, and who ran it."
          />
          <TableWrap
            className="rounded-none border-0 border-t border-line"
            caption="Past imports"
          >
            <THead>
              <TH>File</TH>
              <TH>What it did</TH>
              <TH>Ran by</TH>
              <TH>When</TH>
            </THead>
            <TBody>
              {history.rows.map((batch) => (
                <TR key={batch.id}>
                  <TDPrimary
                    title={batch.filename}
                    subtitle={`${batch.totalRows.toLocaleString("en-NG")} rows`}
                  />
                  <TD>
                    <span className="text-meta text-body">
                      {batch.summary}
                    </span>
                  </TD>
                  <TD>
                    <span className="text-meta text-body">{batch.by}</span>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-1.5 text-meta text-muted">
                      <Clock aria-hidden="true" className="size-3.5" />
                      {new Date(batch.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
