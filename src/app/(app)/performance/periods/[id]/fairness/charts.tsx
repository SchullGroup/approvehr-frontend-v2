"use client";

import { useEffect, useRef, useState } from "react";
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
