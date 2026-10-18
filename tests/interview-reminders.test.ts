import { describe, expect, it } from "vitest";
import type { InterviewNotice } from "@/lib/hiring/interviews/model";
import {
  hoursWords,
  invitationSent,
  noRemindersBecause,
  nudgeSentence,
  reasonOf,
  replanSentence,
  reminderStatus,
  reminderTitle,
  settingsProblems,
  timingWords,
  type PlannedReminder,
  type ReminderSettings,
} from "@/lib/hiring/interviews/reminders";
import { defaultReminderSettings } from "@/lib/hiring/interviews/demo-reminders";

/**
 * Reminders about an interview: when they can exist, what they are called and what the
 * limits are. The rule under it all is that a reminder is never the first email anybody
 * gets, so none exists without an invitation that was actually sent.
 */

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

describe("when an interview can have reminders at all", () => {
  it("only once the candidate's invitation was actually sent", () => {
    expect(invitationSent([notice({ status: "SENT" })])).toBe(true);
    for (const status of [
      "PENDING",
      "SENDING",
      "SKIPPED",
      "FAILED",
      "NOT_ASKED",
    ] as const)
      expect(invitationSent([notice({ status })]), status).toBe(false);
  });

  it("not on the strength of a panelist's invitation, or a change, or a cancellation", () => {
    expect(invitationSent([notice({ audience: "PANELIST" })])).toBe(false);
    expect(invitationSent([notice({ kind: "UPDATE" })])).toBe(false);
    expect(invitationSent([notice({ kind: "CANCEL" })])).toBe(false);
    expect(invitationSent(null)).toBe(false);
  });

  it("says why there are none when the invitation wasn't sent", () => {
    for (const status of ["NOT_ASKED", "SKIPPED", "FAILED"] as const)
      expect(
        noRemindersBecause({
          notices: [notice({ status })],
          status: "SCHEDULED",
        }),
        status,
      ).toBe("No reminders: the invitation wasn't sent.");
    expect(noRemindersBecause({ notices: [], status: "SCHEDULED" })).toBe(
      "No reminders: the invitation wasn't sent.",
    );
  });

  it("says queued is not sent, so reminders have not started", () => {
    expect(
      noRemindersBecause({
        notices: [notice({ status: "PENDING" })],
        status: "SCHEDULED",
      }),
    ).toBe(
      "No reminders yet: the invitation is queued, not sent. They start once it has been sent.",
    );
  });

  it("says a cancelled interview has none", () => {
    expect(
      noRemindersBecause({ notices: [notice()], status: "CANCELLED" }),
    ).toBe("No reminders: the interview is cancelled.");
  });

  it("says nothing when the interview can have some, and nothing when it is not known", () => {
    expect(
      noRemindersBecause({ notices: [notice()], status: "SCHEDULED" }),
    ).toBeNull();
    expect(
      noRemindersBecause({ notices: null, status: "SCHEDULED" }),
    ).toBeNull();
  });
});

describe("the words", () => {
  it("says hours, and days from two up", () => {
    expect(hoursWords(1)).toBe("1 hour");
    expect(hoursWords(2)).toBe("2 hours");
    expect(hoursWords(24)).toBe("24 hours");
    expect(hoursWords(48)).toBe("2 days");
    expect(hoursWords(72)).toBe("3 days");
    expect(hoursWords(36)).toBe("36 hours");
  });

  it("says before the interview for a reminder and after it for a nudge", () => {
    expect(timingWords("CANDIDATE_EARLY", 24)).toBe(
      "24 hours before the interview",
    );
    expect(timingWords("SCORECARD_NUDGE", 2)).toBe(
      "2 hours after the interview",
    );
  });

  it("titles a reminder by who and when, from the company's own hours", () => {
    const settings = defaultReminderSettings();
    const base: PlannedReminder = {
      id: "r",
      kind: "CANDIDATE_EARLY",
      audience: "CANDIDATE",
      at: "2026-10-19T09:00:00.000Z",
      status: "PLANNED",
      note: null,
    };
    expect(reminderTitle(base, settings)).toBe(
      "The candidate: 24 hours before the interview",
    );
    expect(reminderTitle({ ...base, kind: "CANDIDATE_FINAL" }, settings)).toBe(
      "The candidate: 1 hour before the interview",
    );
    expect(
      reminderTitle(
        { ...base, kind: "PANELIST", audience: "PANELIST" },
        settings,
      ),
    ).toBe("Each panelist: 24 hours before the interview");
    expect(
      reminderTitle(
        {
          ...base,
          kind: "SCORECARD_NUDGE",
          audience: "PANELIST",
          nth: { n: 2, of: 3 },
        },
        settings,
      ),
    ).toBe("Each panelist: scorecard nudge 2 of 3");
    expect(reminderTitle(base, null)).toBe(
      "The candidate: before the interview",
    );
  });

  it("calls only SENT sent", () => {
    expect(reminderStatus("SENT")).toEqual({ label: "Sent", tone: "success" });
    for (const status of ["PLANNED", "PENDING", "SKIPPED", "FAILED"] as const)
      expect(reminderStatus(status).label, status).not.toMatch(/sent/i);
    expect(reminderStatus("PLANNED").label).toBe("Planned");
    expect(reminderStatus("PENDING").label).toBe("Queued");
    expect(reminderStatus("SKIPPED").label).toBe("Skipped");
  });

  it("gives the API's reason without its lead, as a sentence", () => {
    expect(reasonOf("not sent: mail not configured")).toBe(
      "Mail not configured.",
    );
    expect(reasonOf("waiting: the daily limit")).toBe("The daily limit.");
    expect(reasonOf(null)).toBeNull();
    expect(reasonOf("not sent:")).toBeNull();
  });

  it("says what a reschedule did to the plan, and what a cancellation took away", () => {
    expect(replanSentence("rescheduled", { planned: 3, removed: 3 })).toBe(
      "3 reminders were planned again for the new time.",
    );
    expect(replanSentence("rescheduled", { planned: 1, removed: 2 })).toBe(
      "1 reminder was planned again for the new time.",
    );
    expect(replanSentence("rescheduled", { planned: 0, removed: 2 })).toBe(
      "No reminder is planned for the new time.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 2 })).toBe(
      "2 planned reminders were removed.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 1 })).toBe(
      "1 planned reminder was removed.",
    );
    expect(replanSentence("cancelled", { planned: 0, removed: 0 })).toBe(
      "No reminder was planned, so none was removed.",
    );
    expect(replanSentence("cancelled", null)).toBeNull();
    expect(replanSentence("rescheduled", null)).toBeNull();
  });
});

describe("where a panelist's nudges stand", () => {
  const when = (iso: string) => `at ${iso.slice(5, 10)}`;
  const base = {
    sent: 0,
    of: 3,
    lastAt: null as string | null,
    nextAt: null as string | null,
    off: false,
  };

  it("says none has gone and when the first is due", () => {
    expect(
      nudgeSentence({ ...base, nextAt: "2026-10-21T10:00:00Z" }, when),
    ).toBe("No reminder has gone yet. The first is due at 10-21.");
  });

  it("says how many went, when the last did, and when the next is due", () => {
    expect(
      nudgeSentence(
        {
          ...base,
          sent: 1,
          lastAt: "2026-10-21T10:00:00Z",
          nextAt: "2026-10-22T10:00:00Z",
        },
        when,
      ),
    ).toBe("Reminder 1 of 3 sent at 10-21. The next is due at 10-22.");
  });

  it("says when that was the last", () => {
    expect(
      nudgeSentence({ ...base, sent: 3, lastAt: "2026-10-23T10:00:00Z" }, when),
    ).toBe("Reminder 3 of 3 sent at 10-23. That was the last.");
  });

  it("says when none is planned, and when they are off for the interview", () => {
    expect(nudgeSentence(base, when)).toBe("No reminder is planned.");
    expect(nudgeSentence({ ...base, off: true, sent: 1 }, when)).toBe(
      "Reminders are off for this interview.",
    );
  });

  it("never says 'sent' for a nudge that has not gone", () => {
    expect(
      nudgeSentence({ ...base, nextAt: "2026-10-21T10:00:00Z" }, when),
    ).not.toMatch(/\bsent\b/);
  });
});

describe("the company's defaults and the limits the server gave", () => {
  const fine = (): ReminderSettings => defaultReminderSettings();

  it("are all right as they ship", () => {
    expect(settingsProblems(fine())).toEqual([]);
  });

  it("holds each box to its own bounds, and names the box", () => {
    const settings = fine();
    const early = settings.rules.find((r) => r.kind === "CANDIDATE_EARLY");
    if (!early) throw new Error("no rule");
    early.hours = 0;
    expect(settingsProblems(settings)).toEqual([
      {
        field: "CANDIDATE_EARLY",
        message: `Between ${String(early.bounds.min)} and ${String(early.bounds.max)} hours.`,
      },
    ]);
    early.hours = early.bounds.max + 1;
    expect(settingsProblems(settings)).toHaveLength(1);
    early.hours = early.bounds.max;
    expect(settingsProblems(settings)).toEqual([]);
  });

  it("refuses a part of an hour, and something that is not a number", () => {
    for (const bad of [1.5, NaN]) {
      const settings = fine();
      const rule = settings.rules[0];
      if (!rule) throw new Error("no rule");
      rule.hours = bad;
      expect(settingsProblems(settings)[0]?.field).toBe(rule.kind);
    }
  });

  it("holds the most nudges to its bounds too", () => {
    const settings = fine();
    settings.nudges.max = settings.nudges.bounds.max + 1;
    expect(settingsProblems(settings)).toEqual([
      {
        field: "nudges",
        message: `Between ${String(settings.nudges.bounds.min)} and ${String(settings.nudges.bounds.max)} nudges.`,
      },
    ]);
    settings.nudges.max = 0;
    expect(settingsProblems(settings)[0]?.field).toBe("nudges");
  });
});
