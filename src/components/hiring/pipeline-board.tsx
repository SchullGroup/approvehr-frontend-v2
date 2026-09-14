"use client";

import { useCallback, useMemo } from "react";
import { Clock, GripVertical, MessageSquare, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, Badge, Money } from "@/components/ui";
import { DragGhost, useDragInto } from "@/components/ui/drag-into";
import { STAGES, fullName, type PipelineCard, type StageId } from "@/lib/types";
import { daysInStage } from "@/lib/mock/hiring";
import { stageTone } from "./stage-pill";

/*
 * The board is the recruiter's home. Columns are the pipeline stages in order,
 * so the left-to-right reading direction matches the direction a candidate
 * actually travels.
 *
 * Drag is not the only way to move someone — every card opens a panel with an
 * explicit "Advance" action. Drag is the accelerator, not the mechanism.
 *
 * ## It was the browser's drag-and-drop, and that is why it felt clunky
 *
 * `draggable` + `onDragStart` + `onDragOver` + `onDrop` is the HTML5 API, and
 * on the product's most drag-heavy screen it bought four problems:
 *
 * - **The browser drew the card being moved**, as its own translucent
 *   screenshot. No lift, no tilt, no shadow — none of the vocabulary every
 *   other draggable thing here speaks, because none of it is reachable from
 *   CSS on a native drag image.
 * - **It does not work on touch at all.** Not badly: at all. A recruiter on a
 *   phone had the Advance action and nothing else, and nothing said so.
 * - **A card off-screen was unreachable.** The board scrolls sideways and the
 *   native API does not auto-scroll, so moving somebody into a column past the
 *   fold was impossible without scrolling first, letting go, and starting over.
 * - **The drop landed with no settle** — the card simply appeared in its new
 *   column, which reads as a repaint rather than as an arrival.
 *
 * It is `useDragInto` now, the same pointer-event core the org chart uses, so
 * all four are answered by the thing that already answered them once.
 *
 * ## The handle exists to keep the card clickable
 *
 * A card opens a panel when you press it, so `onPointerDown` on the whole card
 * would make every click ambiguous — press-and-not-quite-still becomes a drag,
 * and a 3px wobble swallows the click. `Sortable` solved this with a dedicated
 * handle and so does this: the grip is the only thing that starts a drag, the
 * rest of the card is a button.
 *
 * It also fixes touch, which a movement threshold would not have: the handle
 * is `touch-none` so a drag from it never scrolls the board, while a finger
 * anywhere else on a card still pans the columns. A whole-card drag surface
 * would have had to choose between the two.
 *
 * The handle is a real `button`, and pressing it with the keyboard opens the
 * card — where Advance is. That is the honest keyboard path: reordering
 * columns by arrow key is a different feature, and a handle that did nothing
 * on Enter would be a control that looks operable and is not.
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

  /** Which stage a card is in now, so a drop back into it can be refused. */
  const stageOf = useCallback(
    (id: string): StageId | null =>
      cards.find((card) => card.id === id)?.stage ?? null,
    [cards],
  );

  /**
   * A column will not light up for a card that is already in it.
   *
   * Not a guard against a broken write — `onMove` to the same stage is
   * harmless — but against a lie: a column that highlights and then does
   * nothing on release teaches somebody the drop failed. The column they are
   * hovering is the one they are already in, and saying nothing is the
   * truthful answer.
   */
  const canDrop = useCallback(
    (moved: { id: string }, targetId: string) => stageOf(moved.id) !== targetId,
    [stageOf],
  );

  const onDrop = useCallback(
    (moved: { id: string }, targetId: string) => {
      /* `canDrop` has already refused a same-stage drop, and the cast is the
         narrowest place to turn a `data-drop-id` back into a `StageId`: the
         ids come from `STAGES` three lines up in the same render, and there is
         no other kind of drop target on this screen. */
      onMove(moved.id, targetId as StageId);
    },
    [onMove],
  );

  const { drag, start } = useDragInto({ onDrop, canDrop });

  const held = drag ? cards.find((card) => card.id === drag.id) : undefined;

  return (
    <div className="scroll-x -mx-5 px-5 sm:-mx-7 sm:px-7">
      <div className="flex min-w-max gap-3 pb-2">
        {columns.map((col) => {
          const items = byStage[col.id] ?? [];
          const isOver = drag?.over === col.id;

          return (
            <section
              key={col.id}
              aria-label={`${col.label}, ${items.length} candidates`}
              /* The whole column is the target, found by the browser's own hit
                 test rather than by `onDragOver`/`onDragLeave` — which fired
                 per child element and needed the "is it still me" dance to
                 keep the highlight from flickering as the pointer crossed a
                 card boundary inside the column it was already over. */
              data-drop-id={col.id}
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
                <h3 className="text-body-sm font-semibold text-ink">
                  {col.label}
                </h3>
                <span className="tabular ml-auto rounded-full bg-sunken px-1.5 py-0.5 text-meta font-semibold text-muted">
                  {items.length}
                </span>
              </header>

              <p className="border-b border-line px-3 py-2 text-meta leading-snug text-muted">
                {col.blurb}
              </p>

              {/* Cards */}
              <ul className="flex flex-1 flex-col gap-2 p-2">
                {items.map((card) => (
                  <li key={card.id}>
                    <CandidateCard
                      card={card}
                      dragging={drag?.id === card.id}
                      onGrab={start(card.id, "card")}
                      onOpen={() => onOpen(card)}
                    />
                  </li>
                ))}

                {items.length === 0 && (
                  <li className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-meta text-faint">
                    Nobody here yet
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Who is in the hand, by name. The org chart says "Moving…" because a
          department card carries no short label; here the name is the whole
          point — a recruiter moving one of nine people wants to see which. */}
      {drag && held && (
        <DragGhost x={drag.x} y={drag.y}>
          {fullName(held.candidate)}
        </DragGhost>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CandidateCard({
  card,
  dragging,
  onGrab,
  onOpen,
}: {
  card: PipelineCard;
  dragging: boolean;
  /** From `useDragInto`'s `start`. Goes on the grip, never on the card. */
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
  onOpen: () => void;
}) {
  const days = daysInStage(card);
  const stale = days >= 7;
  const pendingScorecards = card.scorecards.filter(
    (s) => !s.submittedAt,
  ).length;
  const name = fullName(card.candidate);

  return (
    /* `ahr-sortable-row` for the settle and `ahr-sortable-lifted` for the lift
       — the same two classes every other draggable thing in the product uses,
       so the tilt, the shadow and the reduced-motion outline are defined once
       in `globals.css` rather than per screen. The wrapper is what carries
       them; the classes style its child, which is why the article is nested.

       `opacity` is gone: the browser used to draw its own translucent copy of
       the card, so the original had to fade or there appeared to be two. The
       card itself moves now, and fading the thing in your hand reads as
       "this is being deleted". */
    <div
      className={cn(
        "ahr-sortable-row",
        dragging && "ahr-sortable-lifted relative z-10",
      )}
    >
      <article
        className={cn(
          "rounded-md border border-line bg-surface p-3 shadow-xs transition-shadow",
          "hover:shadow-sm",
        )}
      >
        <div className="flex items-start gap-1">
          {/* The only thing that starts a drag. `touch-none` so a drag from
              here never scrolls the board, while a finger anywhere else on the
              card still pans the columns.

              Enter and Space open the card, which is where Advance lives —
              see the note at the top on why that is the honest keyboard path
              rather than a dead control. */}
          <button
            type="button"
            onPointerDown={onGrab}
            onClick={onOpen}
            aria-label={`Move ${name}. Or open the card to advance them.`}
            className={cn(
              "mt-0.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint",
              "hover:bg-canvas hover:text-muted active:cursor-grabbing",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            )}
          >
            <GripVertical aria-hidden="true" className="size-3.5" />
          </button>

          {/* The whole card is reachable by keyboard through this one control. */}
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full min-w-0 items-start gap-2.5 text-left"
          >
            <Avatar name={name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium text-ink">
                {name}
              </span>
              <span className="block truncate text-meta text-muted">
                {card.candidate.currentTitle} · {card.candidate.currentCompany}
              </span>
            </span>
            {card.rating !== null && (
              <span className="tabular flex shrink-0 items-center gap-0.5 text-meta font-medium text-ink">
                <Star
                  aria-hidden="true"
                  className="size-3 fill-warning text-warning"
                />
                {card.rating}
              </span>
            )}
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-meta",
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
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-meta text-danger-text">
              <MessageSquare aria-hidden="true" className="size-3" />
              {pendingScorecards} scorecard{pendingScorecards > 1 ? "s" : ""}{" "}
              due
            </span>
          )}

          {card.offer && (
            <Badge tone="success" size="sm">
              <Money amount={card.offer.grossMonthly} compact />
            </Badge>
          )}
        </div>
      </article>
    </div>
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
          <span className="text-meta text-body">{s.label}</span>
          <span className="tabular text-body-sm font-semibold text-ink">
            {counts[s.id] ?? 0}
          </span>
        </li>
      ))}
    </ol>
  );
}

export { stageTone };
