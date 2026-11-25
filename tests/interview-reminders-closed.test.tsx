import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { InterviewReminders } from "@/components/hiring/interviews/interview-reminders";
import {
  CancelInterviewDialog,
  RescheduleInterviewDialog,
  ScheduleInterviewDialog,
} from "@/components/hiring/interviews/interview-dialogs";
import { ApiError } from "@/lib/api/client";
import {
  settingsViewOf,
  defaultReminderSettings,
} from "@/lib/hiring/interviews/demo-reminders";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type { InterviewsGateway } from "@/lib/hiring/interviews/gateway";
import type {
  ChangeResult,
  InterviewNotice,
  InterviewView,
} from "@/lib/hiring/interviews/model";
import type {
  InterviewReminders as Reminders,
  PlannedReminder,
} from "@/lib/hiring/interviews/reminders";

/**
 * A closed interview's reminders say they are not needed (UAT 23 Nov, U91 /
 * PERF-30). The API skips a reminder before the interview once it is not
 * scheduled, and a scorecard nudge once it was cancelled or nobody came; the
 * screen said "Planned" for both. (Harness from interview-reminders-ui.test.tsx.)
 *
 * The Reminders section of an interview.
 *
 * What these hold: it says what is planned, what went and what was skipped and why; it
 * says why there are none in the API's words, and plainly when the invitation wasn't sent;
 * it never calls a reminder sent unless the API did; the one switch is the candidate's and
 * says so; and turning it off shows at once and is put back, with the API's sentence, if it
 * is refused.
 */

const sent: InterviewNotice = {
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  status: "SENT",
  note: null,
  at: "2026-10-12T09:00:00.000Z",
};

const item = (over: Partial<PlannedReminder> = {}): PlannedReminder => ({
  id: "r1",
  slot: "cand-early",
  label: "Reminder to the candidate (earlier)",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  dueAt: "2026-10-19T09:00:00.000Z",
  sentAt: null,
  status: "planned",
  reason: null,
  current: true,
  ...over,
});

const panel = (
  name: string,
  over: Partial<PlannedReminder> = {},
): PlannedReminder =>
  item({
    id: `p-${name}`,
    slot: "pan-late",
    label: "Reminder to the panelist (shortly before)",
    audience: "PANELIST",
    recipient: name,
    dueAt: "2026-10-20T08:00:00.000Z",
    ...over,
  });

const reminders = (
  items: PlannedReminder[],
  paused: Reminders["paused"] = null,
): Reminders => ({ items, paused });

const view = (
  list: Reminders | null | undefined,
  over: Partial<InterviewView> = {},
): InterviewView => ({
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: null,
  joinUrl: null,
  timeZone: "Africa/Lagos",
  stageName: null,
  panelists: [],
  sequence: 0,
  notices: [sent],
  cancelReason: null,
  candidateReminders: true,
  ...(list === undefined ? {} : { reminders: list }),
  ...over,
});

function show(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof InterviewReminders>> = {},
) {
  const onCandidateReminders = vi.fn();
  render(
    <ToastProvider>
      <InterviewReminders
        interview={interview}
        timeZone="Africa/Lagos"
        now="2026-10-10T09:00:00.000Z"
        canManage
        onCandidateReminders={onCandidateReminders}
        {...over}
      />
    </ToastProvider>,
  );
  return onCandidateReminders;
}

const rowOf = (label: string) =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .find((row) => row.textContent?.includes(label));

const NUDGE = "Nudge to hand in the scorecard";

describe("a closed interview's reminders", () => {
  const items = [
    item(),
    item({
      id: "n1",
      slot: "nudge-1",
      label: NUDGE,
      audience: "PANELIST",
      recipient: "Chidi Nwosu",
      dueAt: "2026-10-21T09:00:00.000Z",
    }),
  ];

  it("says the candidate's reminder is not needed once it is complete, and the nudge still goes", () => {
    show(view(reminders(items), { status: "COMPLETED" }));
    const early = rowOf("Reminder to the candidate (earlier)");
    expect(early).toHaveTextContent("Not needed");
    expect(early).not.toHaveTextContent("Planned");
    expect(early).toHaveTextContent("Was planned for Mon 19 Oct");
    expect(rowOf(NUDGE)).toHaveTextContent("Planned");
  });

  it("says nothing is needed once it is cancelled or nobody came", () => {
    show(view(reminders(items), { status: "CANCELLED" }));
    expect(rowOf("Reminder to the candidate (earlier)")).toHaveTextContent(
      "Not needed",
    );
    expect(rowOf(NUDGE)).toHaveTextContent("Not needed");
  });

  it("leaves a scheduled interview's reminders as planned", () => {
    show(view(reminders(items)));
    expect(rowOf("Reminder to the candidate (earlier)")).toHaveTextContent(
      "Planned",
    );
    expect(rowOf(NUDGE)).toHaveTextContent("Planned");
  });
});
