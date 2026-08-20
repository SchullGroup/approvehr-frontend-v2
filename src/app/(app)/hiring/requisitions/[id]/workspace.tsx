"use client";

import { useMemo, useState } from "react";
import { Columns3, Filter, Table2, UserRoundPlus } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Money,
  SegmentedControl,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PipelineBoard, StageStrip } from "@/components/hiring/pipeline-board";
import { CandidatePanel } from "@/components/hiring/candidate-panel";
import { StagePill } from "@/components/hiring/stage-pill";
import { daysInStage } from "@/lib/mock/hiring";
import {
  STAGE_IDS,
  fullName,
  stageIndex,
  type PipelineCard,
  type StageId,
} from "@/lib/types";

/**
 * Board and table are two views of one list, not two features. They share the
 * same state, the same panel and the same actions — switching view never
 * changes what you can do, only how much you can see at once.
 */
export function RequisitionWorkspace({
  initialCards,
  activeStages,
}: {
  initialCards: PipelineCard[];
  activeStages: StageId[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [view, setView] = useState<"board" | "table">("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const toast = useToast();

  const active = useMemo(
    () => cards.filter((c) => showRejected || c.outcome === "in_progress"),
    [cards, showRejected],
  );

  const counts = useMemo(() => {
    const map = Object.fromEntries(STAGE_IDS.map((s) => [s, 0])) as Record<
      StageId,
      number
    >;
    for (const c of cards) {
      if (c.outcome === "in_progress") map[c.stage] += 1;
    }
    return map;
  }, [cards]);

  const openCard = cards.find((c) => c.id === openId) ?? null;
  const rejectedCount = cards.filter((c) => c.outcome !== "in_progress").length;

  function move(applicationId: string, to: StageId) {
    const card = cards.find((c) => c.id === applicationId);
    if (!card || card.stage === to) return;

    const goingBack = stageIndex(to) < stageIndex(card.stage);

    setCards((list) =>
      list.map((c) =>
        c.id === applicationId
          ? { ...c, stage: to, stageEnteredAt: "2026-08-19" }
          : c,
      ),
    );

    toast.push({
      title: `${fullName(card.candidate)} moved to ${to.replace("_", " ")}`,
      tone: goingBack ? "warning" : "success",
      detail: goingBack ? "Moved back a stage" : undefined,
    });
  }

  function reject(applicationId: string, reason: string) {
    const card = cards.find((c) => c.id === applicationId);
    setCards((list) =>
      list.map((c) =>
        c.id === applicationId
          ? { ...c, outcome: "rejected" as const, rejectionReason: reason }
          : c,
      ),
    );
    if (card) {
      toast.push({
        title: `${fullName(card.candidate)} rejected`,
        tone: "info",
        detail: reason,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageStrip counts={counts} activeStages={activeStages} />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showRejected ? "primary" : "secondary"}
            onClick={() => setShowRejected((v) => !v)}
          >
            <Filter aria-hidden="true" className="size-3.5" />
            {showRejected ? "Hide" : "Show"} rejected
            {rejectedCount > 0 && (
              <span className="tabular ml-0.5 text-[0.75rem] opacity-70">
                ({rejectedCount})
              </span>
            )}
          </Button>

          <SegmentedControl
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Board" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<UserRoundPlus aria-hidden="true" />}
          title="No candidates yet"
          description="Share the job link or add someone you have already sourced."
          action={<Button variant="accent">Add a candidate</Button>}
        />
      ) : view === "board" ? (
        <PipelineBoard
          cards={active}
          activeStages={activeStages}
          onOpen={(c) => setOpenId(c.id)}
          onMove={move}
        />
      ) : (
        <TableWrap caption="Candidates with stage, rating, salary expectation and time in stage">
          <THead>
            <TH>Candidate</TH>
            <TH>Stage</TH>
            <TH align="right">Rating</TH>
            <TH align="right">Expected</TH>
            <TH align="right">Days in stage</TH>
            <TH>Source</TH>
          </THead>
          <TBody>
            {active.map((c) => {
              const days = daysInStage(c);
              return (
                <TR key={c.id} interactive onClick={() => setOpenId(c.id)}>
                  <TDPrimary
                    title={fullName(c.candidate)}
                    subtitle={`${c.candidate.currentTitle} · ${c.candidate.currentCompany}`}
                  />
                  <TD>
                    <StagePill stage={c.stage} outcome={c.outcome} />
                  </TD>
                  <TD align="right" className="tabular font-medium text-ink">
                    {c.rating !== null ? `${c.rating}.0` : "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {c.candidate.expectedSalary ? (
                      <Money amount={c.candidate.expectedSalary} compact />
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD align="right" className="tabular">
                    <span className={days >= 7 ? "text-warning-text" : undefined}>
                      {days}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone="neutral" size="sm">
                      {c.candidate.source.replace("_", " ")}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableWrap>
      )}

      <CandidatePanel
        card={openCard}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onAdvance={(id, to) => {
          move(id, to);
          setOpenId(null);
        }}
        onReject={reject}
      />
    </div>
  );
}

export { Columns3, Table2 };
