import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/brand/logo";
import {
  formatKobo,
  naira,
  wasDeducted,
  type Payslip,
  type StatutoryOperation,
} from "@/lib/api/payroll";

/*
 * The payslip document.
 *
 * This is a legal record an employee may keep for years and produce to a bank
 * or a tax office, so it is built to print: A4-ish proportions, no colour that
 * fails in greyscale, and every figure itemised rather than netted off.
 *
 * ## What changed when payroll moved onto the API
 *
 * It used to take the frontend engine's `Payslip` — floating-point naira, one
 * scalar "post-tax deductions" figure, and a list of extra deductions passed in
 * beside it. It now takes the API's payslip, in **integer kobo**, with its
 * `lines`, and itemises them:
 *
 * | Line | Where it appears |
 * |---|---|
 * | `EARNING` | Earnings, under the salary components |
 * | `DEDUCTION` with `taxable` | Deductions, above PAYE — it reduced the tax |
 * | `DEDUCTION` without | Deductions, below PAYE — it did not |
 * | `EMPLOYER_CONTRIBUTION` | Its own section, outside the deduction column |
 *
 * The pre-tax/post-tax placement is not decoration. Where a deduction sits
 * relative to PAYE is the difference between it reducing somebody's tax and not,
 * and an employee querying their payslip is entitled to see which happened.
 *
 * The one thing it works hardest to make unambiguous is that employer pension
 * is **not** a deduction. Showing it inside the deductions column — which plenty
 * of Nigerian payslips do — makes staff believe their pay was cut by 18%.
 *
 * ## Rates are optional, and that is deliberate
 *
 * The old version read the live company settings so the percentages it quoted
 * could never drift from what computed the figures. That still holds where the
 * caller knows the rates. Against the API it does not: a stored payslip does not
 * carry the rates that made it, and only an *approved* run has the frozen
 * settings snapshot. Deriving a percentage back out of the figures would print a
 * confident wrong number, so an unknown rate is simply not printed. Surfacing
 * `settingsSnapshot` on an approved run is the way to get them back.
 *
 * ## A deduction this employer does not operate is ABSENT, not ₦0.00
 *
 * `slip.operates` says which of PAYE, pension and NHF the run that produced this
 * payslip actually worked out, and the two claims are genuinely different:
 *
 * - **₦0.00** says the deduction was computed and came to nothing. Lawful and
 *   common — the first ₦800,000 a year is exempt from PAYE, so somebody on
 *   ₦60,000 a month pays none, and that zero is the answer to a real question.
 * - **Absent** says this employer does not deduct it. Smaller Nigerian companies
 *   often operate no pension scheme, and some have staff file their own tax.
 *
 * So a deduction that was not operated gets **no line in the column** and is
 * named in one sentence under it — absent from the arithmetic and stated in
 * words, rather than either printed as a zero or dropped silently. Somebody
 * whose ₦500,000 salary takes home ₦500,000 is owed the sentence explaining it.
 *
 * The pension line used to be suppressed on `amountKobo > 0`, which conflated
 * the two: a person whose pay prorated to nothing had their pension line vanish
 * as though the company had no scheme. It is suppressed on the operation now,
 * and a genuine nil prints as a nil.
 *
 * `operates` is **optional**, and absent means unknown rather than "none" —
 * every payslip written before the switches existed deducted all three, so
 * `wasDeducted` reads a missing operation as deducted.
 *
 * ## The relief line names a statute, so it is told which one
 *
 * `slip.relief` carries the regime the period's tax schedule granted, sent by
 * the API rather than guessed from the date here. See `reliefLine` below — it is
 * the one label on this document that was factually wrong rather than merely
 * unknown, and the fix is not a rewording.
 */

/** Who the payslip is for. Everything past the name may be unknown. */
export type PayslipIdentity = {
  name: string;
  employeeNo: string;
  jobTitle?: string | null;
  department?: string | null;
  taxState?: string | null;
  pensionPin?: string | null;
  bankAccount?: string | null;
};

/** Year-to-date totals, in kobo. Omitted when they cannot be known. */
export type YearToDateKobo = {
  monthsElapsed: number;
  grossKobo: number;
  payeKobo: number;
  pensionEmployeeKobo: number;
  nhfKobo: number;
  netKobo: number;
  /** True when these are projected from this month rather than summed. */
  projected: boolean;
};

export type PayslipRates = {
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  nhfBasis: "basic" | "gross";
};

/**
 * A deduction that would not fit in net pay.
 *
 * Derived from the payslip rather than passed in: the deduction lines carry what
 * was *asked for*, and `otherDeductions` carries what was actually taken, so the
 * gap between them is the amount carried forward. `reconcile.ts` allows that gap
 * to exist for exactly this reason — the alternative is a line quietly shrinking
 * on the payslip with nothing to say why.
 */
export function carriedForwardKobo(slip: Payslip): number {
  const asked = slip.lines
    .filter((line) => line.kind === "DEDUCTION")
    .reduce((total, line) => total + line.amountKobo, 0);
  return Math.max(0, asked - slip.otherDeductionsKobo);
}

/**
 * How to name the relief on the line, and what else has to be said about it.
 *
 * This line used to read "Consolidated relief allowance (per month)" always. The
 * Consolidated Relief Allowance was **abolished on 1 January 2026** by the
 * Nigeria Tax Act 2025 and replaced by relief on rent, so on an August 2026
 * payslip that label sat over a `0.00` that was arithmetically perfect and
 * named something that does not exist in law. Read plainly it says "your relief
 * is zero"; the truth is "nothing has been declared, so declare it" — and on
 * ₦500,000 a month the difference is ₦5,400 of PAYE every month.
 *
 * Four outcomes, and the third is the one this function exists for:
 *
 * | Regime | Relief | Line reads |
 * |---|---|---|
 * | `CONSOLIDATED_RELIEF` | a figure | Consolidated relief allowance |
 * | `RENT_RELIEF` | a figure | Rent relief, plus how to keep it current |
 * | `RENT_RELIEF` | nil | Rent relief, plus how to claim it |
 * | absent | either | Personal relief, and no statute named |
 *
 * **Absent is not the CRA.** A payslip whose source could not say which regime
 * ran gets the neutral name: the figure is still true, and putting a statute's
 * name on it would be a claim nobody made.
 *
 * The nil case is split on the **amount**, not on the regime being missing. Nil
 * relief under this regime is a real, common and legally correct outcome — a
 * homeowner gets none — so it is a fact to explain, not a value to treat as
 * absent.
 */
export function reliefLine(slip: Payslip): {
  label: string;
  note: string | null;
} {
  const regime = slip.relief;

  if (regime === undefined) {
    return { label: "Personal relief (per month)", note: null };
  }

  if (regime.kind === "CONSOLIDATED_RELIEF") {
    return { label: "Consolidated relief allowance (per month)", note: null };
  }

  const rate = `${+(regime.rateOfRent * 100).toFixed(2)}%`;
  /* Not `formatKobo`: that always prints two decimals, which is right for a
     figure somebody reconciles against a bank statement and wrong inside a
     sentence — "up to ₦500,000.00 a year" is a statutory cap wearing an
     accountant's clothes. Kobo still print if the cap ever has any. */
  const cap = `₦${naira(regime.capKobo).toLocaleString("en-NG")}`;

  if (slip.reliefKobo > 0) {
    return {
      label: "Rent relief (per month)",
      /* Stated even when it was granted, because somebody who moved house or
         pays more than they declared has no other way to know the figure is a
         function of a declaration they can update. */
      note:
        `Rent relief is ${rate} of the yearly rent on your record, capped at ` +
        `${cap} a year. Tell your HR team if the rent they hold has changed.`,
    };
  }

  /**
   * Nothing, when no rent is on file.
   *
   * There used to be a paragraph here: no relief is included, the consolidated
   * relief allowance was abolished on 1 January 2026, personal relief is 20% of
   * the rent you pay up to ₦500,000 a year, ask HR to add your rent. Every
   * clause was true, and it was removed at the product owner's instruction.
   *
   * The reason it is right to remove is worth keeping. A payslip is a statement
   * of what somebody was paid; four sentences of tax-reform history under a line
   * reading nothing is a leaflet stapled to a receipt. Nobody opens their
   * payslip to find out what changed in the Act.
   *
   * **The fact is not lost, and must not be.** `payroll/prepare` raises
   * `rent_relief_unclaimed` naming everybody it applies to, on the list somebody
   * reads before releasing money — and `/people/[id]` has the field to fix it.
   * Explaining a gap at length to the one person who cannot close it, while
   * saying nothing to the people who can, was always the wrong half.
   */
  return { label: "Rent relief (per month)", note: null };
}

/**
 * How an overtime line came to its figure, for the person being paid it.
 *
 * "Overtime, entered by hand (6.00h at 1.5x) — ₦18,493.11" tells somebody two
 * of the three numbers in the sum and leaves out the one they would check
 * against their contract: what an hour of theirs is worth. This puts it back.
 *
 * ## This is arithmetic, not a second engine
 *
 * The hourly figure is **divided out of the amount the payslip already
 * carries**, never computed from a salary and a policy. That distinction is the
 * whole reason this is allowed to exist: `hourlyRateKobo` on the API decides
 * what an hour is worth, from the company's `OvertimeHourlyBasis` and a
 * contractual salary this document does not have and must not guess at. A
 * second implementation of that here is exactly the duplicate-engine mistake
 * this repo deleted once and paid for.
 *
 * So the sum always reconciles: it is the stored figure, factored.
 *
 * Two shapes, because the two sources label themselves differently and only one
 * of them records a multiplier:
 *
 * - `(6.00h at 1.5x)` — entered by hand. Hours, the rate, and the hourly
 *   figure the two of them imply.
 * - `(4.0h)` — off the clock. No multiplier in the label, so no multiplier is
 *   invented: what is stated is the hours and what they averaged an hour,
 *   which is a true sentence about the money either way.
 *
 * Returns null for anything that is not overtime, and for a line whose hours
 * are zero or unreadable — a working somebody cannot check is worse than none.
 */
export function overtimeWorking(label: string, amountKobo: number): string | null {
  if (!label.startsWith("Overtime")) return null;

  const hours = Number(/\(([\d.]+)\s*h/i.exec(label)?.[1]);
  if (!Number.isFinite(hours) || hours <= 0) return null;

  const money = (kobo: number) =>
    `₦${(kobo / 100).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const rate = Number(/at\s+([\d.]+)x/i.exec(label)?.[1]);
  if (Number.isFinite(rate) && rate > 0) {
    return (
      `${String(hours)} hours at ${money(Math.round(amountKobo / hours / rate))} ` +
      `an hour, times ${String(rate)}`
    );
  }

  return `${String(hours)} hours, ${money(Math.round(amountKobo / hours))} an hour`;
}

/**
 * The statutory deductions this employer does not operate, named for a reader.
 *
 * One list, exported, so the payslip, the run's review table and the statutory
 * filings screen cannot describe the same absence three ways. The labels are the
 * words an employee would use, not the engine's field names.
 */
export function notOperated(
  operates: StatutoryOperation | undefined,
): { key: keyof StatutoryOperation; label: string; because: string }[] {
  return (
    [
      {
        key: "pension" as const,
        label: "Pension",
        because: "this employer does not operate a pension scheme",
      },
      {
        key: "nhf" as const,
        label: "National Housing Fund",
        because: "this employer does not deduct a housing fund contribution",
      },
      {
        key: "paye" as const,
        label: "PAYE income tax",
        because: "this employer does not deduct PAYE",
      },
    ]
  ).filter((row) => !wasDeducted(operates, row.key));
}

export function PayslipDocument({
  employee,
  slip,
  period,
  payDate,
  /**
   * No default, deliberately.
   *
   * This used to default to a fabricated company — "Schull Technologies Ltd",
   * "RC 1482930", a registered address — so any caller that omitted it printed
   * an invented statutory identity on a real person's payslip. There is one
   * caller and it always passes a company, so the default was never reached
   * and never noticed; it was a lie waiting for a second caller.
   *
   * `view.tsx` was fixed once already for exactly this, at the call site,
   * while the component kept its own copy of the same fabrication with a
   * *different* RC number. That is the shape worth remembering: fixing the
   * caller leaves the trap set.
   *
   * Required now, so the compiler asks. What is genuinely unknown prints as a
   * dash, which is what the rest of this document already does.
   */
  company,
  rates,
  ytd,
  className,
}: {
  employee: PayslipIdentity;
  slip: Payslip;
  /** Human form, e.g. "August 2026". */
  period: string;
  /** Human form, e.g. "28 August 2026". */
  payDate: string;
  /**
   * The employer this payslip is from. `logoUrl` is an image `data:` URI when
   * the company has uploaded one — never a remote URL, so opening a saved
   * payslip fetches nothing from anybody's server. See `Organization.logoUrl`.
   */
  company?: { name: string; rc: string; address: string; logoUrl?: string | null };
  rates?: PayslipRates;
  ytd?: YearToDateKobo;
  className?: string;
}) {
  const pct = (value: number) => `${+(value * 100).toFixed(2)}%`;
  const allowances = slip.lines.filter((line) => line.kind === "EARNING");
  const preTax = slip.lines.filter(
    (line) => line.kind === "DEDUCTION" && line.taxable,
  );
  const postTax = slip.lines.filter(
    (line) => line.kind === "DEDUCTION" && !line.taxable,
  );
  /**
   * What the employer paid on top — minus anything for a scheme it does not run.
   *
   * The API writes an "Employer pension" line on every payslip, at ₦0.00 where
   * there is no scheme, exactly as it stores `pensionEmployeeKobo: 0` and
   * `payeKobo: 0`. Storing the zero is right; **printing** it is not, and this
   * filter is the same `wasDeducted` decision the deductions column makes one
   * section up.
   *
   * Printing "Employer pension ₦0.00" is the worst of the three zeroes on this
   * document. It is the figure an employee checks to see what went into their
   * retirement savings, so a nil there reads as an employer that owed a
   * contribution and paid nothing — an accusation — when the truth is that there
   * is no scheme to contribute to. The employee column was gated when the
   * switches went in and this column was missed.
   */
  const employerLines = slip.lines.filter(
    (line) =>
      line.kind === "EMPLOYER_CONTRIBUTION" &&
      (line.label !== "Employer pension" ||
        wasDeducted(slip.operates, "pension")),
  );
  const carried = carriedForwardKobo(slip);
  const relief = reliefLine(slip);

  const earnings = [
    { label: "Basic salary", kobo: slip.basicKobo },
    { label: "Housing allowance", kobo: slip.housingKobo },
    { label: "Transport allowance", kobo: slip.transportKobo },
    ...allowances.map((line) => ({
      label: line.label,
      kobo: line.amountKobo,
      note: overtimeWorking(line.label, line.amountKobo),
    })),
  ];

  /* Pension and NHF come off before PAYE, so they are printed before it. The
     order of this column is the order of the calculation.

     Each statutory line appears when the employer **operates** it, not when its
     amount is non-zero. A nil pension on a month that prorated to nothing is a
     real figure and prints; a company with no scheme has no line at all and is
     named below the column instead. */
  const deductions = [
    ...(wasDeducted(slip.operates, "pension")
      ? [
          {
            label: rates
              ? `Pension contribution (${pct(rates.pensionEmployee)})`
              : "Pension contribution",
            kobo: slip.pensionEmployeeKobo,
          },
        ]
      : []),
    ...(wasDeducted(slip.operates, "nhf")
      ? [
          {
            label: rates
              ? `National Housing Fund (${pct(rates.nhf)} of ${rates.nhfBasis})`
              : "National Housing Fund",
            kobo: slip.nhfKobo,
          },
        ]
      : []),
    ...preTax.map((line) => ({ label: line.label, kobo: line.amountKobo })),
    ...(wasDeducted(slip.operates, "paye")
      ? [{ label: "PAYE income tax", kobo: slip.payeKobo }]
      : []),
    ...postTax.map((line) => ({
      /* The full instalment is what the employee agreed to; what fitted this
         month is shown under the total, not by silently shrinking the line. */
      label: line.label,
      kobo: line.amountKobo,
    })),
  ];

  const absent = notOperated(slip.operates);

  /* Only what was actually deducted. Adding a not-operated zero changes nothing
     arithmetically and is written this way so the total and the column can never
     be built from different sets of lines. */
  const takenKobo =
    (wasDeducted(slip.operates, "pension") ? slip.pensionEmployeeKobo : 0) +
    (wasDeducted(slip.operates, "nhf") ? slip.nhfKobo : 0) +
    (wasDeducted(slip.operates, "paye") ? slip.payeKobo : 0) +
    slip.otherDeductionsKobo;

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl bg-surface p-8 text-ink print:max-w-none print:p-0",
        "rounded-lg border border-line print:rounded-none print:border-0",
        className,
      )}
    >
      {/* Masthead */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          {/* The employer's mark, when they have one. `alt` is empty because
              the company name is the line directly under it, and a screen
              reader that announced both would say the name twice. */}
          {company?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt=""
              className="mb-2.5 max-h-12 max-w-[12rem] object-contain object-left"
            />
          )}
          <p className="text-h4 text-ink">{company?.name ?? "—"}</p>
          <p className="mt-0.5 text-meta text-muted">{company?.rc ?? "—"}</p>
          <p className="mt-1 max-w-[18rem] text-meta leading-snug text-muted">
            {company?.address ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-meta font-semibold text-muted">
            Payslip
          </p>
          <p className="mt-1 text-h4 text-ink">{period}</p>
          <p className="mt-0.5 text-meta text-muted">Paid {payDate}</p>
        </div>
      </header>

      {/* Employee */}
      <section className="grid gap-x-8 gap-y-3 border-b border-line py-5 sm:grid-cols-2">
        <Detail label="Employee" value={employee.name} strong />
        <Detail label="Employee ID" value={employee.employeeNo} />
        <Detail label="Job title" value={employee.jobTitle} />
        <Detail label="Department" value={employee.department} />
        <Detail label="Tax state" value={employee.taxState} />
        <Detail label="Pension PIN" value={employee.pensionPin} />
        <Detail label="Paid to" value={employee.bankAccount} />
        <Detail label="Payment date" value={payDate} />
      </section>

      {/* Unpaid days, when there are any. This is the figure an employee
          queries first, so it is stated before the columns rather than left to
          be inferred from a gross that looks wrong. */}
      {slip.unpaidDays > 0 && (
        <section className="mt-5 rounded-md border border-warning-line bg-warning-soft p-4">
          <p className="text-body-sm font-medium text-ink">
            {slip.unpaidDays} unpaid {slip.unpaidDays === 1 ? "day" : "days"} this
            month
          </p>
          <p className="mt-1 text-meta leading-relaxed text-body">
            {formatKobo(slip.proratedDeductionKobo)} was taken off the
            contractual salary before anything below was worked out.
          </p>
        </section>
      )}

      {/* Earnings and deductions */}
      <section className="grid gap-8 py-6 sm:grid-cols-2">
        <div>
          <ColumnHead>Earnings</ColumnHead>
          <dl className="mt-3 flex flex-col">
            {earnings.map((line, i) => (
              <LineItem
                key={`${line.label}-${i}`}
                label={line.label}
                kobo={line.kobo}
                note={"note" in line ? line.note : null}
              />
            ))}
            <LineItem label="Gross pay" kobo={slip.grossKobo} total />
          </dl>
        </div>

        <div>
          <ColumnHead>Deductions</ColumnHead>
          <dl className="mt-3 flex flex-col">
            {deductions.map((line, i) => (
              <LineItem
                key={`${line.label}-${i}`}
                label={line.label}
                kobo={line.kobo}
              />
            ))}
            <LineItem label="Total deductions" kobo={takenKobo} total />
          </dl>
          {/* Absent from the column and stated in words. A ₦500,000 salary
              taking home ₦500,000 needs the sentence, and "PAYE ₦0.00" would be
              the wrong one — it claims tax was worked out. */}
          {absent.length > 0 && (
            <p className="mt-2 text-meta leading-relaxed text-body">
              {absent.map((row) => row.label).join(", ")}{" "}
              {absent.length === 1 ? "does" : "do"} not appear above because{" "}
              {absent.map((row) => row.because).join(", and ")}. Nothing was
              deducted for {absent.length === 1 ? "it" : "them"}.
            </p>
          )}
          {carried > 0 && (
            <p className="mt-2 text-meta leading-relaxed text-body">
              {formatKobo(carried)} of the above could not be taken this month —
              there was not enough pay left after tax. It carries over to next
              month rather than being written off.
            </p>
          )}
        </div>
      </section>

      {/* Net */}
      <section className="flex items-baseline justify-between gap-4 border-y-2 border-ink py-4">
        <p className="text-h4 text-ink">Net pay</p>
        <p className="tabular text-h2 text-ink">{formatKobo(slip.netKobo)}</p>
      </section>

      {/* Employer contributions — deliberately outside the deductions column */}
      {employerLines.length > 0 && (
        <section className="mt-6 rounded-md border border-line bg-canvas p-4">
          <ColumnHead>Paid by your employer</ColumnHead>
          <p className="mt-1.5 text-meta leading-relaxed text-muted">
            Paid by {company?.name ?? "your employer"} on your behalf. These are not deducted from
            your pay and do not reduce the net figure above.
          </p>
          <dl className="mt-3 flex flex-col">
            {employerLines.map((line) => (
              <LineItem
                key={line.id}
                label={
                  line.label === "Employer pension" && rates
                    ? `Employer pension (${pct(rates.pensionEmployer)})`
                    : line.label
                }
                kobo={line.amountKobo}
              />
            ))}
          </dl>
        </section>
      )}

      {/* How the tax was worked out.

          Replaced wholesale where no tax was worked out. Printing a relief
          figure and a taxable-pay figure under a heading that says "how the tax
          was worked out", on a payslip with no tax on it, invites the reader to
          reconstruct a deduction that never happened — which is exactly what the
          abolished-relief line did when it printed ₦0.00 under a statute that no
          longer existed. */}
      <section className="mt-6 rounded-md border border-line p-4">
        <ColumnHead>
          {wasDeducted(slip.operates, "paye")
            ? "How the tax was worked out"
            : "Income tax"}
        </ColumnHead>
        {!wasDeducted(slip.operates, "paye") ? (
          <p className="mt-2 text-meta leading-relaxed text-body">
            No PAYE was deducted from this pay, so there is no tax working to
            show. Your employer does not operate PAYE — you are responsible for
            filing your own return with your state tax authority.
          </p>
        ) : (
        <dl className="mt-3 flex flex-col">
          <LineItem label={relief.label} kobo={slip.reliefKobo} />
          <LineItem label="Taxable pay (per month)" kobo={slip.taxableIncomeKobo} />
          <LineItem label="PAYE" kobo={slip.payeKobo} total />
        </dl>
        )}
        {/* Prints. A relief nobody has claimed is the one thing on this document
            the employee themselves can do something about, so it is not hidden
            behind `no-print` on the copy they are handed. Suppressed where no
            tax ran: there is nothing for a relief to reduce. */}
        {wasDeducted(slip.operates, "paye") && relief.note && (
          <p className="mt-2 text-meta leading-relaxed text-body">
            {relief.note}
          </p>
        )}
      </section>

      {/* Year to date */}
      {ytd && (
        <section className="mt-6">
          <ColumnHead>Year to date · {ytd.monthsElapsed} months</ColumnHead>
          <div className="scroll-x mt-3">
            <table className="w-full min-w-lg border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Gross", "PAYE", "Pension", "Housing fund", "Net"].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className="pb-2 text-meta font-semibold text-muted last:text-right"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    ytd.grossKobo,
                    ytd.payeKobo,
                    ytd.pensionEmployeeKobo,
                    ytd.nhfKobo,
                    ytd.netKobo,
                  ].map((value, i) => (
                    <td
                      key={i}
                      className={cn(
                        "tabular pt-2.5 text-body-sm text-body",
                        i === 4 && "text-right font-medium text-ink",
                      )}
                    >
                      {formatKobo(value)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {/* `projectYearToDate` is set in one place — the demo branch of
              `store/payroll.ts` — because connected mode shows no year-to-date
              at all rather than a figure somebody might file a return against.
              So this paragraph is demo-only by construction, and the build flag
              is what keeps its sentence out of a production bundle. */}
          {DEMO_ENABLED && ytd.projected && (
            <p className="mt-2 text-meta leading-relaxed text-muted">
              Projected from this month, not summed from the runs — this browser
              only has the one run.
            </p>
          )}
        </section>
      )}

      <footer className="mt-8 border-t border-line pt-4">
        {/* Both marks, and in this order. The employer's is the masthead — it
            is their document. This one says what produced it, which is a
            different claim and belongs at the foot in small type. */}
        <p className="mt-2 flex items-center gap-1.5 text-meta text-muted">
          <LogoMark size={13} />
          Generated by ApproveHR · This payslip does not require a signature.
        </p>
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-meta font-semibold text-muted">
      {children}
    </h2>
  );
}

function Detail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:justify-start">
      <dt className="w-28 shrink-0 text-meta text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-body-sm",
          strong ? "font-medium text-ink" : "text-body",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function LineItem({
  label,
  kobo,
  note,
  total = false,
}: {
  label: string;
  kobo: number;
  /** The working under the label — how a figure was arrived at. */
  note?: string | null;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1.5",
        total && "mt-1 border-t border-line pt-2.5",
      )}
    >
      <dt
        className={cn(
          "min-w-0 text-body-sm",
          total ? "font-medium text-ink" : "text-body",
        )}
      >
        {label}
        {note && (
          <span className="block text-meta leading-tight text-muted">{note}</span>
        )}
      </dt>
      <dd
        className={cn(
          "tabular shrink-0 text-body-sm",
          total ? "font-semibold text-ink" : "text-body",
        )}
      >
        {formatKobo(kobo)}
      </dd>
    </div>
  );
}
