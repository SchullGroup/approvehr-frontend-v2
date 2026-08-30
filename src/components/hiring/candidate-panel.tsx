"use client";

import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  FileText,
  Mail,
  MapPin,
  Phone,
  Star,
  ThumbsDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DescriptionList,
  Drawer,
  Field,
  Money,
  ProgressMeter,
  Select,
  Tabs,
  Textarea,
  Timeline,
  useToast,
  type TimelineEntry,
} from "@/components/ui";
import {
  STAGES,
  fullName,
  nextStage,
  type PipelineCard,
  type StageId,
} from "@/lib/types";
import { daysInStage } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { REJECTION_REASONS as REJECTION_REASON_OPTIONS } from "@/lib/reference/lists";
import { StagePill, stageLabel } from "./stage-pill";

/*
 * Shared rather than declared here, and reworded on the way.
 *
 * The old wording was internal shorthand — "below the experience bar", "failed a
 * knockout question", "out of band" — which reads fine to a recruiter who set
 * the bar and means nothing to anybody else. These are the categories a company
 * would have to stand behind if a rejection were questioned, so they say what
 * they mean in plain words.
 */
const REJECTION_REASONS = REJECTION_REASON_OPTIONS;

const SOURCE_LABEL: Record<PipelineCard["candidate"]["source"], string> = {
  careers_page: "Careers page",
  referral: "Referral",
  linkedin: "LinkedIn",
  agency: "Agency",
  sourced: "Sourced",
};

const INTERVIEW_LABEL: Record<string, string> = {
  recruiter_screen: "Recruiter screen",
  technical: "Technical",
  panel: "Panel",
  final: "Final",
};

const RECOMMENDATION = {
  strong_yes: { label: "Strong yes", tone: "success" as const },
  yes: { label: "Yes", tone: "success" as const },
  no: { label: "No", tone: "danger" as const },
  strong_no: { label: "Strong no", tone: "danger" as const },
};

export function CandidatePanel({
  card,
  open,
  onClose,
  onAdvance,
  onReject,
}: {
  card: PipelineCard | null;
  open: boolean;
  onClose: () => void;
  onAdvance: (applicationId: string, to: StageId) => void;
  onReject: (applicationId: string, reason: string) => void;
}) {
  const [tab, setTab] = useState("overview");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  const toast = useToast();

  /**
   * What a control does when there is nothing behind it.
   *
   * `Interview`, `Scorecard` and the pipeline `Application` have no route, so
   * booking an interview and marking somebody hired write nowhere. A button with
   * no handler is the quiet version of lying about that — it looks like it
   * worked. Answering, and saying what did not happen, is the honest version and
   * still leaves a button where a person expects one.
   */
  const nothingHappened = (title: string, detail: string) =>
    toast.push({ title, tone: "info", detail });

  if (!card) return null;

  const name = fullName(card.candidate);
  const to = nextStage(card.stage);
  /* Only offer stages this requisition actually uses. */
  const target =
    to && card.requisition.activeStages.includes(to)
      ? to
      : card.requisition.activeStages.find(
          (s) => STAGES.findIndex((x) => x.id === s) > STAGES.findIndex((x) => x.id === card.stage),
        ) ?? null;

  const stageDef = STAGES.find((s) => s.id === card.stage)!;
  const submitted = card.scorecards.filter((s) => s.submittedAt);
  const pending = card.scorecards.filter((s) => !s.submittedAt);

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={name}
        description={`${card.candidate.currentTitle} · ${card.candidate.currentCompany}`}
        size="lg"
        /*
         * These used to be a `sticky bottom-0 -mx-5 sm:-mx-6` bar at the end of
         * the panel body — a hand-built footer, bleeding back out through the
         * body's own padding to reach the panel edges, with the negative margin
         * guessing at a `sm:px-6` the body did not have. The panel has a footer
         * slot; the buttons belong in it.
         */
        footer={
          card.outcome === "in_progress" ? (
            <div className="flex w-full items-center gap-2">
              {target ? (
                <Button
                  variant="approve"
                  onClick={() => onAdvance(card.id, target)}
                  className="flex-1"
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                  Advance to {stageLabel(target)}
                </Button>
              ) : (
                <Button
                  variant="approve"
                  className="flex-1"
                  onClick={() =>
                    nothingHappened(
                      "Nothing was recorded",
                      "Hiring somebody creates an employee record, and the pipeline has no endpoint to do it from yet. Add them from the people directory.",
                    )
                  }
                >
                  <Check aria-hidden="true" className="size-4" />
                  Mark as hired
                </Button>
              )}
              <Button variant="secondary" onClick={() => setRejecting(true)}>
                <ThumbsDown aria-hidden="true" className="size-4" />
                Reject
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">
          {/* Identity */}
          <div className="flex items-start gap-3">
            <Avatar name={name} size="lg" tone="accent" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StagePill stage={card.stage} outcome={card.outcome} />
                <Badge tone="neutral" size="sm">
                  {SOURCE_LABEL[card.candidate.source]}
                </Badge>
                {card.candidate.referredBy && (
                  <Badge tone="accent" size="sm">
                    via {card.candidate.referredBy}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-meta text-muted">
                Applied {card.appliedAt} · {daysInStage(card)} days in{" "}
                {stageLabel(card.stage).toLowerCase()}
              </p>
            </div>
            {card.rating !== null && (
              <span className="tabular flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-body-sm font-semibold text-ink">
                <Star aria-hidden="true" className="size-3.5 fill-warning text-warning" />
                {card.rating}.0
              </span>
            )}
          </div>

          {/* What has to be true to move on — the reason this stage exists. */}
          {card.outcome === "in_progress" && (
            <Callout tone="accent" title={`To leave ${stageLabel(card.stage)}`}>
              {stageDef.exitCriteria}
            </Callout>
          )}

          {card.outcome === "rejected" && card.rejectionReason && (
            <Callout tone="danger" title="Rejected">
              {card.rejectionReason}
            </Callout>
          )}

          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "overview", label: "Overview" },
              { id: "screening", label: "Screening" },
              { id: "interviews", label: "Interviews", count: card.interviews.length },
              { id: "scorecards", label: "Scorecards", count: card.scorecards.length },
            ]}
          />

          {tab === "overview" && (
            <div className="flex flex-col gap-5">
              <DescriptionList
                columns={2}
                items={[
                  { term: "Email", value: <ContactLine icon={<Mail />} text={card.candidate.email} /> },
                  { term: "Phone", value: <ContactLine icon={<Phone />} text={card.candidate.phone} /> },
                  { term: "Location", value: <ContactLine icon={<MapPin />} text={card.candidate.location} /> },
                  { term: "Experience", value: `${card.candidate.yearsExperience} years` },
                  {
                    term: "Expected salary",
                    value: card.candidate.expectedSalary ? (
                      <SalaryFit
                        expected={card.candidate.expectedSalary}
                        min={card.requisition.salaryMin}
                        max={card.requisition.salaryMax}
                      />
                    ) : (
                      "—"
                    ),
                  },
                  {
                    term: "Notice period",
                    value: card.candidate.noticePeriodWeeks
                      ? `${card.candidate.noticePeriodWeeks} weeks`
                      : "—",
                  },
                ]}
              />

              {/* The filename is all the seed holds, and it is all the API
                  holds either — a CV is recorded as a storage key and no upload
                  pipeline is wired, in any environment. So this names the file
                  and says it cannot be opened, in the same words the screening
                  queue uses, rather than offering a button that opens nothing. */}
              <div className="rounded-lg border border-line bg-canvas p-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FileText aria-hidden="true" className="size-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                    {card.candidate.cvFileName}
                  </span>
                  <Badge tone="neutral" size="sm">
                    CV cannot be opened
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-meta font-semibold text-muted">
                  Activity
                </h4>
                <Timeline entries={activityFor(card)} />
              </div>
            </div>
          )}

          {tab === "screening" && (
            <div className="flex flex-col gap-4">
              {card.requisition.screeningQuestions.length === 0 && (
                <p className="text-body-sm text-muted">
                  This role has no screening questions configured.
                </p>
              )}
              {card.requisition.screeningQuestions.map((q) => {
                const answer = card.screeningAnswers?.[q.id];
                return (
                  <div key={q.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-body-sm font-medium text-ink">
                        {q.question}
                      </p>
                      {q.knockout && (
                        <Badge tone="warning" size="sm">
                          Knockout
                        </Badge>
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-body-sm",
                        answer ? "text-body" : "text-faint italic",
                      )}
                    >
                      {answer ?? "Not answered yet"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "interviews" && (
            <div className="flex flex-col gap-2.5">
              {card.interviews.length === 0 && (
                <p className="text-body-sm text-muted">
                  No interviews scheduled.
                </p>
              )}
              {card.interviews.map((iv) => (
                <div
                  key={iv.id}
                  className="flex items-start gap-3 rounded-lg border border-line p-3"
                >
                  <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium text-ink">
                      {INTERVIEW_LABEL[iv.kind]}
                    </p>
                    <p className="mt-0.5 text-meta text-muted">
                      {new Date(iv.scheduledFor).toLocaleString("en-NG", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {iv.durationMins} mins
                    </p>
                    <p className="mt-1 text-meta text-muted">
                      {iv.interviewerIds
                        .map((id) => {
                          const e = employeeById(id);
                          return e ? fullName(e) : "Unknown";
                        })
                        .join(", ")}
                    </p>
                  </div>
                  <Badge
                    tone={iv.status === "completed" ? "success" : "info"}
                    size="sm"
                  >
                    {iv.status}
                  </Badge>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() =>
                  nothingHappened(
                    "Nothing was booked",
                    "Interviews have no endpoint yet, so no invitation went out and no diary changed.",
                  )
                }
              >
                <CalendarClock aria-hidden="true" className="size-4" />
                Schedule interview
              </Button>
            </div>
          )}

          {tab === "scorecards" && (
            <div className="flex flex-col gap-3">
              {pending.length > 0 && (
                <Callout tone="warning" title={`${pending.length} scorecard awaiting submission`}>
                  {pending
                    .map((s) => {
                      const e = employeeById(s.interviewerId);
                      return e ? fullName(e) : "Unknown";
                    })
                    .join(", ")}{" "}
                  has not submitted yet. The candidate cannot leave Interview
                  until every scorecard is in.
                </Callout>
              )}

              {submitted.map((sc) => {
                const interviewer = employeeById(sc.interviewerId);
                const avg =
                  sc.ratings.reduce((sum, r) => sum + r.score, 0) /
                  (sc.ratings.length || 1);
                return (
                  <div key={sc.id} className="rounded-lg border border-line p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={interviewer ? fullName(interviewer) : "?"}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">
                        {interviewer ? fullName(interviewer) : "Unknown"}
                      </span>
                      {sc.recommendation && (
                        <Badge tone={RECOMMENDATION[sc.recommendation].tone} size="sm">
                          {RECOMMENDATION[sc.recommendation].label}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {sc.ratings.map((r) => (
                        <ProgressMeter
                          key={r.competency}
                          value={r.score}
                          max={5}
                          label={r.competency}
                          size="sm"
                          tone={r.score >= 4 ? "success" : r.score >= 3 ? "accent" : "warning"}
                        />
                      ))}
                    </div>

                    {sc.notes && (
                      <p className="mt-3 border-t border-line pt-2.5 text-body-sm leading-relaxed text-body">
                        {sc.notes}
                      </p>
                    )}

                    <p className="tabular mt-2 text-meta text-muted">
                      Average {avg.toFixed(1)} / 5
                    </p>
                  </div>
                );
              })}

              {submitted.length === 0 && pending.length === 0 && (
                <p className="text-body-sm text-muted">
                  No scorecards yet. They appear once an interview is scheduled.
                </p>
              )}
            </div>
          )}

        </div>
      </Drawer>

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={() => {
          onReject(card.id, reason);
          setRejecting(false);
          onClose();
        }}
        title={`Reject ${name}?`}
        confirmLabel="Reject candidate"
        tone="danger"
        body={
          <div className="flex flex-col gap-4">
            <p className="text-body-sm text-body">
              They move out of the pipeline and the reason is recorded on the
              application. No email is sent automatically.
            </p>
            <Field label="Reason" required>
              <Select
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Private note" help="Visible to the hiring team only.">
              <Textarea rows={2} placeholder="Optional context…" />
            </Field>
          </div>
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ContactLine({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="shrink-0 text-faint [&>svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

/** Expected salary against the band. The judgement is made here, once. */
function SalaryFit({
  expected,
  min,
  max,
}: {
  expected: number;
  min: number;
  max: number;
}) {
  const over = expected > max;
  const under = expected < min;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Money amount={expected} />
      {over && (
        <Badge tone="danger" size="sm">
          Above band
        </Badge>
      )}
      {under && (
        <Badge tone="info" size="sm">
          Below band
        </Badge>
      )}
      {!over && !under && (
        <Badge tone="success" size="sm">
          In band
        </Badge>
      )}
    </span>
  );
}

function activityFor(card: PipelineCard): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (card.offer) {
    entries.push({
      id: "offer",
      title: `Offer ${card.offer.status.replace("_", " ")}`,
      detail: (
        <>
          <Money amount={card.offer.grossMonthly} /> gross monthly · starts{" "}
          {card.offer.startDate}
        </>
      ),
      timestamp: card.stageEnteredAt,
      tone: card.offer.status === "accepted" ? "success" : "accent",
    });
  }

  for (const iv of [...card.interviews].reverse()) {
    entries.push({
      id: iv.id,
      title: `${INTERVIEW_LABEL[iv.kind]} ${iv.status}`,
      timestamp: new Date(iv.scheduledFor).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
      }),
      tone: iv.status === "completed" ? "success" : "neutral",
    });
  }

  entries.push({
    id: "entered",
    title: `Moved to ${stageLabel(card.stage)}`,
    timestamp: card.stageEnteredAt,
    tone: "accent",
  });

  entries.push({
    id: "applied",
    title: "Application received",
    detail: SOURCE_LABEL[card.candidate.source],
    timestamp: card.appliedAt,
  });

  return entries;
}

export { Building2, X };
