"use client";

import { useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import {
  BarChart,
  Card,
  DonutChart,
  Drawer,
  EmptyState,
  LoadState,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { NoticeLine } from "@/components/portal/notice-line";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  dayLabel,
  scoreLabel,
  scoreWords,
  visibleComponents,
  weightLabel,
  type ApiComponentScore,
  type ApiHistoryPoint,
} from "@/lib/api/performance";
import { useScoreHistory } from "@/lib/store/performance";

/**
 * One person's appraisal history, as big cards (owner redesign, 24 Nov 2026).
 *
 * The page is only the history: a card per period, newest first, each showing
 * the period, where it stands and the score in words, or a calm "No score yet".
 * Nothing else is drawn until a card is opened; opening it shows that period's
 * score broken down by part, with charts.
 *
 * Every figure is the cycle screen's own (the API builds each point from the
 * same register, against the weights that period was frozen with); nothing here
 * recomputes or bands a score. A part with nothing recorded is "Not scored", in
 * plain text and never red, and never a zero.
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
                <Card>
                  <EmptyState
                    compact
                    icon={<TriangleAlert aria-hidden="true" />}
                    title="No appraisal period has covered them yet"
                    description="They show up here once an appraisal period they are part of has started."
                  />
                </Card>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {[...history.points].reverse().map((point) => (
                    <li key={point.cycleId} className="min-w-0">
                      <PeriodCard point={point} onOpen={() => setOpen(point)} />
                    </li>
                  ))}
                </ul>
              )}
              {history.truncated && (
                <p className="text-body-sm text-muted">
                  The {history.limit} most recent periods are shown.
                </p>
              )}
            </>
          )}
        </LoadState>
      </PageBody>

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.cycleName ?? "Period"}
        {...(open ? { description: stageLine(open) } : {})}
        size="lg"
      >
        {open && <PeriodDetail point={open} />}
      </Drawer>
    </>
  );
}

function stageLine(point: ApiHistoryPoint): string {
  const stage = point.stage.toLowerCase();
  return point.dueDate ? `Due ${dayLabel(point.dueDate)} · ${stage}` : stage;
}

/** A period, closed: its name, where it stands, and the score or none yet. */
function PeriodCard({
  point,
  onOpen,
}: {
  point: ApiHistoryPoint;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-36 w-full min-w-0 flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-h4 font-semibold text-ink">
            {point.cycleName}
          </span>
          <span className="mt-0.5 block text-body-sm text-muted">
            {stageLine(point)}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-muted"
        />
      </span>
      <span className="tabular text-body-lg text-ink">
        {point.scoreBp === null ? (
          <span className="text-muted">No score yet</span>
        ) : (
          scoreWords(point)
        )}
      </span>
    </button>
  );
}

/** What the score was made of: a ring for the mix, a bar per part. */
function PeriodDetail({ point }: { point: ApiHistoryPoint }) {
  const parts = visibleComponents(point.components);
  const counted = parts.filter((part) => part.included);
  const scored = parts.filter(
    (part): part is ApiComponentScore & { scoreBp: number } =>
      part.included && part.scoreBp !== null,
  );
  const self = parts.find((part) => part.component === "SELF_ASSESSMENT");
  const manager = parts.find((part) => part.component === "MANAGER_APPRAISAL");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-h3 text-ink">
          {point.scoreBp === null ? (
            <span className="text-body-lg text-muted">No score yet</span>
          ) : (
            scoreWords(point)
          )}
        </p>
        {point.weightsFrom === "snapshot" && (
          <span className="inline-flex items-center gap-1 text-body-sm text-muted">
            Weights frozen
            <InfoTooltip
              label="About frozen weights"
              text="This period was scored with the weights it started with. Changing the company's weights later does not change it."
            />
          </span>
        )}
      </div>

      {counted.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-body-sm font-medium text-ink">
            What the score is made of
          </p>
          <DonutChart
            points={counted.map((part) => ({
              label: part.label,
              value: Math.round(part.effectiveWeightBp / 100),
            }))}
            format={(value) => `${String(value)}%`}
            caption="Share of the score by part"
          />
        </Card>
      )}

      {scored.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-body-sm font-medium text-ink">
            How each part scored
          </p>
          <BarChart
            points={scored.map((part) => ({
              label: part.label,
              value: Math.round(part.scoreBp / 100),
            }))}
            format={(value) => `${String(value)}%`}
            caption="Score by part, out of 100%"
          />
        </Card>
      )}

      {self?.scoreBp != null && manager?.scoreBp != null && (
        <Card className="p-5">
          <p className="mb-3 text-body-sm font-medium text-ink">
            Their view and their manager&rsquo;s
          </p>
          <BarChart
            points={[
              { label: "Their own", value: Math.round(self.scoreBp / 100) },
              {
                label: "Their manager's",
                value: Math.round(manager.scoreBp / 100),
              },
            ]}
            format={(value) => `${String(value)}%`}
            caption="Self-assessment against manager appraisal"
            colorBy="series"
          />
        </Card>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {parts.map((part) => (
          <li
            key={part.component}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <p className="text-body-sm font-medium text-ink">{part.label}</p>
            <p className="tabular mt-1 text-body-lg text-ink">
              {part.included && part.scoreBp !== null ? (
                scoreLabel(part.scoreBp)
              ) : (
                <span className="text-muted">Not scored</span>
              )}
            </p>
            <p className="mt-0.5 text-meta text-muted">
              {part.included
                ? `${weightLabel(part.effectiveWeightBp)} of the score`
                : (part.excludedNote ?? "Left out of this score")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
