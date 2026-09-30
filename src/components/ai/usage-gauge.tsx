"use client";

import { ProgressMeter } from "@/components/ui";
import type { Ai2UsageWindow } from "@/lib/api/ai2";
import { useAi2Usage } from "@/lib/store/ai2-usage";

/**
 * How much of the assistant's budget this organisation has spent, today and
 * this month. Renders nothing while offline, loading or unreadable — an
 * absent gauge is honest, a `0` one would claim a spend nobody measured.
 *
 * Shows a percentage, never a token count: nobody running a company has an
 * opinion about "1.2M of 2M" tokens. Two windows because a month's budget
 * says nothing about an afternoon that just spent a third of it.
 */

function toneFor(percent: number): "accent" | "warning" | "danger" {
  return percent >= 95 ? "danger" : percent >= 80 ? "warning" : "accent";
}

/* `spent` rather than `window`, which would shadow the global inside this
   component and read as the DOM one to anybody skimming. */
function Meter({
  label,
  spent,
  size,
}: {
  label: string;
  spent: Ai2UsageWindow;
  size: "sm" | "md";
}) {
  return (
    <ProgressMeter
      label={label}
      value={spent.usedPercent}
      max={100}
      size={size}
      tone={toneFor(spent.usedPercent)}
    />
  );
}

export function UsageGauge({
  compact = false,
  className,
}: {
  /** One meter and no reset date, for a tight space like the chat card header. */
  compact?: boolean;
  className?: string;
}) {
  const usage = useAi2Usage();
  if (!usage) return null;

  const { day, month } = usage;

  /* Compact has room for one bar, so it shows whichever window is closer to
     being spent — that is the one about to stop somebody mid-question. */
  if (compact) {
    const tighter = day.usedPercent >= month.usedPercent ? day : month;
    return (
      <div className={className}>
        <Meter
          label={tighter === day ? "Used today" : "Used this month"}
          spent={tighter}
          size="sm"
        />
      </div>
    );
  }

  const resets = new Date(month.periodEnd).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        <Meter label="Used today" spent={day} size="md" />
        <Meter label="Used this month" spent={month} size="md" />
      </div>
      <p className="mt-2 text-meta text-muted">
        Today&rsquo;s share starts again at midnight UTC. The month&rsquo;s
        resets on {resets}.
      </p>
    </div>
  );
}
