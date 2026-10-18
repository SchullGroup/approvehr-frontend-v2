"use client";

import { useSyncExternalStore } from "react";
import type { InterviewKind, InterviewStatus } from "@/lib/api/recruitment";
import {
  APPLICATIONS,
  CANDIDATES,
  INTERVIEWS,
  REQUISITIONS,
} from "@/lib/mock/hiring";
import { EMPLOYEES } from "@/lib/mock/people";
import { createPersistedState } from "@/lib/store/persisted";
import {
  defaultReminderSettings,
  type ReminderLogEntry,
} from "./demo-reminders";
import type { DemoInterview, InterviewBook, Op } from "./demo-ops";
import type { InterviewNotice } from "./model";

/**
 * The demo's interviews, kept in this browser.
 *
 * Built once from the interviews the seeded hiring module already has, so the record,
 * the diary and "My interviews" agree about who is meeting whom, and then it is the
 * browser's own: a booked, moved or cancelled interview is still that on the next
 * screen and after a refresh.
 *
 * Everything below `seed` is behind `DEMO_ENABLED`, so a production build holds an
 * empty book and none of the invented people.
 */

const KIND: Record<string, InterviewKind> = {
  recruiter_screen: "SCREEN",
  technical: "TECHNICAL",
  panel: "PANEL",
  final: "FINAL",
};
const STATUS: Record<string, InterviewStatus> = {
  scheduled: "SCHEDULED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  no_show: "NO_SHOW",
};

/** A link and a room for a few of them, so the cards show both. */
const WHERE: Record<string, { location?: string; joinUrl?: string }> = {
  "int-02": { joinUrl: "https://meet.google.com/abc-defg-hij" },
  "int-05": { location: "Boardroom, 4th floor" },
  "int-06": { joinUrl: "https://zoom.us/j/84012345678" },
};

const EMPTY: InterviewBook = {
  interviews: [],
  counter: 0,
  reminderSettings: defaultReminderSettings(),
};

const nameOfSeat = (seat: string): string => {
  const person = EMPLOYEES.find((e) => `e:${e.id}` === seat);
  return person ? `${person.firstName} ${person.lastName}` : "A colleague";
};

/**
 * What the seed says was sent for an interview that had its invitation sent: the candidate's
 * and each panelist's, on the day given. It is seed data, written as the API would have
 * written it, so the cards and the reminders have a real record to read. Nothing a person
 * does on the practice board is ever recorded as sent.
 */
const sentInvitations = (
  id: string,
  candidate: string,
  seats: readonly string[],
  at: string,
): InterviewNotice[] => [
  {
    id: `${id}-n-c`,
    kind: "INVITE",
    audience: "CANDIDATE",
    recipient: candidate,
    status: "SENT",
    note: null,
    at,
    inApp: null,
  },
  ...seats.map((seat): InterviewNotice => ({
    id: `${id}-n-${seat}`,
    kind: "INVITE",
    audience: "PANELIST",
    recipient: nameOfSeat(seat),
    status: "SENT",
    note: null,
    at,
    inApp: "created",
  })),
];

const NO_REPLY_TO =
  "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere";

/** The reminders the seed says already went. */
const LOGS: Record<string, ReminderLogEntry[]> = {
  "int-03": [
    {
      kind: "CANDIDATE_EARLY",
      audience: "CANDIDATE",
      at: "2026-08-12T10:00:00.000Z",
      status: "SENT",
      note: null,
    },
    {
      kind: "PANELIST",
      audience: "PANELIST",
      at: "2026-08-12T10:00:00.000Z",
      status: "SENT",
      note: null,
    },
    {
      kind: "CANDIDATE_FINAL",
      audience: "CANDIDATE",
      at: "2026-08-13T09:00:00.000Z",
      status: "SENT",
      note: null,
    },
  ],
  "int-07": [
    {
      kind: "CANDIDATE_EARLY",
      audience: "CANDIDATE",
      at: "2026-08-16T09:00:00.000Z",
      status: "SENT",
      note: null,
    },
    {
      kind: "PANELIST",
      audience: "PANELIST",
      at: "2026-08-16T09:00:00.000Z",
      status: "SKIPPED",
      note: NO_REPLY_TO,
    },
    {
      kind: "CANDIDATE_FINAL",
      audience: "CANDIDATE",
      at: "2026-08-17T08:00:00.000Z",
      status: "SENT",
      note: null,
    },
    {
      kind: "SCORECARD_NUDGE",
      audience: "PANELIST",
      at: "2026-08-18T10:00:00.000Z",
      status: "SENT",
      note: null,
    },
  ],
};

/** Whose invitation was sent, and when. The rest were booked without one. */
const INVITED: Record<string, string> = {
  "int-02": "2026-08-14T09:00:00.000Z",
  "int-03": "2026-08-10T09:00:00.000Z",
  "int-07": "2026-08-12T09:00:00.000Z",
};

function seed(): InterviewBook {
  if (!DEMO_ENABLED) return EMPTY;
  const interviews: DemoInterview[] = INTERVIEWS.flatMap((interview) => {
    const application = APPLICATIONS.find(
      (a) => a.id === interview.applicationId,
    );
    const candidate = CANDIDATES.find((c) => c.id === application?.candidateId);
    const role = REQUISITIONS.find((r) => r.id === application?.requisitionId);
    if (!application || !candidate) return [];
    const where = WHERE[interview.id];
    const seats = interview.interviewerIds.map((id) => `e:${id}`);
    const name = `${candidate.firstName} ${candidate.lastName}`;
    const invited = INVITED[interview.id];
    return [
      {
        id: interview.id,
        applicationId: interview.applicationId,
        candidateName: name,
        role: role?.title ?? null,
        kind: KIND[interview.kind] ?? "SCREEN",
        scheduledFor: new Date(interview.scheduledFor).toISOString(),
        durationMins: interview.durationMins,
        status: STATUS[interview.status] ?? "SCHEDULED",
        location: where?.location ?? null,
        joinUrl: where?.joinUrl ?? null,
        timeZone: "Africa/Lagos",
        stageName: null,
        seats,
        sequence: 0,
        notices: invited
          ? sentInvitations(interview.id, name, seats, invited)
          : [],
        cancelReason: null,
        remindersOff: false,
        reminderLog: LOGS[interview.id] ?? [],
      },
    ];
  });

  /* One more, so a panelist has an interview that took place and a scorecard still due,
     with the first nudge already gone. */
  const extra = APPLICATIONS.find((a) => a.id === "app-11");
  const extraCandidate = CANDIDATES.find((c) => c.id === extra?.candidateId);
  if (extra && extraCandidate) {
    const seats = ["e:p-05", "e:p-04"];
    const name = `${extraCandidate.firstName} ${extraCandidate.lastName}`;
    interviews.push({
      id: "int-07",
      applicationId: extra.id,
      candidateName: name,
      role:
        REQUISITIONS.find((r) => r.id === extra.requisitionId)?.title ?? null,
      kind: "TECHNICAL",
      scheduledFor: "2026-08-17T09:00:00.000Z",
      durationMins: 60,
      status: "COMPLETED",
      location: "Boardroom, 4th floor",
      joinUrl: null,
      timeZone: "Africa/Lagos",
      stageName: null,
      seats,
      sequence: 0,
      notices: sentInvitations("int-07", name, seats, INVITED["int-07"] ?? ""),
      cancelReason: null,
      remindersOff: false,
      reminderLog: LOGS["int-07"] ?? [],
    });
  }
  return {
    interviews,
    counter: 0,
    reminderSettings: defaultReminderSettings(),
  };
}

/** Bump when the book's shape changes: an old payload is dropped, not merged. */
const BOOK_VERSION = 2;

export const demoInterviews = createPersistedState<InterviewBook>({
  key: "approvehr.hiring.interviews.store",
  empty: seed(),
  version: BOOK_VERSION,
});

/** The book, for rendering. Re-renders when anything changes it. */
export function useDemoInterviews(): InterviewBook {
  return useSyncExternalStore(
    demoInterviews.subscribe,
    demoInterviews.read,
    demoInterviews.getServerSnapshot,
  );
}

/**
 * Run a write against the book and keep the result.
 *
 * Read with `current()`, never `read()`: until something subscribes `read()` is the
 * seed, and committing a write computed from it would throw away everything this
 * browser had stored. See `persisted.ts`.
 */
export function interviewRun<T>(write: (book: InterviewBook) => Op<T>): Op<T> {
  const result = write(demoInterviews.current());
  if (result.ok) demoInterviews.commit(result.book);
  return result;
}
