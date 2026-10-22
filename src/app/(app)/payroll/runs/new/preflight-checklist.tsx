"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
} from "@/components/ui";
import { useSetupChecklist } from "@/lib/store/setup-checklist";

/**
 * What would stop or surprise a payroll, asked before anybody has calculated one.
 *
 * ## Quiet when everything passes
 *
 * Five bordered cards, each with a tick, on every visit: the screen spent a
 * screenful saying "nothing to do". When every check passes this is now one line
 * with the count, and the five rows are behind it for anybody who wants to see
 * what was checked. A tick is not news.
 *
 * ## Loud when something does not
 *
 * A failing check stays open and is the only thing on the card. The ones that
 * passed fold into a line beneath it, because "sort these first" and "and the
 * rest were fine" are two different sentences and the second should not compete
 * with the first.
 *
 * ## Deliberately not a second copy of the exception list
 *
 * Nothing here repeats once Calculate has actually run: the run's own
 * exceptions, one per person, are what step two shows from that point on. This is
 * only for the question a person has before they have anybody to name yet.
 */
export function PreflightChecklist() {
  /* Nothing shown while loading or on a read failure: better than a skeleton
     competing with the period form for attention, and there is nothing to act
     on until it answers. */
  const { facts } = useSetupChecklist();
  const pathname = usePathname();
  const search = useSearchParams();
  /* Where "Add one" below sends the bank-accounts screen's own Back link,
     otherwise it lands on the generic Settings page, not back on this run. */
  const here = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
  if (!facts) return null;

  const rows: Row[] = [
    {
      label: facts.pay.settings
        ? "What you deduct is decided"
        : "What you deduct is not decided yet",
      ok: facts.pay.settings,
      detail: "PAYE, pension and NHF, each a switch, in payroll settings.",
      href: "/settings/payroll",
      linkLabel: "Decide it",
    },
    {
      /* The label states what IS, never what should be. A fixed affirmative
         above a "Set it" button on a company that had never set one read as
         done, and only the amber triangle disagreed with it. */
      label: facts.company.taxState
        ? "A default PAYE state is set"
        : "No default PAYE state yet",
      ok: facts.company.taxState,
      detail: "Falls back to this for anybody with no state of their own.",
      href: "/settings/company",
      linkLabel: "Set it",
    },
  ];

  if (facts.payrollChecks.employees > 0) {
    const {
      employees,
      missingBankAccount,
      missingPensionPin,
      requirePensionPin,
    } = facts.payrollChecks;
    rows.push({
      label:
        missingBankAccount === 0
          ? "Everybody has a bank account"
          : `${missingBankAccount} of ${employees} have no bank account`,
      ok: missingBankAccount === 0,
      detail: "Payroll cannot pay somebody with no account on file.",
      href: "/people",
      linkLabel: "Open the directory",
    });
    if (requirePensionPin) {
      rows.push({
        label:
          missingPensionPin === 0
            ? "Everybody has a pension PIN"
            : `${missingPensionPin} of ${employees} have no pension PIN`,
        ok: missingPensionPin === 0,
        detail:
          "Recorded, not pay-blocking: only the remittance schedule is incomplete without it.",
        href: "/people",
        linkLabel: "Open the directory",
      });
    }
  }

  /* Null rather than a row offline: the demo has no payment book, and a false
     claim of "no payout account" beside a company that has one is exactly the
     wrong figure this product is sold against. */
  if (facts.pay.hasPrimaryBankAccount !== null) {
    rows.push({
      label: facts.pay.hasPrimaryBankAccount
        ? "Your company has a payout account on file"
        : "Your company has no payout account on file",
      ok: facts.pay.hasPrimaryBankAccount,
      detail: "Needed to build a payment batch once this run is approved.",
      href: `/settings/bank-accounts?from=${encodeURIComponent(here)}`,
      linkLabel: "Add one",
    });
  }

  const failing = rows.filter((row) => !row.ok);
  const passing = rows.filter((row) => row.ok);

  if (failing.length === 0) {
    return (
      <Disclosure
        dense
        level={3}
        title={
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="size-4 text-success-text" />
            Everything is in place
          </span>
        }
        meta={
          <Badge tone="success" size="sm">
            {rows.length} {rows.length === 1 ? "check" : "checks"} passed
          </Badge>
        }
        hint="Nothing here would stop or surprise this payroll today."
      >
        <ul className="flex flex-col gap-2 px-3 pb-3">
          {passing.map((row) => (
            <CheckRow key={row.label} row={row} />
          ))}
        </ul>
      </Disclosure>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Before you run this"
        description={`${failing.length} ${failing.length === 1 ? "thing" : "things"} worth sorting first. None of this stops Calculate: whoever it is about is still named, on the next step, either way.`}
      />
      <CardBody className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2.5">
          {failing.map((row) => (
            <CheckRow key={row.label} row={row} />
          ))}
        </ul>
        {passing.length > 0 && (
          <Disclosure
            dense
            level={4}
            title={
              passing.length === 1
                ? "1 other check passed"
                : `${passing.length} other checks passed`
            }
          >
            <ul className="flex flex-col gap-2 px-3 pb-3">
              {passing.map((row) => (
                <CheckRow key={row.label} row={row} />
              ))}
            </ul>
          </Disclosure>
        )}
      </CardBody>
    </Card>
  );
}

type Row = {
  label: string;
  ok: boolean;
  detail?: string;
  href?: string;
  linkLabel?: string;
};

function CheckRow({ row }: { row: Row }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-md border p-3",
        row.ok ? "border-line" : "border-warning-line bg-warning-soft",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 shrink-0 [&>svg]:size-4",
            row.ok ? "text-success-text" : "text-warning-text",
          )}
        >
          {row.ok ? <Check /> : <AlertTriangle />}
        </span>
        <div className="min-w-0">
          <p className="text-body-sm text-ink">{row.label}</p>
          {row.detail && (
            <p className="mt-0.5 text-meta leading-relaxed text-muted">
              {row.detail}
            </p>
          )}
        </div>
      </div>
      {!row.ok && row.href && (
        <ButtonLink
          href={row.href}
          size="sm"
          variant="secondary"
          className="max-sm:min-h-11"
        >
          {row.linkLabel}
        </ButtonLink>
      )}
    </li>
  );
}
