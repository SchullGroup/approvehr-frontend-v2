"use client";

import { Badge, Switch } from "@/components/ui";
import type { InterviewView } from "@/lib/hiring/interviews/model";
import {
  followsQueuedInvitation,
  groupReminders,
  pausedLine,
  reasonOf,
  recipientsWords,
  reminderStatus,
  waiting,
  whenWords,
  type ReminderGroup,
} from "@/lib/hiring/interviews/reminders";
import { formatWeekdayTime, zoneLabel } from "@/lib/time";

/**
 * The reminders on one interview: what is planned, what went, and why there may be none.
 *
 * ## It follows an invitation that was sent
 *
 * A reminder is never the first email anybody gets, so the API plans none until an
 * invitation has been sent, and says which of its reasons applies when there are none.
 * This shows that sentence: "No reminders: the invitation wasn't sent." for the plainest.
 *
 * ## Planned, sent and skipped are different things
 *
 * A reminder waiting for its time is "Planned", with the day and time on the company's
 * clock. One is "Sent" only where the API says so; a skipped one says why in the API's own
 * words. The people a reminder is for are named, a panel's once with all the names, because
 * the API writes one row per person.
 *
 * ## One switch, and it is the candidate's
 *
 * The company decides what the panel is reminded of; one interview can only switch off
 * the candidate's. The switch says so, and tells nobody anything.
 *
 * Draws nothing at all where the server does not say what is planned: not knowing is never
 * "there are none".
 */

function Rows({
  groups,
  zone,
  now,
  muted = false,
}: {
  groups: ReminderGroup[];
  zone: string;
  /** The time now, in milliseconds. */
  now: number;
  muted?: boolean;
}) {
  const when = (iso: string) =>
    `${formatWeekdayTime(iso, zone)} · ${zoneLabel(zone)}`;
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => {
        const status = reminderStatus(group.status);
        const reason = reasonOf(group.reason);
        return (
          <li
            key={group.key}
            className={`flex flex-col gap-0.5 rounded-md bg-sunken px-3 py-2 ${muted ? "opacity-80" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm font-medium text-ink">
                {group.label}
              </span>
              <Badge tone={status.tone} size="sm">
                {status.label}
              </Badge>
            </div>
            <p className="text-meta text-muted">{recipientsWords(group)}</p>
            <p className="tabular text-meta text-muted">
              {whenWords(group, when, now)}
            </p>
            {reason && <p className="text-body-sm text-body">{reason}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function InterviewReminders({
  interview,
  timeZone,
  now,
  canManage,
  busy = false,
  onCandidateReminders,
}: {
  interview: InterviewView;
  timeZone: string;
  /** The time now, as an ISO instant: the gateway's, so a practice board keeps its own. */
  now: string;
  canManage: boolean;
  busy?: boolean;
  /** `on` is the new state of the candidate's reminders. */
  onCandidateReminders: (interview: InterviewView, on: boolean) => void;
}) {
  const reminders = interview.reminders;
  if (!reminders) return null;

  const zone = interview.timeZone ?? timeZone;
  const groups = groupReminders(reminders.items);
  const current = groups.filter((g) => g.current);
  const clock = Date.parse(now);
  const earlier = groups.filter((g) => !g.current);
  const line = pausedLine(reminders);
  const somethingWaits = reminders.items.some(waiting);
  const candidateOn = interview.candidateReminders !== false;
  const canSwitch =
    canManage &&
    interview.status === "SCHEDULED" &&
    interview.candidateReminders !== undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-meta font-semibold text-muted">Reminders</p>

      {line && <p className="text-meta text-muted">{line}</p>}

      {canSwitch && (
        <Switch
          label="Don't remind the candidate about this interview"
          description="The panel's reminders are not changed."
          checked={!candidateOn}
          disabled={busy}
          onChange={(event) =>
            onCandidateReminders(interview, !event.target.checked)
          }
        />
      )}

      {somethingWaits && followsQueuedInvitation(interview.notices) && (
        <p className="text-meta text-muted">
          These go only once the invitation has gone. It is queued, not sent.
        </p>
      )}

      {current.length > 0 && <Rows groups={current} zone={zone} now={clock} />}

      {earlier.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-meta text-muted">
            Planned for an earlier version of this interview
          </p>
          <Rows groups={earlier} zone={zone} now={clock} muted />
        </div>
      )}
    </div>
  );
}
