"use client";

import {
  BarChart,
  Card,
  CardBody,
  CardHeader,
  DonutChart,
  Money,
  Spinner,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
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
 */
export function ReportsScreen() {
  const { data, loading, error, reload } = useReports();

  if (loading) {
    return (
      <>
        <PageHeader title="Reports" />
        <PageBody>
          <div className="flex items-center gap-3 py-16">
            <Spinner />
            <span className="text-body-sm text-muted">Working out the figures…</span>
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
                {error ?? "Could not load the reports."}
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

  const { payrollByDepartment, grossBreakdown, headcount, operationalLoad } = data;
  const totalPeople = headcount.byDepartment.reduce((s, d) => s + d.count, 0);
  const totalGross = payrollByDepartment?.reduce((s, d) => s + d.grossKobo, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Headcount, payroll cost and operational load for ${data.period}.`}
      />

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
              value={<Money amount={naira(totalGross)} decimals />}
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
                      { label: "Basic", value: naira(grossBreakdown.basicKobo) },
                      { label: "Housing", value: naira(grossBreakdown.housingKobo) },
                      { label: "Transport", value: naira(grossBreakdown.transportKobo) },
                      { label: "Allowances", value: naira(grossBreakdown.allowancesKobo) },
                    ]}
                  />
                  <p className="text-body-sm text-muted">
                    Employer pension of{" "}
                    <Money amount={naira(grossBreakdown.employerPensionKobo)} decimals />{" "}
                    is a cost on top of this, not a slice of it.
                  </p>
                </div>
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
            <CardHeader
              title="Operational load"
              level={3}
              description="How much work the month put through the system."
            />
            <CardBody className="grid grid-cols-2 gap-5">
              <Load label="Leave requests" value={operationalLoad.leaveRequests} />
              <Load label="Open help requests" value={operationalLoad.ticketsOpen} />
              <Load
                label="Waiting for a decision"
                value={operationalLoad.approvalsPending}
              />
              <Load
                label="Attendance corrections"
                value={operationalLoad.attendanceCorrections}
              />
              {headcount.byEmploymentType.map((t) => (
                <Load
                  key={t.type}
                  label={employmentTypeLabel(t.type)}
                  value={t.count}
                />
              ))}
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
        No payroll has been run for this period, so there are no costs to report.
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
