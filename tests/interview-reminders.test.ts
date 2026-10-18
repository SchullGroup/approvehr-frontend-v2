import { describe, expect, it } from "vitest";
import type { InterviewNotice } from "@/lib/hiring/interviews/model";
import {
  UNITS,
  draftOf,
  durationWords,
  fieldOfPath,
  followsQueuedInvitation,
  groupReminders,
  hoursWords,
  pausedLine,
  reasonOf,
  recipientsWords,
  replanCounts,
  replanSentence,
  reminderStatus,
  settingsFromDraft,
  splitMinutes,
  whenWords,
  type InterviewReminders,
  type PlannedReminder,
  type ReminderSettings,
} from "@/lib/hiring/interviews/reminders";
import {
  DEMO_BOUNDS,
  defaultReminderSettings,
} from "@/lib/hiring/interviews/demo-reminders";

/**
 * Reminders about an interview: how they are grouped and worded, what a change did to
 * the plan, and the limits the server gave. The rule under it all is that a reminder is
 * never the first email anybody gets, so the API plans none without an invitation that
 * was sent, and a screen says which of its reasons applies.
 */

const row = (over: Partial<PlannedReminder> = {}): PlannedReminder => ({
  id: "r1",
  slot: "cand-early",
  label: "Reminder to the candidate (earlier)",
  audience: "CANDIDATE",
  recipient: "Ada Okafor",
  dueAt: "2026-10-19T09:00:00.000Z",
  sentAt: null,
  status: "planned",
  reason: null,
  current: true,
  ...over,
});

const notice = (over: Partial<InterviewNotice> = {}): InterviewNotice => ({
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Ada Okafor",
  status: "SENT",
  note: null,
  at: "2026-10-12T09:00:00.000Z",
  ...over,
});

describe("why there are no reminders", () => {
  const none = (
    code: NonNullable<InterviewReminders["paused"]>["code"],
    reason: string,
    items: PlannedReminder[] = [],
  ): InterviewReminders => ({ items, paused: { code, reason } });

  it("says it plainly when the invitation wasn't sent", () => {
    expect(
      pausedLine(none("no_invitation", "Nobody has been sent an invitation.")),
    ).toBe("No reminders: the invitation wasn't sent.");
  });

  it("gives the API's own sentence for every other reason", () => {
    for (const code of [
      "changed_since_told",
      "not_scheduled",
      "none_planned",
    ] as const)
      expect(pausedLine(none(code, `Because of ${code}.`)), code).toBe(
        `Because of ${code}.`,
      );
  });

  it("says nothing while something is still waiting, even if the interview is not scheduled", () => {
    /* A completed interview can still have nudges waiting, and the API still calls it
       "not scheduled": that sentence would contradict the rows under it. */
    expect(
      pausedLine(
        none("not_scheduled", "This interview is completed.", [
          row({ slot: "nudge-1", audience: "PANELIST" }),
        ]),
      ),
    ).toBeNull();
  });

  it("says nothing when the API gave no reason", () => {
    expect(pausedLine({ items: [], paused: null })).toBeNull();
  });

  it("notes that planned reminders follow an invitation that is queued, not sent", () => {
    expect(followsQueuedInvitation([notice({ status: "PENDING" })])).toBe(true);
    expect(
      followsQueuedInvitation([notice({ kind: "UPDATE", status: "SENDING" })]),
    ).toBe(true);
    expect(followsQueuedInvitation([notice({ status: "SENT" })])).toBe(false);
    expect(followsQueuedInvitation([notice({ status: "SKIPPED" })])).toBe(
      false,
    );
    expect(followsQueuedInvitation(null)).toBe(false);
  });
});

describe("the words", () => {
  it("says hours, and days from two up", () => {
    expect(hoursWords(1)).toBe("1 hour");
    expect(hoursWords(24)).toBe("24 hours");
    expect(hoursWords(48)).toBe("2 days");
    expect(hoursWords(72)).toBe("3 days");
    expect(hoursWords(36)).toBe("36 hours");
  });

  it("says a length of time in the unit it reads best in", () => {
    expect(durationWords(15)).toBe("15 minutes");
    expect(durationWords(60)).toBe("1 hour");
    expect(durationWords(120)).toBe("2 hours");
    expect(durationWords(1_440)).toBe("24 hours");
    expect(durationWords(2_880)).toBe("2 days");
    expect(durationWords(4_320)).toBe("3 days");
    expect(durationWords(90)).toBe("90 minutes");
  });

  it("calls only 'sent' sent", () => {
    expect(reminderStatus("sent")).toEqual({ label: "Sent", tone: "success" });
    for (const status of [
      "planned",
      "due",
      "sending",
      "skipped",
      "failed",
    ] as const)
      expect(reminderStatus(status).label, status).not.toMatch(/\bsent\b/i);
    expect(reminderStatus("planned").label).toBe("Planned");
    expect(reminderStatus("due").label).toBe("Waiting to go");
    expect(reminderStatus("skipped").label).toBe("Skipped");
  });

  it("gives the API's reason without its lead, as a sentence", () => {
    expect(reasonOf("not sent: mail not configured")).toBe(
      "Mail not configured.",
    );
    expect(reasonOf("waiting: the daily limit")).toBe("The daily limit.");
    expect(reasonOf(null)).toBeNull();
    expect(reasonOf("not sent:")).toBeNull();
  });

  it("says when, by what became of it", () => {
    const when = (iso: string) => `at ${iso.slice(5, 10)}`;
    const base = {
      dueAt: "2026-10-19T09:00:00.000Z",
      sentAt: "2026-10-19T09:01:00.000Z",
    };
    const after = Date.parse("2026-10-19T12:00:00.000Z");
    expect(whenWords({ ...base, status: "planned" }, when, after)).toBe(
      "Goes at 10-19",
    );
    expect(whenWords({ ...base, status: "sent" }, when, after)).toBe(
      "Sent at 10-19",
    );
    expect(whenWords({ ...base, status: "due" }, when, after)).toBe(
      "Was due at 10-19",
    );
    expect(whenWords({ ...base, status: "sending" }, when, after)).toBe(
      "Sending now",
    );
  });

  it("does not say a skipped reminder was due before its time came: a change took it off first", () => {
    const when = (iso: string) => `at ${iso.slice(5, 10)}`;
    const base = { dueAt: "2026-10-19T09:00:00.000Z", sentAt: null };
    const before = Date.parse("2026-10-18T09:00:00.000Z");
    const after = Date.parse("2026-10-19T09:00:01.000Z");
    for (const status of ["skipped", "failed"] as const) {
      expect(whenWords({ ...base, status }, when, before), status).toBe(
        "Was planned for at 10-19",
      );
      expect(whenWords({ ...base, status }, when, after), status).toBe(
        "Was due at 10-19",
      );
    }
  });
});

describe("a panel's reminder is one row per person, listed once", () => {
  const panel = (name: string, over: Partial<PlannedReminder> = {}) =>
    row({
      id: name,
      slot: "pan-late",
      audience: "PANELIST",
      recipient: name,
      ...over,
    });

  it("groups people who share a reminder, a time and an outcome", () => {
    const groups = groupReminders([
      panel("Chidi Nwosu"),
      panel("Kemi Outside"),
      panel("Bola Ade", { status: "skipped", reason: "not sent: no reply-to" }),
    ]);
    expect(groups).toHaveLength(2);
    const together = groups.find((g) => g.status === "planned");
    expect(together?.recipients).toEqual(["Chidi Nwosu", "Kemi Outside"]);
    expect(recipientsWords(together as (typeof groups)[number])).toBe(
      "Chidi Nwosu and Kemi Outside",
    );
  });

  it("names the candidate as the candidate, and long panels with a count", () => {
    const [candidate] = groupReminders([row()]);
    expect(recipientsWords(candidate as NonNullable<typeof candidate>)).toBe(
      "The candidate",
    );
    const [many] = groupReminders(
      ["A", "B", "C", "D"].map((name) => panel(name)),
    );
    expect(recipientsWords(many as NonNullable<typeof many>)).toBe(
      "A, B and 2 others",
    );
    const [three] = groupReminders(["A", "B", "C"].map((name) => panel(name)));
    expect(recipientsWords(three as NonNullable<typeof three>)).toBe(
      "A, B and 1 other",
    );
  });

  it("lists them in the order they are due, then by slot", () => {
    const groups = groupReminders([
      row({ id: "late", slot: "cand-late", dueAt: "2026-10-19T10:00:00.000Z" }),
      row({
        id: "early",
        slot: "cand-early",
        dueAt: "2026-10-18T10:00:00.000Z",
      }),
      panel("X", { dueAt: "2026-10-19T10:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.slot)).toEqual([
      "cand-early",
      "cand-late",
      "pan-late",
    ]);
  });

  it("keeps a reminder from an earlier version of the interview apart", () => {
    const groups = groupReminders([panel("A"), panel("B", { current: false })]);
    expect(groups.map((g) => g.current)).toEqual([true, false]);
  });
});

describe("what a change did to the plan", () => {
  const plan = (items: PlannedReminder[]): InterviewReminders => ({
    items,
    paused: null,
  });

  it("counts what is planned now and what was taken off", () => {
    const before = plan([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const after = plan([
      row({ id: "a", status: "skipped", current: false }),
      row({ id: "b", status: "skipped", current: false }),
      row({ id: "c", status: "skipped", current: false }),
      row({ id: "d" }),
      row({ id: "e" }),
    ]);
    expect(replanCounts(before, after)).toEqual({ planned: 2, removed: 3 });
  });

  it("does not count a reminder that was already done as taken off", () => {
    const before = plan([row({ id: "a", status: "sent" }), row({ id: "b" })]);
    const after = plan([row({ id: "a", status: "sent" }), row({ id: "b" })]);
    expect(replanCounts(before, after)).toEqual({ planned: 1, removed: 0 });
  });

  it("says nothing about what was taken off when the plan before is not known", () => {
    expect(replanCounts(null, plan([row()]))).toEqual({
      planned: 1,
      removed: null,
    });
  });

  it("says nothing at all when the plan now is not known", () => {
    expect(replanCounts(plan([row()]), null)).toBeNull();
  });

  it("words a reschedule, a booking and a cancellation from the counts", () => {
    expect(
      replanSentence("rescheduled", { planned: 3, removed: 3 }, null),
    ).toBe(
      "3 reminders are planned for the new time. 3 reminders planned for the old time were taken off.",
    );
    expect(
      replanSentence("rescheduled", { planned: 1, removed: 0 }, null),
    ).toBe("1 reminder is planned for the new time.");
    expect(replanSentence("booked", { planned: 8, removed: null }, null)).toBe(
      "8 reminders are planned. A reminder goes only once its invitation has.",
    );
    expect(replanSentence("invited", { planned: 1, removed: null }, null)).toBe(
      "1 reminder is planned. A reminder goes only once its invitation has.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 2 }, null)).toBe(
      "2 planned reminders were taken off.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 1 }, null)).toBe(
      "1 planned reminder was taken off.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 0 }, null)).toBe(
      "No reminder was planned, so none was taken off.",
    );
  });

  it("gives the API's reason when a change leaves none planned", () => {
    expect(
      replanSentence(
        "rescheduled",
        { planned: 0, removed: 2 },
        {
          code: "changed_since_told",
          reason:
            "The interview changed after they were last told, and the change has not been sent to them, so no reminders are planned. Send an update to plan new ones.",
        },
      ),
    ).toBe(
      "The interview changed after they were last told, and the change has not been sent to them, so no reminders are planned. Send an update to plan new ones. 2 reminders planned for the old time were taken off.",
    );
  });

  it("says plainly that none are planned when the booking was without an invitation", () => {
    expect(
      replanSentence(
        "booked",
        { planned: 0, removed: null },
        {
          code: "no_invitation",
          reason: "Nobody has been sent an invitation.",
        },
      ),
    ).toBe("No reminders: the invitation wasn't sent.");
  });

  it("never words a change nobody reported on", () => {
    expect(replanSentence("cancelled", null, null)).toBeNull();
    expect(replanSentence("rescheduled", null, null)).toBeNull();
    expect(
      replanSentence("cancelled", { planned: 0, removed: null }, null),
    ).toBeNull();
  });
});

describe("the company's choices and the limits the server gave", () => {
  const fine = (): ReminderSettings => defaultReminderSettings();
  const check = (draft = draftOf(fine())) =>
    settingsFromDraft(draft, DEMO_BOUNDS);

  it("are all right as they ship, and read back as they were", () => {
    const { values, problems } = check();
    expect(problems).toEqual([]);
    expect(values).toEqual(fine());
  });

  it("shows how long before as a box and a unit, in the unit that reads best", () => {
    expect(splitMinutes(1_440)).toEqual({ amount: "24", unit: "hours" });
    expect(splitMinutes(2_880)).toEqual({ amount: "2", unit: "days" });
    expect(splitMinutes(60)).toEqual({ amount: "1", unit: "hours" });
    expect(splitMinutes(45)).toEqual({ amount: "45", unit: "minutes" });
    expect(UNITS).toEqual(["minutes", "hours", "days"]);
  });

  it("turns a box and a unit into whole minutes", () => {
    const draft = draftOf(fine());
    draft.candidateEarly = { enabled: true, amount: "2", unit: "days" };
    draft.candidateLate = { enabled: true, amount: "30", unit: "minutes" };
    expect(check(draft).values?.candidate).toEqual({
      early: { enabled: true, minutesBefore: 2_880 },
      late: { enabled: true, minutesBefore: 30 },
    });
    draft.candidateLate = { enabled: true, amount: "1.5", unit: "hours" };
    expect(check(draft).values?.candidate.late.minutesBefore).toBe(90);
  });

  it("holds each box to its own bounds, and names the box in the server's meaning", () => {
    const draft = draftOf(fine());
    draft.candidateEarly = { enabled: true, amount: "1", unit: "hours" };
    expect(check(draft).problems).toEqual([
      {
        field: "candidate.early",
        message:
          "The earlier reminder goes at least 2 hours before the interview.",
      },
    ]);
    draft.candidateEarly = { enabled: true, amount: "4", unit: "days" };
    expect(check(draft).problems).toEqual([
      {
        field: "candidate.early",
        message:
          "The earlier reminder goes at most 3 days before the interview.",
      },
    ]);
    draft.candidateEarly = { enabled: true, amount: "3", unit: "days" };
    expect(check(draft).problems).toEqual([]);

    draft.panelistLate = { enabled: true, amount: "10", unit: "minutes" };
    expect(check(draft).problems).toEqual([
      {
        field: "panelist.late",
        message:
          "The later reminder goes at least 15 minutes before the interview.",
      },
    ]);
    draft.panelistLate = { enabled: true, amount: "7", unit: "hours" };
    expect(check(draft).problems[0]?.message).toBe(
      "The later reminder goes at most 6 hours before the interview.",
    );
  });

  it("refuses a box that is empty, not a number, or not a whole number of minutes", () => {
    for (const amount of ["", "abc", "0", "-3"]) {
      const draft = draftOf(fine());
      draft.candidateEarly = { enabled: true, amount, unit: "hours" };
      expect(check(draft).problems[0]?.field, amount).toBe("candidate.early");
      expect(check(draft).values, amount).toBeNull();
    }
    const draft = draftOf(fine());
    draft.candidateLate = { enabled: true, amount: "0.5", unit: "minutes" };
    expect(check(draft).problems).toEqual([
      { field: "candidate.late", message: "Use a whole number of minutes." },
    ]);
  });

  it("holds the pair as it will stand: the earlier has to be longer before than the later", () => {
    const draft = draftOf(fine());
    draft.candidateEarly = { enabled: true, amount: "2", unit: "hours" };
    draft.candidateLate = { enabled: true, amount: "3", unit: "hours" };
    expect(check(draft).problems).toEqual([
      {
        field: "candidate.early",
        message:
          "The earlier reminder has to go longer before the interview than the later one.",
      },
    ]);
    const panel = draftOf(fine());
    panel.panelistEarly = { enabled: false, amount: "2", unit: "hours" };
    panel.panelistLate = { enabled: true, amount: "2", unit: "hours" };
    expect(check(panel).problems[0]?.field).toBe("panelist.early");
  });

  it("holds the nudges to their hours, and the second after the first", () => {
    const draft = draftOf(fine());
    draft.nudge.first = "0";
    expect(check(draft).problems).toEqual([
      {
        field: "nudge.first",
        message:
          "The first nudge goes at least 1 hour after the interview ends.",
      },
    ]);
    draft.nudge.first = "49";
    expect(check(draft).problems[0]?.message).toBe(
      "The first nudge goes at most 2 days after the interview ends.",
    );
    draft.nudge.first = "24";
    draft.nudge.second = "24";
    expect(check(draft).problems).toEqual([
      {
        field: "nudge.second",
        message: "The second nudge has to come after the first.",
      },
    ]);
    draft.nudge.second = "73";
    expect(check(draft).problems[0]?.message).toBe(
      "The second nudge goes at most 3 days after the interview ends. Switch it off for no second nudge.",
    );
    draft.nudge.second = "1.5";
    expect(check(draft).problems[0]?.message).toBe("Hours are a whole number.");
  });

  it("sends no second nudge when it is switched off, whatever is in its box", () => {
    const draft = draftOf(fine());
    draft.nudge.secondOn = false;
    draft.nudge.second = "nonsense";
    const { values, problems } = check(draft);
    expect(problems).toEqual([]);
    expect(values?.scorecardNudge.secondAfterHours).toBeNull();
  });

  it("puts a refusal from the server under its own box", () => {
    expect(
      fieldOfPath("interviewReminders.candidate.early.minutesBefore"),
    ).toBe("candidate.early");
    expect(fieldOfPath("interviewReminders.candidate.late.minutesBefore")).toBe(
      "candidate.late",
    );
    expect(fieldOfPath("interviewReminders.panelist.early.minutesBefore")).toBe(
      "panelist.early",
    );
    expect(fieldOfPath("interviewReminders.panelist.late.enabled")).toBe(
      "panelist.late",
    );
    expect(
      fieldOfPath("interviewReminders.scorecardNudge.firstAfterHours"),
    ).toBe("nudge.first");
    expect(
      fieldOfPath("interviewReminders.scorecardNudge.secondAfterHours"),
    ).toBe("nudge.second");
    expect(fieldOfPath("something.else")).toBeNull();
  });
});
