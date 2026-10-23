"use client";

import { useState } from "react";
import { Download, Users } from "lucide-react";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  LoadState,
  Select,
  Tabs,
  failureMessage,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  type CompanyReport,
  type CoverageCell,
  type HeadlineRule,
  type ReportHeadline,
  companyReportApi,
  ofLabel,
} from "@/lib/api/company-report";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useCan } from "@/lib/permissions";
import { useLiveCompanyProfile } from "@/lib/store/company";
import { useCompanyReport } from "@/lib/store/company-report";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";
import { DepartmentsTab } from "./departments-tab";
import { Overview } from "./overview";
import { PrintBody, PrintHeading } from "./print-layout";
import { COMPANY_TABS, type CompanyTabId } from "./tabs";

/** What the print layout contains, recorded in the audit trail with the print. */
const PRINT_SECTIONS = [
  "headline",
  "coverage",
  "findings",
  "strengths",
  "actions",
  "departments",
  "method",
] as const;

const TAB_ITEMS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "departments", label: "Departments" },
];

/**
 * Company reports.
 *
 * Opens on one sentence and one first step, then says what was and was not
 * measured, then the findings behind them. Departments are the second tab.
 * `docs/superpowers/specs/2026-10-22-company-report-design.md` is the design;
 * `approvehr-api/src/modules/insights/company-report.ts` is where every figure
 * and every sentence is worked out, and this file draws what it is given.
 *
 * ## It draws; it does not decide
 *
 * Nothing here counts, ranks, averages or picks a sentence. A headline that is
 * not in the response is not drawn. A department row with no figure keys is
 * drawn with its headcount and nothing else. A block the server left out is not
 * replaced by a zero. Three screens in this product's history said something
 * false about the company because they computed a figure on this side of the
 * wire that the API had declined to send.
 *
 * ## The period
 *
 * Defaults to the period in play, which the server picks (`periodInPlay`'s
 * rule), and says in the header when its marks can still move. The picker
 * writes `?cycle=` with `replaceState`, as the tabs write `?tab=`: switching
 * period is not a navigation.
 */
export function CompanyReportScreen({
  initialTab,
  initialCycle,
}: {
  initialTab: CompanyTabId;
  initialCycle: string | null;
}) {
  const [tab, changeTab] = useUrlTab<CompanyTabId>(initialTab, COMPANY_TABS);
  const [cycleId, setCycleId] = useState<string | null>(initialCycle);
  const canSee = useCan("EDIT_RECORDS");
  const canPrint = useCan("EXPORT_DATA");
  const detail = useCompanyReport(cycleId, canSee);
  const report = detail.report;
  const zone = useOrgTimezone();
  const company = useLiveCompanyProfile().profile;
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  /**
   * Save as PDF: the browser prints a print layout and saves it.
   *
   * The server is told first, and the dialog does not open if it cannot be: a
   * trail that records only the prints somebody completed can be defeated by
   * closing the dialog. There is no renderer here, so this is the only place the
   * product can see that a copy left it. The printed layout carries no names.
   */
  async function savePdf() {
    if (!report?.cycle) return;
    setPrinting(true);
    setPrintError(null);
    try {
      await companyReportApi.printed(report.cycle.id, PRINT_SECTIONS);
    } catch (error) {
      setPrintError(failureMessage(error, "the record of this print"));
      setPrinting(false);
      return;
    }
    setPrinting(false);
    window.print();
  }

  function pickCycle(next: string) {
    setCycleId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("cycle", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Company reports"
          action={
            report ? (
              <div className="flex flex-wrap items-center gap-2">
                {report.cycles.length > 1 && (
                  <Select
                    aria-label="Appraisal period"
                    value={report.cycle?.id ?? ""}
                    onChange={(event) => {
                      pickCycle(event.target.value);
                    }}
                  >
                    {report.cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name} ({cycle.stageLabel.toLowerCase()})
                      </option>
                    ))}
                  </Select>
                )}
                {canPrint && report.cycle && (
                  <Button
                    variant="secondary"
                    loading={printing}
                    onClick={() => {
                      void savePdf();
                    }}
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Download PDF
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      <PageBody className="flex flex-col gap-8">
        {!canSee ? (
          <Card>
            <EmptyState
              icon={<Users aria-hidden="true" />}
              title="This report covers the whole company"
              description="It compares everyone's marks, so it is only open to people who can see every employee's record."
              action={
                <ButtonLink href="/performance" variant="secondary">
                  Your own performance
                </ButtonLink>
              }
            />
          </Card>
        ) : !detail.available ? (
          <Card>
            <EmptyState
              icon={<Users aria-hidden="true" />}
              title="Company reports need the live system"
              description="Every figure in them is counted over the whole company by the server, so there is nothing to show without it."
            />
          </Card>
        ) : (
          <LoadState
            loading={detail.loading}
            error={detail.error}
            subject="the company report"
            onRetry={detail.reload}
            hasData={Boolean(report)}
            skeleton="page"
          >
            {report && (
              <>
                {printError && (
                  <p
                    role="alert"
                    className="no-print text-body-sm text-danger-text"
                  >
                    {printError}
                  </p>
                )}
                <PrintHeading
                  companyName={
                    company ? (company.tradingName ?? company.legalName) : null
                  }
                />
                <Masthead report={report} zone={zone} />
                {report.headline && (
                  <HeadlineBlock headline={report.headline} />
                )}
                {report.coverage.cells.length > 0 && (
                  <CoverageStrip cells={report.coverage.cells} />
                )}
                {report.coverage.notMeasured.length > 0 && (
                  <NotMeasuredLine items={report.coverage.notMeasured} />
                )}
                <div className="no-print">
                  <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab}>
                    {tab === "overview" && <Overview report={report} />}
                    {tab === "departments" && (
                      <DepartmentsTab report={report} />
                    )}
                  </Tabs>
                </div>
                <PrintBody report={report} />
              </>
            )}
          </LoadState>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Which period, whether its marks can still move, and when this was worked out.
 *
 * Said once at the top, in plain muted text, because a headline built from
 * marks that calibration may still change is a different claim from one built
 * from published marks.
 */
function Masthead({ report, zone }: { report: CompanyReport; zone: string }) {
  const cycle = report.cycle;
  return (
    <p className="text-meta text-muted">
      {cycle ? (
        <>
          <span className="font-medium text-ink">{cycle.name}.</span>{" "}
          {cycle.stageLabel}
          {cycle.marksMayMove ? ". Marks can still move." : "."}{" "}
        </>
      ) : null}
      Worked out from ApproveHR records by fixed rules,{" "}
      {formatDateTime(report.asOf, zone)}.
    </p>
  );
}

const RULE_NAME: Record<HeadlineRule, string> = {
  H1: "marks flagged by the Fairness check that still need a decision",
  H2: "people with no appraiser",
  H3: "people with no agreed objective",
  H4: "a gap between groups that the Fairness check flags",
  H5: "staff records missing a bank account, pension PIN or tax ID",
};

const RULE_ORDER: HeadlineRule[] = ["H1", "H2", "H3", "H4", "H5"];

/**
 * The one sentence, and the one thing to do about it.
 *
 * Picked by the server from a fixed list, most urgent first, and the tooltip
 * says which check this was and the order of the rest, so nobody has to wonder
 * whether it is a model's opinion. The first step has a button only when the
 * caller may take it; otherwise the sentence stands alone.
 */
function HeadlineBlock({ headline }: { headline: ReportHeadline }) {
  const order = RULE_ORDER.map(
    (rule, index) =>
      `${String(index + 1)}. ${RULE_NAME[rule][0]!.toUpperCase()}${RULE_NAME[rule].slice(1)}${rule === headline.rule ? " (this one)" : ""}`,
  ).join(" ");
  return (
    <section aria-labelledby="company-headline" className="flex flex-col gap-4">
      <h2
        id="company-headline"
        className="max-w-4xl text-h3 text-ink sm:text-h2"
      >
        {headline.sentence}
        <span className="no-print ml-2 align-middle">
          <InfoTooltip
            label="How this was chosen"
            text={`Picked from a fixed list of checks, most urgent first. This was the first one that applied. The list: ${order}`}
          />
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="max-w-3xl text-body-md text-body">
          <span className="font-medium text-ink">First step.</span>{" "}
          {headline.firstStep.sentence}
        </p>
        {headline.firstStep.action && (
          <span className="no-print">
            <ButtonLink href={headline.firstStep.action.href} variant="primary">
              {headline.firstStep.action.label}
            </ButtonLink>
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * What was measured, as figures with their own denominators.
 *
 * No cell is divided by another. "Marks 57 of 61" and "Manager reviews 9 of 13"
 * are different headcounts, and the API keeps them apart for the reason
 * `cycleReport` does.
 */
function CoverageStrip({ cells }: { cells: CoverageCell[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
      {cells.map((cell) => (
        <div
          key={cell.key}
          className="flex min-w-0 flex-col gap-0.5 bg-surface p-4"
        >
          <dt className="text-meta text-muted">{cell.label}</dt>
          <dd className="text-h4 text-ink">{ofLabel(cell)}</dd>
          {cell.note && <dd className="text-meta text-muted">{cell.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function NotMeasuredLine({
  items,
}: {
  items: CompanyReport["coverage"]["notMeasured"];
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-meta font-medium text-ink">What we did not measure</p>
      <ul className="flex flex-col gap-0.5 text-meta text-muted">
        {items.map((item) => (
          <li key={item.what}>
            {item.what}. {item.why}
          </li>
        ))}
      </ul>
    </div>
  );
}
