"use client";

import { ProgressMeter } from "@/components/ui";
import { useAi2Usage } from "@/lib/store/ai2-usage";

/**
 * How much of this month's token budget the assistant has spent. Reads
 * `useAi2Usage`, which is shared across every mount — asking here costs no
 * extra request. Renders nothing while offline, loading, or unreadable: an
 * absent gauge is honest, a `0` one is a claim about spend nobody measured.
 */
function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  }
  return value.toLocaleString();
}

export function UsageGauge({
  compact = false,
  className,
}: {
  /** Drops the reset date, for a tight space like the chat card header. */
  compact?: boolean;
  className?: string;
}) {
  const usage = useAi2Usage();
  if (!usage) return null;

  const pct = usage.limitTokens > 0 ? usage.usedTokens / usage.limitTokens : 0;
  const tone = pct >= 0.95 ? "danger" : pct >= 0.8 ? "warning" : "accent";
  const resets = new Date(usage.periodEnd).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className={className}>
      <ProgressMeter
        value={usage.usedTokens}
        max={usage.limitTokens}
        size={compact ? "sm" : "md"}
        tone={tone}
        showValue={false}
      />
      <p className="mt-1 flex items-baseline justify-between gap-2 text-meta text-muted">
        <span>
          {formatTokenCount(usage.usedTokens)} /{" "}
          {formatTokenCount(usage.limitTokens)} tokens this month
        </span>
        {!compact && <span>Resets {resets}</span>}
      </p>
    </div>
  );
}
