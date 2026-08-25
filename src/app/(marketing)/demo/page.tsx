import type { Metadata } from "next";
import { Check } from "lucide-react";
import Image from "next/image";
import { Reveal } from "@/components/marketing/motion";
import { DemoForm } from "./form";

const LOGOS = [
  { src: "/clients/nnpc.png", alt: "NNPC", w: 414, h: 120 },
  { src: "/clients/fmm.png", alt: "Federal Ministry", w: 225, h: 120 },
  { src: "/clients/crffn.png", alt: "CRFFN", w: 209, h: 120 },
  { src: "/clients/usce.png", alt: "USCE", w: 213, h: 120 },
  { src: "/clients/schull.png", alt: "Schulltech", w: 430, h: 96 },
  { src: "/clients/beat.png", alt: "Beate Synergy", w: 252, h: 96 },
  { src: "/clients/voz.png", alt: "Vomoz", w: 243, h: 120 },
  { src: "/clients/schullio.png", alt: "schull.io", w: 570, h: 120 },
];

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "See the value of ApproveHR in ten minutes. No setup, no slides — just a focused look at what it can do for your organisation.",
};

export default function DemoPage() {
  return (
    <section className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <Reveal>
          <div>
            <h1 className="text-h1 text-slate">
              Let us show you how to transform your organisation.
            </h1>
            <p className="mt-6 text-lead text-slate-muted">
              In ten minutes you will see exactly what ApproveHR can do for
              your team — no setup, no slides, just the value.
            </p>

            <ul className="mt-10 flex flex-col gap-5">
              {[
                {
                  title: "You will see payroll done end to end",
                  body: "PAYE and pension calculated, sent for approval, schedules generated — the whole thing, not a slide of it.",
                },
                {
                  title: "We will tell you if it does not fit",
                  body: "If your setup needs something we do not do yet, you will hear it in the call rather than in month three.",
                },
                {
                  title: "Nothing is installed",
                  body: "No trial account to cancel, no card, no procurement step before you have decided anything.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success">
                    <Check
                      aria-hidden="true"
                      className="size-3 text-slate"
                      strokeWidth={3}
                    />
                  </span>
                  <div>
                    <h2 className="text-body font-medium">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-body-sm leading-relaxed text-slate-muted">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 border-t border-sand-line pt-8">
              <p className="text-meta font-semibold uppercase tracking-widest text-slate-muted">
                Trusted by Nigerian teams in energy, government and technology
              </p>
              <div className="mt-5 grid grid-cols-4 gap-x-6 gap-y-4">
                {LOGOS.map((logo) => (
                  <Image
                    key={logo.src}
                    src={logo.src}
                    alt={logo.alt}
                    width={logo.w}
                    height={logo.h}
                    className="h-7 w-auto object-contain opacity-50"
                  />
                ))}
              </div>
            </div>

            <figure className="mt-7 rounded-2xl border border-sand-line bg-white/70 p-6">
              <blockquote className="text-body leading-relaxed text-slate">
                &ldquo;Compliance and scale were what kept me up. Payroll and
                tax now run themselves, and I finally get numbers I can make
                decisions on instead of numbers I have to check.&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-sand-line pt-4">
                <Image
                  src="/avatars/ko.png"
                  alt=""
                  width={44}
                  height={44}
                  className="size-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-slate">
                    Ayo Oseni
                  </p>
                  <p className="text-meta text-slate-muted">
                    Founder, USCExperts
                  </p>
                </div>
              </figcaption>
            </figure>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <DemoForm />
        </Reveal>
      </div>
    </section>
  );
}
