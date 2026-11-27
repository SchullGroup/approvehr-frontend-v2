"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarRange } from "lucide-react";
import { EmptyState, LoadState, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dayLabel, type ApiCycle } from "@/lib/api/performance";
import { useAppraisals } from "@/lib/store/performance";
import { departmentTone } from "@/components/ui/department-card";
import { periodWords } from "./review-parts";

/**
 * The appraisal periods, as large cards.
 *
 * A card says three things: the name, the dates, and which stage it is at. No
 * counts and no button, because the whole card is the way in and what to do next
 * is the period page's job. Running periods are under **Open**; published ones,
 * which are a record, are under **History**.
 *
 * It names the stage and does **not** draw a percentage. The old card filled a
 * bar by the share of stages passed, so a period read "25%" with nothing sent
 * and "100%" once published with self-reviews still outstanding: a figure that
 * is about the calendar, wearing the face of a figure about the work. A period
 * that has not started says so in words and draws no bar, so it no longer looks
 * like an open one.
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
 * Where a period is, in words and as a step number, with nothing asked of the
 * API beyond the stage and the label it already sends. `step` is null for a
 * period that has not started: a draft is not step zero of anything.
 */
export function stageOf(period: Pick<ApiCycle, "stage" | "stageLabel">): {
  label: string;
  step: number | null;
  of: number;
} {
  const index = STEPS.indexOf(period.stage as (typeof STEPS)[number]);
  const words = period.stageLabel.trim() || "not started";
  return {
    label: words.charAt(0).toUpperCase() + words.slice(1),
    step: index < 0 ? null : index + 1,
    of: STEPS.length,
  };
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
  const where = stageOf(period);
  const dates = periodWords(period.periodStart, period.periodEnd);
  const finished = period.stage === "PUBLISHED";
  /* Each period keeps its own light colour, taken from its name, so a list of them
     is easy to tell apart at a glance and the same period is the same colour on
     the Overview and here. */
  const tone = departmentTone(period.name);

  return (
    <Link
      href={`/performance/periods/${period.id}`}
      className={cn(
        "group flex h-full min-h-48 flex-col gap-5 rounded-2xl border border-line p-5 shadow-sm transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2",
        finished ? "bg-sunken" : "bg-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            color: tone,
            background: `color-mix(in srgb, ${tone} 14%, var(--color-surface))`,
          }}
        >
          <CalendarRange className="size-5" />
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-h4 font-semibold text-ink">{period.name}</p>
        {dates && <p className="mt-0.5 text-body-sm text-muted">{dates}</p>}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body-sm font-medium text-ink">
            {where.label}
          </span>
          {where.step !== null && (
            <span className="tabular text-body-sm text-muted">
              Step {where.step} of {where.of}
            </span>
          )}
        </div>
        {where.step !== null && (
          /* The words above say it; the segments are the same fact drawn, so a
             screen reader is not told twice. */
          <div aria-hidden="true" className="grid grid-cols-4 gap-1">
            {STEPS.map((step, index) => (
              <span
                key={step}
                className="h-1.5 rounded-full bg-line"
                style={
                  index < (where.step ?? 0) ? { background: tone } : undefined
                }
              />
            ))}
          </div>
        )}
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
