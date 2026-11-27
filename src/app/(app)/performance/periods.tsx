"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarRange } from "lucide-react";
import { StageProgress } from "@/components/performance/stage-progress";
import { EmptyState, LoadState, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dayLabel, type ApiCycle } from "@/lib/api/performance";
import { useAppraisals } from "@/lib/store/performance";
import { departmentTone } from "@/components/ui/department-card";
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
        <StageProgress stage={period.stage} tone={tone} label={period.name} />
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
