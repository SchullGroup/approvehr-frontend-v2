import type { Metadata } from "next";
import Image from "next/image";
import { Check } from "lucide-react";
import { Pill } from "@/components/marketing/pill";
import { CountUp, Reveal } from "@/components/marketing/motion";
import { PlatformOverview } from "@/components/marketing/platform-overview";
import {
  ModuleGrid,
  SectionHeading,
} from "@/components/marketing/sections";
import {
  ClientLogos,
  Testimonials,
} from "@/components/marketing/social-proof";
import {
  PayrollMockup,
  StatutoryMockup,
} from "@/components/marketing/mockups";
import { quote } from "@/lib/marketing/pricing";
import { liveProductCta } from "@/lib/marketing/links";

/* Secondary CTAs. Both promise a running product, so both degrade to something
   that exists when the app isn't deployed alongside the site. */
const heroCta = liveProductCta("Explore the live product", {
  href: "/product/payroll",
  label: "Take the product tour",
});
const closingCta = liveProductCta("Explore the product first", {
  href: "/pricing",
  label: "See what it costs first",
});

export const metadata: Metadata = {
  title: "HR and payroll software for Nigerian companies",
  description:
    "One system for employee records, payroll, recruitment, leave and approvals. PAYE, pension and NHF calculated to current Nigerian law, with every schedule your state IRS and PFAs expect.",
};

/**
 * Three shapes of company, each tied to a setting that actually differs
 * between them. This replaced a scrolling rail of statutory bodies, which
 * read like a wall of partner logos we have no right to claim.
 */
const SHAPES = [
  {
    src: "/photos/site-team.jpg",
    alt: "A site team in hi-vis reviewing drawings together",
    title: "Sites and shifts",
    body: "Rotating crews, overtime, and a working month that is not 22 days. Unpaid leave prorates against your roster, not an office calendar.",
    setting: "Working month: configurable",
  },
  {
    src: "/photos/office.jpg",
    alt: "An employee working at a laptop in an office",
    title: "Head office",
    body: "Salaried staff on a standard structure, self-service for their own details, and approvals that route to the right manager.",
    setting: "Salary split: basic, housing, transport",
  },
  {
    src: "/photos/finance-review.jpg",
    alt: "A finance team reviewing figures on a screen in a meeting room",
    title: "Groups and multi-entity",
    body: "Several companies, staff across more than one state, and a finance lead who has to reconcile all of it before the 10th.",
    setting: "PAYE split per tax state",
  },
];

export default function HomePage() {
  const fifty = quote(50);

  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="px-4 pb-20 pt-16 sm:pt-24">
        <div className="container-page">
          <div className="text-center">
            <Reveal delay={60}>
              <h1 className="mx-auto mt-5 max-w-4xl text-mega text-slate">
                All your HR and payroll, in one system.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mx-auto mt-7 max-w-2xl text-lead text-slate-muted">
                Employee records, payroll, recruitment, leave and approvals —
                one platform, one employee record, no re-typing.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Start free — book a demo
                </Pill>
                <Pill href={heroCta.href} variant="quiet" size="lg">
                  {heroCta.label}
                </Pill>
              </div>
              <p className="mt-4 text-meta text-slate-muted">
                Your first month and data migration are on us. No card required before you have decided anything.
              </p>
            </Reveal>
          </div>

          <Reveal delay={240}>
            <div className="mt-16 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <PayrollMockup />
              <div className="flex flex-col gap-5">
                {[
                  {
                    title: "Approval before money moves",
                    body: "Every payroll is prepared, reviewed and approved by named people. The payment file only exists after approval.",
                  },
                  {
                    title: "Deductions you do not maintain",
                    body: "PAYE bands, 8% and 10% pension, NHF. We track the changes so you do not have to.",
                  },
                  {
                    title: "Schedules, not spreadsheets",
                    body: "Every remittance schedule is generated automatically, split by PFA and by state.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-3 rounded-2xl border border-sand-line bg-white/50 p-5"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success">
                      <Check
                        aria-hidden="true"
                        className="size-3 text-slate"
                        strokeWidth={3}
                      />
                    </span>
                    <div>
                      <h3 className="text-body font-medium text-slate">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-body-sm leading-relaxed text-slate-muted">
                        {item.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ Shapes of company */}
      <section className="border-y border-sand-line bg-sand-deep px-4 py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="Built for how your company runs"
              title="One payroll. Three types of company."
              lead="A site crew on rotating shifts. A head office on salary. A contractor on withholding tax. Your working month, salary structure and pensionable components are settings you control — not assumptions we make."
            />
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {SHAPES.map((shape, i) => (
              <Reveal key={shape.title} as="article" delay={i * 80}>
                <div className="group h-full overflow-hidden rounded-3xl border border-sand-line bg-sand">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={shape.src}
                      alt={shape.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="text-h4 text-slate">{shape.title}</h3>
                    <p className="mt-2.5 text-body leading-relaxed text-slate-muted">
                      {shape.body}
                    </p>
                    <p className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-meta font-medium text-slate-soft">
                      {shape.setting}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ClientLogos />

      {/* -------------------------------------------------- Platform rail */}
      <section className="px-4 py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="One platform"
              title="Six modules. One employee record."
              lead="What recruitment agrees becomes the contract. What attendance records is what payroll pays. Change a bank account once, and every module knows."
            />
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-16">
              <PlatformOverview />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- Module cards */}
      <section className="px-4 pb-24">
        <div className="container-page">
          <ModuleGrid />
        </div>
      </section>

      {/* ------------------------------------------------------- Nigeria */}
      <section className="border-y border-sand-line bg-sand-deep px-4 py-24">
        <div className="container-page grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <SectionHeading
              eyebrow="Statutory compliance"
              title="Global HR tools stop at the salary."
              lead="They store what someone earns. Then the real work starts — PAYE split by state, pension split by PFA, NHF, NSITF — and it lands back on your finance lead, a spreadsheet and a consultant on retainer. That is the part we built first."
            />
            <ul className="mt-9 flex flex-col gap-4">
              {[
                "PAYE calculated against current Finance Act bands, with reliefs applied in the right order",
                "Pension at 8% employee and 10% employer, scheduled per PFA",
                "NHF and NSITF computed and filed at the same time",
                "Multi-state employees filed to the correct state IRS",
                "Statutory changes tracked by us, not by you",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-success">
                    <Check
                      aria-hidden="true"
                      className="size-3 text-slate"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="text-body leading-relaxed text-slate-soft">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <StatutoryMockup />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------- One run, many obligations */}
      <section className="px-4 py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="What one payroll produces"
              title="Approve once. Every obligation follows."
              lead="One month for a 264-person company, staff in two states, three pension providers. Everything below comes out of a single approved payroll — computed, not re-keyed."
            />
          </Reveal>

          <dl className="mt-14 grid gap-10 sm:grid-cols-3">
            {[
              {
                value: <CountUp to={7} />,
                label:
                  "Remittance schedules — one per state IRS, one per PFA, plus NHF and NSITF. Each formatted the way that body asks for it.",
              },
              {
                value: <CountUp to={264} />,
                label:
                  "Itemised payslips, sent. Gross, every deduction, net — with employer pension shown separately, so nobody thinks their pay was cut.",
              },
              {
                value: <CountUp to={3} />,
                label:
                  "Named approvers before a payment file exists. Prepared, reviewed, released — each step timestamped.",
              },
            ].map((item, i) => (
              <Reveal key={i} as="div" delay={i * 70}>
                <dt className="text-mega text-slate">{item.value}</dt>
                <dd className="mt-3 text-body leading-relaxed text-slate-muted">
                  {item.label}
                </dd>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={220}>
            <p className="mt-10 max-w-2xl text-meta leading-relaxed text-slate-muted">
              Figures describe the worked example above, not a customer average.
              We are pre-launch and will not quote results we have not earned.
            </p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- Pricing */}
      <section className="px-4 pb-24">
        <div className="container-page">
          <Reveal>
            <div className="grid gap-10 rounded-3xl bg-night p-10 lg:grid-cols-2 lg:items-center lg:p-14">
              <div>
                <p className="mb-3 text-meta font-semibold uppercase tracking-[0.1em] text-white/40">
                  Pricing
                </p>
                <h2 className="text-h1 text-white">
                  Start free. Pay from month two.
                </h2>
                <p className="mt-5 max-w-md text-body leading-relaxed text-white/60">
                  Your first month on us. We migrate your existing employee records and payroll history at no cost. Pricing after that is per employee, per month — the rate falls as your team grows.
                </p>
                <Pill href="/demo" variant="solid" arrow className="mt-8">
                  Get started free
                </Pill>
              </div>

              <div className="rounded-2xl border border-night-line p-7">
                <p className="text-meta text-white/50">
                  A 50-person company on Growth
                </p>
                <p className="mt-3 text-[2.75rem] font-medium leading-none tracking-tight text-white">
                  ₦{fifty.monthly!.toLocaleString("en-NG")}
                </p>
                <p className="mt-2 text-meta text-white/50">
                  per month · ₦{fifty.tier.pepm!.toLocaleString("en-NG")} per
                  employee
                </p>
                <div className="mt-6 border-t border-night-line pt-5">
                  <p className="text-meta text-white/60">
                    Paid annually you save{" "}
                    <span className="font-medium text-success">
                      ₦{fifty.annualSaving!.toLocaleString("en-NG")}
                    </span>{" "}
                    a year — two months free.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Testimonials />

      {/* ------------------------------------------------------------- CTA */}
      <section className="px-4 pb-28">
        <div className="container-page">
          <Reveal>
            <div className="rounded-3xl border border-sand-line bg-white/60 px-8 py-16 text-center">
              <h2 className="mx-auto max-w-3xl text-h1 text-slate">
                Start free. We move your data. You pay from month two.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lead text-slate-muted">
                Book a thirty-minute demo on your own numbers. If it fits, we migrate your records and run your first payroll at no cost.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Start free — book a demo
                </Pill>
                <Pill href={closingCta.href} variant="quiet" size="lg">
                  {closingCta.label}
                </Pill>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
