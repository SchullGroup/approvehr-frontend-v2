"use client";

import { Lock } from "lucide-react";
import {
  BarChart,
  Card,
  CardBody,
  CardHeader,
  DonutChart,
  EmptyState,
  Money,
  Skeleton,
  Spinner,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { usePermissions } from "@/lib/permissions";
import { useReports } from "@/lib/store/insights";
import { employmentTypeLabel, naira } from "@/lib/api/insights";

/**
 * Reports, from `/insights/reports`.
 *
 * ## Money comes from payslips, not from today's records
 *
 * The previous version ran the frontend payroll engine over the current
 * employee list to produce a cost breakdown. That answers "what would this cost
 * if we ran it now", which is not what a report on August means: it changes
 * every time somebody gets a rise, so last month's report silently rewrites
 * itself.
 *
 * The server reads the payslips of the period's run instead. The consequence is
 * that a month with no run has **no money figures** — and it says so, with the
 * button that fixes it, rather than showing a plausible number.
 *
 * ## Permission shaping
 *
 * `payrollByDepartment` and `grossBreakdown` are null both when the caller may
 * not see salaries and when there is no run. The screen does not need to tell
 * those apart: in both cases there is nothing true to draw.
 *
 * ## The `EXPORT_DATA` gate is here because the API's isn't
 *
 * `nav.tsx` hides the `/reports` link behind `EXPORT_DATA`, but
 * `GET /insights/reports` carries no `requirePermissions` — by design, per its
 * own comment: it answers headcount and operational-load figures to every
 * signed-in caller and only shapes the payroll block by `VIEW_SALARIES`, the
 * same "answer something to everyone" idiom `/insights/dashboard` uses. That
 * leaves the nav's stated gate enforced nowhere, so anybody who typed the URL
 * saw company-wide headcount and operational load the nav pretended was
 * hidden. This screen is the fix on this side of the wire; see the router's
 * comment before assuming the backend also needs `requirePermissions` here —
 * the payroll figures already have their own, narrower gate.
 *
 * The gate is a separate component from the one that reads `useReports`, for
 * the same reason `AuditScreen` splits itself from `Trail`: hooks cannot be
 * skipped, so checking the permission inside the reporting component would
 * still fire the request before deciding whether to show what it returned.
 */
export function ReportsScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading reports</span>
        </PageBody>
      </>
    );
  }

  if (!can("EXPORT_DATA")) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see reports"
              description="Reports show company-wide headcount and operational figures, so it is kept to specific people. Ask whoever manages access to add the export permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Reports />;
}

function Reports() {
  const { data, loading, error, reload } = useReports();

  if (loading) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          <div className="flex items-center gap-3 py-16">
            <Spinner />
            <span className="text-body-sm text-muted">
              Working out the figures…
            </span>
          </div>
        </PageBody>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          <Card>
            <CardBody className="flex flex-col items-start gap-3">
              <p className="text-body text-ink">
                {error ?? "The reports did not load. Try again in a moment."}
              </p>
              <button
                type="button"
                onClick={reload}
                className="text-body-sm font-medium text-accent-text underline"
              >
                Try again
              </button>
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  const { payrollByDepartment, grossBreakdown, headcount, operationalLoad } =
    data;
  const totalPeople = headcount.byDepartment.reduce((s, d) => s + d.count, 0);
  /* The employment-mix whole, which is not necessarily `totalPeople` — see the
     donut below. */
  const byEmploymentType = headcount.byEmploymentType.reduce(
    (s, t) => s + t.count,
    0,
  );
  const totalGross =
    payrollByDepartment?.reduce((s, d) => s + d.grossKobo, 0) ?? 0;

  return (
    <>
      <PageHeader title="Reports" />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="On the payroll" value={totalPeople.toLocaleString()} />
          <Stat
            label="Departments"
            value={headcount.byDepartment.length.toLocaleString()}
          />
          {payrollByDepartment && (
            <Stat
              label="Gross this period"
              value={<Money amount={naira(totalGross)} decimals size="xl" />}
            />
          )}
          <Stat
            label="Waiting for a decision"
            value={operationalLoad.approvalsPending.toLocaleString()}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---- Payroll cost by department ------------------------------- */}
          <Card>
            <CardHeader
              title="Payroll cost by department"
              level={3}
              description={
                payrollByDepartment
                  ? "Gross pay for the period, from the payslips the run produced."
                  : undefined
              }
            />
            <CardBody>
              {payrollByDepartment && payrollByDepartment.length > 0 ? (
                <BarChart
                  caption="Gross pay by department for the period"
                  colorBy="series"
                  format={(n) =>
                    `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                  points={payrollByDepartment.map((d) => ({
                    label: d.department,
                    value: naira(d.grossKobo),
                  }))}
                />
              ) : (
                <NoRunYet />
              )}
            </CardBody>
          </Card>

          {/* ---- Where gross goes ---------------------------------------- */}
          <Card>
            <CardHeader
              title="Where gross goes"
              level={3}
              description={
                grossBreakdown
                  ? "Employer pension sits on top of gross, never inside it."
                  : undefined
              }
            />
            <CardBody>
              {grossBreakdown ? (
                <div className="flex flex-col gap-4">
                  <DonutChart
                    caption="How gross pay divides for the period"
                    centreLabel="Gross"
                    format={(n) =>
                      `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                    points={[
                      {
                        label: "Basic",
                        value: naira(grossBreakdown.basicKobo),
                      },
                      {
                        label: "Housing",
                        value: naira(grossBreakdown.housingKobo),
                      },
                      {
                        label: "Transport",
                        value: naira(grossBreakdown.transportKobo),
                      },
                      {
                        label: "Allowances",
                        value: naira(grossBreakdown.allowancesKobo),
                      },
                    ]}
                  />
                  <p className="text-body-sm text-muted">
                    Employer pension of{" "}
                    <Money
                      amount={naira(grossBreakdown.employerPensionKobo)}
                      decimals
                    />{" "}
                    is a cost on top of this, not a slice of it.
                  </p>
                </div>
              ) : (
                <NoRunYet />
              )}
            </CardBody>
          </Card>

          {/* ---- Cost per head ------------------------------------------- */}
          <Card>
            <CardHeader
              title="Cost per head by department"
              level={3}
              description="Gross pay for the period divided by the people it covered."
            />
            <CardBody>
              {/* `headcount` has been on `payrollByDepartment` the whole time
                  and nothing has ever read it — the card above maps `grossKobo`
                  alone, so the one question both department charts exist to
                  answer together ("is Engineering expensive because it is big,
                  or because it is expensive?") needed a reader to hold twelve
                  numbers from two cards in their head.

                  Sorted, unlike the two above, because this is a ranking rather
                  than a per-department lookup — and the ordering mismatch
                  between the other two cards is exactly what made comparing
                  them by eye unreliable. */}
              {payrollByDepartment && payrollByDepartment.length > 0 ? (
                <BarChart
                  caption="Average gross pay per person, by department, for the period"
                  colorBy="series"
                  format={(n) =>
                    `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                  points={[...payrollByDepartment]
                    .map((d) => ({
                      label: d.department,
                      /* Absent, not zero. A department with a gross figure and
                         no headcount is a division by nothing — the honest
                         answer is "no figure", and `BarChart` now renders that
                         as an empty dashed track rather than a bar at the
                         floor. */
                      value:
                        d.headcount > 0 ? naira(d.grossKobo) / d.headcount : null,
                    }))
                    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))}
                />
              ) : (
                <NoRunYet />
              )}
            </CardBody>
          </Card>

          {/* ---- Headcount ----------------------------------------------- */}
          <Card>
            <CardHeader title="Headcount by department" level={3} />
            <CardBody>
              {headcount.byDepartment.length > 0 ? (
                <BarChart
                  caption="People per department"
                  points={headcount.byDepartment.map((d) => ({
                    label: d.name,
                    value: d.count,
                  }))}
                />
              ) : (
                <p className="text-body text-muted">
                  Nobody is assigned to a department yet.
                </p>
              )}
            </CardBody>
          </Card>

          {/* ---- Operational load ---------------------------------------- */}
          <Card>
            <CardHeader title="Operational load" level={3} />
            <CardBody className="grid grid-cols-2 gap-5">
              <Load
                label="Leave requests"
                value={operationalLoad.leaveRequests}
              />
              <Load
                label="Open help requests"
                value={operationalLoad.ticketsOpen}
              />
              <Load
                label="Waiting for a decision"
                value={operationalLoad.approvalsPending}
              />
              <Load
                label="Attendance corrections"
                value={operationalLoad.attendanceCorrections}
              />
            </CardBody>
          </Card>

          {/* ---- Employment mix ------------------------------------------ */}
          <Card>
            <CardHeader title="Employment mix" level={3} />
            <CardBody>
              {/* Moved out of "Operational load", where it did not belong.
                  Those four figures are unrelated queue depths in unrelated
                  units — a number you act on, one at a time. These are
                  **mutually exclusive parts of one whole** that sum to the
                  headcount, and putting the two kinds of fact under one heading
                  invited exactly the arithmetic a donut does for you. */}
              {headcount.byEmploymentType.length > 0 ? (
                <DonutChart
                  caption="People by employment type"
                  /* The sum of THIS chart's own segments, not `totalPeople`.
                     `totalPeople` is summed from `byDepartment`, and somebody
                     with no department is absent from that and present here —
                     so the two disagree in exactly the company most likely to
                     be reading this card. A ring whose centre does not equal
                     its arcs is the §1.1 defect this product is sold against. */
                  centreLabel={`${String(byEmploymentType)} ${byEmploymentType === 1 ? "person" : "people"}`}
                  points={headcount.byEmploymentType.map((t) => ({
                    label: employmentTypeLabel(t.type),
                    value: t.count,
                  }))}
                />
              ) : (
                <p className="text-body text-muted">
                  Nobody has an employment type recorded yet.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What a money chart shows when there is no run.
 *
 * Deliberately not a zeroed chart. A cost breakdown of ₦0.00 across every
 * department reads as "this company spent nothing on salaries", which is a
 * claim, and a false one.
 */
function NoRunYet() {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-body text-body">
        No payroll has been run for this period, so there are no costs to
        report.
      </p>
      <ButtonLink href="/payroll/runs/new" variant="secondary" size="sm">
        Start a payroll run
      </ButtonLink>
    </div>
  );
}

function Load({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-h3 text-ink">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-body-sm text-muted">{label}</p>
    </div>
  );
}
