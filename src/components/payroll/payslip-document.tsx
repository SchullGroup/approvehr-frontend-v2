import { cn } from "@/lib/cn";
import { Money } from "@/components/ui";
import { LogoMark } from "@/components/brand/logo";
import type {
  PayrollEmployee,
  Payslip,
  YearToDate,
} from "@/lib/payroll/engine";
import {
  DEFAULT_SETTINGS,
  type PayrollSettings,
} from "@/lib/payroll/settings";

/*
 * The payslip document.
 *
 * This is a legal record an employee may keep for years and produce to a bank
 * or a tax office, so it is built to print: A4-ish proportions, no colour that
 * fails in greyscale, and every figure itemised rather than netted off.
 *
 * The one thing it works hardest to make unambiguous is that employer pension
 * is NOT a deduction. Showing it inside the deductions column — which plenty
 * of Nigerian payslips do — makes staff believe their pay was cut by 18%.
 */

export function PayslipDocument({
  employee,
  slip,
  ytd,
  period,
  payDate,
  company = {
    name: "Schull Technologies Ltd",
    rc: "RC 1482930",
    address: "12 Adeola Odeku Street, Victoria Island, Lagos",
  },
  extraDeductions = [],
  settings = DEFAULT_SETTINGS,
  className,
}: {
  employee: PayrollEmployee;
  slip: Payslip;
  ytd: YearToDate;
  period: string;
  payDate: string;
  company?: { name: string; rc: string; address: string };
  /** Named post-tax items so the employee sees what was taken, not a lump. */
  extraDeductions?: { label: string; amount: number }[];
  /** Rates are quoted on the slip, so they must come from the same source
      that computed it — never from a constant in this file. */
  settings?: PayrollSettings;
  className?: string;
}) {
  const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
  const earnings = [
    { label: "Basic salary", amount: slip.basic },
    { label: "Housing allowance", amount: slip.housing },
    { label: "Transport allowance", amount: slip.transport },
  ];

  const statutory = [
    {
      label: `Pension contribution (${pct(settings.pension.employeeRate)})`,
      amount: slip.pensionEmployee,
    },
    {
      label: `National Housing Fund (${pct(settings.nhf.rate)} of ${settings.nhf.basis})`,
      amount: slip.nhf,
    },
    { label: "PAYE income tax", amount: slip.payeMonthly },
  ].filter((line) => line.amount > 0 || line.label.startsWith("PAYE"));

  const totalDeductions =
    slip.pensionEmployee + slip.nhf + slip.payeMonthly + slip.postTaxDeductions;

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl bg-surface p-8 text-ink print:max-w-none print:p-0",
        "rounded-lg border border-line print:rounded-none print:border-0",
        className,
      )}
    >
      {/* Masthead */}
      <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
        <div className="flex items-start gap-3">
          <LogoMark size={28} className="mt-0.5 text-ink" />
          <div>
            <p className="text-h4 text-ink">{company.name}</p>
            <p className="mt-0.5 text-[0.75rem] text-muted">{company.rc}</p>
            <p className="mt-1 max-w-[16rem] text-[0.75rem] leading-snug text-muted">
              {company.address}
            </p>
          </div>
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
        <Detail label="Employee ID" value={employee.id.toUpperCase()} />
        <Detail label="Job title" value={employee.jobTitle} />
        <Detail label="Department" value={employee.department} />
        <Detail label="Tax state" value={employee.taxState} />
        <Detail label="Pension PIN" value={employee.pensionPin ?? "—"} />
        <Detail label="Paid to" value={employee.bankAccount ?? "—"} />
        <Detail label="Payment date" value={payDate} />
      </section>

      {/* Earnings and deductions */}
      <section className="grid gap-8 py-6 sm:grid-cols-2">
        <div>
          <ColumnHead>Earnings</ColumnHead>
          <dl className="mt-3 flex flex-col">
            {earnings.map((e) => (
              <LineItem key={e.label} label={e.label} amount={e.amount} />
            ))}
            <LineItem label="Gross pay" amount={slip.grossMonthly} total />
          </dl>
        </div>

        <div>
          <ColumnHead>Deductions</ColumnHead>
          <dl className="mt-3 flex flex-col">
            {statutory.map((d) => (
              <LineItem key={d.label} label={d.label} amount={d.amount} />
            ))}
            {extraDeductions.map((d) => (
              <LineItem key={d.label} label={d.label} amount={d.amount} />
            ))}
            <LineItem
              label="Total deductions"
              amount={totalDeductions}
              total
            />
          </dl>
        </div>
      </section>

      {/* Net */}
      <section className="flex items-baseline justify-between gap-4 border-y-2 border-ink py-4">
        <p className="text-h4 text-ink">Net pay</p>
        <p className="tabular text-h2 text-ink">
          <Money amount={Math.round(slip.netPay)} decimals />
        </p>
      </section>

      {/* Employer contributions — deliberately outside the deductions column */}
      <section className="mt-6 rounded-md border border-line bg-canvas p-4">
        <ColumnHead>Employer contributions</ColumnHead>
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
          Paid by {company.name} on your behalf. These are not deducted from
          your pay and do not reduce the net figure above.
        </p>
        <dl className="mt-3 flex flex-col">
          <LineItem
            label={`Pension contribution (${pct(settings.pension.employerRate)})`}
            amount={slip.pensionEmployer}
          />
        </dl>
      </section>

      {/* Year to date */}
      <section className="mt-6">
        <ColumnHead>Year to date · {ytd.monthsElapsed} months</ColumnHead>
        <div className="scroll-x mt-3">
          <table className="w-full min-w-lg border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Gross", "PAYE", "Pension", "NHF", "Net"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="pb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-muted last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[
                  ytd.gross,
                  ytd.paye,
                  ytd.pensionEmployee,
                  ytd.nhf,
                  ytd.net,
                ].map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      "tabular pt-2.5 text-[0.875rem] text-body",
                      i === 4 && "text-right font-medium text-ink",
                    )}
                  >
                    <Money amount={Math.round(v)} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 border-t border-line pt-4">
        <p className="text-[0.75rem] leading-relaxed text-muted">
          PAYE is calculated on annualised income under the Personal Income Tax
          Act as amended, after pension and National Housing Fund relief and the
          consolidated relief allowance. Pension is remitted to your PFA under
          the Pension Reform Act 2014. Queries go to your HR help desk.
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
  value: string;
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
        {value}
      </dd>
    </div>
  );
}

function LineItem({
  label,
  amount,
  total = false,
}: {
  label: string;
  amount: number;
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
        <Money amount={Math.round(amount)} decimals />
      </dd>
    </div>
  );
}
