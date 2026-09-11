"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/use-debounced";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
import { Pill } from "@/components/marketing/pill";
import {
  calculatePaye,
  configured,
  type CalculatorResult,
} from "@/lib/marketing/tax-calculator";

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

const nairaExact = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Gross salary in, a real payslip out — computed by the same engine that runs
 * actual payroll on this platform, over the network, never re-derived here.
 * See `lib/marketing/tax-calculator.ts` for why that is not negotiable.
 *
 * ## What this shows that a calculator normally does not
 *
 * Every other Nigerian PAYE calculator returns one number. This one is backed
 * by the engine that produces real payslips, and the engine already computes
 * far more than a single figure — so the design shows the working rather than
 * the answer alone. Four things were being thrown away before:
 *
 * - **What it costs the employer.** Employer pension sits *on top* of gross
 *   (10%, Pension Reform Act 2014), so a ₦500,000 salary costs a company
 *   ₦550,000. An HR manager pricing a role is asking that question, not the
 *   employee's one, and nothing else on the public internet answers it.
 * - **The basic/housing/transport split**, which is the only thing that
 *   explains why NHF comes to ₦7,500 rather than ₦12,500: it is charged on
 *   basic salary alone, not on gross.
 * - **The band ladder.** The bands are the whole of how PAYE works and they
 *   were rendered as small grey rows behind a disclosure. They are the
 *   argument this product makes about itself, so they are drawn.
 * - **What declaring rent is worth**, in naira, for this salary. The Nigeria
 *   Tax Act 2025 abolished the Consolidated Relief Allowance and replaced it
 *   with relief on rent, so somebody who has not declared gets nothing — a
 *   real cost, and the single most confusing part of the reform. It was a
 *   sentence of helper text under an optional field.
 *
 * ## Staleness
 *
 * The request is debounced, but the debounced *value* is not what decides
 * whether the answer on screen is current — the **live** input is, compared
 * against the key the in-flight answer was requested for. Without that
 * check, the figure between a keystroke and the timer firing is last
 * keystroke's answer sitting beside an input that has already moved, which on
 * a salary figure is a wrong number wearing a right number's label.
 * `lib/use-debounced.ts`'s own header names this trap; this is the two-line
 * fix it asks the caller for.
 */
export function TaxCalculator() {
  const [grossInput, setGrossInput] = useState("500000");
  const [annual, setAnnual] = useState(false);
  const [pensionElected, setPensionElected] = useState(true);
  const [nhfElected, setNhfElected] = useState(true);
  const [rentInput, setRentInput] = useState("");
  const [state, setState] = useState("Lagos");
  const [showWorking, setShowWorking] = useState(false);

  const grossMonthlyKobo = useMemo(() => {
    const parsed = Number(grossInput.replace(/[^\d.]/g, "")) || 0;
    const monthly = annual ? parsed / 12 : parsed;
    return Math.max(0, Math.round(monthly * 100));
  }, [grossInput, annual]);

  const annualRentKobo = useMemo(() => {
    const parsed = Number(rentInput.replace(/[^\d.]/g, "")) || 0;
    return parsed > 0 ? Math.round(parsed * 100) : undefined;
  }, [rentInput]);

  const liveKey = JSON.stringify({
    grossMonthlyKobo,
    annualRentKobo,
    pensionElected,
    nhfElected,
  });
  const debouncedKey = useDebounced(liveKey, 350);

  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* No fetch for an empty or zero gross — the render below checks
       `grossMonthlyKobo` ahead of `result`/`error`, so whatever is left over
       in either from a previous figure is never shown while this is true. */
    if (grossMonthlyKobo <= 0) return;
    /* Only fires once the debounced key has caught up to what is currently
       typed — see the header note above. */
    if (debouncedKey !== liveKey) return;

    let cancelled = false;
    void calculatePaye({
      grossMonthlyKobo,
      annualRentKobo,
      pensionElected,
      nhfElected,
    }).then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        setResult(outcome.value);
        setResultKey(debouncedKey);
        setError(null);
      } else {
        setError(outcome.message);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on debouncedKey deliberately, not the raw inputs
  }, [debouncedKey]);

  /* `null` whenever the live input has moved past what this answer was
     requested for — the staleness guard `use-debounced.ts` asks callers to
     write themselves. */
  const current = resultKey === liveKey ? result : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-sand-line bg-white/70">
      {/* Controls first in the DOM, and second on screen above `lg`.
          ---------------------------------------------------------------
          A person on a phone has come for a figure, so the figure goes at
          the top there — `order-first` on the result below. On a wide
          screen the eye starts left, so the controls take that column and
          the result takes the larger one. This is the reverse of the
          original split, which gave the inputs the wide track and squeezed
          the answer into a fixed 400px rail. */}
      <div className="grid lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="min-w-0 border-sand-line p-6 sm:p-8 lg:border-r">
          <label htmlFor="gross" className="block font-medium text-slate">
            Gross salary
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body-sm text-slate-muted">
                ₦
              </span>
              <input
                id="gross"
                type="text"
                inputMode="numeric"
                value={grossInput}
                onChange={(e) => setGrossInput(e.currentTarget.value)}
                placeholder="500,000"
                className="h-12 w-full min-w-0 rounded-xl border border-sand-line bg-white pl-8 pr-4 text-[1.25rem] font-medium tabular-nums text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-sand p-1">
              {(["Monthly", "Annual"] as const).map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAnnual(i === 1)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-meta font-medium transition-colors",
                    annual === (i === 1)
                      ? "bg-white text-slate shadow-sm"
                      : "text-slate-muted hover:text-slate",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <label className="flex items-center gap-2.5 rounded-xl border border-sand-line bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={pensionElected}
                onChange={(e) => setPensionElected(e.currentTarget.checked)}
                className="size-4 accent-(--color-accent)"
              />
              <span className="text-body-sm text-slate">
                Pension deducted (8%)
              </span>
            </label>
            <label className="flex items-center gap-2.5 rounded-xl border border-sand-line bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={nhfElected}
                onChange={(e) => setNhfElected(e.currentTarget.checked)}
                className="size-4 accent-(--color-accent)"
              />
              <span className="text-body-sm text-slate">
                NHF deducted (2.5%)
              </span>
            </label>
          </div>

          <div className="mt-6">
            <label
              htmlFor="rent"
              className="block text-body-sm font-medium text-slate"
            >
              Annual rent paid{" "}
              <span className="font-normal text-slate-muted">(optional)</span>
            </label>
            <div className="relative mt-2 min-w-0">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body-sm text-slate-muted">
                ₦
              </span>
              <input
                id="rent"
                type="text"
                inputMode="numeric"
                value={rentInput}
                onChange={(e) => setRentInput(e.currentTarget.value)}
                placeholder="0"
                className="h-11 w-full min-w-0 rounded-xl border border-sand-line bg-white pl-8 pr-4 text-body-sm tabular-nums text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              />
            </div>
            <p className="mt-2 text-meta leading-relaxed text-slate-muted">
              20% of the rent you pay, capped at ₦500,000 a year.
            </p>
          </div>

          <div className="mt-6">
            <label
              htmlFor="state"
              className="block text-body-sm font-medium text-slate"
            >
              Where you file
            </label>
            <div className="relative mt-2">
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.currentTarget.value)}
                className="h-11 w-full min-w-0 appearance-none rounded-xl border border-sand-line bg-white px-4 pr-10 text-body-sm text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              >
                {NIGERIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s === "FCT" ? "FCT (Abuja)" : s}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-muted"
              />
            </div>
            <p className="mt-2 text-meta leading-relaxed text-slate-muted">
              You remit to the {state === "FCT" ? "FCT" : state} Internal
              Revenue Service. The bands are national and identical in every
              state, so this does not change a figure below.
            </p>
          </div>
        </div>

        {/* The answer. */}
        <div className="order-first min-w-0 bg-night p-6 sm:p-8 lg:order-none lg:p-10">
          {!configured ? (
            <Message>
              This preview build is not connected to ApproveHR&apos;s system, so
              the calculator cannot run here.
            </Message>
          ) : grossMonthlyKobo <= 0 ? (
            <Message>Enter a salary to see the breakdown.</Message>
          ) : error ? (
            <Message>{error}</Message>
          ) : !current ? (
            <Message>Working it out…</Message>
          ) : (
            <Result
              result={current}
              showWorking={showWorking}
              onToggleWorking={() => setShowWorking((v) => !v)}
              onDeclareRent={() => {
                setRentInput("1800000");
                document.getElementById("rent")?.focus();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-56 flex-col justify-center">
      <p className="text-body-sm leading-relaxed text-white/60">{children}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One band of the annual ladder, drawn to width.
 *
 * The bar is the feature. PAYE is progressive and almost nobody believes their
 * whole salary is taxed at the top rate they can name — the ladder is the one
 * picture that settles it, and the engine already returns every slice with the
 * tax it produced. Widths are a share of what was actually taxed, so the 0%
 * band's ₦800,000 is visibly the largest slice on an ordinary Nigerian salary,
 * which is the most surprising true thing on the page.
 */
const BAND_TINT = [
  /* The exempt slice, deliberately unlike the rest: it is the only band that
     takes nothing, and a reader should be able to see that without reading a
     number. The taxed bands then climb hard enough to be told apart at a
     glance on a near-black ground — the first version stepped 12/24/36% white
     and rendered as one flat grey line, which loses the whole point of
     drawing it. */
  "bg-white/15",
  "bg-white/45",
  "bg-white/60",
  "bg-white/72",
  "bg-white/84",
  "bg-white/95",
];

function Result({
  result,
  showWorking,
  onToggleWorking,
  onDeclareRent,
}: {
  result: CalculatorResult;
  showWorking: boolean;
  onToggleWorking: () => void;
  onDeclareRent: () => void;
}) {
  const slip = result.slip;
  const bands = slip.workings.paye.bands;

  /* Every figure below is the engine's, or arithmetic over the engine's own
     numbers that adds no tax knowledge: a ratio, a sum, a multiplication by
     twelve. Nothing here re-derives a deduction — that is the rule this whole
     file exists to keep. */
  const taxedTotal = bands.reduce((sum, b) => sum + b.taxedKobo, 0);
  const effectiveRate =
    slip.grossKobo > 0 ? (slip.payeKobo / slip.grossKobo) * 100 : 0;
  const employerCostKobo = slip.grossKobo + slip.pensionEmployerKobo;
  const deductionsKobo = slip.grossKobo - slip.netKobo;
  /* The band this salary actually reaches, so the relief figure below is
     worth what it is worth to *this* reader rather than to somebody on the
     top rate. `rate` is a fraction; `naira` takes kobo, and the cap is
     N500,000 of relief, hence 50_000_000 kobo. */
  const topRate = bands.at(-1)?.rate ?? 0;

  return (
    <div className="flex h-full flex-col">
      <p className="text-meta text-white/50">Take-home pay, per month</p>
      <p className="mt-2 text-[clamp(2.5rem,6vw,3.5rem)] font-medium leading-none tracking-tight tabular-nums text-white">
        {naira(slip.netKobo)}
      </p>
      <p className="mt-3 text-body-sm text-white/60">
        {naira(slip.netKobo * 12)} a year, after {naira(deductionsKobo)} a month
        in deductions.
      </p>

      {/* The three figures a salary conversation actually turns on, and two of
          them are answers no other calculator gives. */}
      <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-night-line sm:grid-cols-3">
        <Figure
          label="Effective tax rate"
          value={`${effectiveRate.toFixed(1)}%`}
        >
          of gross, not the {Math.round(topRate * 100)}% top band
        </Figure>
        <Figure label="Costs your employer" value={naira(employerCostKobo)}>
          gross plus {naira(slip.pensionEmployerKobo)} employer pension
        </Figure>
        <Figure
          label="You keep"
          value={`${((slip.netKobo / slip.grossKobo) * 100).toFixed(0)}%`}
        >
          of every naira earned
        </Figure>
      </dl>

      {/* Rent relief, as a figure rather than a footnote. */}
      {slip.reliefUnclaimed ? (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/6 p-4">
          <p className="text-body-sm font-medium text-white">
            No rent declared, so no relief is applied.
          </p>
          <p className="mt-1.5 text-meta leading-relaxed text-white/60">
            The Nigeria Tax Act 2025 replaced the old automatic allowance with
            relief on the rent you actually pay: 20% of it, up to ₦500,000 a
            year off your taxable income. At your top band of{" "}
            {Math.round(topRate * 100)}% that is worth up to{" "}
            <span className="text-white">{naira(50_000_000 * topRate)}</span> a
            year.{" "}
            <button
              type="button"
              onClick={onDeclareRent}
              className="text-white underline underline-offset-4 hover:no-underline"
            >
              Try it with ₦1.8m rent
            </button>
          </p>
        </div>
      ) : slip.consolidatedReliefMonthlyKobo > 0 ? (
        <div className="mt-5 rounded-xl border border-success/30 bg-success/10 p-4">
          <p className="text-body-sm font-medium text-white">
            Rent relief applied: {naira(slip.consolidatedReliefMonthlyKobo)} a
            month
          </p>
          <p className="mt-1.5 text-meta leading-relaxed text-white/60">
            {naira(slip.consolidatedReliefMonthlyKobo * 12)} a year off your
            taxable income, under the Nigeria Tax Act 2025.
          </p>
        </div>
      ) : null}

      {/* The ladder. */}
      {bands.length > 0 && taxedTotal > 0 && (
        <div className="mt-7">
          <p className="text-meta text-white/50">
            How your {naira(taxedTotal)} of taxable income is taxed
          </p>
          <div
            className="mt-2.5 flex h-4 w-full gap-1 overflow-hidden"
            role="img"
            aria-label={bands
              .map(
                (b) =>
                  `${naira(b.taxedKobo)} at ${Math.round(b.rate * 100)} per cent`,
              )
              .join("; ")}
          >
            {bands.map((band, i) => (
              <span
                key={i}
                className={cn("rounded-sm", BAND_TINT[i] ?? "bg-white/95")}
                style={{ width: `${(band.taxedKobo / taxedTotal) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {bands.map((band, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-meta"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-sm",
                      BAND_TINT[i] ?? "bg-white/95",
                    )}
                  />
                  <span className="truncate text-white/70">
                    {naira(band.taxedKobo)} at {Math.round(band.rate * 100)}%
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-white">
                  {band.taxKobo === 0 ? "no tax" : naira(band.taxKobo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The month, line by line. Closed, because the headline and the ladder
          answer the question somebody arrived with; this is for the reader
          who wants to check it. */}
      <div className="mt-6 border-t border-night-line pt-5">
        <button
          type="button"
          onClick={onToggleWorking}
          aria-expanded={showWorking}
          className="flex w-full items-center justify-between text-meta font-medium text-white/70 hover:text-white"
        >
          Your month, line by line
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform",
              showWorking && "rotate-180",
            )}
          />
        </button>

        {showWorking && (
          <>
            <dl className="mt-4 flex flex-col gap-2.5 text-meta">
              <Line label="Gross pay" value={naira(slip.grossKobo)} />
              <Line
                label="PAYE"
                value={
                  slip.operates.paye === "DEDUCTED"
                    ? `−${naira(slip.payeKobo)}`
                    : "Not deducted"
                }
              />
              <Line
                label="Pension (employee, 8%)"
                value={
                  slip.operates.pension === "DEDUCTED"
                    ? `−${naira(slip.pensionEmployeeKobo)}`
                    : "Not deducted"
                }
              />
              <Line
                label="NHF (2.5% of basic)"
                value={
                  slip.operates.nhf === "DEDUCTED"
                    ? `−${naira(slip.nhfKobo)}`
                    : "Not deducted"
                }
              />
              <div className="mt-1 flex justify-between gap-3 border-t border-night-line pt-2.5">
                <dt className="font-medium text-white">Take-home</dt>
                <dd className="font-medium tabular-nums text-white">
                  {nairaExact(slip.netKobo)}
                </dd>
              </div>
            </dl>

            {/* The split is why NHF is not 2.5% of gross. */}
            <p className="mt-4 text-meta leading-relaxed text-white/50">
              Your gross splits into {naira(slip.basicKobo)} basic,{" "}
              {naira(slip.housingKobo)} housing and {naira(slip.transportKobo)}{" "}
              transport. Pension is charged on the whole of it and NHF on basic
              alone, which is why NHF comes to {naira(slip.nhfKobo)} rather than{" "}
              {naira(Math.round(slip.grossKobo * 0.025))}.
            </p>
          </>
        )}
      </div>

      <div className="mt-auto pt-7">
        <p className="text-meta leading-relaxed text-white/40">
          Worked out by the same engine that runs real payroll on this platform.
          Nigeria Tax Act 2025, effective {result.taxSchedule.effectiveFrom}.
        </p>
        <Pill
          href="/demo"
          variant="solid"
          arrow
          className="mt-4 w-full justify-center"
        >
          See this running for your whole team
        </Pill>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-night p-4">
      <dt className="text-meta text-white/50">{label}</dt>
      <dd className="mt-1 text-[1.375rem] font-medium leading-none tabular-nums text-white">
        {value}
      </dd>
      <p className="mt-1.5 text-meta leading-snug text-white/40">{children}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/50">{label}</dt>
      <dd className="tabular-nums text-white">{value}</dd>
    </div>
  );
}
