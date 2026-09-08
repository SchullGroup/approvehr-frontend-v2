"use client";

import { Disclosure } from "@/components/ui";
import { formatKobo, type Payslip } from "@/lib/api/payroll";

/**
 * The band-by-band working behind a payslip's tax figure.
 *
 * Asked for in the standup: *"more transparency regarding how the system
 * calculates tax and pension figures."* The section this sits inside already
 * showed the relief, the taxable pay and the tax — the inputs and the answer.
 * What it could not show was the step between them, so a reader who wanted to
 * check ₦63,950 had nothing to check it against.
 *
 * ## Nothing here is computed
 *
 * Every figure is `slip.workings.paye`, derived on the API from this payslip's
 * own stored row and the bands of its own period. A copy of the bands on this
 * side is how a screen comes to disagree with the payroll about somebody's tax
 * — the mistake this codebase has already paid for once, when the frontend
 * carried its own schedule and quoted ₦63,266.67 where the answer was ₦63,950.
 *
 * ## Absent is the ordinary case
 *
 * `workings.paye` is null wherever the API cannot stand behind a working: no
 * PAYE operated, a figure entered by hand, a nil tax with no bands behind it,
 * or a derivation that did not reproduce the charge. All four render nothing,
 * and the section above still says what it always said. A band table that
 * disagrees with the deduction beside it is worse than none — the person
 * reading it came looking because they already doubted the number.
 *
 * ## Closed, and off the printed copy
 *
 * `PARITY.md` Rule 5: a reveal is for reference-shaped detail, and open is for
 * something the reader has to act on. This is the opposite of a blocker — it
 * explains a figure that has already been decided. `print:hidden` for the same
 * reason: the printed artefact is the payslip, and a derivation is not part of
 * what it certifies.
 */

/** `0.15` → `15%`. Decimals only where the rate actually has them. */
const pct = (rate: number): string => {
  const value = rate * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
};

export function TaxBands({ slip }: { slip: Payslip }) {
  const working = slip.workings?.paye;
  if (!working) return null;

  return (
    <Disclosure
      className="mt-4 print:hidden"
      level={4}
      dense
      title="How this tax figure was reached"
      meta={`${working.bands.length} ${working.bands.length === 1 ? "band" : "bands"}`}
      hint="The arithmetic behind the figure above. Not a separate calculation — the same one, shown."
    >
      <dl className="flex flex-col gap-1 text-body-sm">
        <Row
          label="Taxable pay for the year"
          value={formatKobo(working.taxableAnnualKobo + working.reliefAnnualKobo)}
        />
        <Row label="Less relief" value={`− ${formatKobo(working.reliefAnnualKobo)}`} />
        <Row label="Taxed on" value={formatKobo(working.taxableAnnualKobo)} strong />
      </dl>

      <div className="scroll-x mt-3">
        <table className="w-full min-w-lg border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="pb-2 text-meta font-semibold text-muted">
                Band
              </th>
              <th scope="col" className="pb-2 text-right text-meta font-semibold text-muted">
                Rate
              </th>
              <th scope="col" className="pb-2 text-right text-meta font-semibold text-muted">
                Taxed
              </th>
              <th scope="col" className="pb-2 text-right text-meta font-semibold text-muted">
                Tax
              </th>
            </tr>
          </thead>
          <tbody>
            {working.bands.map((band, index) => (
              <tr key={index} className="border-b border-line">
                <td className="py-1.5 text-body-sm text-body">
                  {/* Null means "and everything above". The stored width on the
                      top band stands in for infinity, and printing it would be
                      a confident claim about a ceiling that does not exist. */}
                  {band.widthKobo === null
                    ? "Everything above that"
                    : `First ${formatKobo(band.widthKobo)}`}
                </td>
                <td className="tabular py-1.5 text-right text-body-sm text-body">
                  {pct(band.rate)}
                </td>
                <td className="tabular py-1.5 text-right text-body-sm text-body">
                  {formatKobo(band.taxedKobo)}
                </td>
                <td className="tabular py-1.5 text-right text-body-sm font-medium text-ink">
                  {formatKobo(band.taxKobo)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-2 text-body-sm font-medium text-ink">
                Tax for the year
              </td>
              {/* The column above sums to this exactly, by construction on the
                  API. A total its own rows do not add up to is the discrepancy
                  a reader came here looking for, and it would be ours. */}
              <td className="tabular pt-2 text-right text-body-sm font-medium text-ink">
                {formatKobo(working.annualKobo)}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="pt-1 text-body-sm text-body">
                Divided by twelve
              </td>
              <td className="tabular pt-1 text-right text-body-sm font-medium text-ink">
                {formatKobo(slip.payeKobo)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-meta leading-relaxed text-body">
        The bands are annual and progressive: each slice of your pay is taxed at
        its own rate, and only the part above a band pays the next rate up. The
        year&apos;s tax is worked out first and divided by twelve, so a month is
        never taxed against month-sized bands.
      </p>
    </Disclosure>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "text-ink" : "text-body"}>{label}</dt>
      <dd className={`tabular ${strong ? "font-medium text-ink" : "text-body"}`}>
        {value}
      </dd>
    </div>
  );
}
