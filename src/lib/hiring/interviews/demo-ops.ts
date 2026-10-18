import type { InterviewKind, InterviewStatus } from "@/lib/api/recruitment";
import { merge, type Values } from "@/lib/hiring/comms/fields";
import type { EmailKind } from "@/lib/hiring/comms/model";
import {
  eventFor,
  googleCalendarUrl,
  outlookCalendarUrl,
} from "@/lib/hiring/interviews/calendar";
import { formatDate, formatTime, zoneLabel } from "@/lib/time";
import type {
  CancelInput,
  ChangeInput,
  ChangeOutcome,
  InterviewNotice,
  InterviewView,
  NoticeAudience,
  NoticeKind,
  ScheduleInput,
} from "./model";
import { joinLinkProblem } from "./join-link";
import {
  plannedCount,
  remindersOf,
  type ReminderLogEntry,
} from "./demo-reminders";
import { invitationSent, type ReminderSettings } from "./reminders";

/**
 * The demo's interviews, as plain functions over a plain object.
 *
 * A practice board has no server and no mail, but the interview screens still have to
 * be something a person can try: book one, move it, cancel it, add it to a calendar,
 * see what the invitation would have said. So the demo keeps a **book** in this browser
 * and these functions answer the way the API would, with the same refusals in the same
 * sentences, so the demo cannot show a flow the real one would refuse.
 *
 * ## Nothing is ever sent from here
 *
 * When somebody chooses to send an invitation, an update or a cancellation, the book
 * records that they asked and records that it was **not sent**, with the reason, using
 * the checks the API's worker makes in the same order: the company's switch, the
 * reply-to address, a field with no value. Past all of them the only reason left is
 * that a practice board has no mail. When they chose not to send, it says "not asked".
 * It never says a message went out.
 *
 * Pure on purpose: every function takes the book and returns the next one, and never
 * reads storage, the clock or a store, so each rule is a unit test and `demo-store.ts`
 * is the only thing that touches a browser.
 */

export type DemoInterview = {
  id: string;
  applicationId: string;
  candidateName: string;
  role: string | null;
  kind: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  location: string | null;
  joinUrl: string | null;
  timeZone: string | null;
  stageName: string | null;
  /** `e:<employee>` or `u:<account>`: who was invited to score it. */
  seats: string[];
  sequence: number;
  notices: InterviewNotice[];
  cancelReason: string | null;
  /** Somebody turned its reminders off. */
  remindersOff: boolean;
  /** The reminders that went, or were skipped: seed data, never written by this board. */
  reminderLog: ReminderLogEntry[];
};

export type InterviewBook = {
  interviews: DemoInterview[];
  /** For ids and notice ids made here. */
  counter: number;
  /** The company's reminder defaults. */
  reminderSettings: ReminderSettings;
};

export type Op<T = undefined> =
  { ok: true; book: InterviewBook; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

/** The company's mail, as the offline book knows it. */
export type MailRules = {
  enabled: boolean;
  replyTo: string | null;
  companyName: string;
  /** The words for a kind: the company's default template, else the built-in. */
  wording: (kind: EmailKind) => { subject: string; body: string };
};

/** Who is who: names, and whether a scorecard is in. Supplied by whoever has the rosters. */
export type Roster = {
  nameOf: (seat: string) => string;
  submitted: (interview: DemoInterview, seat: string) => boolean;
};

/* ----------------------------------------------------------------- the checks */

export const DURATION_MIN = 5;
export const DURATION_MAX = 480;

/** The sentences the API would refuse a booking with. */
export function refusal(
  input: Pick<ScheduleInput, "scheduledFor" | "durationMins" | "joinUrl">,
): string | null {
  if (Number.isNaN(new Date(input.scheduledFor).getTime()))
    return "Choose when the interview is.";
  if (
    !Number.isInteger(input.durationMins) ||
    input.durationMins < DURATION_MIN ||
    input.durationMins > DURATION_MAX
  )
    return `An interview is ${String(DURATION_MIN)} to ${String(DURATION_MAX)} minutes.`;
  if (input.joinUrl) {
    const problem = joinLinkProblem(input.joinUrl);
    if (problem) return problem;
  }
  return null;
}

/* --------------------------------------------------------------------- notices */

const KIND_OF: Record<NoticeKind, EmailKind> = {
  INVITE: "INVITE",
  UPDATE: "INTERVIEW_UPDATE",
  CANCEL: "INTERVIEW_CANCELLED",
};

const PANELIST_KIND_OF: Record<NoticeKind, EmailKind> = {
  INVITE: "PANELIST_INVITE",
  UPDATE: "PANELIST_UPDATE",
  CANCEL: "PANELIST_CANCELLED",
};

const NOT_SENT = {
  companyOff:
    "not sent: emails to candidates are switched off for this company",
  noReplyTo:
    "not sent: no reply-to address is set for this company (Careers settings). " +
    "We do not send an email whose replies would go nowhere",
  practice: "not sent: nothing is sent from a practice board",
} as const;

const WHY_MISSING: Record<string, string> = {
  interview_date: "the interview has no date",
  interview_time: "the interview has no time",
  candidate_first_name: "it has no name for them",
  job_title: "it has no job title",
};

/**
 * What the words of an email can be filled in with. Where an interview is and the
 * link to join are never "missing" here: the API decides what an in-person interview
 * with no link sends, and an offline copy does not guess.
 */
function valuesFor(
  interview: DemoInterview,
  rules: MailRules,
  timeZone: string,
  who: string,
): Values {
  const event = eventFor(interview, "staff");
  const hours = interview.durationMins / 60;
  return {
    candidate_first_name: who.split(" ")[0] ?? "",
    candidate_name: interview.candidateName,
    panelist_first_name: who.split(" ")[0] ?? "",
    job_title: interview.role,
    company_name: rules.companyName,
    reply_to: rules.replyTo,
    reference: "APP-DEMO0000",
    recruiter_name: "You",
    interview_date: formatDate(interview.scheduledFor, timeZone),
    interview_time: `${formatDate(interview.scheduledFor, timeZone)} at ${formatTime(interview.scheduledFor, timeZone)}`,
    interview_time_zone: zoneLabel(timeZone),
    interview_duration:
      interview.durationMins % 60 === 0
        ? `${String(hours)} ${hours === 1 ? "hour" : "hours"}`
        : `${String(interview.durationMins)} minutes`,
    interview_location:
      interview.location ?? (interview.joinUrl ? "Online" : "To be confirmed"),
    /* The one optional field: nothing for an interview in person, and the line goes. */
    join_link: interview.joinUrl,
    add_to_calendar_link: googleCalendarUrl(event),
    add_to_outlook_link: outlookCalendarUrl(event),
    scorecard_link: "/hiring/my-interviews",
  };
}

function noticeFor(
  id: string,
  interview: DemoInterview,
  rules: MailRules,
  timeZone: string,
  kind: NoticeKind,
  audience: NoticeAudience,
  recipient: string,
  asked: boolean,
  /** Whether this person has already been told the interview is on. */
  told: boolean,
): InterviewNotice {
  if (!asked)
    return {
      id,
      kind,
      audience,
      recipient,
      at: null,
      status: "NOT_ASKED",
      note: null,
    };
  /* Nobody is told a change to something they never heard of: the first thing they
     are sent is the invitation. And nobody is told a cancellation of it either. */
  if (kind === "CANCEL" && !told)
    return {
      id,
      kind,
      audience,
      recipient,
      at: null,
      status: "SKIPPED",
      note: "They were never sent an invitation to this interview, so there is nothing to cancel.",
    };
  const sent: NoticeKind = kind === "UPDATE" && !told ? "INVITE" : kind;
  const base = { id, kind: sent, audience, recipient, at: null };

  const email: EmailKind =
    audience === "PANELIST" ? PANELIST_KIND_OF[sent] : KIND_OF[sent];
  const wording = rules.wording(email);
  const values = valuesFor(
    interview,
    rules,
    timeZone,
    audience === "PANELIST" ? recipient : interview.candidateName,
  );
  const missing = [
    ...new Set([
      ...merge(wording.subject, values).missing,
      ...merge(wording.body, values, { multiline: true }).missing,
    ]),
  ];

  let note: string;
  if (!rules.enabled) note = NOT_SENT.companyOff;
  else if (!rules.replyTo) note = NOT_SENT.noReplyTo;
  else if (missing.length > 0)
    note =
      `not sent: this email uses ${missing.map((m) => `{${m}}`).join(", ")} and ` +
      [
        ...new Set(
          missing.map((m) => WHY_MISSING[m] ?? "it has no value here"),
        ),
      ].join("; ");
  else note = NOT_SENT.practice;
  return { ...base, status: "SKIPPED", note };
}

/** Whether somebody has been sent, or is about to be sent, the invitation. */
const toldBefore = (
  notices: readonly InterviewNotice[],
  audience: NoticeAudience,
  recipient: string,
): boolean =>
  notices.some(
    (n) =>
      n.audience === audience &&
      n.recipient === recipient &&
      (n.kind === "INVITE" || n.kind === "UPDATE") &&
      (n.status === "SENT" || n.status === "SENDING"),
  );

/**
 * Messages for one change: one for the candidate and one for each panelist, either
 * asked for or not. Nothing is recorded for a person the message is not about.
 */
function noticesFor(
  book: InterviewBook,
  interview: DemoInterview,
  rules: MailRules,
  roster: Roster,
  timeZone: string,
  kind: NoticeKind,
  asked: boolean,
): { notices: InterviewNotice[]; counter: number } {
  let n = book.counter;
  const id = () => `n-${String((n += 1))}`;
  const notices: InterviewNotice[] = [
    noticeFor(
      id(),
      interview,
      rules,
      timeZone,
      kind,
      "CANDIDATE",
      interview.candidateName,
      asked,
      toldBefore(interview.notices, "CANDIDATE", interview.candidateName),
    ),
  ];
  for (const seat of interview.seats) {
    notices.push(
      noticeFor(
        id(),
        interview,
        rules,
        timeZone,
        kind,
        "PANELIST",
        roster.nameOf(seat),
        asked,
        toldBefore(interview.notices, "PANELIST", roster.nameOf(seat)),
      ),
    );
  }
  return { notices, counter: n };
}

/* --------------------------------------------------------------------- reading */

export function viewOf(
  interview: DemoInterview,
  roster: Roster,
  /** The defaults and the time, to say what is planned. Without them nothing is said. */
  plan?: { settings: ReminderSettings; now: string },
): InterviewView {
  const owed = interview.seats.some(
    (seat) => !roster.submitted(interview, seat),
  );
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    candidateName: interview.candidateName,
    role: interview.role,
    kind: interview.kind,
    scheduledFor: interview.scheduledFor,
    durationMins: interview.durationMins,
    status: interview.status,
    location: interview.location,
    joinUrl: interview.joinUrl,
    timeZone: interview.timeZone,
    stageName: interview.stageName,
    panelists: interview.seats.map((seat) => ({
      key: seat,
      name: roster.nameOf(seat),
      submitted: roster.submitted(interview, seat),
    })),
    sequence: interview.sequence,
    notices: interview.notices,
    cancelReason: interview.cancelReason,
    ...(plan
      ? {
          reminders: remindersOf(interview, plan.settings, plan.now, owed),
        }
      : {}),
  };
}

export const interviewsOf = (
  book: InterviewBook,
  applicationId: string,
): DemoInterview[] =>
  book.interviews
    .filter((interview) => interview.applicationId === applicationId)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

/* --------------------------------------------------------------------- writing */

export type NewInterview = {
  applicationId: string;
  candidateName: string;
  role: string | null;
  stageName: string | null;
  /** The panel to start from: the stage's own, when nobody was picked. */
  stageSeats: string[];
};

export function schedule(
  book: InterviewBook,
  target: NewInterview,
  input: ScheduleInput,
  seats: string[] | null,
  rules: MailRules,
  roster: Roster,
  timeZone: string,
  at: string,
): Op<{ interview: DemoInterview; outcome: ChangeOutcome }> {
  const problem = refusal(input);
  if (problem) return fail(problem);
  if (
    input.sendInvite &&
    new Date(input.scheduledFor).getTime() < Date.parse(at)
  )
    return fail(
      "That time has passed, so an invitation for it would be no use. Choose a later time, or book it without sending.",
    );

  const id = `iv-${String(book.counter + 1)}`;
  const base: DemoInterview = {
    id,
    applicationId: target.applicationId,
    candidateName: target.candidateName,
    role: target.role,
    kind: input.kind,
    scheduledFor: input.scheduledFor,
    durationMins: input.durationMins,
    status: "SCHEDULED",
    location: input.location,
    joinUrl: input.joinUrl,
    timeZone: input.timeZone,
    stageName: target.stageName,
    seats: seats ?? target.stageSeats,
    sequence: 0,
    notices: [],
    cancelReason: null,
    remindersOff: false,
    reminderLog: [],
  };
  const made = noticesFor(
    { ...book, counter: book.counter + 1 },
    base,
    rules,
    roster,
    timeZone,
    "INVITE",
    input.sendInvite,
  );
  const interview = { ...base, notices: made.notices };
  return {
    ok: true,
    book: {
      ...book,
      interviews: [...book.interviews, interview],
      counter: made.counter,
    },
    value: {
      interview,
      outcome: { asked: input.sendInvite, notices: made.notices },
    },
  };
}

/** What differs between an interview and what a change asks for: the words for "what changed". */
export function changesOf(
  was: Pick<
    InterviewView,
    "kind" | "scheduledFor" | "durationMins" | "location" | "joinUrl"
  >,
  input: Omit<ChangeInput, "sendUpdate">,
): string[] {
  const out: string[] = [];
  if (input.kind !== undefined && input.kind !== was.kind) out.push("kind");
  if (
    input.scheduledFor !== undefined &&
    input.scheduledFor !== was.scheduledFor
  )
    out.push("time");
  if (
    input.durationMins !== undefined &&
    input.durationMins !== was.durationMins
  )
    out.push("length");
  if (input.location !== undefined && input.location !== was.location)
    out.push("place");
  if (input.joinUrl !== undefined && input.joinUrl !== was.joinUrl)
    out.push("link");
  return out;
}

export function change(
  book: InterviewBook,
  interviewId: string,
  input: ChangeInput,
  rules: MailRules,
  roster: Roster,
  timeZone: string,
  at: string,
): Op<{ interview: DemoInterview; outcome: ChangeOutcome }> {
  const was = book.interviews.find((i) => i.id === interviewId);
  if (!was) return fail("That interview is not here any more.");
  if (was.status !== "SCHEDULED")
    return fail("Only an interview that has not happened yet can be changed.");

  const next: DemoInterview = {
    ...was,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.scheduledFor !== undefined
      ? { scheduledFor: input.scheduledFor }
      : {}),
    ...(input.durationMins !== undefined
      ? { durationMins: input.durationMins }
      : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.joinUrl !== undefined ? { joinUrl: input.joinUrl } : {}),
  };
  const problem = refusal(next);
  if (problem) return fail(problem);
  const changed = changesOf(was, input);
  if (changed.length === 0)
    return fail("Nothing here differs from what is already booked.");
  if (
    input.sendUpdate &&
    new Date(next.scheduledFor).getTime() < Date.parse(at)
  )
    return fail(
      "That time has passed, so an updated invitation for it would be no use. Choose a later time, or save it without sending.",
    );

  /* A calendar entry is replaced only when something it shows moved: the time, the
     length, the place or the link. Changing only the kind moves nothing it shows. */
  const callsForUpdate = changed.some((c) => c !== "kind");
  const moved: DemoInterview = {
    ...next,
    sequence: callsForUpdate ? was.sequence + 1 : was.sequence,
  };
  const made = noticesFor(
    book,
    moved,
    rules,
    roster,
    timeZone,
    "UPDATE",
    input.sendUpdate,
  );
  const interview = { ...moved, notices: [...was.notices, ...made.notices] };
  return {
    ok: true,
    book: {
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interviewId ? interview : i,
      ),
      counter: made.counter,
    },
    value: {
      interview,
      outcome: {
        asked: input.sendUpdate,
        notices: made.notices,
        reminders: replanned(book.reminderSettings, was, interview, at, roster),
      },
    },
  };
}

/**
 * What a reschedule did to the reminders: how many are planned for the new time. `null`
 * when the invitation was never sent, because then there were none to move.
 */
function replanned(
  settings: ReminderSettings,
  was: DemoInterview,
  now: DemoInterview,
  at: string,
  roster: Roster,
): { planned: number; removed: number } | null {
  if (!invitationSent(was.notices)) return null;
  const owed = (i: DemoInterview) =>
    i.seats.some((seat) => !roster.submitted(i, seat));
  return {
    planned: plannedCount(remindersOf(now, settings, at, owed(now))),
    removed: plannedCount(remindersOf(was, settings, at, owed(was))),
  };
}

export function cancel(
  book: InterviewBook,
  interviewId: string,
  input: CancelInput,
  rules: MailRules,
  roster: Roster,
  timeZone: string,
  /** The time now, to say how many reminders were taken away. */
  at: string,
): Op<{ interview: DemoInterview; outcome: ChangeOutcome }> {
  const was = book.interviews.find((i) => i.id === interviewId);
  if (!was) return fail("That interview is not here any more.");
  if (was.status !== "SCHEDULED")
    return fail(
      "Only an interview that has not happened yet can be cancelled.",
    );
  const reason = input.reason?.trim() ? input.reason.trim() : null;
  if (reason && reason.length > 500)
    return fail("Keep the reason to 500 characters.");
  const moved: DemoInterview = {
    ...was,
    status: "CANCELLED",
    cancelReason: reason,
    sequence: was.sequence + 1,
  };
  const made = noticesFor(
    book,
    moved,
    rules,
    roster,
    timeZone,
    "CANCEL",
    input.sendCancellation,
  );
  const interview = { ...moved, notices: [...was.notices, ...made.notices] };
  return {
    ok: true,
    book: {
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interviewId ? interview : i,
      ),
      counter: made.counter,
    },
    value: {
      interview,
      outcome: {
        asked: input.sendCancellation,
        notices: made.notices,
        reminders: invitationSent(was.notices)
          ? {
              planned: 0,
              removed: plannedCount(
                remindersOf(
                  was,
                  book.reminderSettings,
                  at,
                  was.seats.some((seat) => !roster.submitted(was, seat)),
                ),
              ),
            }
          : null,
      },
    },
  };
}

export function settle(
  book: InterviewBook,
  interviewId: string,
  status: "COMPLETED" | "NO_SHOW",
): Op {
  const was = book.interviews.find((i) => i.id === interviewId);
  if (!was) return fail("That interview is not here any more.");
  if (was.status !== "SCHEDULED")
    return fail("That interview has already been settled.");
  return {
    ok: true,
    book: {
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interviewId ? { ...i, status } : i,
      ),
    },
    value: undefined,
  };
}

/**
 * "Tell them now": an invitation for an interview that was booked without one, as it
 * stands. It is recorded as asked for and, as everywhere here, as not sent.
 */
export function notify(
  book: InterviewBook,
  interviewId: string,
  rules: MailRules,
  roster: Roster,
  timeZone: string,
  at: string,
): Op<{ interview: DemoInterview; outcome: ChangeOutcome }> {
  const was = book.interviews.find((i) => i.id === interviewId);
  if (!was) return fail("That interview is not here any more.");
  if (was.status !== "SCHEDULED")
    return fail("Only an interview that has not happened yet can be sent.");
  if (Date.parse(was.scheduledFor) < Date.parse(at))
    return fail(
      "That time has passed, so an invitation for it would be no use.",
    );
  const made = noticesFor(book, was, rules, roster, timeZone, "INVITE", true);
  const interview = { ...was, notices: [...was.notices, ...made.notices] };
  return {
    ok: true,
    book: {
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interviewId ? interview : i,
      ),
      counter: made.counter,
    },
    value: { interview, outcome: { asked: true, notices: made.notices } },
  };
}

/** Turns the reminders for one interview off or back on. */
export function setRemindersOff(
  book: InterviewBook,
  interviewId: string,
  off: boolean,
): Op<DemoInterview> {
  const was = book.interviews.find((i) => i.id === interviewId);
  if (!was) return fail("That interview is not here any more.");
  if (was.status === "CANCELLED")
    return fail("That interview is cancelled, so it has no reminders.");
  if (!invitationSent(was.notices))
    return fail(
      "Reminders follow an invitation that was sent, and this interview's was not.",
    );
  const interview = { ...was, remindersOff: off };
  return {
    ok: true,
    book: {
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interviewId ? interview : i,
      ),
    },
    value: interview,
  };
}

/** Keeps the company's reminder defaults. */
export function saveReminderSettings(
  book: InterviewBook,
  settings: ReminderSettings,
): Op<ReminderSettings> {
  return {
    ok: true,
    book: { ...book, reminderSettings: settings },
    value: settings,
  };
}
