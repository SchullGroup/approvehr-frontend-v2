import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { DemoForm } from "./form";

export const metadata: Metadata = {
  title: "Book a demo",
  description:
    "Thirty minutes on your own numbers. We will run a payroll cycle end to end and tell you honestly whether it fits.",
};

export default function DemoPage() {
  return (
    <section className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <Reveal>
          <div>
            <h1 className="text-h1 text-slate">
              Thirty minutes, your numbers, no slides.
            </h1>
            <p className="mt-6 text-lead text-slate-muted">
              Send us your headcount and how you run payroll today. We will set
              the demo up against a company shaped like yours and run a cycle
              end to end.
            </p>

            <ul className="mt-10 flex flex-col gap-5">
              {[
                {
                  title: "You will see a full payroll run",
                  body: "Prepared, PAYE and pension calculated, sent for approval, schedules generated. Not a slide of one.",
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
                    <h2 className="text-[0.9375rem] font-medium text-slate">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-slate-muted">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-10 border-t border-sand-line pt-6 text-[0.8125rem] leading-relaxed text-slate-muted">
              We use what you send here to prepare the call and nothing else.
              Your details are not sold, shared or added to a marketing list
              without you asking.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <DemoForm />
        </Reveal>
      </div>
    </section>
  );
}
