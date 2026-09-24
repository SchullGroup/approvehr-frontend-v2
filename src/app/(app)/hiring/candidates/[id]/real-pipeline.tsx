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
  type ApiInterviewSummary,
  type ApiStage,
  type InterviewKind,
  type RescheduleInterviewBody,
  type ScorecardRecommendation,
  type UpdateOfferBody,
} from "@/lib/api/recruitment";
import { useCan } from "@/lib/permissions";
import {
  useApplicationMutations,
  useCandidateMutations,
  useInterviewMutations,
  useOfferMutations,
  useStages,
} from "@/lib/store/recruitment";
import { useOrgTimezone } from "@/lib/store/session";
import { formatWeekdayTime } from "@/lib/time";

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
export function RealRole({
  application,
}: {
  application: ApiApplicationDetail;
}) {
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
          <Briefcase
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
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
  const timeZone = useOrgTimezone();

  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState<ApiInterviewSummary | null>(
    null,
  );
  const [scoring, setScoring] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [withdrawingApplication, setWithdrawingApplication] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  const say = (tone: "success" | "danger", text: string) =>
    setNotice({ tone, text });
  const fail = (error: unknown) =>
    say(
      "danger",
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Try again.",
    );

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

  /* A different fact from `reject`: `ApplicationOutcome` has both `REJECTED`
     and `WITHDRAWN`, and the two controls must not read as one act wearing
     two labels — see `WithdrawApplicationDialog` for the wording rule. */
  async function withdrawApplication(reason: string) {
    setBusy(true);
    try {
      await applications.withdraw(application.id, reason.trim() || undefined);
      say("success", "Recorded as withdrawn.");
      setWithdrawingApplication(false);
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
        <Callout
          tone={notice.tone}
          title={notice.tone === "success" ? "Done" : "Not done"}
        >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRejecting(true)}
            >
              Reject
            </Button>
            {/* `POST /applications/:id/withdraw` is gated on `MANAGE_HIRING`
                server-side — see `OfferCard`'s comment on the same gate for
                why this is offered rather than left to 403 on the press. */}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWithdrawingApplication(true)}
              >
                Candidate withdrew
              </Button>
            )}
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
              <Button
                variant="accent"
                size="sm"
                onClick={() => setOffering(true)}
              >
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setScheduling(true)}
            >
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
                <CalendarClock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium text-ink">
                    {INTERVIEW_KIND_LABEL[iv.kind]}
                  </p>
                  <p className="tabular mt-0.5 text-meta text-muted">
                    {formatWeekdayTime(iv.scheduledFor, timeZone)} ·{" "}
                    {iv.durationMins} mins
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScoring(iv.id)}
                >
                  Submit a scorecard
                </Button>
                {iv.status === "SCHEDULED" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void interviews
                          .complete(iv.id)
                          .then(onChanged)
                          .catch(fail)
                      }
                    >
                      Mark complete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void interviews
                          .noShow(iv.id)
                          .then(onChanged)
                          .catch(fail)
                      }
                    >
                      No-show
                    </Button>
                    {/* `PATCH /interviews/:id` is gated on `MANAGE_HIRING`
                        server-side, same as `.complete`/`.noShow` above —
                        this one is offered on that permission rather than
                        left to refuse on the press. */}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRescheduling(iv)}
                      >
                        Reschedule
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Each dialog below stays mounted regardless of its gating state —
          `Modal` decides whether to render from the real `open` prop, so it
          can see that value go false and play its own exit animation. */}
      <ScheduleInterviewDialog
        open={scheduling}
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

      <RescheduleInterviewDialog
        open={rescheduling !== null}
        interview={rescheduling}
        onClose={() => setRescheduling(null)}
        onConfirm={async (body) => {
          if (!rescheduling) return;
          try {
            await interviews.reschedule(rescheduling.id, body);
            setRescheduling(null);
            onChanged();
          } catch (error) {
            fail(error);
          }
        }}
      />

      <ScorecardDialog
        open={scoring !== null}
        onClose={() => setScoring(null)}
        onConfirm={async (body) => {
          if (!scoring) return;
          try {
            await interviews.submitScorecard(scoring, body);
            setScoring(null);
            onChanged();
          } catch (error) {
            fail(error);
          }
        }}
      />

      <OfferDialog
        open={offering}
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

      <RejectDialog
        open={rejecting}
        busy={busy}
        onClose={() => setRejecting(false)}
        onConfirm={reject}
      />

      <WithdrawApplicationDialog
        open={withdrawingApplication}
        busy={busy}
        onClose={() => setWithdrawingApplication(false)}
        onConfirm={withdrawApplication}
      />
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
  const [editing, setEditing] = useState(false);
  const [redoing, setRedoing] = useState(false);

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

  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Something went wrong.");

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
          <span className="text-body-sm text-muted">
            a month, from {offer.startDate}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          {offer.status === "DRAFT" && (
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              onClick={() => void run(() => offers.submit(offer.id))}
            >
              Submit for approval
            </Button>
          )}
          {/* `PATCH /offers/:id` is `MANAGE_HIRING`-gated, same as every
              other offer write on this card — offered on that permission
              rather than left to refuse on the press. */}
          {offer.status === "DRAFT" && canManage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
          {(offer.status === "DECLINED" || offer.status === "WITHDRAWN") &&
            canManage && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setRedoing(true)}
              >
                Make a new offer
              </Button>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            !offer.approvedAt &&
            canApprove && (
              <Button
                variant="approve"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.approve(offer.id))}
              >
                Approve
              </Button>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            !offer.approvedAt &&
            !canApprove && (
              <span className="text-meta text-muted">Waiting on approval.</span>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            offer.approvedAt &&
            canManage && (
              <Button
                variant="accent"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.send(offer.id))}
              >
                Send
              </Button>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            offer.approvedAt &&
            !canManage && (
              <span className="text-meta text-muted">
                Approved. Waiting to be sent.
              </span>
            )}
          {offer.status === "SENT" && (
            <>
              <Button
                variant="approve"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.accept(offer.id))}
              >
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
            <span className="text-meta text-success-text">
              Became an employee record.
            </span>
          )}
        </div>
      </CardBody>

      {/* Mounted regardless of `editing`/`redoing` — see the note above
          `ScheduleInterviewDialog` on why these dialogs stay mounted rather
          than being conditionally rendered. */}
      <EditOfferDialog
        open={editing}
        offer={offer}
        onClose={() => setEditing(false)}
        onConfirm={async (body) => {
          try {
            setError(null);
            await offers.update(offer.id, body);
            setEditing(false);
            onChanged();
          } catch (err) {
            fail(err);
          }
        }}
      />

      <OfferDialog
        open={redoing}
        onClose={() => setRedoing(false)}
        title="Make a new offer"
        confirmLabel="Save as draft"
        help="This starts a fresh draft on the same application — the offer that was declined or withdrawn is replaced, not duplicated. Submit it for approval once you are ready."
        onConfirm={async (amountNaira, startDate) => {
          try {
            setError(null);
            await offers.redo(offer.id, {
              grossMonthlyKobo: kobo(amountNaira),
              startDate,
            });
            setRedoing(false);
            onChanged();
          } catch (err) {
            fail(err);
          }
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ dialogs */

function ScheduleInterviewDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
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
      open={open}
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
          <Select
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as InterviewKind)}
          >
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
          <Input
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * `2026-09-25T14:00` from an ISO instant — the shape `<input
 * type="datetime-local">` expects, read through the browser's own local
 * time. `ScheduleInterviewDialog` makes the identical simplification on the
 * way back out (`new Date(when).toISOString()`, no org time zone involved),
 * so this keeps a reschedule consistent with a fresh booking rather than
 * inventing a second rule.
 */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Only the fields that actually changed. `RescheduleInterviewBody` is a
 * patch, and sending every field back on every save regardless of whether it
 * moved is the thing this codebase's PATCH endpoints are written not to
 * expect — see `null` clears / absent leaves alone elsewhere in this app's
 * PATCH bodies. `location` is the one field that can be *cleared*: an empty
 * box means "no longer applies," sent as `null`, not left out.
 */
function rescheduleDiff(
  interview: ApiInterviewSummary,
  kind: InterviewKind,
  when: string,
  duration: string,
  location: string,
): RescheduleInterviewBody {
  const body: RescheduleInterviewBody = {};

  if (kind !== interview.kind) body.kind = kind;

  const isoWhen = when ? new Date(when).toISOString() : null;
  if (isoWhen && isoWhen !== interview.scheduledFor) {
    body.scheduledFor = isoWhen;
  }

  const durationNum = Number(duration);
  if (
    Number.isFinite(durationNum) &&
    durationNum > 0 &&
    durationNum !== interview.durationMins
  ) {
    body.durationMins = durationNum;
  }

  const trimmedLocation = location.trim();
  const originalLocation = interview.location ?? "";
  if (trimmedLocation !== originalLocation) {
    body.location = trimmedLocation === "" ? null : trimmedLocation;
  }

  return body;
}

function RescheduleInterviewDialog({
  open,
  interview,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /**
   * `null` before anything has been picked. The dialog stays mounted either
   * way — see the note above `ScheduleInterviewDialog`'s call site on why —
   * so there is nothing to prefill from until a specific interview is
   * targeted.
   */
  interview: ApiInterviewSummary | null;
  onClose: () => void;
  onConfirm: (body: RescheduleInterviewBody) => Promise<void>;
}) {
  const [kind, setKind] = useState<InterviewKind>("SCREEN");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  /*
   * One dialog instance is shared across every interview on this record, so
   * a lazily-initialised `useState` (the pattern `ScreeningDialog` uses,
   * which only ever has one candidate to describe) would keep showing
   * whichever interview was rescheduled first. This re-syncs the form
   * during render whenever a *different* interview is targeted — React's
   * own documented way to adjust state from a prop without an effect's
   * extra render — keyed on the id rather than the object, because
   * `application.interviews` is a fresh array on every reload and would
   * otherwise overwrite a draft mid-edit.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (interview && interview.id !== loadedFor) {
    setLoadedFor(interview.id);
    setKind(interview.kind);
    setWhen(toDatetimeLocalValue(interview.scheduledFor));
    setDuration(String(interview.durationMins));
    setLocation(interview.location ?? "");
  }

  const body = interview
    ? rescheduleDiff(interview, kind, when, duration, location)
    : {};
  const hasChanges = Object.keys(body).length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Reschedule this interview"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!interview || !when || !hasChanges}
            onClick={() => {
              setBusy(true);
              void onConfirm(body).finally(() => setBusy(false));
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as InterviewKind)}
          >
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
        <Field
          label="Location"
          optional
          help="A room, or a call link. Clear it if it no longer applies."
        >
          <Input
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
          />
        </Field>
        {interview && !hasChanges && (
          <p className="text-meta text-muted">
            Nothing here differs from what is already booked.
          </p>
        )}
      </div>
    </Modal>
  );
}

const COMPETENCIES = [
  "Technical depth",
  "Communication",
  "Ownership",
  "Culture fit",
];

function ScorecardDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (body: {
    recommendation?: ScorecardRecommendation | null;
    notes?: string;
    ratings: { competency: string; score: number }[];
  }) => Promise<void>;
}) {
  const [recommendation, setRecommendation] = useState<
    ScorecardRecommendation | ""
  >("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
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
            onChange={(e) =>
              setRecommendation(
                e.currentTarget.value as ScorecardRecommendation,
              )
            }
            placeholder="Not given"
          >
            {(
              Object.keys(RECOMMENDATION_LABEL) as ScorecardRecommendation[]
            ).map((r) => (
              <option key={r} value={r}>
                {RECOMMENDATION_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Also does duty for "make a new offer" on a declined or withdrawn offer
 * (`offers.redo`) — same two fields, same money conversion, a fresh start
 * rather than a correction. `title`/`confirmLabel`/`help` let that call site
 * say so without a second copy of the amount-to-kobo logic below.
 */
function OfferDialog({
  open,
  onClose,
  onConfirm,
  title = "Make an offer",
  confirmLabel = "Save as draft",
  help = "Saved as a draft. Submit it for approval once you are ready.",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (amountNaira: number, startDate: string) => Promise<void>;
  title?: string;
  confirmLabel?: string;
  help?: string;
}) {
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = Number(amount.replace(/\D/g, "")) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
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
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gross monthly (₦)" required>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="1,500,000"
          />
        </Field>
        <Field label="Start date" required>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
          />
        </Field>
        <p className="text-meta text-muted">{help}</p>
      </div>
    </Modal>
  );
}

/**
 * Correcting a draft offer's figure before it is submitted — `grossMonthlyKobo`
 * and/or `startDate`, only the one(s) that changed. Unlike `OfferDialog`
 * above (blank fields, a fresh start), this is prefilled from the offer on
 * screen: it is a correction, not a new proposal, so there is something to
 * show and nothing to retype that did not change.
 */
function EditOfferDialog({
  open,
  offer,
  onClose,
  onConfirm,
}: {
  open: boolean;
  offer: NonNullable<ApiApplicationDetail["offer"]>;
  onClose: () => void;
  onConfirm: (body: UpdateOfferBody) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() =>
    String(naira(offer.grossMonthlyKobo)),
  );
  const [startDate, setStartDate] = useState(offer.startDate);
  const [busy, setBusy] = useState(false);
  const parsed = Number(amount.replace(/\D/g, "")) || 0;

  const body: UpdateOfferBody = {};
  if (parsed > 0 && kobo(parsed) !== offer.grossMonthlyKobo) {
    body.grossMonthlyKobo = kobo(parsed);
  }
  if (startDate && startDate !== offer.startDate) {
    body.startDate = startDate;
  }
  const hasChanges = Object.keys(body).length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Edit this offer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={parsed <= 0 || !startDate || !hasChanges}
            onClick={() => {
              setBusy(true);
              void onConfirm(body).finally(() => setBusy(false));
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gross monthly (₦)" required>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="1,500,000"
          />
        </Field>
        <Field label="Start date" required>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
          />
        </Field>
        {!hasChanges && (
          <p className="text-meta text-muted">
            Nothing here differs from the offer as it stands.
          </p>
        )}
      </div>
    </Modal>
  );
}

function RejectDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Reject this candidate?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onConfirm(reason)}
          >
            Reject
          </Button>
        </>
      }
    >
      <Field label="Reason" optional help="Kept internal.">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      </Field>
    </Modal>
  );
}

/**
 * A distinct fact from `RejectDialog` — `ApplicationOutcome` has both
 * `REJECTED` and `WITHDRAWN` as separate values, and the two controls must
 * not read as one act wearing two labels. The candidate pulling out on
 * their own is not the company turning them down, so neither this title nor
 * its confirm button ever says "declined" or "rejected".
 */
function WithdrawApplicationDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="The candidate pulled out?"
      description="Records that they withdrew on their own, not that the company turned them down. It reads differently everywhere this application appears."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onConfirm(reason)}
          >
            Record as withdrawn
          </Button>
        </>
      }
    >
      <Field label="Reason" optional help="Kept internal.">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      </Field>
    </Modal>
  );
}

export type { ApiStage };

/* ------------------------------------------------------- screening answers */

/**
 * What the screener asked, and what they were told.
 *
 * ## These five facts were written and could not be read
 *
 * `advance` on the screening queue collects a notice period, a current salary,
 * an expected salary, right to work and a CV, and writes them onto `Candidate`.
 * `ApiApplicationDetail.candidate` has carried every one of them since the
 * recruitment module shipped. **Nothing rendered any of them**, and
 * `useCandidateMutations().update` — the PATCH that corrects them — had no
 * consumer at all.
 *
 * So a recruiter typed somebody's salary expectation into a dialog, pressed
 * Screen in, and the candidate's own record never mentioned it again. The
 * figure that decides whether an offer is worth making was in the database and
 * unreachable from the one screen built to decide it.
 *
 * That is the fifth instance of this shape in this codebase — a capability
 * present, correct, and findable by nobody — and the second where somebody had
 * already entered the data.
 *
 * ## Not the same thing as the demo's "Screening answers"
 *
 * The seeded pipeline renders a per-role **questionnaire**:
 * `requisition.screeningQuestions` with a free-text answer each and a knockout
 * flag. There is no such model on the API — `Requisition` has no questions and
 * `Application` has no answers — so that panel cannot be wired, and pretending
 * otherwise would mean inventing questions nobody set. This panel is the five
 * facts the API does hold, which the demo does not show.
 *
 * ## Absent is never zero, and two of the five are money
 *
 * `currentSalaryKobo: null` means nobody asked. Rendering it as ₦0.00 would
 * claim a person earns nothing — the same wrong claim as the payroll that paid
 * a company ₦0 because no attendance row existed, on the figure an offer is
 * negotiated against. `Money` takes `number | null` for exactly this and
 * carries its own absent copy.
 *
 * `rightToWork` is three states, not two: yes, no, and **not asked**. A `null`
 * shown as "No" would reject somebody for a question nobody put to them.
 */
export function RealScreening({
  application,
  onChanged,
}: {
  application: ApiApplicationDetail;
  onChanged: () => void;
}) {
  const candidate = application.candidate;
  const canManage = useCan("MANAGE_HIRING");
  const [editing, setEditing] = useState(false);

  const asked =
    candidate.noticeDays !== null ||
    candidate.currentSalaryKobo !== null ||
    candidate.expectedSalaryKobo !== null ||
    candidate.rightToWork !== null;

  return (
    <Card>
      <CardHeader
        title="What the screener asked"
        description={
          asked
            ? "Recorded when they were screened in. Correct anything that has changed."
            : undefined
        }
        {...(canManage
          ? {
              action: (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(true)}
                >
                  {asked ? "Update" : "Fill these in"}
                </Button>
              ),
            }
          : {})}
      />
      <CardBody className="flex flex-col gap-3">
        {!asked && (
          <p className="text-body-sm text-muted">
            Nothing was recorded when this person was screened in. None of it is
            required — an offer can be made without any of it — but a notice
            period and a salary expectation are what a hiring manager asks for
            first.
          </p>
        )}

        <DescriptionList
          columns={2}
          items={[
            {
              term: "Notice period",
              /* "Not asked" rather than "0 days". Somebody on no notice and
                 somebody nobody asked are different facts, and the first is a
                 reason to move fast. */
              value:
                candidate.noticeDays === null ? (
                  <span className="text-faint">Not asked</span>
                ) : candidate.noticeDays === 0 ? (
                  "Available immediately"
                ) : (
                  `${String(candidate.noticeDays)} ${candidate.noticeDays === 1 ? "day" : "days"}`
                ),
            },
            {
              term: "Right to work",
              value:
                candidate.rightToWork === null ? (
                  <span className="text-faint">Not asked</span>
                ) : (
                  <Badge
                    tone={candidate.rightToWork ? "success" : "warning"}
                    size="sm"
                  >
                    {candidate.rightToWork ? "Confirmed" : "Not confirmed"}
                  </Badge>
                ),
            },
            {
              term: "Earning now",
              value: (
                <Money
                  amount={
                    candidate.currentSalaryKobo === null
                      ? null
                      : naira(candidate.currentSalaryKobo)
                  }
                  decimals
                  per="month"
                  absent="Not asked"
                />
              ),
            },
            {
              term: "Expecting",
              value: (
                <Money
                  amount={
                    candidate.expectedSalaryKobo === null
                      ? null
                      : naira(candidate.expectedSalaryKobo)
                  }
                  decimals
                  per="month"
                  absent="Not asked"
                />
              ),
            },
          ]}
        />

        <CvLine storageKey={candidate.cvStorageKey} source={candidate.source} />
      </CardBody>

      {/* `candidate` is always available here (it comes straight from the
          `application` prop, not from `editing`), so the only thing this
          state gates is `open` — `Modal` stays mounted and decides for
          itself whether to render. */}
      <ScreeningDialog
        open={editing}
        candidate={candidate}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    </Card>
  );
}

/**
 * The CV, and the honest thing to say about it.
 *
 * `cvStorageKey` is a **key**, not a file. No deployment has ever had
 * `S3_BUCKET` set, so the bytes are not there to serve and the API says so at
 * boot. A download button here would be a control whose only outcome is a
 * refusal — so the key is named as a record that one was attached, and where it
 * has to be fetched from until object storage is wired.
 */
function CvLine({
  storageKey,
  source,
}: {
  storageKey: string | null;
  source: string | null;
}) {
  if (!storageKey && !source) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3">
      {storageKey && (
        <p className="text-meta text-muted">
          A CV was attached on screening.{" "}
          <span className="text-faint">
            It is recorded as a storage key and cannot be downloaded until file
            storage is configured.
          </span>
        </p>
      )}
      {source && (
        <p className="text-meta text-muted">
          Heard about the role through{" "}
          <span className="text-body">{source}</span>.
        </p>
      )}
    </div>
  );
}

/**
 * Correcting the five.
 *
 * Sent as a **whole set**, and an emptied field clears the fact rather than
 * leaving it: that is the only way somebody can take back an expectation that
 * was noted wrong, and `UpdateCandidateBody` accepts `null` for each. A form
 * that only ever added would make a mistyped salary permanent.
 */
function ScreeningDialog({
  open,
  candidate,
  onClose,
  onSaved,
}: {
  open: boolean;
  candidate: ApiApplicationDetail["candidate"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const candidates = useCandidateMutations();
  const [notice, setNotice] = useState(
    candidate.noticeDays === null ? "" : String(candidate.noticeDays),
  );
  const [current, setCurrent] = useState(
    candidate.currentSalaryKobo === null
      ? ""
      : String(naira(candidate.currentSalaryKobo)),
  );
  const [expected, setExpected] = useState(
    candidate.expectedSalaryKobo === null
      ? ""
      : String(naira(candidate.expectedSalaryKobo)),
  );
  const [right, setRight] = useState(
    candidate.rightToWork === null ? "" : candidate.rightToWork ? "yes" : "no",
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /* A blank box is a cleared fact, so an empty string maps to null rather than
     being dropped from the body. `Number("")` is 0, which is why this parses
     explicitly instead. */
  const numberOrNull = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const days = numberOrNull(notice);
      const now = numberOrNull(current);
      const want = numberOrNull(expected);
      await candidates.update(candidate.id, {
        noticeDays: days === null ? null : Math.round(days),
        currentSalaryKobo: now === null ? null : kobo(now),
        expectedSalaryKobo: want === null ? null : kobo(want),
        rightToWork: right === "" ? null : right === "yes",
      });
      onSaved();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What the screener asked"
      description="Leave anything blank that was never asked. Clearing a box removes what was recorded."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Notice period"
          optional
          help="In days. Zero means they can start immediately, which is a different answer from leaving it blank."
        >
          <Input
            type="number"
            min={0}
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
            placeholder="30"
          />
        </Field>
        <Field label="Earning now" optional help="Monthly, in naira.">
          <Input
            type="number"
            min={0}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            placeholder="400000"
          />
        </Field>
        <Field
          label="Expecting"
          optional
          help="Monthly, in naira. This is the figure an offer gets measured against."
        >
          <Input
            type="number"
            min={0}
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="550000"
          />
        </Field>
        <Field
          label="Right to work"
          optional
          help="Blank means nobody asked — which is not the same as being told no."
        >
          <Select
            value={right}
            onChange={(event) => setRight(event.target.value)}
          >
            <option value="">Not asked</option>
            <option value="yes">Confirmed</option>
            <option value="no">Not confirmed</option>
          </Select>
        </Field>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
