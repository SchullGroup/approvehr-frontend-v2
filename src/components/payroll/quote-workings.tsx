"use client";

import { Disclosure } from "@/components/ui";
import { formatKobo, type ComputedPayslip } from "@/lib/api/payroll";

/**
 * How a quoted payslip's statutory figures were arrived at.
 *
 * The feedback's onboarding item, in its own words: *"When onboarding an
 * employee manually, there's no visibility into how their pay and pension are
 * calculated by the system. The onboarding flow should show the pay computation
 * logic and pension setup/percentage, not just the final numbers."*
 *
 * The wizard already quoted a live payslip — Gross, Pension, NHF, PAYE, Net —
 * which is exactly the "just the final numbers" the item objects to. Every
 * input was already on the object; what nobody could see was the arithmetic
 * between them, and in particular **the pension percentage**, which the item
 * names and which appeared nowhere.
 *
 * ## Not `TaxBands`, and not merged with it
 *
 * `components/payroll/tax-bands.tsx` does this for a **stored** payslip, whose
 * workings the API *derives* and refuses where the derivation cannot be stood
 * behind. This is a **quote**: the engine has just run, so the rates and the
 * bases are the ones it used and there is nothing to reconcile against. Two
 * different shapes on the wire and two different guarantees, so folding them
 * into one component would mean a prop deciding which promise it was making.
 *
 * ## Nothing here is computed
 *
 * Every figure is `slip.workings`. The annual tax is the sum of the band
 * column, which the engine builds so that it telescopes to `annualPaye`
 * exactly — a total worked out on this side would be a second implementation
 * of somebody's tax, which is the mistake this codebase has already paid for
 * once.
 *
 * Closed by default: somebody adding an employee has a job to do and this is
 * reference. It is the answer to "where does that number come from", available
 * to whoever asks it.
 */

/** `0.08` → `8%`. Decimals only where the rate has them. */
const pct = (rate: number): string => {
  const value = rate * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
};

export function QuoteWorkings({ slip }: { slip: ComputedPayslip }) {
  const workings = slip.workings;
  /* Absent from an API that predates it. Rendering an empty reveal would
     promise a working that is not there. */
  if (!workings) return null;

  const { paye, pension, nhf } = workings;
  const annualKobo = paye.bands.reduce(
    (total, band) => total + band.taxKobo,
    0,
  );

  return (
    <Disclosure
      className="mt-1"
      level={4}
      dense
      title="How these figures are worked out"
      hint="The rates and the bands behind the four numbers above."
    >
      <div className="flex flex-col gap-4 text-body-sm">
        {/* --------------------------------------------------------- pension */}
        {pension.rate > 0 && (
          <section>
            <h5 className="text-meta font-semibold text-faint">Pension</h5>
            <p className="mt-1 leading-relaxed text-body">
              {pct(pension.rate)} of {formatKobo(pension.baseKobo)} —{" "}
              {formatKobo(slip.pensionEmployeeKobo)} from their pay. The
              employer adds {pct(pension.employerRate)} on top, which is{" "}
              {formatKobo(slip.pensionEmployerKobo)} and never comes out of it.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------------- NHF */}
        {nhf.rate > 0 && (
          <section>
            <h5 className="text-meta font-semibold text-faint">
              National Housing Fund
            </h5>
            <p className="mt-1 leading-relaxed text-body">
              {pct(nhf.rate)} of {formatKobo(nhf.baseKobo)} —{" "}
              {formatKobo(slip.nhfKobo)}.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------------ PAYE */}
        <section>
          <h5 className="text-meta font-semibold text-faint">Income tax</h5>
          {paye.bands.length === 0 ? (
            <p className="mt-1 leading-relaxed text-body">
              {slip.operates.paye === "DEDUCTED"
                ? "Nothing is taxable at this salary, so no tax is worked out."
                : "This company does not run PAYE through payroll."}
            </p>
          ) : (
            <>
              <p className="mt-1 leading-relaxed text-body">
                Pension and the housing fund come off first, then{" "}
                {formatKobo(paye.reliefAnnualKobo)} of relief for the year —
                leaving {formatKobo(paye.taxableAnnualKobo)} to be taxed.
              </p>
              <div className="scroll-x mt-2">
                <table className="w-full min-w-lg border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {["Band", "Rate", "Taxed", "Tax"].map((head, i) => (
                        <th
                          key={head}
                          scope="col"
                          className={`pb-2 text-meta font-semibold text-muted${i > 0 ? " text-right" : ""}`}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paye.bands.map((band, index) => (
                      <tr key={index} className="border-b border-line">
                        <td className="py-1.5 text-body">
                          {/* Null is "and everything above": the stored width
                              on the top band stands in for infinity, and
                              printing it would claim a ceiling that does not
                              exist. */}
                          {band.widthKobo === null
                            ? "Everything above that"
                            : `First ${formatKobo(band.widthKobo)}`}
                        </td>
                        <td className="tabular py-1.5 text-right text-body">
                          {pct(band.rate)}
                        </td>
                        <td className="tabular py-1.5 text-right text-body">
                          {formatKobo(band.taxedKobo)}
                        </td>
                        <td className="tabular py-1.5 text-right font-medium text-ink">
                          {formatKobo(band.taxKobo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="pt-2 font-medium text-ink">
                        Tax for the year
                      </td>
                      <td className="tabular pt-2 text-right font-medium text-ink">
                        {formatKobo(annualKobo)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="pt-1 text-body">
                        Divided by twelve
                      </td>
                      <td className="tabular pt-1 text-right font-medium text-ink">
                        {formatKobo(slip.payeKobo)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-meta leading-relaxed text-faint">
                The bands are annual and progressive, so the year is worked out
                first and divided by twelve. Taxing a month against month-sized
                bands would give a different, and wrong, answer.
              </p>
            </>
          )}
        </section>
      </div>
    </Disclosure>
  );
}
