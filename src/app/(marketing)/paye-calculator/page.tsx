import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/motion";
import { SectionHeading } from "@/components/marketing/sections";
import { Pill } from "@/components/marketing/pill";
import { JsonLd } from "@/components/marketing/json-ld";
import { SITE_URL } from "@/lib/marketing/site";
import { TaxCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "Nigeria PAYE Calculator (2026) — Free Salary Tax Calculator",
  description:
    "Calculate your take-home pay under the Nigeria Tax Act 2025 for free. PAYE, pension, NHF and rent relief, worked out by the same engine that runs real payroll.",
  alternates: { canonical: `${SITE_URL}/paye-calculator` },
};

const FAQ = [
  {
    q: "How is PAYE calculated in Nigeria in 2026?",
    a: "Gross pay less pension, NHF and any relief gives taxable income. That figure is taxed across progressive annual bands: the first ₦800,000 is tax-free, then 15%, 18%, 21%, 23% and 25% on each slice above it. This calculator runs that exact arithmetic.",
  },
  {
    q: "What changed under the Nigeria Tax Act 2025?",
    a: "The Consolidated Relief Allowance is gone. In its place is rent relief — 20% of the rent you actually pay each year, capped at ₦500,000 — so somebody who has not declared their rent gets no relief at all, where the old regime granted one to everybody automatically.",
  },
  {
    q: "Is pension deducted before or after tax?",
    a: "Before. Pension (8% of pay for most employees) and NHF (2.5%) both come off gross pay first, and PAYE is charged on what is left, not on the full gross figure.",
  },
  {
    q: "Does PAYE differ by state?",
    a: "The bands are set nationally and are identical in every state. What differs is who you remit to — your own State Internal Revenue Service, or the FCT-IRS in Abuja.",
  },
  {
    q: "Is this figure exact?",
    a: "It is the same calculation a real payslip on this platform runs, to the kobo, for the inputs you gave it. It is not tax advice, and it cannot see anything about your situation you did not enter — a professional can.",
  },
];

export default function PayeCalculatorPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />

      {/* Hero + calculator */}
      <section className="px-4 pb-16 pt-16 sm:pt-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              as="h1"
              align="center"
              eyebrow="Free tool"
              title="Nigeria PAYE calculator"
              lead="Free. No signup. Updated for the Nigeria Tax Act 2025 — the same engine that runs real payroll on this platform, not a spreadsheet copy of it."
            />
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-12">
              <TaxCalculator />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Companion explainer — the keyword coverage a calculator alone misses */}
      <section className="border-t border-sand-line bg-sand-deep px-4 py-24">
        <div className="container-page max-w-3xl">
          <Reveal>
            <h2 className="text-h2 text-slate">
              How PAYE is calculated in Nigeria, under the Nigeria Tax Act 2025
            </h2>
          </Reveal>

          <Reveal delay={60}>
            <div className="mt-8 flex flex-col gap-6 text-body leading-relaxed text-slate-soft">
              <p>
                Personal income tax in Nigeria is Pay As You Earn — PAYE — and
                since 1 January 2026 it runs on the bands set by the Nigeria Tax
                Act 2025, not the 2011 schedule most guides online still quote.
                Getting the order of operations right matters more than the
                bands themselves: get it wrong and every figure downstream looks
                plausible and is not.
              </p>

              <ol className="flex flex-col gap-4">
                <li>
                  <strong className="text-slate">
                    1. Start from gross pay.
                  </strong>{" "}
                  Basic salary plus housing, transport and any other allowance,
                  for the year.
                </li>
                <li>
                  <strong className="text-slate">
                    2. Deduct pension and NHF.
                  </strong>{" "}
                  8% employee pension and 2.5% National Housing Fund come off
                  first — both are statutory, and both reduce what PAYE is
                  charged on.
                </li>
                <li>
                  <strong className="text-slate">
                    3. Apply rent relief, if declared.
                  </strong>{" "}
                  20% of annual rent actually paid, capped at ₦500,000 a year.
                  This is new: the Act abolished the old Consolidated Relief
                  Allowance, which every employee received automatically
                  regardless of what they paid in rent. Rent relief only applies
                  to rent that has actually been declared — nothing is assumed.
                </li>
                <li>
                  <strong className="text-slate">
                    4. Tax what is left, band by band.
                  </strong>{" "}
                  The bands are progressive, so earning ₦1 above a threshold
                  does not push the whole income into the next rate — only that
                  ₦1 is taxed at it.
                </li>
              </ol>

              <div className="overflow-x-auto rounded-2xl border border-sand-line bg-white/70">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-sand-line">
                      <th className="px-5 py-3 font-medium text-slate">
                        Annual income band
                      </th>
                      <th className="px-5 py-3 font-medium text-slate">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-line">
                    {[
                      ["First ₦800,000", "0%"],
                      ["Next ₦2,200,000 (to ₦3,000,000)", "15%"],
                      ["Next ₦9,000,000 (to ₦12,000,000)", "18%"],
                      ["Next ₦13,000,000 (to ₦25,000,000)", "21%"],
                      ["Next ₦25,000,000 (to ₦50,000,000)", "23%"],
                      ["Above ₦50,000,000", "25%"],
                    ].map(([band, rate]) => (
                      <tr key={band}>
                        <td className="px-5 py-3 text-slate-soft">{band}</td>
                        <td className="px-5 py-3 tabular-nums text-slate-soft">
                          {rate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p>
                A worked example: someone on ₦500,000 a month, with no rent
                declared, pays ₦63,950.00 in PAYE — a figure worth knowing
                because a widely used tool got this exact salary wrong by
                ₦683.33 in 2026, having been left on the old 2011 bands after
                the law changed. The calculator above runs the current bands
                against your own figure, not this one.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-10">
              <h3 className="text-h4 text-slate">Common questions</h3>
              <dl className="mt-5 flex flex-col divide-y divide-sand-line border-t border-sand-line">
                {FAQ.map((item) => (
                  <div key={item.q} className="py-5">
                    <dt className="text-body font-medium text-slate">
                      {item.q}
                    </dt>
                    <dd className="mt-2 text-body-sm leading-relaxed text-slate-muted">
                      {item.a}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="px-4 py-16">
        <div className="container-page max-w-3xl">
          <Reveal>
            <div className="rounded-2xl border border-sand-line bg-white/60 p-7">
              <h3 className="text-body font-semibold text-slate">
                What this is not
              </h3>
              <p className="mt-3 text-body-sm leading-relaxed text-slate-muted">
                This calculator is not tax advice, and ApproveHR is not liable
                for any decision made from its figures. It computes statutory
                PAYE, pension and NHF from what you enter, and nothing else — it
                cannot see your full tax position, any other income, or a
                state&apos;s own local levies. For a decision that matters,
                consult a licensed tax professional or the Federal Inland
                Revenue Service. Nothing you enter here is stored: each
                calculation is worked out and discarded.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-sand-line bg-night px-4 py-20">
        <div className="container-page">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-h2 text-white">
                This is what one payslip looks like.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-body-lg leading-relaxed text-white/60">
                ApproveHR runs this same calculation for your whole team, every
                month — payslips, remittance schedules and approvals included,
                not just the arithmetic.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Book a demo
                </Pill>
                <Pill href="/pricing" variant="quiet" size="lg">
                  See what it costs
                </Pill>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
