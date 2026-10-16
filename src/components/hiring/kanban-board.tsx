"use client";

import { useCallback } from "react";
import {
  ArrowRightLeft,
  Clock,
  Flag,
  GripVertical,
  Link2,
  Star,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, Checkbox, Tag, TextLink } from "@/components/ui";
import { DragGhost, useDragInto } from "@/components/ui/drag-into";
import {
  ageWords,
  daysSince,
  STALE_AFTER_DAYS,
} from "@/lib/hiring/pipeline/age";
import { DeletionLine, ScoreBadge } from "@/components/hiring/card-bits";
import { columnKeyOf } from "@/lib/hiring/pipeline/columns";
import { channelLabel } from "@/lib/hiring/pipeline/filters";
import type { BoardCard, BoardColumn } from "@/lib/hiring/pipeline/model";
import type { BulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";
import type { Board, ColumnView } from "@/lib/hiring/pipeline/use-board";

/**
 * The recruiter's board: a column per stage, every column paged on its own.
 *
 * ## Three ways to move a card, because dragging is only one of them
 *
 * - **Drag** the grip, mouse or touch. The grip alone starts a drag, so a finger
 *   anywhere else on a card still scrolls the board sideways.
 * - **Move to…**: a real `<select>` laid over an icon, so a phone gets its own
 *   picker and a keyboard gets arrow keys. It is on every card.
 * - **Open the person** and use the record's own move controls.
 *
 * Dropping on the Rejected column asks for a reason first, because turning
 * somebody down is a decision with a record. Nobody is dropped into Hired:
 * people are hired by accepting an offer, so that column does not light up.
 *
 * ## Whose rule is it
 *
 * The board says what the screen knows: a card is not offered a stage that is the
 * one it is already in, and Hired is not offered at all. Everything else — a
 * scorecard missing, an offer already out — is the API's rule, and when it refuses
 * the screen shows the API's sentence and puts the card back.
 *
 * ## On a phone
 *
 * The columns keep their width and the board scrolls sideways, snapping to a
 * column, rather than squeezing five columns into 375 pixels.
 */

const COLUMN_RULE: Record<"stage" | "HIRED" | "REJECTED", string> = {
  stage: "border-t-accent",
  HIRED: "border-t-success-strong",
  REJECTED: "border-t-danger",
};

export function KanbanBoard({
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
  /** The stages a card can be moved into, in order. */
  moveTargets: readonly BoardColumn[];
  onMove: (card: BoardCard, stageId: string) => void;
  onRejectRequest: (card: BoardCard) => void;
  onEditTags: (card: BoardCard) => void;
}) {
  const findCard = useCallback(
    (id: string): BoardCard | undefined => {
      for (const column of board.columns) {
        const found = column.cards.find((card) => card.id === id);
        if (found) return found;
      }
      return undefined;
    },
    [board.columns],
  );

  const order = board.columns.map((view) => view.column);

  const canDrop = useCallback(
    (moved: { id: string }, targetKey: string) => {
      if (!canManage) return false;
      const target = order.find((column) => column.key === targetKey);
      if (!target) return false;
      /* Nobody is dragged into Hired: an accepted offer puts them there. */
      if (target.ends === "HIRED") return false;
      const card = findCard(moved.id);
      if (!card || !isActive(card)) return false;
      return columnKeyOf(card, order) !== targetKey;
    },
    // `order` is rebuilt each render; the columns themselves are the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, findCard, board.columns],
  );

  const onDrop = useCallback(
    (moved: { id: string }, targetKey: string) => {
      const card = findCard(moved.id);
      const target = board.columns.find(
        (view) => view.column.key === targetKey,
      )?.column;
      if (!card || !target) return;
      if (target.ends === "REJECTED") {
        onRejectRequest(card);
        return;
      }
      if (target.stageId) onMove(card, target.stageId);
    },
    [findCard, board.columns, onMove, onRejectRequest],
  );

  const { drag, start } = useDragInto({ onDrop, canDrop });
  const held = drag ? findCard(drag.id) : undefined;

  return (
    <div
      aria-busy={board.settling}
      className={cn(
        /* `relative` is load-bearing: the checkboxes carry `sr-only` text, which is
           absolutely positioned, and without a positioned ancestor inside the
           scroller its containing block is the page, so it escapes the board's
           clipping and widens the whole document. */
        "scroll-x relative snap-x snap-mandatory -mx-5 px-5 pb-2 sm:-mx-7 sm:px-7",
        "transition-opacity",
        board.settling && "opacity-60",
      )}
    >
      <div className="flex min-w-max items-start gap-3">
        {board.columns.map((view) => (
          <Column
            key={view.column.key}
            view={view}
            over={drag?.over === view.column.key}
            draggingId={drag?.id ?? null}
            canManage={canManage}
            today={today}
            timeZone={timeZone}
            selection={selection}
            moveTargets={moveTargets}
            order={order}
            onGrab={start}
            onLoadMore={() => board.loadMore(view.column.key)}
            onMove={onMove}
            onRejectRequest={onRejectRequest}
            onEditTags={onEditTags}
          />
        ))}
      </div>

      {drag && held && (
        <DragGhost x={drag.x} y={drag.y}>
          {held.name}
        </DragGhost>
      )}
    </div>
  );
}

const isActive = (card: BoardCard): boolean =>
  card.outcome === "IN_PROGRESS" || card.outcome === "OFFER_MADE";

/* -------------------------------------------------------------------------- */

function Column({
  view,
  over,
  draggingId,
  canManage,
  today,
  timeZone,
  selection,
  moveTargets,
  order,
  onGrab,
  onLoadMore,
  onMove,
  onRejectRequest,
  onEditTags,
}: {
  view: ColumnView;
  over: boolean;
  draggingId: string | null;
  canManage: boolean;
  today: string;
  timeZone: string;
  selection: BulkSelection;
  moveTargets: readonly BoardColumn[];
  order: readonly BoardColumn[];
  onGrab: (
    id: string,
    kind: string,
  ) => (event: React.PointerEvent<HTMLElement>) => void;
  onLoadMore: () => void;
  onMove: (card: BoardCard, stageId: string) => void;
  onRejectRequest: (card: BoardCard) => void;
  onEditTags: (card: BoardCard) => void;
}) {
  const { column, cards } = view;
  const total = view.total ?? cards.length;
  const ids = cards.map((card) => card.id);
  const rule = COLUMN_RULE[column.ends ?? "stage"];
  const left = Math.max(0, total - cards.length);

  return (
    <section
      aria-label={`${column.label}, ${String(total)} ${total === 1 ? "person" : "people"}`}
      data-drop-id={column.key}
      className={cn(
        "flex w-[min(82vw,17.5rem)] shrink-0 snap-start flex-col rounded-lg border border-t-[3px] transition-colors sm:w-72",
        rule,
        over ? "border-accent bg-accent-soft" : "border-line bg-canvas",
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        {canManage && cards.length > 0 && (
          <Checkbox
            hiddenLabel={`Select everyone shown in ${column.label}`}
            checked={selection.allOf(ids)}
            indeterminate={selection.someOf(ids)}
            disabled={Boolean(selection.everyone)}
            onChange={() => selection.toggleMany(ids)}
          />
        )}
        <h3 className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink">
          {column.label}
        </h3>
        <Badge tone="neutral" size="sm" className="tabular">
          {total}
        </Badge>
      </header>

      <ul className="flex flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <li className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-meta text-faint">
            Nobody here
          </li>
        ) : (
          cards.map((card) => (
            <li key={card.id}>
              <Card
                card={card}
                dragging={draggingId === card.id}
                canManage={canManage}
                today={today}
                timeZone={timeZone}
                selection={selection}
                moveTargets={moveTargets}
                order={order}
                onGrab={onGrab(card.id, "candidate")}
                onMove={(stageId) => onMove(card, stageId)}
                onRejectRequest={() => onRejectRequest(card)}
                onEditTags={() => onEditTags(card)}
              />
            </li>
          ))
        )}
      </ul>

      {(view.hasMore || view.moreError) && (
        <div className="flex flex-col gap-2 border-t border-line p-2">
          {view.moreError && (
            <p role="alert" className="text-meta text-danger-text">
              {view.moreError.message}
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            block
            loading={view.loadingMore}
            disabled={view.loadingMore}
            onClick={onLoadMore}
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

function Card({
  card,
  dragging,
  canManage,
  today,
  timeZone,
  selection,
  moveTargets,
  order,
  onGrab,
  onMove,
  onRejectRequest,
  onEditTags,
}: {
  card: BoardCard;
  dragging: boolean;
  canManage: boolean;
  today: string;
  timeZone: string;
  selection: BulkSelection;
  moveTargets: readonly BoardColumn[];
  order: readonly BoardColumn[];
  /** From `useDragInto`'s `start`. Goes on the grip, never on the card. */
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
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
    <div
      data-card-id={card.id}
      className={cn(
        "ahr-sortable-row",
        dragging && "ahr-sortable-lifted relative z-10",
      )}
    >
      <article
        className={cn(
          "relative rounded-md border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-sm",
          "focus-within:ring-2 focus-within:ring-accent/40",
        )}
      >
        <div className="flex items-start gap-1.5">
          {canManage && active && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onPointerDown={onGrab}
              className={cn(
                "-ml-1 mt-0.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-faint",
                "hover:bg-canvas hover:text-muted active:cursor-grabbing",
              )}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          )}

          {canManage && (
            <Checkbox
              className="mt-0.5"
              hiddenLabel={`Select ${card.name}`}
              checked={selection.isSelected(card.id)}
              disabled={Boolean(selection.everyone)}
              onChange={() => selection.toggle(card.id)}
            />
          )}

          <div className="min-w-0 flex-1 space-y-1.5">
            <TextLink
              href={`/hiring/candidates/${card.id}`}
              className="block break-words text-body-sm font-medium"
            >
              {card.name}
            </TextLink>
            <p className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
              {card.reference && (
                <span className="tabular">{card.reference}</span>
              )}
              {card.source && <span>{channelLabel(card.source)}</span>}
            </p>
          </div>

          {canManage && active && (
            <label
              className={cn(
                "relative -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted [@media(pointer:coarse)]:size-10",
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

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.flagged && (
            <Badge tone="warning" size="sm" icon={<Flag />}>
              Needs a look
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
        </div>

        {(shownTags.length > 0 || canManage) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-meta text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-2.5"
                aria-label={`Tags and talent pool for ${card.name}`}
              >
                <Tags aria-hidden="true" className="size-3" />
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
    </div>
  );
}
