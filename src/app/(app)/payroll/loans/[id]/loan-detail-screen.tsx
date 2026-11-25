"use client";

import { CreditCard } from "lucide-react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { summaryOf } from "@/lib/loans/person-page";
import { useLoan, usePersonLoans } from "@/lib/store/loans";
import { useSession } from "@/lib/store/session";
import { LoanSection } from "./loan-section";
import { FoldedLoans, OtherLoans, PersonSummary } from "./person-loans";

/**
 * A person's loans, all of them, on one page.
 *
 * It used to be one loan: to see what somebody had borrowed you opened each line
 * in the list in turn, and the page said nothing of the others. It is now the
 * person's page. Whichever of their loans you open, you get that loan first and
 * every other loan they have below it, each with its figures and its full
 * schedule, and what you can do to each one. The address is still the loan's
 * (`/payroll/loans/<id>`), because payslips, approvals and notifications link
 * to it, and none of those should break.
 *
 * ## What comes first, and how fast
 *
 * The loan in the address is read first, on its own, and drawn as soon as it
 * arrives, so a person's page is never slower to start than the old one was.
 * Its answer says who the person is, and only then are their other loans asked
 * for (`usePersonLoans`). They arrive under it, with a summary above both once
 * there is more than one loan to add up. Until then the page looks as the old one
 * did, and a person with a single loan never sees anything else.
 *
 * ## What a loan section is
 *
 * `loan-section.tsx`: the whole of what this page used to be, repeated. Each
 * keeps its own buttons and dialogs, so Approve on one touches no other.
 */
export function LoanDetailScreen({ id }: { id: string }) {
  const { loan, loading, error } = useLoan(id);
  const { employeeId } = useSession();
  const person = usePersonLoans(loan?.employeeId ?? null, id);

  if (loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading the loan</span>
      </PageBody>
    );
  }

  if (!loan) {
    return (
      <>
        <PageHeader
          title="Loan"
          breadcrumb={[
            { href: "/payroll", label: "Monthly payroll" },
            { href: "/payroll/loans", label: "Loans" },
          ]}
        />
        <PageBody>
          <EmptyState
            plain
            icon={<CreditCard aria-hidden="true" />}
            title="That loan is not here"
            description={
              error
                ? error.message
                : "It may have been created in another browser, or the link is wrong."
            }
            action={
              <ButtonLink href="/payroll/loans">Back to loans</ButtonLink>
            }
          />
        </PageBody>
      </>
    );
  }

  const own = loan.employeeId === employeeId;
  const others = person.others ?? [];
  /* Until the others are read `others` is empty, so the page is drawn as the old
     one was. Whether there is more than one loan is only a claim once it has
     been read. */
  const solo = others.length === 0 && person.folded.length === 0;
  const summary = person.others ? summaryOf([loan, ...others]) : null;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/loans", label: "Loans" },
        ]}
        title={
          own
            ? solo
              ? "Your staff loan"
              : "Your staff loans"
            : loan.employeeName
        }
        {...(!solo && !own
          ? { subline: `${loan.employeeNo} · ${loan.jobTitle}` }
          : {})}
      />

      <PageBody className="flex flex-col gap-8">
        {summary && summary.count > 1 && (
          <PersonSummary summary={summary} own={own} />
        )}
        <LoanSection loan={loan} solo={solo} highlighted={!solo} />
        <OtherLoans person={person} />
        <FoldedLoans loans={person.folded} />
      </PageBody>
    </>
  );
}
