import type { Metadata } from "next";
import Image from "next/image";
import { Check, Layers, Radar, ShieldCheck, Sparkles } from "lucide-react";
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
import { liveProductCta, newTabIfApp } from "@/lib/marketing/links";

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
  title: "HR payroll intelligence for Nigerian companies",
  description:
    "Your HR intelligence partner: employee records, payroll, recruitment, leave and approvals in one system that checks its own arithmetic, tracks Nigerian statutory law automatically, and drafts the busywork so your team reviews instead of starting from nothing.",
};

/**
 * The "HR intelligence" pillars. Each one is a real, shipped capability, not
 * a roadmap promise — see the closing line under the grid. Keep it that way:
 * if a pillar stops being true of the product, cut it rather than soften the
 * wording around it.
 */
const INTELLIGENCE = [
  {
    icon: ShieldCheck,
    title: "Statutory law, tracked automatically",
    body: "PAYE bands, pension rates, reliefs and NHF update the moment Nigerian law changes. Nobody on your team maintains a rate table.",
  },
  {
    icon: Radar,
    title: "Accurate information assured",
    body: "Every payroll is checked against its own arithmetic before you ever see it. If a number could not be true (net pay above gross, tax above the top band), the run refuses itself and says exactly why.",
  },
  {
    icon: Sparkles,
    title: "Start with our templates",
    body: "Draft objectives from a company goal, a first pass at a progress note, development areas grounded in real scores. Every draft is reviewed by a person before it means anything.",
  },
  {
    icon: Layers,
    title: "As simple as your company needs",
    body: "A five-person business sees six menu items. A five-hundred-person group sees the governance it actually needs. The system reveals itself as you grow into it, not all at once.",
  },
];

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
    body: "Rotating crews, overtime, and a working month that is adjustable. Unpaid leave prorates against your roster, not an office calendar.",
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
  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="px-4 pb-20 pt-16 sm:pt-24">
        <div className="container-page">
          <div className="text-center">
            <Reveal>
              <p className="text-meta font-semibold text-accent">
                Your HR intelligence partner
              </p>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mx-auto mt-5 max-w-4xl text-mega text-slate">
                A smarter way to manage staff.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mx-auto mt-7 max-w-2xl text-lead text-slate-muted">
                Employee records, payroll, recruitment, leave and approvals,
                managed in one platform.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Start free, book a demo
                </Pill>
                <Pill
                  href={heroCta.href}
                  variant="quiet"
                  size="lg"
                  {...newTabIfApp(heroCta.href)}
                >
                  {heroCta.label}
                </Pill>
              </div>
              <p className="mt-4 text-meta text-slate-muted">
                Your first month and data migration are on us. No card required before you have decided anything.
              </p>
            </Reveal>
          </div>

          <Reveal delay={240}>
            <div className="mt-16">
              <PayrollMockup className="mx-auto max-w-2xl" />
            </div>
          </Reveal>
        </div>
      </section>

      <ClientLogos />

      {/* ------------------------------------------------------ Intelligence */}
      <section className="px-4 py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="HR intelligence"
              title="Your HR intelligence partner, not just another system of record."
              lead="Most HR software stores what happened. Ours checks it, flags what needs a second look, and gets a head start on the parts that used to take all day."
            />
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {INTELLIGENCE.map((item, i) => (
              <Reveal key={item.title} as="article" delay={i * 70}>
                <div className="flex h-full flex-col gap-3 rounded-3xl border border-sand-line bg-white/60 p-7">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
                    <item.icon
                      aria-hidden="true"
                      className="size-5 text-accent"
                      strokeWidth={2}
                    />
                  </span>
                  <h3 className="text-h4 text-slate">{item.title}</h3>
                  <p className="text-body leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Shapes of company */}
      <section className="border-y border-sand-line bg-sand-deep px-4 py-24">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="Built for how your company runs"
              title="One payroll. Three company structures."
              lead="A site crew on rotating shifts. A head office on salary. A contractor on withholding tax. Your working month, salary structure and pensionable components are easy settings you can control."
            />
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {SHAPES.map((shape, i) => (
              <Reveal key={shape.title} as="article" delay={i * 80}>
                <div className="group h-full overflow-hidden rounded-3xl border border-sand-line bg-sand">
                  <div className="relative aspect-4/3 overflow-hidden">
                    <Image
                      src={shape.src}
                      alt={shape.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="text-h4 text-slate">{shape.title}</h3>
                    <p className="mt-2.5 text-body leading-relaxed">
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
              title="Most global HR tools stop at salary."
              lead="They store what someone earns. Then the real work starts, PAYE split by state, pension split by PFA, NHF, NSITF, and it lands back on your finance lead, a spreadsheet and a consultant on retainer. That is the part we built first."
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
                  <span className="text-body leading-relaxed">
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
              lead="One month for a 264-person company, staff in two states, three pension providers. Everything below comes out of a single approved payroll, computed, not re-keyed."
            />
          </Reveal>

          <dl className="mt-14 grid gap-10 sm:grid-cols-3">
            {[
              {
                value: <CountUp to={7} />,
                label:
                  "Remittance schedules, one per state IRS, one per PFA, plus NHF and NSITF. Each formatted the way that body asks for it.",
              },
              {
                value: <CountUp to={264} />,
                label:
                  "Itemised payslips, sent. Gross, every deduction, net, with employer pension shown separately, so nobody thinks their pay was cut.",
              },
              {
                value: <CountUp to={3} />,
                label:
                  "A named office approves before a payment file exists. Prepared, reviewed, released, each step timestamped.",
              },
            ].map((item, i) => (
              <Reveal key={i} as="div" delay={i * 70}>
                <dt className="text-mega text-slate">{item.value}</dt>
                <dd className="mt-3 text-body leading-relaxed">
                  {item.label}
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------------- Pricing */}
      <section className="px-4 pb-24">
        <div className="container-page">
          <Reveal>
            <div className="rounded-3xl bg-night px-8 py-16 text-center lg:px-14">
              <p className="mb-3 text-meta font-semibold text-white/40">
                Pricing
              </p>
              <h2 className="mx-auto max-w-2xl text-h1 text-white">
                Start free. Pay from month two.
              </h2>
              <p className="mx-auto mt-5 max-w-md leading-relaxed text-white/60">
                Your first month on us. We migrate your existing employee records and payroll history at no cost. Pricing after that is per employee, per month, the rate falls as your team grows.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Pill href="/demo" variant="solid" arrow>
                  Get started free
                </Pill>
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
                  Start free, book a demo
                </Pill>
                <Pill
                  href={closingCta.href}
                  variant="quiet"
                  size="lg"
                  {...newTabIfApp(closingCta.href)}
                >
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
