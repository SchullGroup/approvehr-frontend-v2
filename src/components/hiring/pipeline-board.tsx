"use client";

import { useMemo, useState } from "react";
import { Clock, MessageSquare, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, Badge, Money } from "@/components/ui";
import { STAGES, fullName, type PipelineCard, type StageId } from "@/lib/types";
import { daysInStage } from "@/lib/mock/hiring";
import { stageTone } from "./stage-pill";

/*
 * The board is the recruiter's home. Columns are the pipeline stages in order,
 * so the left-to-right reading direction matches the direction a candidate
 * actually travels.
 *
 * Drag is not the only way to move someone — every card opens a panel with an
 * explicit "Advance" action, because drag-and-drop is unusable by keyboard and
 * fiddly on a phone. Drag is the accelerator, not the mechanism.
 */

const COLUMN_ACCENT: Record<StageId, string> = {
  sourced: "bg-muted",
  shortlisted: "bg-info",
  prescreen: "bg-accent",
  interview: "bg-warning",
  selection: "bg-success",
};

export function PipelineBoard({
  cards,
  activeStages,
  onOpen,
  onMove,
}: {
  cards: PipelineCard[];
  activeStages: StageId[];
  onOpen: (card: PipelineCard) => void;
  onMove: (applicationId: string, to: StageId) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  const columns = useMemo(
    () => STAGES.filter((s) => activeStages.includes(s.id)),
    [activeStages],
  );

  const byStage = useMemo(() => {
    const map = Object.fromEntries(
      columns.map((c) => [c.id, [] as PipelineCard[]]),
    ) as Record<StageId, PipelineCard[]>;
    for (const card of cards) {
      if (card.outcome !== "in_progress") continue;
      if (map[card.stage]) map[card.stage].push(card);
    }
    return map;
  }, [cards, columns]);

  return (
    <div className="scroll-x -mx-5 px-5 sm:-mx-7 sm:px-7">
      <div className="flex min-w-max gap-3 pb-2">
        {columns.map((col) => {
          const items = byStage[col.id] ?? [];
          const isOver = overStage === col.id;

          return (
            <section
              key={col.id}
              aria-label={`${col.label}, ${items.length} candidates`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.id ? null : s))}
              onDrop={() => {
                if (dragId) onMove(dragId, col.id);
                setDragId(null);
                setOverStage(null);
              }}
              className={cn(
                "flex w-[268px] shrink-0 flex-col rounded-lg border transition-colors",
                isOver
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-canvas",
              )}
            >
              {/* Column head */}
              <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", COLUMN_ACCENT[col.id])}
                />
                <h3 className="text-[0.875rem] font-semibold text-ink">
                  {col.label}
                </h3>
                <span className="tabular ml-auto rounded-full bg-sunken px-1.5 py-0.5 text-[0.75rem] font-semibold text-muted">
                  {items.length}
                </span>
              </header>

              <p className="border-b border-line px-3 py-2 text-[0.75rem] leading-snug text-muted">
                {col.blurb}
              </p>

              {/* Cards */}
              <ul className="flex flex-1 flex-col gap-2 p-2">
                {items.map((card) => (
                  <li key={card.id}>
                    <CandidateCard
                      card={card}
                      dragging={dragId === card.id}
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      onOpen={() => onOpen(card)}
                    />
                  </li>
                ))}

                {items.length === 0 && (
                  <li className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-[0.75rem] text-faint">
                    Nobody here yet
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CandidateCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  card: PipelineCard;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const days = daysInStage(card);
  const stale = days >= 7;
  const pendingScorecards = card.scorecards.filter((s) => !s.submittedAt).length;
  const name = fullName(card.candidate);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border border-line bg-surface p-3 shadow-xs transition-shadow",
        "hover:shadow-sm",
        dragging && "opacity-40",
      )}
    >
      {/* The whole card is reachable by keyboard through this one control. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-2.5 text-left"
      >
        <Avatar name={name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-medium text-ink">
            {name}
          </span>
          <span className="block truncate text-[0.75rem] text-muted">
            {card.candidate.currentTitle} · {card.candidate.currentCompany}
          </span>
        </span>
        {card.rating !== null && (
          <span className="tabular flex shrink-0 items-center gap-0.5 text-[0.75rem] font-medium text-ink">
            <Star
              aria-hidden="true"
              className="size-3 fill-warning text-warning"
            />
            {card.rating}
          </span>
        )}
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.75rem]",
            stale
              ? "bg-warning-soft text-warning-text"
              : "bg-sunken text-muted",
          )}
          title={`${days} days in ${card.stage}`}
        >
          <Clock aria-hidden="true" className="size-3" />
          {days}d
        </span>

        {pendingScorecards > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[0.75rem] text-danger-text">
            <MessageSquare aria-hidden="true" className="size-3" />
            {pendingScorecards} scorecard{pendingScorecards > 1 ? "s" : ""} due
          </span>
        )}

        {card.offer && (
          <Badge tone="success" size="sm">
            <Money amount={card.offer.grossMonthly} compact />
          </Badge>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/** Compact stage summary used above the board. */
export function StageStrip({
  counts,
  activeStages,
}: {
  counts: Record<StageId, number>;
  activeStages: StageId[];
}) {
  const cols = STAGES.filter((s) => activeStages.includes(s.id));
  return (
    <ol className="flex flex-wrap gap-2">
      {cols.map((s) => (
        <li
          key={s.id}
          className="flex items-baseline gap-2 rounded-md border border-line bg-surface px-3 py-2"
        >
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full", COLUMN_ACCENT[s.id])}
          />
          <span className="text-[0.75rem] text-body">{s.label}</span>
          <span className="tabular text-[0.875rem] font-semibold text-ink">
            {counts[s.id] ?? 0}
          </span>
        </li>
      ))}
    </ol>
  );
}

export { stageTone };
