"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarRange } from "lucide-react";
import { EmptyState, LoadState, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dayLabel, type ApiCycle } from "@/lib/api/performance";
import { useAppraisals } from "@/lib/store/performance";
import { periodWords } from "./review-parts";

/**
 * The appraisal periods, as large cards.
 *
 * A card says three things: the name, the dates, and how far along it is. No
 * status word, no counts and no button, because the whole card is the way in and
 * what to do next is the period page's job. Running periods are under **Open**;
 * published ones, which are a record, are under **History**.
 */
export function PeriodsTab() {
  const appraisals = useAppraisals();
  const [tab, setTab] = useState<"open" | "history">("open");

  const periods = appraisals.cycles;
  const open = periods.filter((period) => period.stage !== "PUBLISHED");
  const history = periods.filter((period) => period.stage === "PUBLISHED");
  const shown = tab === "open" ? open : history;

  return (
    <LoadState
      loading={appraisals.loading}
      error={appraisals.error}
      subject="the appraisal periods"
      onRetry={appraisals.reload}
      hasData={periods.length > 0}
      skeleton="list"
    >
      <Tabs
        items={[
          { id: "open", label: "Open", count: open.length },
          { id: "history", label: "History", count: history.length },
        ]}
        value={tab}
        onChange={(id) => setTab(id as "open" | "history")}
      >
        {shown.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarRange aria-hidden="true" />}
            title={
              tab === "open"
                ? "No appraisal period is open"
                : "Nothing here yet"
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {shown.map((period) => (
              <li key={period.id}>
                <PeriodCard period={period} />
              </li>
            ))}
          </ul>
        )}
      </Tabs>
    </LoadState>
  );
}

/* -------------------------------------------------------------------------- */

/** The four steps a period moves through after it starts. */
const STEPS = ["SELF", "MANAGER", "CALIBRATION", "PUBLISHED"] as const;

/**
 * How far along a period is, as a share of the way through, with nothing asked
 * of the API: the stage it has reached already says it. A draft has not started
 * and fills nothing.
 */
export function progressOf(period: Pick<ApiCycle, "stage">): number {
  const reached = STEPS.indexOf(period.stage as (typeof STEPS)[number]);
  return reached < 0 ? 0 : (reached + 1) / STEPS.length;
}

/**
 * One period, as a card. Shared by the periods list and the Overview, so a
 * period looks the same wherever it is met.
 */
export function PeriodCard({
  period,
  className,
}: {
  period: ApiCycle;
  className?: string;
}) {
  const share = progressOf(period);
  const dates = periodWords(period.periodStart, period.periodEnd);
  const started = share > 0;
  const finished = period.stage === "PUBLISHED";
  /* Four segments, one for each stage a period moves through: how far along it is
     reads at a glance without a word for where it is. */
  const reached = Math.round(share * STEPS.length);

  return (
    <Link
      href={`/performance/periods/${period.id}`}
      className={cn(
        "group flex h-full min-h-48 flex-col gap-5 rounded-2xl border border-line p-5 shadow-sm transition-[border-color,box-shadow] hover:border-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
      style={{
        background: finished
          ? "var(--color-sunken)"
          : started
            ? "linear-gradient(145deg, color-mix(in srgb, var(--color-accent) 11%, var(--color-surface)) 0%, var(--color-surface) 70%)"
            : "var(--color-surface)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-xl",
            started && !finished
              ? "bg-accent text-white"
              : "bg-accent-soft text-accent-text",
          )}
        >
          <CalendarRange className="size-5" />
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-h4 font-semibold text-ink">{period.name}</p>
        {dates && <p className="mt-0.5 text-body-sm text-muted">{dates}</p>}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-body-sm text-muted">Progress</span>
          {started && (
            <span className="tabular text-h3 font-semibold text-ink">
              {Math.round(share * 100)}%
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`${period.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          className="flex gap-1.5"
        >
          {STEPS.map((step, index) => (
            <span
              key={step}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
                index < reached ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </div>
        {period.dueDate && (
          <p className="flex items-center gap-1.5 text-meta text-muted">
            <CalendarClock aria-hidden="true" className="size-3.5" />
            Due {dayLabel(period.dueDate)}
          </p>
        )}
      </div>
    </Link>
  );
}
