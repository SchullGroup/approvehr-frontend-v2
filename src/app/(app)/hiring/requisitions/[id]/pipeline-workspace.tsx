"use client";

import { useMemo, useState } from "react";
import { TriangleAlert, UserRoundPlus } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  BulkBar,
  BulkResults,
  type BulkChoice,
} from "@/components/hiring/bulk-bar";
import {
  BulkMoveDialog,
  BulkPoolDialog,
  BulkTagDialog,
  EveryoneDialog,
} from "@/components/hiring/bulk-dialogs";
import { CandidateTagsDialog } from "@/components/hiring/candidate-tags-dialog";
import { KanbanBoard } from "@/components/hiring/kanban-board";
import { MoveEmailDialog } from "@/components/hiring/move-email-dialog";
import { StageComms } from "@/components/hiring/stage-comms";
import { PipelineFilters } from "@/components/hiring/pipeline-filters";
import { useScoreFilterState } from "@/components/hiring/screening/score-filters";
import { scoresAreSent } from "@/lib/hiring/screening/score";
import { PipelineTable } from "@/components/hiring/pipeline-table";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import { noticeSentence } from "@/lib/hiring/comms/status";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import {
  useEmailReadiness,
  useStageMail,
} from "@/lib/hiring/pipeline/use-comms";
import { downloadCsv } from "@/lib/csv";
import { usePipelineToday } from "@/lib/hiring/pipeline/age";
import {
  appliedChips,
  filterKey,
  hasFilters,
} from "@/lib/hiring/pipeline/filters";
import type {
  BoardCard,
  BoardFilters,
  BulkAction,
  BulkOutcome,
  BulkProgress,
  BulkTarget,
} from "@/lib/hiring/pipeline/model";
import { useBoard, type ColumnView } from "@/lib/hiring/pipeline/use-board";
import {
  useBulkSelection,
  type BulkSelection,
} from "@/lib/hiring/pipeline/use-bulk-selection";
import {
  usePipelineGateway,
  useRejectionReasons,
  useTags,
} from "@/lib/hiring/pipeline/use-pipeline";
import { usePipelineView } from "@/lib/hiring/pipeline/use-view";
import { useCan } from "@/lib/permissions";
import { useDebounced } from "@/lib/use-debounced";
import { PhoneStages } from "./phone-stages";
import { usePhone } from "./use-phone";
import { ViewSwitch } from "./view-switch";

/**
 * One role's people, as a board or a table, with the same filters, the same
 * selection and the same actions on both.
 *
 * ## What it owns
 *
 * The filters, the selection and the handful of dialogs. The data belongs to the
 * board: a page per column, with the server's count for each. The table is the same
 * data as rows, so switching view asks for nothing and loses nothing. Every write
 * goes through the gateway, which is the API when connected and the browser's own
 * book in a demo, so nothing here knows which.
 *
 * ## What it will not do
 *
 * It never rejects anybody on its own, never sends an email on its own, and never
 * acts on "everyone matching" without the exact count having been confirmed. Every
 * refusal is shown in the API's own words, next to the person it was about.
 */

type Offer = { count: number; where: string; column: string };

/**
 * The offer to widen a selection to everyone the filters match in a column.
 *
 * Made only once everything shown in a column is ticked and there is more behind
 * it, so it reads as the next step of what the person is already doing rather than
 * as a button that appears from nowhere.
 */
function everyoneOffer(
  selection: BulkSelection,
  columns: readonly ColumnView[],
): Offer | null {
  if (selection.everyone) return null;
  for (const column of columns) {
    const ids = column.cards.map((card) => card.id);
    const count = column.total ?? 0;
    if (
      ids.length > 0 &&
      column.hasMore &&
      count > ids.length &&
      selection.allOf(ids)
    ) {
      return {
        count,
        where: `in ${column.column.label}`,
        column: column.column.key,
      };
    }
  }
  return null;
}

/** One per click. The same key is the same action, so a double click is one. */
const newKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

type Rejecting = { kind: "one"; card: BoardCard } | { kind: "many" };

export function PipelineWorkspace({
  requisitionId,
}: {
  requisitionId: string;
}) {
  const gateway = usePipelineGateway();
  const canManage = useCan("MANAGE_HIRING");
  const toast = useToast();
  const { today, timeZone } = usePipelineToday();
  const tags = useTags();
  const reasons = useRejectionReasons();
  const [view, setView] = usePipelineView();
  /* A phone gets the board one stage at a time; see `phone-stages.tsx`. */
  const phone = usePhone();

  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const [filters, setFilters] = useState<BoardFilters>({});
  /* The score filters and the sort. Held here, beside the others, because the
     board's columns, the table and the "select everyone matching" count all ask
     the one question. */
  const score = useScoreFilterState();
  const stale = search.trim() !== query;

  /* What is actually asked: the typed search only once it has settled. */
  const asked: BoardFilters = useMemo(
    () => ({
      ...filters,
      ...(query ? { q: query } : {}),
      ...score.filters,
      ...(score.sort !== "newest" ? { sort: score.sort } : {}),
    }),
    [filters, query, score.filters, score.sort],
  );

  const board = useBoard({ gateway, requisitionId, filters: asked });
  /* Which stages send an email when somebody is moved in, and whether one would
     actually leave. Asked once, so a move can say so before it is made. */
  const mail = useStageMail(requisitionId, canManage);
  const readiness = useEmailReadiness(canManage);
  const emailsSupported = readiness.data?.supported === true;
  /* Nobody is moved into Hired by hand (an accepted offer puts them there) and
     Rejected has its own action with a reason, so neither is a place to move to. */
  const moveTargets = board.columns
    .map((column) => column.column)
    .filter((column) => column.ends === null && column.stageId !== null);

  const scope = JSON.stringify([requisitionId, filterKey(asked)]);
  const selection = useBulkSelection(scope);
  const [everyoneColumn, setEveryoneColumn] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState<Rejecting | null>(null);
  const [moving, setMoving] = useState<{
    card: BoardCard;
    stageId: string;
  } | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [tagsFor, setTagsFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "move" | "tag" | "untag" | "pool-add" | "pool-remove" | "everyone" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [results, setResults] = useState<{
    what: string;
    outcome: BulkOutcome;
  } | null>(null);

  const cardsOnScreen: BoardCard[] = board.columns.flatMap(
    (column) => column.cards,
  );
  const tagsCard = tagsFor
    ? (cardsOnScreen.find((card) => card.id === tagsFor) ?? null)
    : null;

  /* -------------------------------------------------------- single writes */

  /**
   * A card was dropped on a stage. If the stage sends an email, ask first: the API
   * sends it unless told not to, and nobody should be emailed by a drag. If it is
   * not known whether the stage sends one, nothing is sent.
   */
  function askToMove(card: BoardCard, stageId: string) {
    if (emailsSupported && mail.known && mail.byStage.has(stageId)) {
      setMoving({ card, stageId });
      return;
    }
    void move(card, stageId, false);
  }

  async function move(card: BoardCard, stageId: string, sendEmail: boolean) {
    const to = moveTargets.find((column) => column.stageId === stageId);
    setMoveBusy(true);
    try {
      const result = await board.move(card, stageId, { sendEmail });
      const said = noticeSentence(result.email, card.name);
      toast.push({
        title: `${card.name} moved to ${to?.label ?? "the new stage"}`,
        tone:
          said && said.tone !== "success" && said.tone !== "info"
            ? "warning"
            : "success",
        ...(said ? { detail: said.text } : {}),
      });
    } catch (error) {
      /* The board has already put the card back. Say why, in the API's words. */
      toast.push({
        title: `${card.name} was not moved`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setMoveBusy(false);
      setMoving(null);
    }
  }

  async function rejectOne(
    card: BoardCard,
    choice: { reasonId: string; note: string | null; sendEmail: boolean },
  ) {
    setRejectBusy(true);
    setRejectError(null);
    try {
      const result = await board.reject(card, choice);
      /* The card is already in the Rejected column; a quiet refresh brings the
         reason the API wrote with it. */
      board.reload();
      setRejecting(null);
      const said = noticeSentence(result.email, card.name);
      toast.push({
        title: `${card.name} rejected`,
        tone:
          said && (said.tone === "warning" || said.tone === "danger")
            ? "warning"
            : "info",
        detail: said
          ? `The reason is on their record. ${said.text}`
          : "The reason is on their record. Nothing was sent to them.",
      });
    } catch (error) {
      setRejectError(sentenceOf(error));
    } finally {
      setRejectBusy(false);
    }
  }

  async function toggleTag(
    card: BoardCard,
    tag: { id: string; name: string },
    on: boolean,
  ) {
    const before = card;
    board.patch(card.id, (c) => ({
      ...c,
      tags: on
        ? c.tags.some((t) => t.id === tag.id)
          ? c.tags
          : [...c.tags, { id: tag.id, name: tag.name }]
        : c.tags.filter((t) => t.id !== tag.id),
    }));
    try {
      await gateway.setTag(card, tag.id, on);
    } catch (error) {
      board.patch(card.id, () => before);
      toast.push({
        title: `${card.name}'s tags were not changed`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  async function togglePool(card: BoardCard, on: boolean) {
    const before = card;
    board.patch(card.id, (c) => ({ ...c, talentPool: on }));
    try {
      await gateway.setTalentPool(card, on);
      toast.push({
        title: on
          ? `${card.name} is in the talent pool`
          : `${card.name} is out of the talent pool`,
        tone: "success",
      });
    } catch (error) {
      board.patch(card.id, () => before);
      toast.push({
        title: `${card.name} was not changed`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  async function createTag(card: BoardCard, name: string) {
    try {
      const tag = await gateway.tags.create(name);
      tags.reload();
      await toggleTag(card, tag, true);
    } catch (error) {
      toast.push({
        title: "The tag was not made",
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  /* -------------------------------------------------------------- bulk work */

  const target = (): BulkTarget =>
    selection.everyone && everyoneColumn
      ? {
          kind: "filter",
          requisitionId,
          column: everyoneColumn,
          filters: asked,
          expected: selection.everyone.count,
        }
      : { kind: "ids", requisitionId, ids: [...selection.picked] };

  async function run(action: BulkAction, what: string) {
    setBusy(true);
    setProgress(null);
    setResults(null);
    try {
      const done = await gateway.bulk({
        target: target(),
        action,
        idempotencyKey: newKey(),
        signal: new AbortController().signal,
        onProgress: setProgress,
      });
      setResults({ what, outcome: done });
      selection.clear();
      setRejecting(null);
      setDialog(null);
      board.reload();
    } catch (error) {
      toast.push({
        title: "Nothing was changed",
        tone: "danger",
        detail: sentenceOf(error),
      });
      setRejectError(sentenceOf(error));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function exportSelected() {
    try {
      const file = await gateway.exportCards(target());
      downloadCsv(file.filename, file.body);
      toast.push({ title: `Downloaded ${file.filename}`, tone: "success" });
    } catch (error) {
      toast.push({
        title: "Nothing was downloaded",
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  function choose(choice: BulkChoice) {
    switch (choice) {
      case "move":
      case "tag":
      case "untag":
      case "pool-add":
      case "pool-remove":
      case "everyone":
        setDialog(choice);
        return;
      case "reject":
        setRejectError(null);
        setRejecting({ kind: "many" });
        return;
      case "export":
        void exportSelected();
        return;
      case "clear":
        selection.clear();
        return;
    }
  }

  const offer = canManage ? everyoneOffer(selection, board.columns) : null;

  const chips = appliedChips(
    { ...asked },
    {
      tags: tags.items,
      clear: (key) =>
        setFilters((now) => {
          const next = { ...now };
          delete next[key];
          return next;
        }),
    },
  );

  /* ------------------------------------------------------------- the views */

  const narrowed = hasFilters(asked);
  const empty =
    !board.loading &&
    board.error === null &&
    board.columns.length > 0 &&
    board.columns.every((column) => column.cards.length === 0);
  const total =
    board.columns.length > 0 && board.columns.every((c) => c.total !== null)
      ? board.columns.reduce((sum, c) => sum + (c.total ?? 0), 0)
      : undefined;

  const subject =
    rejecting?.kind === "one"
      ? rejecting.card.name
      : `${selection.size.toLocaleString("en-NG")} ${selection.size === 1 ? "person" : "people"}`;

  const askToReject = (card: BoardCard) => {
    setRejectError(null);
    setRejecting({ kind: "one", card });
  };

  return (
    <div className="flex flex-col gap-4">
      {DEMO_ENABLED && gateway.mode === "demo" && (
        <Callout tone="info" title="A practice board">
          Moves, tags and rejections here are kept in this browser and nothing
          is sent to anybody.
        </Callout>
      )}

      <PipelineFilters
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onChange={setFilters}
        tags={tags.items}
        count={total}
        score={score}
        scoresShown={scoresAreSent(
          cardsOnScreen,
          score.narrowed || score.sort !== "newest",
        )}
        actions={
          <ViewSwitch
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Board" },
              { value: "table", label: "Table" },
            ]}
          />
        }
      />

      {canManage && (
        <BulkBar
          selection={selection}
          busy={busy}
          progress={progress}
          offer={offer ? { count: offer.count, where: offer.where } : null}
          onChoose={choose}
        />
      )}

      {results && (
        <BulkResults
          what={results.what}
          outcome={results.outcome}
          onDismiss={() => setResults(null)}
        />
      )}

      {board.loading ? (
        <div>
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-48 w-72 shrink-0" />
            ))}
          </div>
          <span className="sr-only-focusable">Loading this pipeline</span>
        </div>
      ) : board.error ? (
        <EmptyState
          icon={<TriangleAlert aria-hidden="true" />}
          title="Could not load this pipeline"
          description={board.error.message}
          action={
            <Button variant="secondary" size="sm" onClick={board.reload}>
              Try again
            </Button>
          }
        />
      ) : empty ? (
        <EmptyState
          icon={<UserRoundPlus aria-hidden="true" />}
          title={narrowed ? "Nobody matches" : "No candidates yet"}
          description={
            narrowed
              ? "Nobody on this role fits the search and filters above."
              : "Somebody joins this board when a screener screens them in from the application queue."
          }
          action={
            narrowed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilters({});
                  score.clear();
                }}
              >
                Clear the search and filters
              </Button>
            ) : (
              <ButtonLink
                href="/hiring/postings/applications"
                variant="accent"
                size="sm"
              >
                Open the application queue
              </ButtonLink>
            )
          }
        />
      ) : view === "board" ? (
        <div className={stale ? "opacity-60 transition-opacity" : undefined}>
          {phone ? (
            <PhoneStages
              board={board}
              canManage={canManage}
              today={today}
              timeZone={timeZone}
              selection={selection}
              moveTargets={moveTargets}
              onMove={askToMove}
              onRejectRequest={askToReject}
              onEditTags={(card) => setTagsFor(card.id)}
            />
          ) : (
            <KanbanBoard
              board={board}
              canManage={canManage}
              today={today}
              timeZone={timeZone}
              selection={selection}
              moveTargets={moveTargets}
              onMove={askToMove}
              onRejectRequest={askToReject}
              onEditTags={(card) => setTagsFor(card.id)}
            />
          )}
        </div>
      ) : (
        <div className={stale ? "opacity-60 transition-opacity" : undefined}>
          <PipelineTable
            board={board}
            canManage={canManage}
            today={today}
            timeZone={timeZone}
            selection={selection}
            moveTargets={moveTargets}
            onMove={askToMove}
            onRejectRequest={askToReject}
            onEditTags={(card) => setTagsFor(card.id)}
          />
        </div>
      )}

      {canManage && mail.stages && mail.catalog && emailsSupported && (
        <StageComms
          requisitionId={requisitionId}
          gateway={gateway}
          stages={mail.stages}
          catalog={mail.catalog}
          canManage={canManage}
          onChanged={mail.reload}
        />
      )}

      <RejectDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        subject={subject}
        reasons={reasons.items}
        busy={rejectBusy || busy}
        error={rejectError}
        emailOffer={
          canManage && emailsSupported
            ? {
                label:
                  rejecting?.kind === "many"
                    ? "Send a decline email to each person"
                    : "Send them a decline email",
                description:
                  "Off unless you tick it. Rejecting never emails anybody by itself.",
                blockedBy: readiness.data?.blockedBy ?? [],
              }
            : null
        }
        onConfirm={(choice) => {
          if (rejecting?.kind === "one") void rejectOne(rejecting.card, choice);
          else
            void run(
              {
                type: "reject",
                reasonId: choice.reasonId,
                note: choice.note,
                sendEmail: choice.sendEmail,
              },
              "Rejected",
            );
        }}
      />

      <MoveEmailDialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        who={moving?.card.name ?? ""}
        stage={
          moveTargets.find((column) => column.stageId === moving?.stageId)
            ?.label ?? "this stage"
        }
        mail={(moving && mail.byStage.get(moving.stageId)) || null}
        readiness={readiness.data}
        busy={moveBusy}
        onChoose={(send) =>
          moving && void move(moving.card, moving.stageId, send)
        }
      />

      <BulkMoveDialog
        open={dialog === "move"}
        onClose={() => setDialog(null)}
        count={selection.size}
        targets={moveTargets}
        mailOf={(stageId) =>
          emailsSupported ? (mail.byStage.get(stageId) ?? null) : null
        }
        readiness={readiness.data}
        onConfirm={(stageId, name, sendEmail) =>
          void run({ type: "move", stageId, sendEmail }, `Moved to ${name}`)
        }
      />

      <BulkTagDialog
        open={dialog === "tag" || dialog === "untag"}
        onClose={() => setDialog(null)}
        count={selection.size}
        tags={tags.items}
        mode={dialog === "untag" ? "untag" : "tag"}
        onConfirm={(tag) =>
          void run(
            { type: dialog === "untag" ? "untag" : "tag", tagId: tag.id },
            dialog === "untag"
              ? `Took "${tag.name}" off`
              : `Tagged "${tag.name}"`,
          )
        }
      />

      <BulkPoolDialog
        open={dialog === "pool-add" || dialog === "pool-remove"}
        onClose={() => setDialog(null)}
        count={selection.size}
        on={dialog === "pool-add"}
        onConfirm={() =>
          void run(
            { type: "talent-pool", on: dialog === "pool-add" },
            dialog === "pool-add"
              ? "Kept in the talent pool"
              : "Taken out of the talent pool",
          )
        }
      />

      <EveryoneDialog
        open={dialog === "everyone" && offer !== null}
        onClose={() => setDialog(null)}
        count={offer?.count ?? 0}
        where={offer?.where ?? "on this role"}
        applied={chips}
        onConfirm={() => {
          if (!offer) return;
          setEveryoneColumn(offer.column);
          selection.chooseEveryone(offer.count);
          setDialog(null);
        }}
      />

      <CandidateTagsDialog
        open={tagsFor !== null}
        onClose={() => setTagsFor(null)}
        card={tagsCard}
        tags={tags.items}
        onToggleTag={toggleTag}
        onTogglePool={togglePool}
        onCreateTag={createTag}
      />
    </div>
  );
}
