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
import { useEmployeeImport, useImportHistory } from "@/lib/store/imports";
import { EMPLOYEE_COLUMNS } from "@/lib/imports/template";
import { CheckReport } from "./check-report";
import { ImportResult } from "./import-result";
import { MatchColumns } from "./match-columns";

/**
 * Bring a spreadsheet of staff in.
 *
 * Onboarding a company means importing their file. The old system has a
 * one-at-a-time form and so did we, which is a week of typing for a company of
 * three hundred — and the reason a migration stalls.
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
export function ImportScreen() {
  const { can, isConnected } = useSession();
  const imp = useEmployeeImport();
  const allowed = !isConnected || can("IMPORT_DATA");

  const steps: Step[] = [
    {
      id: "file",
      label: "Choose a file",
      hint: "A CSV saved from your spreadsheet",
      isComplete: imp.file !== null,
    },
    {
      id: "columns",
      label: "Match the columns",
      hint: "Your headings, whatever they are called",
      isComplete: imp.ready,
    },
    {
      id: "check",
      label: "Check",
      hint: "What this file will do",
      isComplete: imp.check !== null,
    },
    {
      id: "import",
      label: "Import",
      hint: "One confirmation",
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
        <PageHeader
          title="Import your staff list"
          breadcrumb={[{ href: "/people", label: "People" }]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You do not have permission to import staff"
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
        title="Import your staff list"
        description="Upload the spreadsheet you already keep. You will see exactly what it will do before anything is saved."
        breadcrumb={[{ href: "/people", label: "People" }]}
        meta={
          imp.isConnected ? undefined : (
            <Badge tone="warning" size="sm">
              Demo data, this browser only
            </Badge>
          )
        }
        action={
          <Button variant="secondary" size="sm" onClick={imp.downloadTemplate}>
            <Download aria-hidden="true" className="size-4" />
            Download the template
          </Button>
        }
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
              <p className="mt-2 text-[0.875rem] text-muted">
                Large files go up in parts. Each part reports its own numbers.
              </p>
            </CardBody>
          </Card>
        )}

        {stepper.index === 0 && (
          <ChooseFile
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
            csv={imp.file.csv}
            mapping={imp.mapping}
            onChange={imp.setColumn}
            onReset={imp.resetMapping}
            onBack={() => {
              imp.clear();
              stepper.goTo(0);
            }}
            busy={imp.progress !== null}
            onContinue={async () => {
              const ok = await imp.runCheck();
              if (ok) stepper.goTo(2);
            }}
          />
        )}

        {stepper.index === 2 && imp.check && (
          <CheckReport
            check={imp.check}
            onBack={() => stepper.goTo(1)}
            onDownload={imp.downloadRowsToFix}
            onContinue={() => stepper.goTo(3)}
          />
        )}

        {stepper.index === 3 && imp.check && (
          <ImportResult
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
          />
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Step one.
 *
 * `FileDrop` from the design system is not used here: it reports `{ id, name,
 * size }` and never hands over the `File`, so there is nothing to read. This
 * needs the bytes.
 */
function ChooseFile({
  filename,
  rows,
  columns,
  onFile,
  onTemplate,
}: {
  filename: string | null;
  rows: number;
  columns: number;
  onFile: (file: File) => void | Promise<void>;
  onTemplate: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const history = useImportHistory();
  const required = EMPLOYEE_COLUMNS.filter((spec) => spec.required);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            level={2}
            title="Choose your file"
            description="A CSV saved from Excel, Google Sheets or your old system."
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
              <p className="text-[0.9375rem] font-semibold text-ink">
                Drag your file here
              </p>
              <p className="mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-muted">
                Your headings can be called anything. You match them to ours on
                the next step.
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
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(event) => {
                  const chosen = event.currentTarget.files?.[0];
                  /* Cleared so choosing the same file again still fires. */
                  event.currentTarget.value = "";
                  if (chosen) void onFile(chosen);
                }}
              />
              {filename && (
                <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[0.875rem] text-body">
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
            description="Our template has every column we can read, with an example filled in."
          />
          <CardBody className="flex flex-col gap-4">
            <Button variant="secondary" onClick={onTemplate}>
              <Download aria-hidden="true" className="size-4" />
              Download the template
            </Button>
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">
                Every person needs
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {required.map((spec) => (
                  <li key={spec.field}>
                    <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.8125rem] text-body">
                      {spec.column}
                    </code>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
                The other {EMPLOYEE_COLUMNS.length - required.length} columns are
                optional, and a column you do not have is simply left alone on
                anyone we update.
              </p>
            </div>
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
                    <span className="text-[0.875rem] text-body">
                      {batch.summary}
                    </span>
                  </TD>
                  <TD>
                    <span className="text-[0.875rem] text-body">{batch.by}</span>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-1.5 text-[0.875rem] text-muted">
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
