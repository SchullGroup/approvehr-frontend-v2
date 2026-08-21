import { cn } from "@/lib/cn";
import { formatKobo, type Payslip } from "@/lib/api/payroll";

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

export function PayslipDocument({
  employee,
  slip,
  period,
  payDate,
  company = {
    name: "Schull Technologies Ltd",
    rc: "RC 1482930",
    address: "12 Adeola Odeku Street, Victoria Island, Lagos",
  },
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
  company?: { name: string; rc: string; address: string };
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
  const employerLines = slip.lines.filter(
    (line) => line.kind === "EMPLOYER_CONTRIBUTION",
  );
  const carried = carriedForwardKobo(slip);

  const earnings = [
    { label: "Basic salary", kobo: slip.basicKobo },
    { label: "Housing allowance", kobo: slip.housingKobo },
    { label: "Transport allowance", kobo: slip.transportKobo },
    ...allowances.map((line) => ({ label: line.label, kobo: line.amountKobo })),
  ];

  /* Pension and NHF come off before PAYE, so they are printed before it. The
     order of this column is the order of the calculation. */
  const deductions = [
    ...(slip.pensionEmployeeKobo > 0
      ? [
          {
            label: rates
              ? `Pension contribution (${pct(rates.pensionEmployee)})`
              : "Pension contribution",
            kobo: slip.pensionEmployeeKobo,
          },
        ]
      : []),
    ...(slip.nhfKobo > 0
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
    { label: "PAYE income tax", kobo: slip.payeKobo },
    ...postTax.map((line) => ({
      /* The full instalment is what the employee agreed to; what fitted this
         month is shown under the total, not by silently shrinking the line. */
      label: line.label,
      kobo: line.amountKobo,
    })),
  ];

  const takenKobo =
    slip.pensionEmployeeKobo +
    slip.nhfKobo +
    slip.payeKobo +
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
          <p className="text-h4 text-ink">{company.name}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">{company.rc}</p>
          <p className="mt-1 max-w-[18rem] text-[0.75rem] leading-snug text-muted">
            {company.address}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
            Payslip
          </p>
          <p className="mt-1 text-h4 text-ink">{period}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">Paid {payDate}</p>
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
          <p className="text-[0.875rem] font-medium text-ink">
            {slip.unpaidDays} unpaid {slip.unpaidDays === 1 ? "day" : "days"} this
            month
          </p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-body">
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
            {earnings.map((line) => (
              <LineItem key={line.label} label={line.label} kobo={line.kobo} />
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
          {carried > 0 && (
            <p className="mt-2 text-[0.75rem] leading-relaxed text-body">
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
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
            Paid by {company.name} on your behalf. These are not deducted from
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

      {/* How the tax was worked out */}
      <section className="mt-6 rounded-md border border-line p-4">
        <ColumnHead>How the tax was worked out</ColumnHead>
        <dl className="mt-3 flex flex-col">
          <LineItem
            label="Consolidated relief allowance (per month)"
            kobo={slip.consolidatedReliefKobo}
          />
          <LineItem label="Taxable pay (per month)" kobo={slip.taxableIncomeKobo} />
          <LineItem label="PAYE" kobo={slip.payeKobo} total />
        </dl>
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
                      className="pb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-muted last:text-right"
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
                        "tabular pt-2.5 text-[0.875rem] text-body",
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
          {ytd.projected && (
            <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
              Projected from this month, not summed from the runs — this browser
              only has the one run.
            </p>
          )}
        </section>
      )}

      <footer className="mt-8 border-t border-line pt-4">
        {/* Named for the relief that actually applied, not for the one this
            footer used to name. The Consolidated Relief Allowance was abolished
            on 1 January 2026 and replaced by relief on rent — 20% of annual rent
            declared, capped at ₦500,000 — so a 2026 payslip that says "after the
            consolidated relief allowance" is describing a relief nobody
            received. `reliefKind` on the payslip says which regime ran. */}
        <p className="text-[0.75rem] leading-relaxed text-muted">
          PAYE is calculated on annualised income under the Personal Income Tax
          Act as amended, after pension and National Housing Fund relief and any
          personal relief you are entitled to. Pension is remitted to your PFA
          under the Pension Reform Act 2014. Queries go to your HR help desk.
        </p>
        <p className="mt-2 text-[0.75rem] text-muted">
          Generated by ApproveHR · This payslip does not require a signature.
        </p>
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
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
      <dt className="w-28 shrink-0 text-[0.75rem] text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-[0.875rem]",
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
  total = false,
}: {
  label: string;
  kobo: number;
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
          "min-w-0 text-[0.875rem]",
          total ? "font-medium text-ink" : "text-body",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "tabular shrink-0 text-[0.875rem]",
          total ? "font-semibold text-ink" : "text-body",
        )}
      >
        {formatKobo(kobo)}
      </dd>
    </div>
  );
}
