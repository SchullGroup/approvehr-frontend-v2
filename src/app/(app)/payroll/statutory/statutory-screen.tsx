"use client";

import { Download, ShieldAlert } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/payroll/run-panels";
import { useCan } from "@/lib/permissions";
import { useDeductionSwitches } from "@/lib/store/payroll-deductions";

/**
 * Statutory filings.
 *
 * ## A schedule is never offered for a deduction that was never taken
 *
 * This screen used to list a PAYE row, three pension rows and an NHF row
 * unconditionally, because the filings were a constant. For a company that does
 * not deduct PAYE — plenty of small Nigerian employers do not; their staff file
 * their own returns — that is an offer to file a return against money nobody
 * withheld, and the shape a customer would fill in is a **nil return they had no
 * obligation to make**.
 *
 * So each group is gated on what the company actually deducts, from
 * `GET /payroll/settings`, and a group that is off is replaced by a sentence
 * saying why there is nothing to file rather than by an empty schedule. An empty
 * table with a Download button is the worst version of this: it looks like a
 * product that lost the data.
 *
 * NSITF is deliberately **not** gated. The Employees' Compensation Act is an
 * employer contribution and has nothing to do with the three payslip deductions,
 * so switching PAYE off does not touch it.
 *
 * ## The figures are illustrative and the screen says so
 *
 * `StatutorySchedule` exists in the schema and nothing writes it yet, so these
 * rows are an illustration of the shape rather than a read of a run — in
 * **either** mode, connected or not, because there is no endpoint on either
 * side of this that would make them real. That is stated in a callout right
 * under the header, not buried in a footnote, because the standing rule is
 * that a screen must never look connected when it is not. What is real here is
 * **which bodies appear**, which is the part this change is about, and the
 * `SourceBadge` reports whether *that* half — what this company actually
 * deducts — came from the API or from this browser's demo answers.
 *
 * ## Who may look
 *
 * Every figure on this page is money the company owes somebody else, so it is
 * gated the same way `GET /payroll/settings` is on the API: `VIEW_SALARIES`.
 * Connected, that is a second lock on a door already locked — the API would
 * refuse the read and `useDeductionSwitches` would surface the error instead.
 * It earns its place in demo mode, where every store answers regardless of
 * role unless a screen asks — previewing "Employee" under `/settings/roles`
 * must not still show the company's statutory schedule.
 */

type Group = "paye" | "pension" | "nhf" | "other";

const FILINGS: {
  body: string;
  kind: string;
  group: Group;
  amount: number;
  due: string;
  staff: number;
  status: "filed" | "due" | "scheduled";
}[] = [
  {
    body: "Lagos State IRS",
    kind: "PAYE",
    group: "paye",
    amount: 14_203_880,
    due: "10 Sep 2026",
    staff: 198,
    status: "filed",
  },
  {
    body: "Ogun State IRS",
    kind: "PAYE",
    group: "paye",
    amount: 1_940_220,
    due: "10 Sep 2026",
    staff: 31,
    status: "filed",
  },
  {
    body: "Stanbic IBTC Pensions",
    kind: "Pension",
    group: "pension",
    amount: 3_412_600,
    due: "07 Sep 2026",
    staff: 94,
    status: "filed",
  },
  {
    body: "ARM Pensions",
    kind: "Pension",
    group: "pension",
    amount: 2_610_400,
    due: "07 Sep 2026",
    staff: 71,
    status: "filed",
  },
  {
    body: "Leadway Pensure",
    kind: "Pension",
    group: "pension",
    amount: 2_117_200,
    due: "07 Sep 2026",
    staff: 58,
    status: "filed",
  },
  {
    body: "FMBN",
    kind: "NHF",
    group: "nhf",
    amount: 2_325_110,
    due: "10 Sep 2026",
    staff: 264,
    status: "due",
  },
  {
    body: "NSITF",
    kind: "ECS",
    group: "other",
    amount: 930_045,
    due: "15 Sep 2026",
    staff: 264,
    status: "scheduled",
  },
];

const STATUS = {
  filed: { tone: "success" as const, label: "Filed" },
  due: { tone: "warning" as const, label: "Due" },
  scheduled: { tone: "info" as const, label: "Scheduled" },
};

/**
 * What is said in place of a schedule.
 *
 * Each sentence names the body that is not being filed with and why, because
 * "there is nothing here" is the sentence a reader can already see. The legal
 * consequence is the API's, from `statutoryNotices`, and it renders above this —
 * these are about the filing, not about the obligation.
 */
const NOTHING_TO_FILE: Record<Exclude<Group, "other">, string> = {
  paye: "No PAYE schedule for any state tax authority, because no tax was deducted from anybody's pay this period. Nothing is filed and nothing is remitted.",
  pension:
    "No schedule for any pension fund administrator, because no contribution was deducted and none was added on top.",
  nhf: "No National Housing Fund schedule for the Federal Mortgage Bank, because no contribution was deducted.",
};

const GROUP_LABEL: Record<Exclude<Group, "other">, string> = {
  paye: "PAYE",
  pension: "Pension",
  nhf: "National Housing Fund",
};

export function StatutoryScreen() {
  const canView = useCan("VIEW_SALARIES");
  const deductions = useDeductionSwitches();
  const stored = deductions.settings?.settings ?? null;

  if (!canView) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { href: "/payroll", label: "Monthly payroll" },
            { href: "/payroll/statutory", label: "Statutory filings" },
          ]}
          title="Statutory filings"
        />
        <PageBody>
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="You cannot view statutory filings"
            description={
              "Seeing what this company owes each tax authority, pension " +
              "fund and the Federal Mortgage Bank needs the “View " +
              "salaries” permission. Ask somebody who holds it."
            }
          />
        </PageBody>
      </>
    );
  }

  /**
   * Which groups this company operates.
   *
   * Absent while the read is in flight, so nothing on this screen claims a
   * schedule exists — or that one does not — before the answer lands. The
   * loading branch below renders skeletons rather than an optimistic table.
   */
  const operates: Record<Exclude<Group, "other">, boolean> | null = stored
    ? {
        paye: stored.payeEnabled,
        pension: stored.pensionEnabled,
        nhf: stored.nhfEnabled,
      }
    : null;

  const shown = FILINGS.filter(
    (filing) =>
      filing.group === "other" || operates === null || operates[filing.group],
  );
  const absent = (["paye", "pension", "nhf"] as const).filter(
    (group) => operates !== null && !operates[group],
  );

  const total = shown.reduce((sum, filing) => sum + filing.amount, 0);
  const outstanding = shown
    .filter((filing) => filing.status !== "filed")
    .reduce((sum, filing) => sum + filing.amount, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/statutory", label: "Statutory filings" },
        ]}
        title="Statutory filings"
        action={
          <Button variant="secondary" size="sm" disabled={shown.length === 0}>
            <Download aria-hidden="true" className="size-3.5" />
            Download all schedules
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* What "which bodies appear" is read from — the API's own settings
            row when connected, this browser's demo answers when not. The
            filing amounts below are a different question and are answered by
            the callout right after this, in both modes. */}
        <SourceBadge
          connected={deductions.available}
          loading={deductions.loading}
          error={deductions.error ? { message: deductions.error } : null}
        />

        <Callout tone="info" title="These schedules are illustrative">
          Nothing in this build writes a real statutory schedule from an
          approved payroll run yet, so the amounts, due dates, employee counts
          and status below are illustrative rather than a read of your own
          payroll — whether or not this company is connected to the API. Which
          bodies appear <strong className="font-medium">is</strong> real: it is
          read from what this company actually deducts, below.
        </Callout>

        {/*
          Outside everything, because it is the one thing on this screen that
          changes what somebody has to do next. The wording is the API's, from
          `statutoryNotices` in the payroll engine, rendered verbatim.
        */}
        {deductions.notices.map((notice) => (
          <Callout
            key={notice.code}
            tone="warning"
            title="Nothing to file, and what that means"
          >
            {notice.message}
          </Callout>
        ))}

        {deductions.loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
            <span className="sr-only">Reading what this company deducts</span>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Total remittance"
                value={<Money amount={total} compact size="xl" />}
              />
              <Stat
                label="Outstanding"
                value={<Money amount={outstanding} compact size="xl" />}
              />
              <Stat
                label="Bodies"
                value={String(shown.length)}
                {...(absent.length > 0
                  ? {
                      hint: `${absent
                        .map((group) => GROUP_LABEL[group])
                        .join(", ")} not deducted`,
                    }
                  : {})}
              />
            </div>

            {absent.length > 0 && (
              <Card>
                <CardHeader
                  title="What is not filed, and why"
                  description="A schedule is never produced for a deduction that was not taken."
                />
                <CardBody className="flex flex-col gap-3">
                  {absent.map((group) => (
                    <p
                      key={group}
                      className="text-body-sm leading-relaxed text-body"
                    >
                      <strong className="font-medium text-ink">
                        {GROUP_LABEL[group]}
                      </strong>{" "}
                      — {NOTHING_TO_FILE[group]}
                    </p>
                  ))}
                </CardBody>
              </Card>
            )}

            {shown.length > 0 && (
              <TableWrap caption="Statutory filings for August 2026 by body, amount and due date">
                <THead>
                  <TH>Body</TH>
                  <TH>Type</TH>
                  <TH align="right">Employees</TH>
                  <TH align="right">Amount</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                </THead>
                <TBody>
                  {shown.map((filing) => (
                    <TR key={`${filing.body}-${filing.kind}`} interactive>
                      <TDPrimary title={filing.body} />
                      <TD>
                        <Badge tone="neutral" size="sm">
                          {filing.kind}
                        </Badge>
                      </TD>
                      <TD align="right" className="tabular">
                        {filing.staff}
                      </TD>
                      <TD
                        align="right"
                        className="tabular font-medium text-ink"
                      >
                        <Money amount={filing.amount} />
                      </TD>
                      <TD className="tabular">{filing.due}</TD>
                      <TD>
                        <Badge tone={STATUS[filing.status].tone} size="sm" dot>
                          {STATUS[filing.status].label}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}

            <Card>
              <CardHeader title="How this is produced" />
              <CardBody className="flex flex-col gap-3">
                <p className="text-body-sm leading-relaxed text-body">
                  Each row is computed from the approved payroll run rather than
                  re-entered. PAYE splits by the employee&apos;s tax state,
                  pension by their PFA, and NHF and NSITF across everyone on the
                  run. If a run is corrected, the schedules regenerate with it.
                </p>
                <p className="text-body-sm leading-relaxed text-body">
                  A deduction your company does not operate produces no schedule
                  at all — not an empty one. A nil return you had no obligation
                  to make is worse than no return, so the reason is stated
                  instead. Change what you deduct under{" "}
                  <strong className="font-medium text-ink">
                    Settings → Payroll
                  </strong>
                  .
                </p>
                <p className="text-meta leading-relaxed text-muted">
                  The amounts and bodies above are illustrative. Which{" "}
                  deductions appear is read from this company&apos;s own payroll
                  settings; generating real schedules from a run is not built
                  yet.
                </p>
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}
