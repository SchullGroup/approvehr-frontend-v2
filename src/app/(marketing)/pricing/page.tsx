import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import { SectionHeading } from "@/components/marketing/sections";
import { ClientLogos } from "@/components/marketing/social-proof";
import { ADD_ONS, TIERS } from "@/lib/marketing/pricing";
import { cn } from "@/lib/cn";
import { PricingCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Per employee, per month, in naira. The rate falls as your headcount rises. See exactly what your company would pay.",
};

/* -------------------------------------------------------------------------- */

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    band: "Small teams",
    tagline: "Get HR off spreadsheets and onto a proper system.",
    features: [
      "Employee records & documents",
      "Employee self-service portal",
      "Leave & time off management",
      "Payslip generation",
      "Help desk & ticketing",
      "Knowledge base",
    ],
    cta: "Book a demo",
    featured: false,
  },
  {
    id: "growth",
    name: "Growth",
    band: "Growing companies",
    tagline: "Run payroll and hire without switching between systems.",
    features: [
      "Everything in Starter",
      "Full payroll, PAYE, pension, NHF",
      "Remittance schedules per state IRS and PFA",
      "Attendance tracking & shifts",
      "Recruitment & applicant tracking",
      "Interview scorecards",
      "Approval workflows",
    ],
    cta: "Book a demo",
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    band: "Multi-entity organisations",
    tagline: "Governance and reporting across multiple entities and locations.",
    features: [
      "Everything in Growth",
      "Performance reviews & goal cascading",
      "Multiple entities & locations",
      "Reporting & analytics",
      "Custom roles & permissions",
      "API access",
    ],
    cta: "Book a demo",
    featured: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    band: "Large organisations",
    tagline: "For groups, banks and public sector bodies with bespoke needs.",
    features: [
      "Everything in Scale",
      "Single sign-on & directory sync",
      "Uptime SLA & priority support",
      "Named customer success manager",
      "Custom integrations & data residency",
      "Security review & DPA",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

/* -------------------------------------------------------------------------- */

type Cell = true | false;

type TableSection = {
  module: string;
  rows: {
    label: string;
    cells: [Cell, Cell, Cell, Cell]; // [Starter, Growth, Scale, Enterprise]
  }[];
};

const COMPARISON: TableSection[] = [
  {
    module: "Core HR",
    rows: [
      { label: "Employee records & documents", cells: [true, true, true, true] },
      { label: "Employee self-service portal", cells: [true, true, true, true] },
      { label: "Org chart & departments", cells: [true, true, true, true] },
      { label: "Letters & contract templates", cells: [true, true, true, true] },
      { label: "Multiple entities & locations", cells: [false, false, true, true] },
      { label: "Custom roles & permissions", cells: [false, false, true, true] },
    ],
  },
  {
    module: "Payroll",
    rows: [
      { label: "Payslip generation", cells: [true, true, true, true] },
      { label: "Full payroll, PAYE, pension, NHF", cells: [false, true, true, true] },
      { label: "Remittance schedules (state IRS & PFAs)", cells: [false, true, true, true] },
      { label: "Loans & salary advances", cells: [false, true, true, true] },
    ],
  },
  {
    module: "Recruitment",
    rows: [
      { label: "Applicant tracking (unlimited roles)", cells: [false, true, true, true] },
      { label: "Configurable hiring pipelines", cells: [false, true, true, true] },
      { label: "Interview scorecards", cells: [false, true, true, true] },
      { label: "Offer management", cells: [false, true, true, true] },
    ],
  },
  {
    module: "Time & Leave",
    rows: [
      { label: "Leave management & approval chains", cells: [true, true, true, true] },
      { label: "Nigerian public holidays maintained", cells: [true, true, true, true] },
      { label: "Attendance & clock-in / clock-out", cells: [false, true, true, true] },
      { label: "Shift scheduling", cells: [false, true, true, true] },
    ],
  },
  {
    module: "Performance",
    rows: [
      { label: "Goal setting & cascade", cells: [false, false, true, true] },
      { label: "Review cycles (self, manager, peer)", cells: [false, false, true, true] },
      { label: "Competency scoring & calibration", cells: [false, false, true, true] },
    ],
  },
  {
    module: "Employee Support",
    rows: [
      { label: "Help desk & ticketing", cells: [true, true, true, true] },
      { label: "Knowledge base", cells: [true, true, true, true] },
      { label: "Response time targets", cells: [true, true, true, true] },
    ],
  },
  {
    module: "Platform",
    rows: [
      { label: "Reporting & analytics", cells: [false, false, true, true] },
      { label: "API access", cells: [false, false, true, true] },
      { label: "Single sign-on & directory sync", cells: [false, false, false, true] },
      { label: "Uptime SLA & priority support", cells: [false, false, false, true] },
      { label: "Dedicated customer success manager", cells: [false, false, false, true] },
    ],
  },
];

/* -------------------------------------------------------------------------- */

const FAQ = [
  {
    q: "How does pricing work?",
    a: "We price per employee, per month, banded by headcount, the rate falls as your team grows. Tell us your headcount and we will give you an exact number in one conversation.",
  },
  {
    q: "Is there an implementation fee?",
    a: "Not to start. If you want us to migrate existing records, leave balances and payroll history, that is scoped and quoted separately once we understand what you are moving from.",
  },
  {
    q: "Do we pay for people who have left?",
    a: "No. Billing counts active employees on the first of the month. Leavers drop off the next cycle.",
  },
  {
    q: "Can we use payroll only?",
    a: "Payroll needs the employee record underneath it, so Core HR is always included. There is no cheaper payroll-only tier, because it would not work.",
  },
  {
    q: "What about contractors and part-time staff?",
    a: "Anyone you pay through the system counts toward headcount, whether they are on PAYE or withholding tax.",
  },
  {
    q: "How do you handle statutory changes mid-year?",
    a: "We track Finance Act changes, PenCom circulars and state IRS updates and apply them automatically. You do not maintain rate tables.",
  },
];

/* -------------------------------------------------------------------------- */

export default function PricingPage() {
  const planNames = PLANS.map((p) => p.name);

  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-16 pt-16 sm:pt-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              align="center"
              eyebrow="Pricing"
              title="Start free. Pay from month two."
              lead="Your first month on us, run your first payroll, onboard your full team, and we migrate your existing data at no cost. After that, pricing is per employee, per month."
            />
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Pill href="/demo" variant="solid" size="lg" arrow>
                Start free, book a demo
              </Pill>
              <Pill href="/demo" variant="quiet" size="lg">
                Talk to sales
              </Pill>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Calculator */}
      <section className="px-4 py-20">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h2 text-slate">
              Work out what it costs your company
            </h2>
            <p className="mt-3 max-w-xl text-body-sm leading-relaxed text-slate-muted">
              Move the number to your headcount — the tier and the price
              follow it.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-10">
              <PricingCalculator />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Plan cards */}
      <section className="px-4 py-20">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h2 text-slate">Find your plan</h2>
            <p className="mt-3 max-w-xl text-body-sm leading-relaxed text-slate-muted">
              Four tiers, one price per head. Every plan starts with a free month and free migration, no module fees bolted on later.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            {PLANS.map((plan, i) => {
              const tier = TIERS.find((t) => t.id === plan.id)!;
              return (
              <Reveal key={plan.id} as="div" delay={i * 60}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-6",
                    plan.featured
                      ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                      : "border-sand-line bg-white/60",
                  )}
                >
                  {plan.featured && (
                    <span className="mb-3 self-start rounded-full bg-accent px-2.5 py-0.5 text-meta font-semibold text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-h4 text-slate">{plan.name}</h3>
                  <p className="mt-0.5 text-meta text-slate-muted">{plan.band}</p>
                  <p className="mt-4 text-[1.5rem] font-medium tracking-tight text-slate">
                    {tier.pepm === null
                      ? "Custom"
                      : `₦${tier.pepm.toLocaleString("en-NG")}`}
                  </p>
                  {tier.pepm !== null && (
                    <p className="text-meta text-slate-muted">
                      per employee / month
                    </p>
                  )}
                  <p className="mt-4 text-meta leading-relaxed text-slate-soft">
                    {plan.tagline}
                  </p>

                  <ul className="mt-5 flex flex-col gap-2.5 border-t border-sand-line pt-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
                          <Check className="size-2.5 text-slate" strokeWidth={3} aria-hidden />
                        </span>
                        <span className="text-meta leading-snug text-slate-soft">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-7">
                    <Pill
                      href="/demo"
                      variant={plan.featured ? "solid" : "quiet"}
                      className="w-full justify-center"
                      arrow
                    >
                      {plan.cta}
                    </Pill>
                  </div>
                </div>
              </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Client logos */}
      <ClientLogos />

      {/* Feature comparison table */}
      <section className="px-4 py-16">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h2 text-slate">Compare plans</h2>
            <p className="mt-3 max-w-xl text-body-sm leading-relaxed text-slate-muted">
              Every feature, by module. Higher tiers carry everything below them.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-sand-line bg-white/70">
              <table className="w-full min-w-160 border-collapse text-meta">
                <thead>
                  <tr className="border-b border-sand-line">
                    <th className="py-4 pl-6 pr-4 text-left text-meta font-semibold text-slate-muted">
                      Feature
                    </th>
                    {planNames.map((name) => (
                      <th
                        key={name}
                        className="px-4 py-4 text-center text-meta font-semibold text-slate"
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((section, si) => (
                    <>
                      {/* Module header row */}
                      <tr key={`section-${si}`} className="border-t border-sand-line bg-sand/60">
                        <td
                          colSpan={5}
                          className="py-2.5 pl-6 pr-4 text-meta font-semibold text-slate"
                        >
                          {section.module}
                        </td>
                      </tr>
                      {/* Feature rows */}
                      {section.rows.map((row, ri) => (
                        <tr
                          key={`${si}-${ri}`}
                          className="border-t border-sand-line/60 hover:bg-sand/30 transition-colors duration-100"
                        >
                          <td className="py-3 pl-6 pr-4 text-slate-soft">{row.label}</td>
                          {row.cells.map((included, ci) => (
                            <td key={ci} className="px-4 py-3 text-center">
                              {included ? (
                                <span className="inline-flex size-5 items-center justify-center rounded-full bg-success mx-auto">
                                  <Check
                                    aria-label="Included"
                                    className="size-3 text-slate"
                                    strokeWidth={3}
                                  />
                                </span>
                              ) : (
                                <Minus
                                  aria-label="Not included"
                                  className="mx-auto size-4 text-slate-muted/40"
                                  strokeWidth={1.5}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
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
                  <h3 className="text-body-lg font-medium text-slate">
                    {a.name}
                  </h3>
                  <p className="mt-1.5 text-body-sm font-medium text-success-text">
                    {a.price}
                  </p>
                  <p className="mt-3 text-body-sm leading-relaxed text-slate-muted">
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
                  <dt className="text-body-lg font-medium text-slate">{item.q}</dt>
                  <dd className="mt-2.5 text-body-sm leading-relaxed text-slate-muted">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-28">
        <div className="container-page">
          <Reveal>
            <div className="rounded-3xl bg-night px-8 py-16 text-center">
              <h2 className="mx-auto max-w-2xl text-h1 text-white">
                Start free. We move your data. You pay from month two.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-body-lg leading-relaxed text-white/60">
                Book a demo on your own numbers. If it fits, we migrate your existing records and you run your first payroll at no cost.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Start free, book a demo
                </Pill>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
