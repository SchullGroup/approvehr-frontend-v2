"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  Lock,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Skeleton,
  StepIndicator,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
  type Step,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  REFUSAL_WORDS,
  readAssessmentText,
} from "@/lib/hiring/screening/assessment-file";
import type { AssessmentRowInput } from "@/lib/hiring/screening/gateway";
import type {
  AssessmentCheck,
  AssessmentFileOptions,
  AssessmentResult,
} from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";
import { useScreeningGateway } from "@/lib/hiring/screening/use-gateway";
import { usePermissions } from "@/lib/permissions";
import { usePosting } from "@/lib/store/careers-form";

/**
 * Bring a test's results in.
 *
 * A boot camp runs its own test and sends a spreadsheet back: an email (or the
 * reference the person was given) and a score for each person. This screen follows the shape every other import in the
 * product has, because people have learned it: **download a template, choose a
 * file, see what will happen before anything is saved, then save**.
 *
 * ## The check is the point
 *
 * Nobody should save two thousand scores blind. The second step reports, row by
 * row and in words, what cannot be used and why: an email nobody applied with,
 * an email two applicants share, a score that is not a number or is out of range,
 * a person in the file twice. Nothing is saved until the person presses the
 * button that says how many will be.
 *
 * ## What a score does
 *
 * It feeds the sort and the pass mark, and it shows on the person's record with
 * where it came from. A newer result for the same person and test replaces the one
 * in use and the older one stays in their history; the same file twice changes
 * nothing. It does not move anybody anywhere: people below a pass mark are flagged
 * for a person to confirm.
 */

const BREADCRUMB = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/postings", label: "Job adverts" },
];

export function AssessmentImportScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();
  if (loading) {
    return (
      <>
        <PageHeader title="Import assessment scores" breadcrumb={BREADCRUMB} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading</span>
        </PageBody>
      </>
    );
  }
  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Import assessment scores" breadcrumb={BREADCRUMB} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot import scores"
              description="Scores feed who is shown to a person first, so importing them is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }
  return <Flow id={id} />;
}

type Read = {
  name: string;
  rows: AssessmentRowInput[];
  notes: string[];
};

/** The text of a file, in a browser or in a test runner. */
async function textOf(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsText(file);
  });
}

function Flow({ id }: { id: string }) {
  const gateway = useScreeningGateway();
  const advert = usePosting(id);
  const [read, setRead] = useState<Read | null>(null);
  const [testName, setTestName] = useState("");
  const [check, setCheck] = useState<AssessmentCheck | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checking" | "saving" | null>(null);

  const title = advert.posting?.title ?? "Advert";
  const crumbs = [
    ...BREADCRUMB,
    { href: `/hiring/postings/${id}?tab=screening`, label: title },
  ];

  const steps: Step[] = [
    {
      id: "file",
      label: "Choose a file",
      hint: read
        ? `${count(read.rows.length)} ${read.rows.length === 1 ? "row" : "rows"} in ${read.name}`
        : "Our template, or your own spreadsheet",
      isComplete: read !== null,
    },
    {
      id: "check",
      label: "Check it",
      hint: result
        ? `${count(result.saved)} saved`
        : check
          ? `${count(check.usable)} can be saved, ${count(check.refused)} cannot`
          : "Before anything is saved",
      isComplete: result !== null,
    },
  ];
  const stepper = useStepper(steps);

  const options: AssessmentFileOptions = { test: testName.trim() };

  async function chooseFile(file: File) {
    setProblem(null);
    setCheck(null);
    setResult(null);
    try {
      const parsed = readAssessmentText(await textOf(file));
      if (!parsed.ok) {
        setRead(null);
        setProblem(parsed.problem);
        return;
      }
      setRead({ name: file.name, rows: parsed.rows, notes: parsed.notes });
      setBusy("checking");
      try {
        const checked = await gateway.assessment.check(
          id,
          file.name,
          parsed.rows,
          options,
          new AbortController().signal,
        );
        setCheck(checked);
        stepper.goTo(1);
      } catch (error) {
        setProblem(
          error instanceof ApiError
            ? error.message
            : "The file could not be checked. Try again.",
        );
      } finally {
        setBusy(null);
      }
    } catch {
      setProblem("That file could not be read. Is it a CSV?");
    }
  }

  async function save() {
    if (!check || !read) return;
    setBusy("saving");
    setProblem(null);
    try {
      const saved = await gateway.assessment.commit(
        id,
        check,
        read.rows,
        options,
      );
      setResult(saved);
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Nothing was saved. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setRead(null);
    setCheck(null);
    setResult(null);
    setProblem(null);
    stepper.goTo(0);
  }

  return (
    <>
      <PageHeader
        title="Import assessment scores"
        breadcrumb={crumbs}
        action={
          <ButtonLink
            href={`/hiring/postings/${id}?tab=screening`}
            variant="secondary"
            size="sm"
          >
            Back to screening
          </ButtonLink>
        }
      />
      <PageBody className="flex flex-col gap-6">
        <StepIndicator
          steps={steps}
          index={stepper.index}
          furthest={stepper.furthest}
          onStepSelect={(n) => {
            if (n < stepper.index && result === null) stepper.goTo(n);
          }}
        />

        {problem && (
          <Callout tone="danger" title="That did not work">
            {problem}
          </Callout>
        )}

        {stepper.index === 0 && (
          <ChooseFile
            busy={busy === "checking"}
            testName={testName}
            onTestName={setTestName}
            template={gateway.assessment.template}
            onFile={(file) => void chooseFile(file)}
          />
        )}

        {stepper.index === 1 && check && result === null && (
          <CheckReport
            check={check}
            saving={busy === "saving"}
            onBack={startOver}
            onSave={() => void save()}
          />
        )}

        {stepper.index === 1 && result !== null && check && (
          <Done result={result} advertId={id} onAnother={startOver} />
        )}
      </PageBody>
    </>
  );
}

/* ----------------------------------------------------------------- step one */

function ChooseFile({
  busy,
  testName,
  onTestName,
  template,
  onFile,
}: {
  busy: boolean;
  testName: string;
  onTestName: (name: string) => void;
  template: () => { filename: string; body: string };
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          level={2}
          title="Choose your file"
          description="A CSV with an email and a score on each row."
        />
        <CardBody className="flex flex-col gap-4">
          <Field
            label="Test name"
            optional
            help="Used for every row that has no Test column. Leave empty for Assessment."
          >
            <Input
              value={testName}
              maxLength={80}
              placeholder="Assessment"
              onChange={(event) => onTestName(event.target.value)}
            />
          </Field>
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
              if (dropped) onFile(dropped);
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
              Headings can be called Email and Score, or something close. If
              your spreadsheet is in Excel, use Save as and choose CSV.
            </p>
            <Button
              variant="accent"
              className="mt-4"
              loading={busy}
              onClick={() => input.current?.click()}
            >
              Choose a file
            </Button>
            <input
              ref={input}
              type="file"
              aria-label="Assessment scores file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(event) => {
                const chosen = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (chosen) onFile(chosen);
              }}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          level={2}
          title="Start with our template"
          description="The columns, with two example rows."
        />
        <CardBody className="flex flex-col gap-4">
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                const file = template();
                downloadCsv(file.filename, file.body);
              }}
            >
              <Download aria-hidden="true" className="size-4" />
              Download the template
            </Button>
          </div>
          <ul className="flex flex-col gap-2 text-body-sm text-body">
            <li>
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Applicant email
              </code>{" "}
              The email the person applied with, or their{" "}
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Application reference
              </code>{" "}
              (it starts APP-).
            </li>
            <li>
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Score
              </code>{" "}
              A number. With no Out of, it is read as a percentage, 0 to 100.
              Decimals are fine, and 42/60 works too.
            </li>
            <li>
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Out of
              </code>{" "}
              What the test was marked out of, if it was not 100. Optional.
            </li>
            <li>
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Test
              </code>
              ,{" "}
              <code className="rounded bg-sunken px-1.5 py-0.5 text-meta">
                Date taken
              </code>{" "}
              The test&apos;s name and the day, if the file holds more than one
              test or you want the date kept. Optional.
            </li>
          </ul>
          <p className="text-meta text-muted">
            A person who is not in the file keeps whatever result they have. A
            newer result for the same person and test replaces the one in use
            and the older one stays in their history. Importing the same file
            again changes nothing.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- step two */

const SHOWN_REFUSALS = 200;

function CheckReport({
  check,
  saving,
  onBack,
  onSave,
}: {
  check: AssessmentCheck;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const refused = check.rows.filter((row) => row.refusal !== null);
  const usable = check.rows.filter((row) => row.refusal === null);
  const shown = refused.slice(0, SHOWN_REFUSALS);

  const downloadFixes = () => {
    downloadCsv(
      "assessment-rows-to-fix.csv",
      toCsv(
        ["Row", "Email or reference", "Score", "Problem"],
        refused.map((row) => ({
          Row: String(row.row),
          "Email or reference": row.email ?? "",
          Score: row.score === null ? "" : String(row.score),
          Problem:
            row.message ?? (row.refusal ? REFUSAL_WORDS[row.refusal] : ""),
        })),
      ),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Callout
        tone={check.refused === 0 ? "success" : "warning"}
        title={`${check.filename}: ${count(check.total)} ${check.total === 1 ? "row" : "rows"} checked`}
      >
        {check.usable === 0
          ? "Not one row can be used, so nothing would be saved. Fix the file and choose it again."
          : `${count(check.usable)} ${check.usable === 1 ? "score can" : "scores can"} be saved${
              check.refused > 0
                ? `. ${count(check.refused)} ${check.refused === 1 ? "row cannot" : "rows cannot"}, and ${check.refused === 1 ? "is" : "are"} listed below with the reason.`
                : "."
            }${
              check.replacing > 0
                ? ` ${count(check.replacing)} ${check.replacing === 1 ? "replaces" : "replace"} a result the person already has, and the earlier one stays in their history.`
                : ""
            }${
              check.unchanged > 0
                ? ` ${count(check.unchanged)} ${check.unchanged === 1 ? "is" : "are"} already on file exactly as the file says, so nothing is written for ${check.unchanged === 1 ? "it" : "them"}.`
                : ""
            }`}
      </Callout>

      {refused.length > 0 && (
        <Card>
          <CardHeader
            level={2}
            title="Rows that cannot be used"
            description="They are left out. Fix them in your file and import it again, or enter the score on the person's record."
            action={
              <Button variant="secondary" size="sm" onClick={downloadFixes}>
                <Download aria-hidden="true" className="size-3.5" />
                Download these rows
              </Button>
            }
          />
          <div className="hidden sm:block">
            <TableWrap
              className="rounded-none border-0 border-t border-line"
              caption="Rows of the file that cannot be saved, and why"
            >
              <THead>
                <TH>Row</TH>
                <TH>Email or reference</TH>
                <TH>Why not</TH>
              </THead>
              <TBody>
                {shown.map((row) => (
                  <TR key={row.row}>
                    <TD className="tabular">{row.row}</TD>
                    <TD className="[overflow-wrap:anywhere]">
                      {row.email ?? "—"}
                    </TD>
                    <TD>
                      <Badge tone="warning" size="sm">
                        {row.refusal ? REFUSAL_WORDS[row.refusal] : ""}
                      </Badge>
                      {row.message && (
                        <p className="mt-1 text-meta text-muted">
                          {row.message}
                        </p>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
          <ul className="divide-y divide-line border-t border-line sm:hidden">
            {shown.map((row) => (
              <li key={row.row} className="flex flex-col gap-1 p-4">
                <p className="text-body-sm font-medium text-ink">
                  Row {row.row}
                  <span className="font-normal text-muted">
                    {" "}
                    {row.email ?? "no email"}
                  </span>
                </p>
                <p className="text-body-sm text-body">
                  {row.refusal ? REFUSAL_WORDS[row.refusal] : ""}
                </p>
                {row.message && (
                  <p className="text-meta text-muted">{row.message}</p>
                )}
              </li>
            ))}
          </ul>
          {refused.length > shown.length && (
            <p className="border-t border-line px-5 py-3 text-meta text-muted">
              {count(refused.length - shown.length)} more are in the download.
            </p>
          )}
        </Card>
      )}

      {usable.length > 0 && (
        <Disclosure
          title="Rows that will be saved"
          meta={`${count(usable.length)}`}
        >
          <ul className="divide-y divide-line">
            {usable.slice(0, 50).map((row) => (
              <li
                key={row.row}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium text-ink">
                    {row.name ?? row.email}
                  </span>{" "}
                  <span className="text-muted">{row.email}</span>
                </span>
                <span className="tabular font-medium text-ink">
                  {row.score}
                  {row.max !== null ? ` of ${String(row.max)}` : ""}
                  {row.effect === "replaces"
                    ? ", replaces the one on file"
                    : row.effect === "unchanged"
                      ? ", already on file"
                      : ""}
                </span>
              </li>
            ))}
          </ul>
          {usable.length > 50 && (
            <p className="mt-2 text-meta text-muted">
              The first 50 of {count(usable.length)}.
            </p>
          )}
        </Disclosure>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Choose another file
        </Button>
        <Button
          variant="accent"
          loading={saving}
          disabled={check.usable - check.unchanged === 0}
          onClick={onSave}
        >
          Save {count(check.usable - check.unchanged)}{" "}
          {check.usable - check.unchanged === 1 ? "score" : "scores"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- result */

function Done({
  result,
  advertId,
  onAnother,
}: {
  result: AssessmentResult;
  advertId: string;
  onAnother: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Callout
        tone={result.refused === 0 ? "success" : "warning"}
        title={`${count(result.saved)} ${result.saved === 1 ? "score" : "scores"} saved`}
        icon={<FileSpreadsheet />}
      >
        <div className="flex flex-col gap-2">
          {result.unchanged > 0 && (
            <p>
              {count(result.unchanged)}{" "}
              {result.unchanged === 1 ? "was" : "were"} already on file exactly
              as the file says, so nothing was written for{" "}
              {result.unchanged === 1 ? "it" : "them"}.
            </p>
          )}
          {result.refused > 0 && (
            <p>
              {count(result.refused)}{" "}
              {result.refused === 1 ? "row was" : "rows were"} not saved.
            </p>
          )}
          {result.movedBelow !== null && result.movedBelow > 0 && (
            <p>
              {count(result.movedBelow)}{" "}
              {result.movedBelow === 1 ? "person is" : "people are"} now below
              the pass mark. Nobody is rejected: they are on the list for a
              person to confirm.
            </p>
          )}
          <p>
            The scores feed the sort and the pass mark, and each is on the
            person&apos;s record with where it came from.
          </p>
        </div>
      </Callout>
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          href={`/hiring/postings/${advertId}/below-pass-mark`}
          variant="accent"
        >
          See who is below the pass mark
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
        <Button variant="secondary" onClick={onAnother}>
          Import another file
        </Button>
      </div>
    </div>
  );
}
