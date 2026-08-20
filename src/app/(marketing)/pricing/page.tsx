import type { Metadata } from "next";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import { SectionHeading } from "@/components/marketing/sections";
import { ADD_ONS, TIERS } from "@/lib/marketing/pricing";
import { PricingCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Per employee, per month, in naira. The rate falls as your headcount rises. See exactly what your company would pay.",
};

const FAQ = [
  {
    q: "Is there an implementation fee?",
    a: "Not to start. If you want us to migrate existing records, balances and payroll history and reconcile your first run against your old system, that is quoted separately from ₦250,000.",
  },
  {
    q: "What happens when we cross a headcount band?",
    a: "You move to the lower rate automatically at your next billing date, and we credit the difference on annual plans. Growing does not cost you a renegotiation.",
  },
  {
    q: "Do we pay for people who have left?",
    a: "No. Billing counts active employees on the first of the month. Leavers drop off the next cycle.",
  },
  {
    q: "Can we run payroll only?",
    a: "Payroll needs the employee record underneath it, so Core HR is always included. There is no cheaper payroll-only tier, because it would not work.",
  },
  {
    q: "What about contractors and part-time staff?",
    a: "Anyone you pay through the system counts toward headcount, whether they are on PAYE or withholding tax.",
  },
  {
    q: "How do you handle a statutory change mid-year?",
    a: "We track Finance Act changes, PenCom circulars and state IRS updates and apply them to the calculation. You do not maintain rate tables.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="px-4 pb-16 pt-16 sm:pt-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              align="center"
              eyebrow="Pricing"
              title="Work out what it costs your company, right now."
              lead="Per employee, per month, in naira. Move the number to your headcount — the tier and the price follow it."
            />
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-12">
              <PricingCalculator />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Tier detail */}
      <section className="px-4 py-16">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h2 text-slate">What each tier adds</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.id} as="div" delay={i * 60}>
                <div className="flex h-full flex-col rounded-2xl border border-sand-line bg-white/60 p-6">
                  <h3 className="text-h4 text-slate">{tier.name}</h3>
                  <p className="mt-1 text-[0.8125rem] tabular-nums text-slate-muted">
                    {tier.max === null
                      ? `${tier.min}+ employees`
                      : `${tier.min}–${tier.max} employees`}
                  </p>
                  <p className="mt-4 text-[1.5rem] font-medium tracking-tight text-slate">
                    {tier.pepm === null
                      ? "Custom"
                      : `₦${tier.pepm.toLocaleString("en-NG")}`}
                  </p>
                  {tier.pepm !== null && (
                    <p className="text-[0.75rem] text-slate-muted">
                      per employee / month
                    </p>
                  )}
                  <p className="mt-4 text-[0.875rem] leading-relaxed text-slate-soft">
                    {tier.tagline}
                  </p>

                  <ul className="mt-5 flex flex-col gap-2 border-t border-sand-line pt-5">
                    {(tier.includes.length ? tier.includes : tier.adds).map(
                      (line) => (
                        <li
                          key={line}
                          className="text-[0.8125rem] leading-snug text-slate-muted"
                        >
                          {tier.includes.length ? "" : "+ "}
                          {line}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="border-y border-sand-line bg-sand-deep px-4 py-16">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h2 text-slate">Add-ons</h2>
          </Reveal>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {ADD_ONS.map((a, i) => (
              <Reveal key={a.name} as="div" delay={i * 60}>
                <div className="h-full rounded-2xl border border-sand-line bg-sand p-6">
                  <h3 className="text-[1.0625rem] font-medium text-slate">
                    {a.name}
                  </h3>
                  <p className="mt-1.5 text-[0.875rem] font-medium text-success-text">
                    {a.price}
                  </p>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-slate-muted">
                    {a.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-20">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <h2 className="text-h2 text-slate">Questions we get asked</h2>
          </Reveal>
          <Reveal delay={80}>
            <dl className="flex flex-col divide-y divide-sand-line border-t border-sand-line">
              {FAQ.map((item) => (
                <div key={item.q} className="py-6">
                  <dt className="text-[1.0625rem] font-medium text-slate">
                    {item.q}
                  </dt>
                  <dd className="mt-2.5 text-[0.9375rem] leading-relaxed text-slate-muted">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-28">
        <div className="container-page">
          <Reveal>
            <div className="rounded-3xl bg-night px-8 py-16 text-center">
              <h2 className="mx-auto max-w-2xl text-h1 text-white">
                Still not sure which tier you land in?
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-white/60">
                Tell us your headcount and how you run payroll today. We will
                tell you what it would cost and what it would replace.
              </p>
              <div className="mt-9 flex justify-center">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Book a demo
                </Pill>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
