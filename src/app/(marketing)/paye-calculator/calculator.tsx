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
  const [showBands, setShowBands] = useState(false);

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
    <div className="grid gap-8 rounded-3xl border border-sand-line bg-white/70 p-7 lg:grid-cols-[1fr_400px] lg:p-10">
      {/* Controls. `min-w-0` because a grid item's default `min-width: auto`
          floors the whole (single, mobile) column at this div's min-content
          width otherwise — the `<select>` below is wide enough on its own to
          push the card past the viewport without it. */}
      <div className="min-w-0">
        <label htmlFor="gross" className="block font-medium text-slate">
          Gross salary
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body text-slate-muted">
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

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
            <span className="text-body-sm text-slate">NHF deducted (2.5%)</span>
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
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body text-slate-muted">
              ₦
            </span>
            <input
              id="rent"
              type="text"
              inputMode="numeric"
              value={rentInput}
              onChange={(e) => setRentInput(e.currentTarget.value)}
              placeholder="0"
              className="h-11 w-full min-w-0 rounded-xl border border-sand-line bg-white pl-8 pr-4 text-body tabular-nums text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
            />
          </div>
          <p className="mt-2 text-meta leading-relaxed text-slate-muted">
            Declared rent unlocks relief under the Nigeria Tax Act 2025: 20% of
            what you pay, capped at ₦500,000 a year.
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
              className="h-11 w-full min-w-0 appearance-none rounded-xl border border-sand-line bg-white px-4 pr-10 text-body text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
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
            You would remit PAYE through the {state === "FCT" ? "FCT" : state}{" "}
            State Internal Revenue Service. The bands themselves are set
            nationally and do not change by state — only who collects the money
            does.
          </p>
        </div>
      </div>

      {/* Result */}
      <div className="flex min-w-0 flex-col rounded-2xl bg-night p-7">
        {!configured ? (
          <p className="text-body-sm leading-relaxed text-white/60">
            This preview build is not connected to ApproveHR&apos;s system, so
            the calculator cannot run here.
          </p>
        ) : grossMonthlyKobo <= 0 ? (
          <p className="text-body-sm leading-relaxed text-white/60">
            Enter a salary to see the breakdown.
          </p>
        ) : error ? (
          <p className="text-body-sm leading-relaxed text-white/60">{error}</p>
        ) : !current ? (
          <p className="text-body-sm leading-relaxed text-white/60">
            Working it out…
          </p>
        ) : (
          <>
            <p className="text-meta text-white/50">Take-home pay, per month</p>
            <p className="mt-2 text-[2.25rem] font-medium leading-none tracking-tight text-white tabular-nums">
              {naira(current.slip.netKobo)}
            </p>

            <dl className="mt-6 flex flex-col gap-2.5 border-t border-night-line pt-5 text-meta">
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">Gross pay</dt>
                <dd className="tabular-nums text-white">
                  {naira(current.slip.grossKobo)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">PAYE</dt>
                <dd className="tabular-nums text-white">
                  {current.slip.operates.paye === "DEDUCTED"
                    ? naira(current.slip.payeKobo)
                    : "Not deducted"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">Pension (employee)</dt>
                <dd className="tabular-nums text-white">
                  {current.slip.operates.pension === "DEDUCTED"
                    ? naira(current.slip.pensionEmployeeKobo)
                    : "Not deducted"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-white/50">NHF</dt>
                <dd className="tabular-nums text-white">
                  {current.slip.operates.nhf === "DEDUCTED"
                    ? naira(current.slip.nhfKobo)
                    : "Not deducted"}
                </dd>
              </div>
              {current.slip.consolidatedReliefMonthlyKobo > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-white/50">Rent relief applied</dt>
                  <dd className="tabular-nums font-medium text-success">
                    −{naira(current.slip.consolidatedReliefMonthlyKobo)}
                  </dd>
                </div>
              )}
            </dl>

            {current.slip.reliefUnclaimed && (
              <p className="mt-4 rounded-xl bg-white/6 p-3 text-meta leading-relaxed text-white/60">
                No rent declared, so no relief is applied. Add your annual rent
                above to see the difference.
              </p>
            )}

            {current.slip.workings.paye.bands.length > 0 && (
              <div className="mt-5 border-t border-night-line pt-4">
                <button
                  type="button"
                  onClick={() => setShowBands((v) => !v)}
                  className="flex w-full items-center justify-between text-meta font-medium text-white/70 hover:text-white"
                >
                  How the tax was worked out
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 transition-transform",
                      showBands && "rotate-180",
                    )}
                  />
                </button>
                {showBands && (
                  <ul className="mt-3 flex flex-col gap-1.5 text-meta">
                    {current.slip.workings.paye.bands.map((band, i) => (
                      <li
                        key={i}
                        className="flex justify-between gap-3 text-white/60"
                      >
                        <span>
                          {nairaExact(band.taxedKobo / 12)}/mo at{" "}
                          {Math.round(band.rate * 100)}%
                        </span>
                        <span className="tabular-nums text-white/80">
                          {naira(Math.round(band.taxKobo / 12))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="mt-5 text-meta leading-relaxed text-white/40">
              Sourced from the same engine that runs real payroll on this
              platform — Nigeria Tax Act 2025, effective{" "}
              {current.taxSchedule.effectiveFrom}.
            </p>
          </>
        )}

        <div className="mt-auto pt-7">
          <Pill
            href="/demo"
            variant="solid"
            arrow
            className="w-full justify-center"
          >
            See this running for your whole team
          </Pill>
        </div>
      </div>
    </div>
  );
}
