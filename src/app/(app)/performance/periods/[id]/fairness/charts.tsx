"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreBand } from "@/lib/api/performance";
import { pct, points } from "@/components/performance/record-check";

export { pct, points };

const DOMAIN = [4000, 8000] as const;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type RangeRow = {
  label: string;
  people: number;
  meanBp: number;
  lowBp: number | null;
  highBp: number | null;
  emphasis: boolean;
};

export function RangeChart({
  rows,
  referenceBp,
  caption,
}: {
  rows: RangeRow[];
  referenceBp: number | null;
  caption: string;
}) {
  const [ref, width] = useWidth();
  const narrow = width < 440;
  const labelW = narrow ? 104 : 140;
  const countW = 40;
  const top = 28;
  const rowH = 34;
  const height = top + rows.length * rowH + 26;
  const x0 = labelW;
  const x1 = Math.max(x0 + 40, width - countW - 8);
  const x = (bp: number) =>
    x0 +
    ((Math.min(Math.max(bp, DOMAIN[0]), DOMAIN[1]) - DOMAIN[0]) /
      (DOMAIN[1] - DOMAIN[0])) *
      (x1 - x0);
  const ticks = [4000, 5000, 6000, 7000, 8000].filter(
    (t) => !narrow || t % 2000 === 0,
  );

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={caption}
          className="block overflow-visible"
        >
          {[4000, 5000, 6000, 7000, 8000].map((t) => (
            <line
              key={t}
              x1={x(t)}
              x2={x(t)}
              y1={top - 6}
              y2={height - 26}
              className="stroke-line"
            />
          ))}
          {ticks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted text-meta tabular-nums"
            >
              {pct(t).replace(".0", "")}
            </text>
          ))}
          {referenceBp !== null && (
            <>
              <line
                x1={x(referenceBp)}
                x2={x(referenceBp)}
                y1={top - 8}
                y2={height - 26}
                className="stroke-body"
              />
              <text
                x={x(referenceBp)}
                y={14}
                textAnchor="middle"
                className="fill-muted text-meta"
              >
                Company {pct(referenceBp)}
              </text>
            </>
          )}
          {rows.map((row, i) => {
            const cy = top + i * rowH + rowH / 2;
            const tone = row.emphasis ? "accent" : "faint";
            return (
              <g key={row.label}>
                <title>{`${row.label}: ${pct(row.meanBp)} average, ${String(row.people)} people`}</title>
                <text
                  x={0}
                  y={cy + 5}
                  className={`fill-ink text-meta ${row.emphasis ? "font-medium" : ""}`}
                >
                  {row.label}
                </text>
                <text
                  x={width}
                  y={cy + 5}
                  textAnchor="end"
                  className="fill-muted text-meta tabular-nums"
                >
                  {row.people}
                </text>
                {row.lowBp !== null && row.highBp !== null && (
                  <line
                    x1={x(row.lowBp)}
                    x2={x(row.highBp)}
                    y1={cy}
                    y2={cy}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeOpacity={0.5}
                    className={
                      tone === "accent" ? "stroke-accent" : "stroke-faint"
                    }
                  />
                )}
                <circle
                  cx={x(row.meanBp)}
                  cy={cy}
                  r={5}
                  strokeWidth={2}
                  className={`stroke-surface ${tone === "accent" ? "fill-accent" : "fill-faint"}`}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export const BANDS: { key: ScoreBand; label: string; fill: string }[] = [
  { key: "BELOW", label: "Below", fill: "var(--color-danger)" },
  {
    key: "PARTIALLY_MEETS",
    label: "Partially meets",
    fill: "var(--color-warning)",
  },
  { key: "MEETS", label: "Meets", fill: "var(--color-line-strong)" },
  { key: "EXCEEDS", label: "Exceeds", fill: "var(--color-accent)" },
  {
    key: "OUTSTANDING",
    label: "Outstanding",
    fill: "var(--color-success-strong)",
  },
];

export function BandBars({
  rows,
}: {
  rows: { label: string; people: number; bands: Record<ScoreBand, number> }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-body"
        aria-hidden="true"
      >
        {BANDS.map((band) => (
          <span key={band.key} className="inline-flex items-center gap-1.5">
            <i
              className="size-2.5 rounded-xs"
              style={{ background: band.fill }}
            />
            {band.label}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const above = row.bands.EXCEEDS + row.bands.OUTSTANDING;
        return (
          <div
            key={row.label}
            className="grid grid-cols-[104px_1fr_48px] items-center gap-3 sm:grid-cols-[140px_1fr_48px]"
          >
            <span className="truncate text-meta text-ink">{row.label}</span>
            <div
              className="flex h-4 gap-0.5"
              role="img"
              aria-label={BANDS.map(
                (b) => `${b.label} ${String(row.bands[b.key])}`,
              ).join(", ")}
            >
              {BANDS.filter((b) => row.bands[b.key] > 0).map((band) => (
                <div
                  key={band.key}
                  className="h-full rounded-xs"
                  style={{
                    width: `${String((row.bands[band.key] / row.people) * 100)}%`,
                    background: band.fill,
                  }}
                  title={`${band.label}: ${String(row.bands[band.key])}`}
                />
              ))}
            </div>
            <span className="text-right text-meta text-muted tabular-nums">
              {Math.round((above / row.people) * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
