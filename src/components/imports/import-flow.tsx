"use client";

import { Fragment, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
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
import type { ApiImportBatchDetail } from "@/lib/api/imports";
import type { Dictionary } from "@/lib/imports/spec";
import type { ImportSurface } from "@/lib/imports/surface";
import { CheckReport } from "./check-report";
import { ImportOutcome } from "./import-result";
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
 * ## Three steps, and the third is the product
 *
 * 1. Choose a file. 2. Match its columns to ours. 3. **Check, then import.**
 *
 * Step three is why the other two exist. Nobody uploads five hundred salaries
 * blind: the check reports what will be created, what will be updated, and every
 * row that will not go in — with its row number, the column, and what to do
 * about it — before anything is written. The step's own button is what submits:
 * there used to be a fourth step asking "ready to import?" first, and it never
 * said anything the check above it had not already said. Once the button is
 * pressed, the same step shows what happened instead of what is about to.
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
      label: "Fixes",
      hint: imp.result
        ? `${(imp.result.created + imp.result.updated).toLocaleString("en-NG")} in, ${imp.result.notImported.length.toLocaleString("en-NG")} not`
        : imp.check
          ? `${imp.check.toSkip.toLocaleString("en-NG")} to fix, ${imp.check.flagged.toLocaleString("en-NG")} flagged`
          : "Before anything is saved",
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
            onResume={async (batchId) => {
              const ok = await imp.resumeFrom(batchId);
              if (ok) stepper.goTo(1);
              return ok;
            }}
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

        {stepper.index === 2 && imp.check && imp.result === null && (
          <CheckReport
            dictionary={dictionary}
            prerequisites={surface.prerequisites}
            check={imp.check}
            refusalWithoutApi={surface.refusalWithoutApi}
            onBack={() => stepper.goTo(1)}
            onDownload={imp.downloadRowsToFix}
            /* Answers to "is this the same person?" gate the step: see
               `blocker` in the report. */
            unchecked={imp.unchecked}
            decisions={imp.decisions}
            onDecide={(row, action) => {
              imp.decide(row, action);
            }}
            onDecideAll={imp.decideAll}
            onSeedDecisions={imp.seedDecisions}
            /* Fixing a cell here and re-checking, rather than downloading the
               rejects and editing them in Excel. `runCheck` re-applies the
               corrections over freshly mapped rows, so pressing this repeatedly
               is safe and the raw file is never altered. Missing-but-optional
               details are fixed the same way, from the same map. */
            fixes={imp.fixes}
            fixCount={imp.fixCount}
            onFix={imp.fixCell}
            onRecheck={() => void imp.runCheck()}
            rechecking={imp.progress !== null}
            /* The step's own button now submits directly — see the file
               header for why there is no separate confirm step any more. */
            onConfirm={() => void imp.runImport()}
            confirming={imp.progress !== null}
          />
        )}

        {stepper.index === 2 && imp.check && imp.result !== null && (
          <ImportOutcome
            surface={surface}
            filename={imp.check.filename}
            result={imp.result}
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
  onResume,
}: {
  surface: ImportSurface;
  filename: string | null;
  rows: number;
  columns: number;
  onFile: (file: File) => void | Promise<void>;
  onTemplate: (format: "csv" | "xlsx") => void;
  /** Pick a past batch up again. Resolves false when its rows are gone. */
  onResume: (batchId: string) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);
  const history = useImportHistory(surface.dictionary.kind);
  /* Which past batch is showing its row report, and what came back for it.
     Fetched once per batch and kept — reopening the same one should not
     re-fetch what is already on screen. */
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ApiImportBatchDetail>>(
    {},
  );
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);
  const toggleBatch = (batchId: string) => {
    if (openBatch === batchId) {
      setOpenBatch(null);
      return;
    }
    setOpenBatch(batchId);
    if (details[batchId]) return;
    setLoadingBatch(batchId);
    void history
      .getDetail(batchId)
      .then((detail) => setDetails((prev) => ({ ...prev, [batchId]: detail })))
      .catch(() => {
        /* Left absent — the render falls through to "Could not load". */
      })
      .finally(() => setLoadingBatch(null));
  };
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
            title="Start with our template"
            description="Every column, with an example row."
          />
          <CardBody className="flex flex-col gap-4">
            <TemplateButtons onDownload={onTemplate} />
            <div>
              <p className="text-meta font-semibold text-faint">
                Required
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
              <p className="text-meta font-semibold text-faint">
                Recommended
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
            {/* Was three sentences plus a per-entity `keyNote` explaining why
                the match key is refused rather than generated. Copy that has to
                explain the design is a sign the design needs no explaining: the
                two chip lists above already say which columns matter, and a row
                that is refused says why on the row. */}
            <p className="text-meta text-muted">
              The other{" "}
              {dictionary.columns.length - required.length - recommended.length}{" "}
              columns are optional.
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
            caption="Past imports — click a resumable one to carry on, or one with rows skipped to see what went wrong"
          >
            <THead>
              <TH>File</TH>
              <TH>What it did</TH>
              <TH>Ran by</TH>
              <TH>When</TH>
            </THead>
            <TBody>
              {history.rows.map((batch) => {
                const hasReport = batch.failed > 0;
                const open = openBatch === batch.id;
                const detail = details[batch.id];
                const isResuming = resuming === batch.id;
                /* Resumable rows act immediately — the long row-by-row report
                   is what the product owner's own words called out: nobody
                   wants to read why 30 rows failed on the way to fixing it,
                   they want the wizard. Everything else still expands, because
                   there is nothing to jump into and reading why is the only
                   thing left to offer. */
                const rowClick = batch.resumable
                  ? () => {
                      setResuming(batch.id);
                      void onResume(batch.id).finally(() => setResuming(null));
                    }
                  : hasReport
                    ? () => toggleBatch(batch.id)
                    : undefined;
                return (
                  <Fragment key={batch.id}>
                    <TR
                      interactive={Boolean(rowClick)}
                      onClick={isResuming ? undefined : rowClick}
                      aria-expanded={
                        !batch.resumable && hasReport ? open : undefined
                      }
                    >
                      <TDPrimary
                        title={batch.filename}
                        subtitle={`${batch.totalRows.toLocaleString("en-NG")} rows`}
                      />
                      <TD>
                        <span className="flex items-center gap-1.5 text-meta text-body">
                          {isResuming ? "Picking up where it stopped…" : batch.summary}
                          {isResuming ? (
                            <Loader2
                              aria-hidden="true"
                              className="size-3.5 animate-spin text-muted"
                            />
                          ) : batch.resumable ? (
                            <ArrowRight
                              aria-hidden="true"
                              className="size-3.5 text-accent-text"
                            />
                          ) : (
                            hasReport && (
                              <ChevronDown
                                aria-hidden="true"
                                className={cn(
                                  "size-3.5 text-muted transition-transform",
                                  open && "rotate-180",
                                )}
                              />
                            )
                          )}
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
                    {/* Never reached for a resumable batch — see `rowClick`. */}
                    {open && !batch.resumable && (
                      <TR className="bg-sunken/60">
                        <TD colSpan={4} className="py-4">
                          {loadingBatch === batch.id && !detail ? (
                            <span className="flex items-center gap-2 text-meta text-muted">
                              <Loader2
                                aria-hidden="true"
                                className="size-3.5 animate-spin"
                              />
                              Loading what went wrong…
                            </span>
                          ) : detail ? (
                            <div className="flex flex-col gap-3">
                              <ul className="flex flex-col gap-2">
                                {detail.rows.map((row) => (
                                  <li
                                    key={row.row}
                                    className="text-meta text-body"
                                  >
                                    <span className="tabular font-medium text-ink">
                                      Row {row.row}
                                    </span>{" "}
                                    <span className="text-muted">
                                      {row.name ?? row.employeeNo ?? "No name in this row"}
                                    </span>
                                    <ul className="ml-4 mt-1 flex flex-col gap-0.5">
                                      {[...row.errors, ...row.warnings].map(
                                        (issue, i) => (
                                          <li
                                            key={i}
                                            className="text-muted"
                                          >
                                            <code className="rounded bg-sunken px-1 py-0.5 text-meta">
                                              {issue.column}
                                            </code>{" "}
                                            {issue.problem}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                                <p className="flex-1 text-meta text-muted">
                                  This one did not keep its rows — it ran
                                  before we started keeping them, or
                                  everything in it imported. Upload the file
                                  again to carry on.
                                </p>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => input.current?.click()}
                                >
                                  <UploadCloud
                                    aria-hidden="true"
                                    className="size-3.5"
                                  />
                                  Choose a file
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-meta text-danger-text">
                              Could not load this report. Try again.
                            </span>
                          )}
                        </TD>
                      </TR>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
