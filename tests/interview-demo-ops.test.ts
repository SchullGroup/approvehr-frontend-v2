import { describe, expect, it } from "vitest";
import {
  cancel,
  change,
  changesOf,
  interviewsOf,
  refusal,
  schedule,
  setCandidateReminders,
  settle,
  viewOf,
  type InterviewBook,
  type MailRules,
  type Roster,
} from "@/lib/hiring/interviews/demo-ops";
import { KINDS } from "@/lib/hiring/comms/fields";
import {
  SETTLED,
  defaultReminderSettings,
} from "@/lib/hiring/interviews/demo-reminders";
import type { ScheduleInput } from "@/lib/hiring/interviews/model";

/**
 * The practice board's interviews: the same refusals as the API, in the same words, and
 * a record of what was asked of the mail that never says a message went out.
 */

const NOW = "2026-08-19T09:00:00.000Z";
const LATER = "2026-08-25T09:00:00.000Z";

const EMPTY: InterviewBook = {
  interviews: [],
  counter: 0,
  reminderSettings: defaultReminderSettings(),
};

const roster: Roster = {
  nameOf: (seat) => (seat === "e:p-05" ? "Fatima Bello" : "Chidi Nwosu"),
  submitted: () => false,
};

const wording = (kind: string) =>
  KINDS.find((entry) => entry.kind === kind)?.builtIn ?? {
    subject: "s",
    body: "b",
  };

const mail = (over: Partial<MailRules> = {}): MailRules => ({
  enabled: true,
  replyTo: "people@schull.io",
  companyName: "Schull Technologies",
  wording,
  ...over,
});

const target = {
  applicationId: "app-01",
  candidateName: "Ada Okafor",
  role: "Payroll Analyst",
  stageName: "Interview",
  stageSeats: ["e:p-05"],
};

const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  kind: "TECHNICAL",
  scheduledFor: LATER,
  timeZone: "Africa/Lagos",
  durationMins: 60,
  location: null,
  joinUrl: "https://meet.google.com/abc-defg-hij",
  panel: null,
  sendInvite: false,
  ...over,
});

const book = (
  over: Partial<ScheduleInput> = {},
  rules: MailRules = mail(),
  seats: string[] | null = null,
) => {
  const made = schedule(
    EMPTY,
    target,
    input(over),
    seats,
    rules,
    roster,
    "Africa/Lagos",
    NOW,
  );
  if (!made.ok) throw new Error(made.error);
  return made;
};

describe("booking an interview", () => {
  it("records what was booked, with the stage's panel when nobody was picked", () => {
    const made = book();
    const iv = made.value.interview;
    expect(iv).toMatchObject({
      applicationId: "app-01",
      status: "SCHEDULED",
      kind: "TECHNICAL",
      sequence: 0,
      joinUrl: "https://meet.google.com/abc-defg-hij",
      seats: ["e:p-05"],
    });
    expect(made.book.interviews).toHaveLength(1);
  });

  it("uses the people picked for this interview, not the stage's", () => {
    expect(
      book({}, mail(), ["e:p-01", "u:acct-9"]).value.interview.seats,
    ).toEqual(["e:p-01", "u:acct-9"]);
  });

  it("refuses a link that is not https, in the sentence a person sees under the box", () => {
    const made = schedule(
      EMPTY,
      target,
      input({ joinUrl: "http://meet.google.com/abc" }),
      null,
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    expect(made).toEqual({
      ok: false,
      error: "Use a link that starts with https://",
    });
  });

  it("refuses a length that is not a real one", () => {
    expect(refusal({ ...input(), durationMins: 3 })).toContain(
      "5 to 480 minutes",
    );
    expect(refusal({ ...input(), durationMins: 600 })).toContain(
      "5 to 480 minutes",
    );
    expect(refusal({ ...input(), durationMins: 30.5 })).toContain(
      "5 to 480 minutes",
    );
    expect(refusal({ ...input(), scheduledFor: "soon" })).toBe(
      "Choose when the interview is.",
    );
  });

  it("refuses an invitation for a time that has passed, but books the same past interview without one", () => {
    const past = "2026-08-01T09:00:00.000Z";
    const asked = schedule(
      EMPTY,
      target,
      input({ scheduledFor: past, sendInvite: true }),
      null,
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    expect(asked.ok).toBe(false);
    expect(
      schedule(
        EMPTY,
        target,
        input({ scheduledFor: past }),
        null,
        mail(),
        roster,
        "Africa/Lagos",
        NOW,
      ).ok,
    ).toBe(true);
  });

  it("numbers each booking differently", () => {
    const first = book();
    const second = schedule(
      first.book,
      target,
      input(),
      null,
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!second.ok) throw new Error(second.error);
    expect(second.value.interview.id).not.toBe(first.value.interview.id);
  });
});

describe("what is asked of the mail when an interview is booked", () => {
  it("records 'not asked' for the candidate and every panelist when nobody chose to send", () => {
    const { outcome } = book({ sendInvite: false }, mail(), [
      "e:p-05",
      "e:p-01",
    ]).value;
    expect(outcome.asked).toBe(false);
    expect(
      outcome.notices.map((n) => [n.audience, n.recipient, n.status]),
    ).toEqual([
      ["CANDIDATE", "Ada Okafor", "NOT_ASKED"],
      ["PANELIST", "Fatima Bello", "NOT_ASKED"],
      ["PANELIST", "Chidi Nwosu", "NOT_ASKED"],
    ]);
  });

  it("never says a message was sent: a practice board has no mail", () => {
    const { outcome } = book({ sendInvite: true }).value;
    expect(outcome.asked).toBe(true);
    for (const n of outcome.notices) {
      expect(n.status).toBe("SKIPPED");
      expect(n.status).not.toBe("SENT");
      expect(n.note).toBe("not sent: nothing is sent from a practice board");
    }
  });

  it("gives the reasons the API's worker would, in its order", () => {
    const off = book({ sendInvite: true }, mail({ enabled: false })).value
      .outcome.notices[0];
    expect(off?.note).toBe(
      "not sent: emails to candidates are switched off for this company",
    );

    const noReplyTo = book({ sendInvite: true }, mail({ replyTo: null })).value
      .outcome.notices[0];
    expect(noReplyTo?.note).toContain(
      "no reply-to address is set for this company",
    );

    /* Switched off wins over a missing reply-to, as it does in the worker. */
    const both = book(
      { sendInvite: true },
      mail({ enabled: false, replyTo: null }),
    ).value.outcome.notices[0];
    expect(both?.note).toContain("switched off");
  });

  it("skips an email whose words use a field that has no value, and names it", () => {
    const rules = mail({
      wording: () => ({
        subject: "Hello {candidate_first_name}",
        body: "About {job_title}: {reference} and {not_a_field}",
      }),
    });
    /* An interview with no job title cannot fill `{job_title}`. */
    const noRole = schedule(
      EMPTY,
      { ...target, role: null },
      input({ sendInvite: true }),
      null,
      rules,
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!noRole.ok) throw new Error(noRole.error);
    expect(noRole.value.outcome.notices[0]?.note).toContain("{job_title}");
    expect(noRole.value.outcome.notices[0]?.note).toContain(
      "it has no job title",
    );
  });

  it("uses the panelist wording for panelists, which has no 'Hello Ada'", () => {
    const seen: string[] = [];
    book(
      { sendInvite: true },
      mail({
        wording: (kind) => {
          seen.push(kind);
          return wording(kind);
        },
      }),
    );
    expect(seen).toContain("INVITE");
    expect(seen).toContain("PANELIST_INVITE");
    expect(seen).not.toContain("PANELIST_UPDATE");
  });
});

describe("changing an interview", () => {
  const booked = () => book().book;
  const id = () => booked().interviews[0]?.id ?? "";

  it("moves the time and counts a change a calendar must be told about", () => {
    const made = change(
      booked(),
      id(),
      { scheduledFor: "2026-08-26T09:00:00.000Z", sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!made.ok) throw new Error(made.error);
    expect(made.value.interview.scheduledFor).toBe("2026-08-26T09:00:00.000Z");
    expect(made.value.interview.sequence).toBe(1);
    expect(
      made.value.outcome.notices.every((n) => n.status === "NOT_ASKED"),
    ).toBe(true);
  });

  it("refuses a change that changes nothing, in the dialog's own words", () => {
    const made = change(
      booked(),
      id(),
      { durationMins: 60, sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    expect(made).toEqual({
      ok: false,
      error: "Nothing here differs from what is already booked.",
    });
  });

  it("can clear the place and the link, with null", () => {
    const made = change(
      booked(),
      id(),
      { joinUrl: null, location: null, sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!made.ok) throw new Error(made.error);
    expect(made.value.interview.joinUrl).toBeNull();
  });

  it("keeps the log of messages across changes, oldest first", () => {
    const first = change(
      booked(),
      id(),
      { durationMins: 45, sendUpdate: true },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!first.ok) throw new Error(first.error);
    const second = change(
      first.book,
      id(),
      { durationMins: 30, sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!second.ok) throw new Error(second.error);
    const log = second.value.interview.notices;
    expect(log.map((n) => [n.kind, n.status])).toEqual([
      ["INVITE", "NOT_ASKED"],
      ["INVITE", "NOT_ASKED"],
      /* Asked to tell them, but nobody had been invited: what goes is the invitation. */
      ["INVITE", "SKIPPED"],
      ["INVITE", "SKIPPED"],
      ["UPDATE", "NOT_ASKED"],
      ["UPDATE", "NOT_ASKED"],
    ]);
  });

  it("refuses to change an interview that has happened", () => {
    const done = settle(booked(), id(), "COMPLETED");
    if (!done.ok) throw new Error(done.error);
    const made = change(
      done.book,
      id(),
      { durationMins: 30, sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    expect(made).toEqual({
      ok: false,
      error: "Only an interview that has not happened yet can be changed.",
    });
  });

  it("says what differs", () => {
    const was = {
      kind: "TECHNICAL" as const,
      scheduledFor: LATER,
      durationMins: 60,
      location: null,
      joinUrl: null,
    };
    expect(changesOf(was, { durationMins: 60 })).toEqual([]);
    expect(changesOf(was, { durationMins: 45, location: "Room 2" })).toEqual([
      "length",
      "place",
    ]);
  });
});

describe("cancelling an interview", () => {
  it("records it, with the reason, and a cancellation asked for or not", () => {
    const base = book().book;
    const id = base.interviews[0]?.id ?? "";
    const made = cancel(
      base,
      id,
      { reason: "  Role on hold  ", sendCancellation: true },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!made.ok) throw new Error(made.error);
    expect(made.value.interview).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Role on hold",
      sequence: 1,
    });
    expect(
      made.value.outcome.notices
        .filter((n) => n.kind === "CANCEL")
        .every((n) => n.status === "SKIPPED"),
    ).toBe(true);
  });

  it("tells nobody who was never invited that it is off: there is nothing to cancel", () => {
    const base = book().book;
    const id = base.interviews[0]?.id ?? "";
    const made = cancel(
      base,
      id,
      { reason: null, sendCancellation: true },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!made.ok) throw new Error(made.error);
    for (const n of made.value.outcome.notices) {
      expect(n.status).toBe("SKIPPED");
      expect(n.note).toContain("there is nothing to cancel");
    }
  });

  it("refuses a second cancellation", () => {
    const base = book().book;
    const id = base.interviews[0]?.id ?? "";
    const once = cancel(
      base,
      id,
      { reason: null, sendCancellation: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!once.ok) throw new Error(once.error);
    expect(
      cancel(
        once.book,
        id,
        { reason: null, sendCancellation: false },
        mail(),
        roster,
        "Africa/Lagos",
        NOW,
      ),
    ).toEqual({
      ok: false,
      error: "Only an interview that has not happened yet can be cancelled.",
    });
  });
});

describe("reading the book", () => {
  it("lists one application's interviews by when they are, and draws each with its panel", () => {
    const first = book({ scheduledFor: "2026-08-27T09:00:00.000Z" });
    const second = schedule(
      first.book,
      target,
      input({ scheduledFor: LATER }),
      null,
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!second.ok) throw new Error(second.error);
    const list = interviewsOf(second.book, "app-01");
    expect(list.map((i) => i.scheduledFor)).toEqual([
      LATER,
      "2026-08-27T09:00:00.000Z",
    ]);
    expect(viewOf(list[0]!, roster).panelists).toEqual([
      { key: "e:p-05", name: "Fatima Bello", submitted: false },
    ]);
    expect(interviewsOf(second.book, "app-02")).toEqual([]);
  });
});

/* ===================================================== reminders on the practice board */

describe("reminders on the practice board", () => {
  /** A booked interview whose invitation had been sent, as the seed has them. */
  const told = () => {
    const made = book();
    const interview = { ...made.value.interview, toldSequence: 0 };
    return {
      ...made.book,
      interviews: made.book.interviews.map((i) =>
        i.id === interview.id ? interview : i,
      ),
    };
  };
  const plan = { settings: defaultReminderSettings(), now: NOW };
  const slots = (b: InterviewBook) =>
    viewOf(b.interviews[0]!, roster, plan)
      .reminders?.items.filter((i) => i.current && i.status === "planned")
      .map((i) => i.slot);

  it("books with the candidate's reminders on, and off only when that was asked", () => {
    expect(book().value.interview.candidateRemindersOff).toBe(false);
    expect(viewOf(book().value.interview, roster).candidateReminders).toBe(
      true,
    );
    const off = book({ sendInvite: true, candidateReminders: false });
    expect(off.value.interview.candidateRemindersOff).toBe(true);
    expect(viewOf(off.value.interview, roster).candidateReminders).toBe(false);
  });

  it("plans none for an interview nobody was sent an invitation for, and says so", () => {
    const made = book({ sendInvite: true });
    const view = viewOf(made.value.interview, roster, plan);
    expect(view.reminders?.items).toEqual([]);
    expect(view.reminders?.paused?.code).toBe("no_invitation");
    expect(made.value.outcome.reminders).toBeUndefined();
  });

  it("plans the reminders the company asked for once the invitation was sent", () => {
    expect(slots(told())).toEqual([
      "cand-early",
      "cand-late",
      "pan-late",
      "nudge-1",
      "nudge-2",
    ]);
  });

  it("settles what was planned when the time moves, and plans none until the change is sent", () => {
    const moved = change(
      told(),
      told().interviews[0]!.id,
      { scheduledFor: "2026-08-26T09:00:00.000Z", sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!moved.ok) throw new Error(moved.error);
    const { interview, outcome } = moved.value;
    expect(interview.sequence).toBe(1);
    expect(outcome.reminders).toMatchObject({
      planned: 0,
      removed: 5,
      paused: { code: "changed_since_told" },
    });
    const view = viewOf(interview, roster, plan);
    const old = view.reminders?.items.filter((i) => !i.current) ?? [];
    expect(old).toHaveLength(5);
    expect(old.every((i) => i.status === "skipped")).toBe(true);
    expect(old[0]?.reason).toBe(SETTLED.changed);
    /* Asking to send an update does not change that: a practice board sends nothing. */
    const asked = change(
      told(),
      told().interviews[0]!.id,
      { scheduledFor: "2026-08-26T09:00:00.000Z", sendUpdate: true },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!asked.ok) throw new Error(asked.error);
    expect(asked.value.outcome.reminders?.planned).toBe(0);
  });

  it("settles nothing when only the kind changed: a calendar entry shows no kind", () => {
    const kind = change(
      told(),
      told().interviews[0]!.id,
      { kind: "PANEL", sendUpdate: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!kind.ok) throw new Error(kind.error);
    expect(kind.value.interview.sequence).toBe(0);
    expect(kind.value.outcome.reminders).toMatchObject({
      planned: 5,
      removed: 0,
    });
  });

  it("takes every planned reminder off when the interview is cancelled, and says which", () => {
    const gone = cancel(
      told(),
      told().interviews[0]!.id,
      { reason: null, sendCancellation: false },
      mail(),
      roster,
      "Africa/Lagos",
      NOW,
    );
    if (!gone.ok) throw new Error(gone.error);
    expect(gone.value.outcome.reminders).toMatchObject({
      planned: 0,
      removed: 5,
      paused: { code: "not_scheduled" },
    });
    const items = viewOf(gone.value.interview, roster, plan).reminders?.items;
    expect(items?.every((i) => i.status === "skipped")).toBe(true);
    expect(items?.[0]?.reason).toBe(SETTLED.cancelled);
  });

  it("switches the candidate's reminders off, and only theirs", () => {
    const b = told();
    const off = setCandidateReminders(
      b,
      b.interviews[0]!.id,
      false,
      roster,
      NOW,
    );
    if (!off.ok) throw new Error(off.error);
    expect(off.value.outcome.reminders).toMatchObject({
      planned: 3,
      removed: 2,
    });
    expect(slots(off.book)).toEqual(["pan-late", "nudge-1", "nudge-2"]);
    const skipped = viewOf(
      off.value.interview,
      roster,
      plan,
    ).reminders?.items.filter((i) => i.status === "skipped");
    expect(skipped?.map((i) => i.slot)).toEqual(["cand-early", "cand-late"]);
    expect(skipped?.[0]?.reason).toBe(SETTLED.candidateOff);
  });

  it("puts them back when the switch is turned on again, as the API does", () => {
    const b = told();
    const off = setCandidateReminders(
      b,
      b.interviews[0]!.id,
      false,
      roster,
      NOW,
    );
    if (!off.ok) throw new Error(off.error);
    const on = setCandidateReminders(
      off.book,
      b.interviews[0]!.id,
      true,
      roster,
      NOW,
    );
    if (!on.ok) throw new Error(on.error);
    expect(slots(on.book)).toEqual([
      "cand-early",
      "cand-late",
      "pan-late",
      "nudge-1",
      "nudge-2",
    ]);
    expect(
      viewOf(on.value.interview, roster, plan).reminders?.items.some(
        (i) => i.status === "skipped",
      ),
    ).toBe(false);
  });

  it("refuses the switch for an interview that is over, and when it changes nothing, in the API's words", () => {
    const b = told();
    const id = b.interviews[0]!.id;
    const done = settle(b, id, "COMPLETED");
    if (!done.ok) throw new Error(done.error);
    expect(setCandidateReminders(done.book, id, false, roster, NOW)).toEqual({
      ok: false,
      error: "Only an interview that has not happened yet can be changed.",
    });
    expect(setCandidateReminders(b, id, true, roster, NOW)).toEqual({
      ok: false,
      error: "Nothing here differs from what is already booked.",
    });
    expect(setCandidateReminders(b, "nope", true, roster, NOW)).toEqual({
      ok: false,
      error: "That interview is not here any more.",
    });
  });
});
