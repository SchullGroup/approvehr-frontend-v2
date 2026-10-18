"use client";

import { CalendarClock } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { INTERVIEW_KIND_LABEL } from "@/lib/api/recruitment";
import type { CalendarFile } from "@/lib/hiring/interviews/gateway";
import type { InterviewView } from "@/lib/hiring/interviews/model";
import { candidateWasInvited } from "@/lib/hiring/interviews/words";
import { formatWeekdayTime, zoneLabel } from "@/lib/time";
import { CalendarMenu } from "./calendar-menu";
import { InterviewEmails } from "./interview-emails";
import { JoinLink } from "./join-link";

/**
 * One interview, as it stands: when (on the company's clock), where, the link to join,
 * who was invited to score it, the actions that are open to it and the emails asked for.
 *
 * It decides nothing. What a button does is handed in, so the same card serves a
 * connected record and a practice one. The scorecard controls differ between the two
 * (a practice board has none) and arrive as slots.
 */

const STATUS_TONE = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
} as const;

export function InterviewCard({
  interview,
  timeZone,
  canManage,
  busy = false,
  getFile,
  onReschedule,
  onCancel,
  onComplete,
  onNoShow,
  onNotify,
  scorecardActions,
  scorecardPanel,
  reminders,
  className,
}: {
  interview: InterviewView & { saving?: boolean };
  timeZone: string;
  canManage: boolean;
  busy?: boolean;
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
  onReschedule: (interview: InterviewView) => void;
  onCancel: (interview: InterviewView) => void;
  onComplete: (interview: InterviewView) => void;
  onNoShow: (interview: InterviewView) => void;
  /** Offered, for an interview nobody has been invited to, when mail is possible at all. */
  onNotify?: (interview: InterviewView) => void;
  /** What is said about scorecards, and the buttons for them, beside the other actions. */
  scorecardActions?: React.ReactNode;
  /** What was submitted, below the card. Connected records only. */
  scorecardPanel?: React.ReactNode;
  /** The reminders planned and sent for it. */
  reminders?: React.ReactNode;
  className?: string;
}) {
  const scheduled = interview.status === "SCHEDULED";
  /* The clock it was booked on: the company's, unless it was booked on another. */
  const zone = interview.timeZone ?? timeZone;

  return (
    <div
      className={className ?? "rounded-md border border-line p-3"}
      aria-busy={interview.saving || undefined}
    >
      <div className="flex items-start gap-3">
        <CalendarClock
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-faint"
        />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-ink">
            {INTERVIEW_KIND_LABEL[interview.kind]}
          </p>
          <p className="tabular mt-0.5 text-meta text-muted">
            {formatWeekdayTime(interview.scheduledFor, zone)} ·{" "}
            {zoneLabel(zone)} · {interview.durationMins} mins
            {interview.location ? ` · ${interview.location}` : ""}
            {interview.stageName ? ` · ${interview.stageName}` : ""}
          </p>
          {interview.joinUrl && (
            <p className="mt-1">
              <JoinLink url={interview.joinUrl} />
            </p>
          )}
          {interview.panelists.length > 0 && (
            <p className="mt-1 text-meta text-muted">
              Invited to score it:{" "}
              {interview.panelists.map((person, index) => (
                <span key={person.key}>
                  {index > 0 ? ", " : ""}
                  <span className="text-body">{person.name}</span>
                  {person.submitted ? " (scorecard in)" : " (waiting)"}
                </span>
              ))}
            </p>
          )}
          {interview.status === "CANCELLED" && interview.cancelReason && (
            <p className="mt-1 text-meta text-muted">
              Cancelled: {interview.cancelReason}
            </p>
          )}
        </div>
        <Badge tone={STATUS_TONE[interview.status]} size="sm">
          {interview.saving
            ? "Saving"
            : interview.status.replace("_", " ").toLowerCase()}
        </Badge>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        {scorecardActions}
        {scheduled && (
          <CalendarMenu
            interview={interview}
            who="staff"
            copyLink={false}
            getFile={() => getFile(interview)}
          />
        )}
        {scheduled && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onComplete(interview)}
            >
              Mark complete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onNoShow(interview)}
            >
              No-show
            </Button>
            {canManage &&
              onNotify &&
              interview.notices !== null &&
              !candidateWasInvited(interview.notices) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onNotify(interview)}
                >
                  Send the invitation
                </Button>
              )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onReschedule(interview)}
              >
                Reschedule
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onCancel(interview)}
              >
                Cancel
              </Button>
            )}
          </>
        )}
      </div>

      {(interview.notices !== null || interview.reminders) && (
        <div className="mt-2.5 flex flex-col gap-3 border-t border-line pt-2.5">
          <InterviewEmails notices={interview.notices} timeZone={timeZone} />
          {reminders}
        </div>
      )}

      {scorecardPanel}
    </div>
  );
}
