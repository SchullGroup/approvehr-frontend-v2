"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, CalendarClock, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  INTERVIEW_KIND_LABEL,
  RECOMMENDATION_LABEL,
  kobo,
  naira,
  type ApiApplicationDetail,
  type ApiStage,
  type InterviewKind,
  type ScorecardRecommendation,
} from "@/lib/api/recruitment";
import { useCan } from "@/lib/permissions";
import {
  useApplicationMutations,
  useInterviewMutations,
  useOfferMutations,
  useStages,
} from "@/lib/store/recruitment";

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

const OFFER_STATUS_TONE = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
} as const;

const INTERVIEW_STATUS_TONE = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
} as const;

export function realOutcomeBadge(application: ApiApplicationDetail) {
  return (
    <Badge tone={OUTCOME_TONE[application.outcome]} dot>
      {OUTCOME_LABEL[application.outcome] ?? application.outcome}
    </Badge>
  );
}

/** The role card for a real pipeline application, replacing `SeededRole`. */
export function RealRole({ application }: { application: ApiApplicationDetail }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-meta font-semibold text-muted">Applying for</h2>
        </div>
        <Link
          href={`/hiring/requisitions/${application.requisitionId}`}
          className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
        >
          <Briefcase aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">
              {application.requisitionJobTitle}
            </span>
            <span className="block truncate text-meta text-muted">
              {application.requisitionReference}
            </span>
          </span>
        </Link>
        <DescriptionList
          columns={1}
          items={[
            { term: "Stage", value: application.stageName ?? "Not yet placed" },
            { term: "Outcome", value: realOutcomeBadge(application) },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/**
 * The real pipeline: stage moves, interviews, scorecards and the offer —
 * everything `Pipeline` in `candidate-screen.tsx` renders from the seed, now
 * against `/api/v1/recruitment`.
 */
export function RealPipeline({
  application,
  onChanged,
}: {
  application: ApiApplicationDetail;
  onChanged: () => void;
}) {
  const stagesState = useStages(application.requisitionId);
  const applications = useApplicationMutations();
  const interviews = useInterviewMutations();
  const offers = useOfferMutations();
  const canApprove = useCan("APPROVE_HIRING");
  const canManage = useCan("MANAGE_HIRING");

  const [scheduling, setScheduling] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const say = (tone: "success" | "danger", text: string) => setNotice({ tone, text });
  const fail = (error: unknown) =>
    say("danger", error instanceof ApiError ? error.message : "Something went wrong. Try again.");

  async function moveTo(stageId: string) {
    setBusy(true);
    try {
      await applications.move(application.id, stageId);
      say("success", "Moved.");
      onChanged();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string) {
    setBusy(true);
    try {
      await applications.reject(application.id, reason.trim() || undefined);
      say("success", "Rejected.");
      setRejecting(false);
      onChanged();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {notice && (
        <Callout tone={notice.tone} title={notice.tone === "success" ? "Done" : "Not done"}>
          {notice.text}
        </Callout>
      )}

      {application.outcome === "IN_PROGRESS" && (
        <Card>
          <CardHeader title="Move this candidate" />
          <CardBody className="flex flex-wrap items-center gap-2">
            {stagesState.stages
              .filter((s) => s.id !== application.stageId)
              .map((s) => (
                <Button
                  key={s.id}
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => void moveTo(s.id)}
                >
                  Move to {s.name}
                </Button>
              ))}
            <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </CardBody>
        </Card>
      )}

      {application.offer ? (
        <OfferCard
          offer={application.offer}
          canApprove={canApprove}
          canManage={canManage}
          onChanged={onChanged}
        />
      ) : application.outcome === "IN_PROGRESS" ? (
        <Card>
          <CardHeader
            title="Offer"
            action={
              <Button variant="accent" size="sm" onClick={() => setOffering(true)}>
                <Plus aria-hidden="true" className="size-3.5" />
                Make an offer
              </Button>
            }
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Interviews"
          action={
            <Button variant="secondary" size="sm" onClick={() => setScheduling(true)}>
              <Plus aria-hidden="true" className="size-3.5" />
              Schedule
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-2.5">
          {application.interviews.length === 0 && (
            <p className="text-body-sm text-muted">Nothing scheduled.</p>
          )}
          {application.interviews.map((iv) => (
            <div key={iv.id} className="rounded-md border border-line p-3">
              <div className="flex items-start gap-3">
                <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium text-ink">
                    {INTERVIEW_KIND_LABEL[iv.kind]}
                  </p>
                  <p className="tabular mt-0.5 text-meta text-muted">
                    {new Date(iv.scheduledFor).toLocaleString("en-NG", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {iv.durationMins} mins
                    {iv.location ? ` · ${iv.location}` : ""}
                  </p>
                </div>
                <Badge tone={INTERVIEW_STATUS_TONE[iv.status]} size="sm">
                  {iv.status.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                <span className="text-meta text-muted">
                  {iv.scorecards.filter((s) => s.submitted).length} of{" "}
                  {iv.scorecards.length || 1} scorecards in
                </span>
                <Button variant="ghost" size="sm" onClick={() => setScoring(iv.id)}>
                  Submit a scorecard
                </Button>
                {iv.status === "SCHEDULED" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void interviews.complete(iv.id).then(onChanged).catch(fail)}
                    >
                      Mark complete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void interviews.noShow(iv.id).then(onChanged).catch(fail)}
                    >
                      No-show
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {scheduling && (
        <ScheduleInterviewDialog
          onClose={() => setScheduling(false)}
          onConfirm={async (body) => {
            try {
              await interviews.schedule(application.id, body);
              setScheduling(false);
              onChanged();
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {scoring && (
        <ScorecardDialog
          onClose={() => setScoring(null)}
          onConfirm={async (body) => {
            try {
              await interviews.submitScorecard(scoring, body);
              setScoring(null);
              onChanged();
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {offering && (
        <OfferDialog
          onClose={() => setOffering(false)}
          onConfirm={async (amountNaira, startDate) => {
            try {
              await offers.create(application.id, {
                grossMonthlyKobo: kobo(amountNaira),
                startDate,
              });
              setOffering(false);
              onChanged();
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {rejecting && (
        <RejectDialog
          busy={busy}
          onClose={() => setRejecting(false)}
          onConfirm={reject}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------- offer */

function OfferCard({
  offer,
  canApprove,
  canManage,
  onChanged,
}: {
  offer: NonNullable<ApiApplicationDetail["offer"]>;
  canApprove: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const offers = useOfferMutations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Offer"
        action={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={OFFER_STATUS_TONE[offer.status]} dot>
              {offer.status.replace("_", " ").toLowerCase()}
            </Badge>
            {offer.outsideBand && (
              <Badge tone="warning" size="sm">
                Outside band
              </Badge>
            )}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {error && (
          <Callout tone="danger" title="Not done">
            {error}
          </Callout>
        )}
        <p className="flex items-baseline gap-2">
          <Money amount={naira(offer.grossMonthlyKobo)} decimals size="lg" />
          <span className="text-body-sm text-muted">a month, from {offer.startDate}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          {offer.status === "DRAFT" && (
            <Button variant="accent" size="sm" loading={busy} onClick={() => void run(() => offers.submit(offer.id))}>
              Submit for approval
            </Button>
          )}
          {offer.status === "PENDING_APPROVAL" && !offer.approvedAt && canApprove && (
            <Button variant="approve" size="sm" loading={busy} onClick={() => void run(() => offers.approve(offer.id))}>
              Approve
            </Button>
          )}
          {offer.status === "PENDING_APPROVAL" && !offer.approvedAt && !canApprove && (
            <span className="text-meta text-muted">Waiting on approval.</span>
          )}
          {offer.status === "PENDING_APPROVAL" && offer.approvedAt && canManage && (
            <Button variant="accent" size="sm" loading={busy} onClick={() => void run(() => offers.send(offer.id))}>
              Send
            </Button>
          )}
          {offer.status === "PENDING_APPROVAL" && offer.approvedAt && !canManage && (
            <span className="text-meta text-muted">Approved. Waiting to be sent.</span>
          )}
          {offer.status === "SENT" && (
            <>
              <Button variant="approve" size="sm" loading={busy} onClick={() => void run(() => offers.accept(offer.id))}>
                Record accepted
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.decline(offer.id))}
              >
                Record declined
              </Button>
            </>
          )}
          {offer.status !== "ACCEPTED" &&
            offer.status !== "DECLINED" &&
            offer.status !== "WITHDRAWN" && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.withdraw(offer.id))}
              >
                Withdraw
              </Button>
            )}
          {offer.status === "ACCEPTED" && (
            <span className="text-meta text-success-text">Became an employee record.</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ dialogs */

function ScheduleInterviewDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (body: {
    kind: InterviewKind;
    scheduledFor: string;
    durationMins?: number;
    location?: string;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<InterviewKind>("SCREEN");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Schedule an interview"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!when}
            onClick={() => {
              setBusy(true);
              void onConfirm({
                kind,
                scheduledFor: new Date(when).toISOString(),
                durationMins: Number(duration) || 60,
                ...(location.trim() ? { location: location.trim() } : {}),
              }).finally(() => setBusy(false));
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.currentTarget.value as InterviewKind)}>
            {(Object.keys(INTERVIEW_KIND_LABEL) as InterviewKind[]).map((k) => (
              <option key={k} value={k}>
                {INTERVIEW_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When" required>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.currentTarget.value)}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.currentTarget.value)}
            />
          </Field>
        </div>
        <Field label="Location" optional help="A room, or a call link.">
          <Input value={location} onChange={(e) => setLocation(e.currentTarget.value)} />
        </Field>
      </div>
    </Modal>
  );
}

const COMPETENCIES = ["Technical depth", "Communication", "Ownership", "Culture fit"];

function ScorecardDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (body: {
    recommendation?: ScorecardRecommendation | null;
    notes?: string;
    ratings: { competency: string; score: number }[];
  }) => Promise<void>;
}) {
  const [recommendation, setRecommendation] = useState<ScorecardRecommendation | "">("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Submit a scorecard"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm({
                ...(recommendation ? { recommendation } : {}),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
                ratings: COMPETENCIES.filter((c) => scores[c]).map((c) => ({
                  competency: c,
                  score: scores[c]!,
                })),
              }).finally(() => setBusy(false));
            }}
          >
            Submit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {COMPETENCIES.map((c) => (
          <Field key={c} label={c} optional>
            <Select
              value={scores[c] ? String(scores[c]) : ""}
              onChange={(e) => {
                const score = Number(e.currentTarget.value);
                setScores((s) => ({ ...s, [c]: score }));
              }}
              placeholder="Not rated"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </Select>
          </Field>
        ))}
        <Field label="Recommendation" optional>
          <Select
            value={recommendation}
            onChange={(e) => setRecommendation(e.currentTarget.value as ScorecardRecommendation)}
            placeholder="Not given"
          >
            {(Object.keys(RECOMMENDATION_LABEL) as ScorecardRecommendation[]).map((r) => (
              <option key={r} value={r}>
                {RECOMMENDATION_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function OfferDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (amountNaira: number, startDate: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = Number(amount.replace(/\D/g, "")) || 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Make an offer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={parsed <= 0 || !startDate}
            onClick={() => {
              setBusy(true);
              void onConfirm(parsed, startDate).finally(() => setBusy(false));
            }}
          >
            Save as draft
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gross monthly (₦)" required>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} placeholder="1,500,000" />
        </Field>
        <Field label="Start date" required>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} />
        </Field>
        <p className="text-meta text-muted">
          Saved as a draft. Submit it for approval once you are ready.
        </p>
      </div>
    </Modal>
  );
}

function RejectDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Reject this candidate?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onConfirm(reason)}>
            Reject
          </Button>
        </>
      }
    >
      <Field label="Reason" optional help="Kept internal.">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      </Field>
    </Modal>
  );
}

export type { ApiStage };
