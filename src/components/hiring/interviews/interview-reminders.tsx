"use client";

import { Badge, Switch, TextLink } from "@/components/ui";
import type { InterviewView } from "@/lib/hiring/interviews/model";
import {
  noRemindersBecause,
  reasonOf,
  reminderStatus,
  reminderTitle,
  type ReminderSettings,
} from "@/lib/hiring/interviews/reminders";
import { formatWeekdayTime, zoneLabel } from "@/lib/time";

/**
 * The reminders on one interview: what is planned, what went, and why there may be none.
 *
 * ## It follows an invitation that was sent
 *
 * A reminder is never the first email a candidate gets, so there are none, and no switch
 * for them, unless the invitation was actually **sent**. Without one this says why in a
 * line: "No reminders: the invitation wasn't sent." Queued is not sent, and it says that
 * too.
 *
 * ## Planned, sent and skipped are three different things
 *
 * A reminder waiting for its time is "Planned", with the day and time on the company's
 * clock. One is "Sent" only where the API says so, and a skipped one says why in the API's
 * own words. When somebody turns reminders off for one interview, what was planned for it
 * is gone, and what already went stays on the list.
 *
 * Draws nothing at all where the server does not say what is planned: not knowing is never
 * "there are none".
 */

export function InterviewReminders({
  interview,
  timeZone,
  settings,
  canManage,
  busy = false,
  onOff,
}: {
  interview: InterviewView;
  timeZone: string;
  /** The company's defaults, for the words ("24 hours before"). */
  settings: ReminderSettings | null;
  canManage: boolean;
  busy?: boolean;
  onOff: (interview: InterviewView, off: boolean) => void;
}) {
  const reminders = interview.reminders;
  if (!reminders) return null;

  const because = noRemindersBecause(interview);
  const zone = interview.timeZone ?? timeZone;
  const planned = reminders.items.filter((item) => item.status === "PLANNED");

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-meta font-semibold text-muted">Reminders</p>

      {because ? (
        <p className="text-meta text-muted">{because}</p>
      ) : (
        <>
          {interview.status !== "CANCELLED" && canManage && (
            <Switch
              label="Don't send reminders for this interview"
              description="Turns them all off for this one. The company's settings are not changed."
              checked={reminders.off}
              disabled={busy}
              onChange={(event) => onOff(interview, event.target.checked)}
            />
          )}

          {reminders.off && (
            <p className="text-meta text-muted">
              Reminders are off for this interview. Nothing is planned.
            </p>
          )}

          {!reminders.off &&
            planned.length === 0 &&
            interview.status === "SCHEDULED" && (
              <p className="text-meta text-muted">
                Nothing is planned. Every reminder time has passed, or they are
                switched off in{" "}
                <TextLink href="/hiring/settings/interviews">
                  the company&apos;s settings
                </TextLink>
                .
              </p>
            )}

          {reminders.items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {reminders.items.map((item) => {
                const status = reminderStatus(item.status);
                const reason = reasonOf(item.note);
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-0.5 rounded-md bg-sunken px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium text-ink">
                        {reminderTitle(item, settings)}
                      </span>
                      <Badge tone={status.tone} size="sm">
                        {status.label}
                      </Badge>
                    </div>
                    <p className="tabular text-meta text-muted">
                      {formatWeekdayTime(item.at, zone)} · {zoneLabel(zone)}
                    </p>
                    {reason && (
                      <p className="text-body-sm text-body">{reason}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
