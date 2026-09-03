import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import {
  CHIP_CLASS,
  MODULES,
  WASH_CLASS,
  type ModuleId,
} from "@/lib/marketing/modules";
import {
  DeskMockup,
  LeaveMockup,
  PayrollMockup,
  PipelineMockup,
  RecordMockup,
  ReviewMockup,
} from "@/components/marketing/mockups";
import { CAPABILITY_MOCKUPS } from "@/components/marketing/module-mockups";
import { liveProductCta } from "@/lib/marketing/links";

/* A module page has already shown the walkthrough, so the honest fallback when
   there's no live app to enter is the price, not another tour. */
const cta = liveProductCta("See it live", {
  href: "/pricing",
  label: "See what it costs",
});

const HERO: Record<
  ModuleId,
  (p: { className?: string }) => React.ReactElement
> = {
  payroll: PayrollMockup,
  hiring: PipelineMockup,
  "core-hr": RecordMockup,
  time: LeaveMockup,
  performance: ReviewMockup,
  desk: DeskMockup,
};

export function generateStaticParams() {
  return MODULES.map((m) => ({ module: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const { module: id } = await params;
  const mod = MODULES.find((m) => m.id === id);
  if (!mod) return { title: "Product" };
  return { title: mod.label, description: mod.blurb };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: id } = await params;
  const mod = MODULES.find((m) => m.id === id);
  if (!mod) notFound();

  const Mockup = HERO[mod.id];
  const others = MODULES.filter((m) => m.id !== mod.id);

  return (
    <>
      {/* Hero */}
      <section
        className={cn("px-4 pb-20 pt-16 sm:pt-20", WASH_CLASS[mod.wash])}
      >
        <div className="container-page">
          <Reveal>
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex items-center gap-2 text-[0.8125rem] text-slate-muted">
                <li>
                  <Link href="/" className="hover:text-slate">
                    Product
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-slate">{mod.label}</li>
              </ol>
            </nav>

            <div className="text-center">
              <span
                className={cn(
                  "inline-flex items-center rounded-lg px-2.5 py-1 text-[0.75rem] font-medium",
                  CHIP_CLASS[mod.wash],
                )}
              >
                {mod.label}
              </span>

              <h1 className="mx-auto mt-5 max-w-3xl text-h1 text-slate">
                {mod.headline}
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lead text-slate-soft">
                {mod.blurb}
              </p>

              {mod.statutory && (
                <p className="mt-6 inline-flex rounded-full bg-white/70 px-4 py-2 text-[0.8125rem] font-medium text-slate">
                  {mod.statutory}
                </p>
              )}

              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Pill href="/demo" variant="solid" size="lg" arrow>
                  Book a demo
                </Pill>
                <Pill href={cta.href} variant="quiet" size="lg">
                  {cta.label}
                </Pill>
              </div>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="mx-auto mt-14 max-w-3xl">
              <Mockup />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Capabilities — alternating walkthrough, one illustration each */}
      <section className="px-4 py-24">
        <div className="container-page">
          <Reveal>
            <h2 className="max-w-2xl text-h2 text-slate">
              What {mod.label.toLowerCase()} actually does
            </h2>
          </Reveal>

          <div className="mt-16 flex flex-col gap-20 lg:gap-24">
            {mod.capabilities.map((cap, i) => {
              const Art = CAPABILITY_MOCKUPS[mod.id]?.[i];
              const flipped = i % 2 === 1;

              return (
                <Reveal key={cap.title} as="article">
                  <div
                    className={cn(
                      "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                    )}
                  >
                    <div className={cn(flipped && "lg:order-2")}>
                      <span className="text-[0.875rem] font-medium tabular-nums text-slate-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 className="mt-2 text-h3 text-slate">{cap.title}</h3>
                      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-slate-muted">
                        {cap.detail}
                      </p>
                    </div>

                    {Art && (
                      <div
                        className={cn(
                          "rounded-3xl p-6 sm:p-8",
                          WASH_CLASS[mod.wash],
                          flipped && "lg:order-1",
                        )}
                      >
                        <Art />
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Other modules */}
      <section className="border-t border-sand-line bg-sand-deep px-4 py-20">
        <div className="container-page">
          <Reveal>
            <h2 className="text-h3 text-slate">The rest of the platform</h2>
          </Reveal>

          <ul className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((other, i) => (
              <Reveal key={other.id} as="li" delay={i * 50}>
                <Link
                  href={`/product/${other.id}`}
                  className="group flex h-full items-start gap-3 rounded-2xl border border-sand-line bg-sand p-5 transition-all duration-300 ease-out-soft hover:-translate-y-0.5 hover:bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[1.0625rem] font-medium text-slate">
                      {other.label}
                    </h3>
                    <p className="mt-1.5 text-[0.875rem] leading-snug text-slate-muted">
                      {other.headline}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-slate-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate"
                  />
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
