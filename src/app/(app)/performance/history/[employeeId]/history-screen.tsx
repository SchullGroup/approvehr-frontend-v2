"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Drawer, LoadState } from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  STAGE_WORDS,
  stagesReached,
} from "@/components/performance/stage-progress";
import { ScoreParts, scorePartsOf } from "@/components/performance/score-parts";
import {
  dayLabel,
  scoreWords,
  type ApiHistoryPoint,
} from "@/lib/api/performance";
import { useProjectsGate } from "@/lib/store/project-session";
import { useScoreHistory } from "@/lib/store/performance";

/**
 * One person's appraisal history, as big cards (owner redesign, 24 Nov 2026).
 *
 * The page is only the history: a card per period, newest first, each showing
 * the period, where it stands and the score in words, or a calm "No score yet".
 * Nothing else is drawn until a card is opened; opening it shows that period's
 * score broken down by part, as the one list the record of an appraisal uses
 * (`ScoreParts`): the part, a thin bar, the score out of 5 and its weight. The
 * big score is not drawn again in the drawer, because the card it was opened
 * from has it, and a card with no part that has anything recorded does not open
 * onto an empty drawer.
 *
 * Every figure is the cycle screen's own (the API builds each point from the
 * same register, against the weights that period was frozen with); nothing here
 * recomputes or bands a score. A part with nothing recorded is not in the list,
 * and is never a zero.
 *
 * The Work record tab is hidden for now. `WorkRecordPanel` is kept in
 * `components/performance/work-record.tsx` and returns when the owner says to
 * pull the history from tasks and projects (see HANDOVER).
 *
 * Somebody reading their own history sees final marks only; `withheldNote` is
 * the API's sentence for periods held back, so a missing period is explained.
 */
export function ScoreHistoryScreen({ employeeId }: { employeeId: string }) {
  const detail = useScoreHistory(employeeId, true);
  const history = detail.history;
  const projects = useProjectsGate();
  const [open, setOpen] = useState<ApiHistoryPoint | null>(null);

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title={history?.employeeName ?? "Appraisal history"}
        meta={
          history ? (
            <span>
              {[history.jobTitle, history.departmentName]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-4">
        {/* The one loading and failure rule. A 403 reaches the reader as the
            server's own sentence, which names the rule. */}
        <LoadState
          loading={detail.loading}
          error={detail.error}
          subject="this person's score history"
          onRetry={detail.reload}
          skeleton="detail"
        >
          {history && (
            <>
              {history.withheldNote && (
                <NoticeLine tone="muted">{history.withheldNote}</NoticeLine>
              )}
              {history.points.length === 0 ? (
                /* A line, not a card with a warning in it: nothing has gone
                   wrong, there is just no period yet. */
                <p className="text-body-sm text-muted">
                  No appraisal period has covered them yet
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {[...history.points].reverse().map((point) => (
                    <li key={point.cycleId} className="min-w-0">
                      <PeriodCard
                        point={point}
                        {...(scorePartsOf(point.components, {
                          projects: projects.enabled,
                        }).rows.length > 0
                          ? { onOpen: () => setOpen(point) }
                          : {})}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </LoadState>
      </PageBody>

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.cycleName ?? "Period"}
        {...(open && stageLine(open) ? { description: stageLine(open) } : {})}
        size="lg"
      >
        {open && (
          <ScoreParts
            components={open.components}
            notes={[
              open.weightsFrom === "snapshot" &&
                "This period was scored with the weights it started with. Changing the company's weights later does not change it.",
            ]}
          />
        )}
      </Drawer>
    </>
  );
}

/**
 * "Due 31 Dec 2026 · Final": the due date and the stage in the one word each
 * stage has everywhere (`STAGE_WORDS`). A draft has reached no stage and a
 * period with no date has none to give, and each is left out rather than said
 * as a blank.
 */
function stageLine(point: ApiHistoryPoint): string {
  const reached = stagesReached(point.stage);
  return [
    point.dueDate ? `Due ${dayLabel(point.dueDate)}` : null,
    reached > 0 ? STAGE_WORDS[reached - 1] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A period, closed: its name, where it stands, and the score or none yet. A
 * button only where there is a breakdown to open.
 */
function PeriodCard({
  point,
  onOpen,
}: {
  point: ApiHistoryPoint;
  onOpen?: () => void;
}) {
  const line = stageLine(point);
  const face = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-h4 font-semibold text-ink">
            {point.cycleName}
          </span>
          {line && (
            <span className="mt-0.5 block text-body-sm text-muted">{line}</span>
          )}
        </span>
        {onOpen && (
          <ChevronRight
            aria-hidden="true"
            className="mt-1 size-5 shrink-0 text-muted"
          />
        )}
      </span>
      <span className="tabular text-body-lg text-ink">
        {point.scoreBp === null ? (
          <span className="text-muted">No score yet</span>
        ) : (
          scoreWords(point)
        )}
      </span>
    </>
  );
  const shape =
    "flex min-h-36 w-full min-w-0 flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-5 text-left";

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={`${shape} transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      {face}
    </button>
  ) : (
    <div className={shape}>{face}</div>
  );
}
