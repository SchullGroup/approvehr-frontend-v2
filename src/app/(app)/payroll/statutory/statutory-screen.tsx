"use client";

import { ShieldAlert } from "lucide-react";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  Stat,
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
 * ## There are no invented figures on this screen, and there used to be
 *
 * This screen carried a hardcoded `FILINGS` array — "Lagos State IRS,
 * ₦14,203,880, 198 staff, **Filed**" — with a callout underneath explaining
 * that all of it was illustrative. Both are gone. A remittance amount, a due
 * date and a **Filed** badge are exactly the figures somebody acts on, and
 * "Filed" against a return nobody filed is a regulatory penalty wearing a
 * green badge. The callout was doing real work while it was there, but a
 * label warning that the data below is fake is not a substitute for not
 * shipping fake data — and on a live product it is the wrong half to keep.
 *
 * `StatutorySchedule` exists in the schema and nothing writes it yet, so what
 * remains is only what is true: **which bodies this company files for**, read
 * from what it actually deducts, and the statement that each schedule appears
 * once a run is approved. The `SourceBadge` reports where that came from.
 * When the generator lands, the amounts arrive with it.
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

  /* What this company does deduct, and therefore has to file for. NSITF is
     always in the list: it is an employer contribution under the Employees'
     Compensation Act and has nothing to do with the three payslip
     deductions. */
  const filesFor = (["paye", "pension", "nhf"] as const).filter(
    (group) => operates === null || operates[group],
  );
  const absent = (["paye", "pension", "nhf"] as const).filter(
    (group) => operates !== null && !operates[group],
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/statutory", label: "Statutory filings" },
        ]}
        title="Statutory filings"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="You file for"
                value={String(filesFor.length + 1)}
                hint="Including NSITF, which every employer contributes to"
              />
              <Stat
                label="Not deducted"
                value={String(absent.length)}
                {...(absent.length > 0
                  ? {
                      hint: absent
                        .map((group) => GROUP_LABEL[group])
                        .join(", "),
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

            <Card>
              <CardHeader
                title="What you file for"
                description="Read from what this company actually deducts."
              />
              <CardBody className="flex flex-col gap-3">
                {[...filesFor.map((group) => GROUP_LABEL[group]), "NSITF"].map(
                  (label) => (
                    <p
                      key={label}
                      className="text-body-sm leading-relaxed text-body"
                    >
                      <strong className="font-medium text-ink">{label}</strong>{" "}
                      — the schedule, the amount and the due date appear here
                      once a payroll run for the period is approved.
                    </p>
                  ),
                )}
              </CardBody>
            </Card>

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
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}
