"use client";

import { Clock, Flag, Link2, Star, Tags } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Select,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tag,
  TextLink,
} from "@/components/ui";
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

/**
 * The same people as the board, as rows.
 *
 * Board and table are two views of one set of data, not two features: the same
 * columns, the same counts, the same filters, the same selection, the same
 * "Move to…" and the same refusals. Switching view never changes what can be done,
 * only how much is seen at once, and it does not ask the server again — it draws
 * what the board already holds.
 *
 * ## Rows grouped by stage, not one long list
 *
 * Each stage is its own section with its own count and its own "Load more",
 * because that is how the server pages them: a stage is a question with a true
 * count, and a single list that mixed forty applicants with two interviewees would
 * have no honest total to put above it.
 */

const OUTCOME_TONE = {
  IN_PROGRESS: "info",
  OFFER_MADE: "warning",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
} as const;

const OUTCOME_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  OFFER_MADE: "Offer made",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const isActive = (card: BoardCard): boolean =>
  card.outcome === "IN_PROGRESS" || card.outcome === "OFFER_MADE";

export function PipelineTable({
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
  const order = board.columns.map((view) => view.column);

  return (
    <div
      aria-busy={board.settling}
      className={board.settling ? "opacity-60 transition-opacity" : undefined}
    >
      <div className="flex flex-col gap-6">
        {board.columns.map((view) => (
          <Section
            key={view.column.key}
            view={view}
            order={order}
            canManage={canManage}
            today={today}
            timeZone={timeZone}
            selection={selection}
            moveTargets={moveTargets}
            onLoadMore={() => board.loadMore(view.column.key)}
            onMove={onMove}
            onRejectRequest={onRejectRequest}
            onEditTags={onEditTags}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
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

  const moveSelect = (card: BoardCard) =>
    canManage && isActive(card) ? (
      <Select
        aria-label={`Move ${card.name} to…`}
        value=""
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "__reject") onRejectRequest(card);
          else if (value) onMove(card, value);
        }}
        className="w-auto"
      >
        <option value="" disabled>
          Move to…
        </option>
        {moveTargets.map((target) => (
          <option
            key={target.key}
            value={target.stageId ?? ""}
            disabled={target.key === columnKeyOf(card, order)}
          >
            {target.label}
          </option>
        ))}
        <option value="__reject">Reject…</option>
      </Select>
    ) : null;

  const chips = (card: BoardCard) => (
    <div className="flex flex-wrap items-center gap-1.5">
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
      {card.tags.map((tag) => (
        <Tag key={tag.id}>{tag.name}</Tag>
      ))}
      {canManage && (
        <button
          type="button"
          onClick={() => onEditTags(card)}
          aria-label={`Tags and talent pool for ${card.name}`}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-meta text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-2.5"
        >
          <Tags aria-hidden="true" className="size-3" />
          {card.tags.length === 0 ? "Add tag" : "Edit"}
        </button>
      )}
    </div>
  );

  const age = (card: BoardCard) => {
    const days = daysSince(card.stageEnteredAt, today, timeZone);
    const stale = isActive(card) && days >= STALE_AFTER_DAYS;
    return (
      <span
        className={`tabular inline-flex items-center gap-1 ${stale ? "font-medium text-warning-text" : "text-muted"}`}
      >
        <Clock aria-hidden="true" className="size-3" />
        {ageWords(days)}
      </span>
    );
  };

  return (
    <section
      aria-label={`${column.label}, ${String(total)} ${total === 1 ? "person" : "people"}`}
    >
      <div className="mb-2 flex items-center gap-2">
        {canManage && cards.length > 0 && (
          <Checkbox
            hiddenLabel={`Select everyone shown in ${column.label}`}
            checked={selection.allOf(ids)}
            indeterminate={selection.someOf(ids)}
            disabled={Boolean(selection.everyone)}
            onChange={() => selection.toggleMany(ids)}
          />
        )}
        <h3 className="text-body-sm font-semibold text-ink">{column.label}</h3>
        <Badge tone="neutral" size="sm" className="tabular">
          {total}
        </Badge>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-meta text-faint">
          Nobody here
        </p>
      ) : (
        <>
          <div className="hidden sm:block">
            <TableWrap caption={`${column.label}: their stage and outcome`}>
              <THead>
                {canManage && (
                  <TH>
                    <span className="sr-only">Select</span>
                  </TH>
                )}
                <TH>Candidate</TH>
                <TH>Outcome</TH>
                <TH>Flags and tags</TH>
                <TH>Heard via</TH>
                <TH>In stage</TH>
                {canManage && <TH align="right">Move</TH>}
              </THead>
              <TBody>
                {cards.map((card) => (
                  <TR key={card.id}>
                    {canManage && (
                      <TD>
                        <Checkbox
                          hiddenLabel={`Select ${card.name}`}
                          checked={selection.isSelected(card.id)}
                          disabled={Boolean(selection.everyone)}
                          onChange={() => selection.toggle(card.id)}
                        />
                      </TD>
                    )}
                    <TDPrimary
                      title={
                        <TextLink href={`/hiring/candidates/${card.id}`}>
                          {card.name}
                        </TextLink>
                      }
                      subtitle={[card.email, card.reference]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <TD>
                      <Badge tone={OUTCOME_TONE[card.outcome]} size="sm">
                        {OUTCOME_LABEL[card.outcome] ?? card.outcome}
                      </Badge>
                      {card.rejectionReason && (
                        <p className="mt-0.5 text-meta text-muted">
                          {card.rejectionReason}
                        </p>
                      )}
                    </TD>
                    <TD>{chips(card)}</TD>
                    <TD>{card.source ? channelLabel(card.source) : "—"}</TD>
                    <TD>{age(card)}</TD>
                    {canManage && <TD align="right">{moveSelect(card)}</TD>}
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>

          <ul className="divide-y divide-line sm:hidden">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start gap-2.5">
                  {canManage && (
                    <Checkbox
                      hiddenLabel={`Select ${card.name}`}
                      checked={selection.isSelected(card.id)}
                      disabled={Boolean(selection.everyone)}
                      onChange={() => selection.toggle(card.id)}
                    />
                  )}
                  <div className="min-w-0">
                    <TextLink href={`/hiring/candidates/${card.id}`}>
                      {card.name}
                    </TextLink>
                    <p className="text-body-sm text-muted">
                      {[card.email, card.reference].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={OUTCOME_TONE[card.outcome]} size="sm">
                    {OUTCOME_LABEL[card.outcome] ?? card.outcome}
                  </Badge>
                  {age(card)}
                </div>
                {chips(card)}
                {card.rejectionReason && (
                  <p className="text-meta text-muted">{card.rejectionReason}</p>
                )}
                {moveSelect(card)}
              </li>
            ))}
          </ul>
        </>
      )}

      {(view.hasMore || view.moreError) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-meta text-muted" aria-live="polite">
            Showing {cards.length} of {total}
          </p>
          {view.moreError && (
            <p role="alert" className="text-meta text-danger-text">
              {view.moreError.message}
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
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
