"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ANNUAL_MONTHS_CHARGED,
  TIERS,
  cumulativeIncludes,
  quote,
} from "@/lib/marketing/pricing";
import { Pill, PillButton } from "@/components/marketing/pill";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * Headcount in, price out. The slider is the primary control because the
 * question a buyer actually has is "what does this cost *me*", not "what are
 * your tiers" — so the tier is a result of the number, never something they
 * have to work out first.
 */
export function PricingCalculator() {
  const [headcount, setHeadcount] = useState(50);
  const [annual, setAnnual] = useState(true);

  const q = quote(headcount);
  const enterprise = q.tier.pepm === null;

  const payable = annual ? q.annual : q.monthly;

  return (
    <div className="grid gap-8 rounded-3xl border border-sand-line bg-white/70 p-7 lg:grid-cols-[1fr_360px] lg:p-10">
      {/* Controls */}
      <div>
        <label
          htmlFor="headcount"
          className="block text-[0.9375rem] font-medium text-slate"
        >
          How many people do you pay?
        </label>

        <div className="mt-5 flex items-center gap-3">
          <PillButton
            variant="quiet"
            aria-label="Decrease headcount by 10"
            onClick={() => setHeadcount((h) => Math.max(1, h - 10))}
            className="size-10 shrink-0 p-0"
          >
            <Minus aria-hidden="true" className="size-4" />
          </PillButton>

          <input
            id="headcount"
            type="number"
            min={1}
            max={5000}
            value={headcount}
            onChange={(e) =>
              setHeadcount(
                Math.min(5000, Math.max(1, Number(e.currentTarget.value) || 1)),
              )
            }
            className="h-12 w-28 rounded-xl border border-sand-line bg-white px-4 text-center text-[1.25rem] font-medium tabular-nums text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
          />

          <PillButton
            variant="quiet"
            aria-label="Increase headcount by 10"
            onClick={() => setHeadcount((h) => Math.min(5000, h + 10))}
            className="size-10 shrink-0 p-0"
          >
            <Plus aria-hidden="true" className="size-4" />
          </PillButton>

          <span className="text-[0.875rem] text-slate-muted">employees</span>
        </div>

        <input
          type="range"
          min={1}
          max={1000}
          step={1}
          value={Math.min(headcount, 1000)}
          onChange={(e) => setHeadcount(Number(e.currentTarget.value))}
          aria-label="Headcount"
          className="mt-6 w-full accent-(--color-accent)"
        />

        {/* Tier ladder — shows where the number lands and what is next. */}
        <ol className="mt-8 flex flex-col gap-1.5">
          {TIERS.map((t) => {
            const on = t.id === q.tier.id;
            return (
              <li key={t.id}>
                <button
                  onClick={() => setHeadcount(t.min)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-200",
                    on ? "bg-slate text-white" : "hover:bg-sand",
                  )}
                >
                  <span
                    className={cn(
                      "text-[0.9375rem] font-medium",
                      on ? "text-white" : "text-slate",
                    )}
                  >
                    {t.name}
                  </span>
                  <span
                    className={cn(
                      "text-[0.8125rem] tabular-nums",
                      on ? "text-white/60" : "text-slate-muted",
                    )}
                  >
                    {t.max === null ? `${t.min}+` : `${t.min}–${t.max}`} staff
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-[0.8125rem] tabular-nums",
                      on ? "text-white" : "text-slate-muted",
                    )}
                  >
                    {t.pepm === null ? "Custom" : `${naira(t.pepm)} / employee`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Quote */}
      <div className="flex flex-col rounded-2xl bg-night p-7">
        <div className="flex items-center gap-1 self-start rounded-full bg-white/8 p-1">
          {[
            ["Monthly", false],
            ["Annual", true],
          ].map(([label, value]) => (
            <button
              key={String(label)}
              onClick={() => setAnnual(value as boolean)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[0.75rem] font-medium transition-colors",
                annual === value
                  ? "bg-success text-slate"
                  : "text-white/60 hover:text-white",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>

        <p className="mt-6 text-[0.8125rem] text-white/50">
          {q.tier.name} · {headcount.toLocaleString("en-NG")} employees
        </p>

        {enterprise ? (
          <>
            <p className="mt-3 text-[2.25rem] font-medium leading-none tracking-tight text-white">
              Let&apos;s talk
            </p>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-white/60">
              Above 500 staff the price depends on entities, integrations and
              the support level you need. We will quote in one call.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-[2.5rem] font-medium leading-none tracking-tight text-white tabular-nums">
              {naira(payable!)}
            </p>
            <p className="mt-2 text-[0.8125rem] text-white/50">
              {annual
                ? `per year — ${ANNUAL_MONTHS_CHARGED} months charged`
                : "per month"}
            </p>

            <dl className="mt-6 flex flex-col gap-2.5 border-t border-night-line pt-5 text-[0.8125rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">Rate per employee</dt>
                <dd className="tabular-nums text-white">
                  {naira(q.effectivePepm!)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">Billed</dt>
                <dd className="text-white">
                  {annual ? "Once a year" : "Every month"}
                </dd>
              </div>
              {annual && (
                <div className="flex justify-between gap-3">
                  <dt className="text-white/50">You save</dt>
                  <dd className="tabular-nums font-medium text-success">
                    {naira(q.annualSaving!)}
                  </dd>
                </div>
              )}
            </dl>

            {q.flooredUp && (
              <p className="mt-4 rounded-xl bg-white/6 p-3 text-[0.75rem] leading-relaxed text-white/60">
                Small teams are charged a {naira(q.tier.monthlyFloor)} monthly
                minimum, so this works out above the per-employee rate.
              </p>
            )}
          </>
        )}

        <div className="mt-auto pt-7">
          <Pill
            href="/demo"
            variant="solid"
            arrow
            className="w-full justify-center"
          >
            {enterprise ? "Request a quote" : "Book a demo"}
          </Pill>
        </div>
      </div>

      {/* What is included */}
      <div className="lg:col-span-2">
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-widest text-slate-muted">
          Included on {q.tier.name}
        </h3>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cumulativeIncludes(q.tier.id).map((line) => (
            <li key={line} className="flex gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
                <Check
                  aria-hidden="true"
                  className="size-2.5 text-slate"
                  strokeWidth={3}
                />
              </span>
              <span className="text-[0.875rem] leading-snug text-slate-soft">
                {line}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
