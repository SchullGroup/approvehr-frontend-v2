"use client";

import { useId, useRef, useState } from "react";
import { ArrowRightLeft, Clock, Flag, Link2, Star, Tags } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, Checkbox, Tag, TextLink } from "@/components/ui";
import { DeletionLine, ScoreBadge } from "@/components/hiring/card-bits";
import {
  AssessmentBadge,
  BelowBadge,
  FitBar,
} from "@/components/hiring/screening/fit-badge";
import {
  ageWords,
  daysSince,
  STALE_AFTER_DAYS,
} from "@/lib/hiring/pipeline/age";
import { columnKeyOf } from "@/lib/hiring/pipeline/columns";
import { channelLabel } from "@/lib/hiring/pipeline/filters";
import type { BoardCard, BoardColumn } from "@/lib/hiring/pipeline/model";
import type { Board, ColumnView } from "@/lib/hiring/pipeline/use-board";
import type { BulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";
import { TabStrip, tabPanelProps } from "./tab-strip";

/**
 * The board on a phone: one stage at a time, the stage you are working in first.
 *
 * ## Why this exists beside `KanbanBoard`
 *
 * The board is five columns 280px wide in a sideways scroller. On a 390px phone
 * that shows one column and a sliver of the next, with nothing saying which stage
 * you are in or how many people the others hold, and every control on a card is
 * 18 to 32px. This is the same data, the same selection and the same three ways
 * to act (open the person, move to a stage, reject), laid out for a thumb:
 *
 * - **A strip of stages with their counts**, scrollable, and the one you are in is
 *   marked. The strip opens on the first stage that has somebody in it, so what is
 *   on screen is a person to act on rather than an empty column.
 * - **A swipe sideways changes stage.** Vertical scrolling is untouched; only a
 *   clearly horizontal, deliberate movement counts.
 * - **Every control is 44px.**
 *
 * `KanbanBoard` is not replaced. It is what a desktop and a tablet still get, and
 * it is where dragging lives (a drag across a 390px screen to a column that is
 * off it is not a gesture that works). This takes the same props, so the choice
 * between them is made in one place, `pipeline-workspace.tsx`.
 *
 * ## What it deliberately does not carry
 *
 * No drag grip. Moving somebody is the "Move to…" control, a real `<select>` so
 * the phone's own picker opens. If the board's card gains a badge, add it here
 * too: the two are kept in step by hand, and `kanban-board.tsx` is where to look.
 */

const isActive = (card: BoardCard): boolean =>
  card.outcome === "IN_PROGRESS" || card.outcome === "OFFER_MADE";

/** Least horizontal travel, in px, that counts as a swipe, and how much more
 *  horizontal than vertical it has to be. A scroll is mostly vertical. */
const SWIPE_MIN = 64;
const SWIPE_RATIO = 1.6;

export function PhoneStages({
  board,
  canManage,
  today,
  timeZone,
  selection,
  moveTargets,
  onMove,
  onRejectRequest,
  onEditTags,
}: {
  board: Board;
  canManage: boolean;
  today: string;
  timeZone: string;
  selection: BulkSelection;
  moveTargets: readonly BoardColumn[];
  onMove: (card: BoardCard, stageId: string) => void;
  onRejectRequest: (card: BoardCard) => void;
  onEditTags: (card: BoardCard) => void;
}) {
  const baseId = useId();
  const columns = board.columns;
  const order = columns.map((view) => view.column);
  const [picked, setPicked] = useState<string | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  /* What is on screen is derived, never copied into state: a chosen stage that a
     filter or a refresh has since removed falls back to the first one with
     somebody in it instead of leaving a blank panel under a dead tab. */
  const firstBusy =
    columns.find((view) => view.cards.some(isActive)) ?? columns[0];
  const current =
    columns.find((view) => view.column.key === picked) ?? firstBusy;
  const currentKey = current?.column.key;

  if (!current) return null;

  const index = columns.findIndex((view) => view.column.key === currentKey);
  const go = (to: number) => {
    const next = columns[to];
    if (next) setPicked(next.column.key);
  };

  return (
    <div
      aria-busy={board.settling}
      className={cn(board.settling && "opacity-60")}
    >
      <TabStrip
        label="Pipeline stages"
        prefix={baseId}
        value={current.column.key}
        onChange={(key) => setPicked(key)}
        items={columns.map((view) => ({
          id: view.column.key,
          label: view.column.label,
          count: view.total ?? view.cards.length,
        }))}
        variant="pills"
        className="-mx-5 px-5"
      />

      <div
        {...tabPanelProps(baseId, current.column.key)}
        className="touch-pan-y pt-3 focus-visible:outline-none"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = swipe.current;
          swipe.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < SWIPE_MIN) return;
          if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
          go(dx < 0 ? index + 1 : index - 1);
        }}
      >
        <StageList
          view={current}
          order={order}
          canManage={canManage}
          today={today}
          timeZone={timeZone}
          selection={selection}
          moveTargets={moveTargets}
          onLoadMore={() => board.loadMore(current.column.key)}
          onMove={onMove}
          onRejectRequest={onRejectRequest}
          onEditTags={onEditTags}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StageList({
  view,
  order,
  canManage,
  today,
  timeZone,
  selection,
  moveTargets,
  onLoadMore,
  onMove,
  onRejectRequest,
  onEditTags,
}: {
  view: ColumnView;
  order: readonly BoardColumn[];
  canManage: boolean;
  today: string;
  timeZone: string;
  selection: BulkSelection;
  moveTargets: readonly BoardColumn[];
  onLoadMore: () => void;
  onMove: (card: BoardCard, stageId: string) => void;
  onRejectRequest: (card: BoardCard) => void;
  onEditTags: (card: BoardCard) => void;
}) {
  const { column, cards } = view;
  const total = view.total ?? cards.length;
  const ids = cards.map((card) => card.id);
  const left = Math.max(0, total - cards.length);

  return (
    <section
      aria-label={`${column.label}, ${String(total)} ${total === 1 ? "person" : "people"}`}
    >
      {canManage && cards.length > 0 && (
        <Checkbox
          className="min-h-11 items-center"
          label={`Select everyone shown in ${column.label}`}
          checked={selection.allOf(ids)}
          indeterminate={selection.someOf(ids)}
          disabled={Boolean(selection.everyone)}
          onChange={() => selection.toggleMany(ids)}
        />
      )}

      <ul className="flex flex-col gap-3">
        {cards.length === 0 ? (
          <li className="rounded-md border border-dashed border-line-strong px-3 py-8 text-center text-body-sm text-muted">
            Nobody here
          </li>
        ) : (
          cards.map((card) => (
            <li key={card.id}>
              <PhoneCard
                card={card}
                canManage={canManage}
                today={today}
                timeZone={timeZone}
                selection={selection}
                moveTargets={moveTargets}
                order={order}
                onMove={(stageId) => onMove(card, stageId)}
                onRejectRequest={() => onRejectRequest(card)}
                onEditTags={() => onEditTags(card)}
              />
            </li>
          ))
        )}
      </ul>

      {(view.hasMore || view.moreError) && (
        <div className="mt-3 flex flex-col gap-2">
          {view.moreError && (
            <p role="alert" className="text-meta text-danger-text">
              {view.moreError.message}
            </p>
          )}
          <Button
            variant="secondary"
            block
            loading={view.loadingMore}
            disabled={view.loadingMore}
            onClick={onLoadMore}
            className="max-sm:h-11"
          >
            {view.moreError
              ? "Try again"
              : `Load more${left > 0 ? ` (${String(left)} left)` : ""}`}
          </Button>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PhoneCard({
  card,
  canManage,
  today,
  timeZone,
  selection,
  moveTargets,
  order,
  onMove,
  onRejectRequest,
  onEditTags,
}: {
  card: BoardCard;
  canManage: boolean;
  today: string;
  timeZone: string;
  selection: BulkSelection;
  moveTargets: readonly BoardColumn[];
  order: readonly BoardColumn[];
  onMove: (stageId: string) => void;
  onRejectRequest: () => void;
  onEditTags: () => void;
}) {
  const active = isActive(card);
  const days = daysSince(card.stageEnteredAt, today, timeZone);
  const stale = active && days >= STALE_AFTER_DAYS;
  const currentKey = columnKeyOf(card, order);
  const shownTags = card.tags.slice(0, 3);
  const moreTags = card.tags.length - shownTags.length;

  return (
    <article
      data-card-id={card.id}
      className="relative rounded-lg border border-line bg-surface p-3 shadow-xs"
    >
      <div className="flex items-start gap-1">
        {canManage && (
          /* The tick is 18px and cannot be made bigger from here, so the press
             is the 44px label around it. */
          <label className="-ml-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              hiddenLabel={`Select ${card.name}`}
              checked={selection.isSelected(card.id)}
              disabled={Boolean(selection.everyone)}
              onChange={() => selection.toggle(card.id)}
            />
          </label>
        )}

        <div className="min-w-0 flex-1 py-0.5">
          <TextLink
            href={`/hiring/candidates/${card.id}`}
            className="flex min-h-11 items-center break-words text-body-md font-medium"
          >
            {card.name}
          </TextLink>
          <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-meta text-muted">
            {card.reference && (
              <span className="tabular">{card.reference}</span>
            )}
            {card.source && <span>{channelLabel(card.source)}</span>}
          </p>
        </div>

        {canManage && active && (
          <label
            className={cn(
              "relative -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted",
              "hover:bg-canvas hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text",
            )}
            title="Move to…"
          >
            <ArrowRightLeft aria-hidden="true" className="size-4" />
            <select
              aria-label={`Move ${card.name} to…`}
              value=""
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__reject") onRejectRequest();
                else if (value) onMove(value);
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            >
              <option value="" disabled>
                Move to…
              </option>
              {moveTargets.map((target) => (
                <option
                  key={target.key}
                  value={target.stageId ?? ""}
                  disabled={target.key === currentKey}
                >
                  {target.label}
                </option>
              ))}
              <option value="__reject">Reject…</option>
            </select>
          </label>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {card.flagged && (
          <Badge tone="warning" size="sm" icon={<Flag />}>
            Needs a look
            {(card.screening?.knockoutCount ?? 0) > 1
              ? `: ${String(card.screening?.knockoutCount)} answers`
              : ""}
          </Badge>
        )}
        {card.duplicate && (
          <Badge tone="neutral" size="sm" icon={<Link2 />}>
            Possible duplicate
          </Badge>
        )}
        {card.talentPool && (
          <Badge tone="info" size="sm" icon={<Star />}>
            Talent pool
          </Badge>
        )}
        <ScoreBadge score={card.score} />
        <AssessmentBadge score={card.screening?.assessment} />
        <BelowBadge below={card.screening?.belowPassMark === true} />
      </div>

      {card.screening && <FitBar fit={card.screening.fit} className="mt-2" />}

      {(shownTags.length > 0 || canManage) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {shownTags.map((tag) => (
            <Tag key={tag.id}>{tag.name}</Tag>
          ))}
          {moreTags > 0 && (
            <span className="text-meta text-muted">+{moreTags} more</span>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onEditTags}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-meta text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text"
              aria-label={`Tags and talent pool for ${card.name}`}
            >
              <Tags aria-hidden="true" className="size-3.5" />
              {card.tags.length === 0 ? "Add tag" : "Edit"}
            </button>
          )}
        </div>
      )}

      {!active && card.rejectionReason && (
        <p className="mt-2 text-meta text-muted">{card.rejectionReason}</p>
      )}
      {!active && (
        <DeletionLine
          day={card.scheduledDeletionOn}
          className="mt-1 text-meta text-muted"
        />
      )}

      <p
        className={cn(
          "mt-2 flex items-center gap-1 text-meta",
          stale ? "font-medium text-warning-text" : "text-muted",
        )}
        title={`In ${card.stageName ?? "this stage"} for ${ageWords(days).toLowerCase()}`}
      >
        <Clock aria-hidden="true" className="size-3" />
        <span className="tabular">{ageWords(days)}</span>
        <span className="sr-only"> in this stage</span>
      </p>
    </article>
  );
}
