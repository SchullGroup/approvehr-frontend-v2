import { describe, expect, it } from "vitest";
import {
  defaultReminderSettings,
  plannedCount,
  remindersOf,
  type ReminderLogEntry,
} from "@/lib/hiring/interviews/demo-reminders";
import type { InterviewNotice } from "@/lib/hiring/interviews/model";

/**
 * The practice board's plan for an interview's reminders.
 *
 * What it holds: nothing is planned unless the invitation was sent; each reminder is due
 * the company's hours before (or after) and one whose time has passed is not planned late;
 * a nudge is planned only while a scorecard is owed, and no more than the most there are.
 */

const NOW = "2026-10-10T09:00:00.000Z";
const START = "2026-10-20T09:00:00.000Z";

const sentInvite: InterviewNotice = {
  id: "n",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Ada Okafor",
  status: "SENT",
  note: null,
  at: "2026-10-09T09:00:00.000Z",
};

const interview = (over: Partial<Parameters<typeof remindersOf>[0]> = {}) => ({
  id: "iv-1",
  scheduledFor: START,
  durationMins: 60,
  status: "SCHEDULED",
  seats: ["e:p1"],
  notices: [sentInvite],
  remindersOff: false,
  reminderLog: [] as ReminderLogEntry[],
  ...over,
});

const kinds = (items: { kind: string }[]) => items.map((i) => i.kind);

describe("planning", () => {
  it("plans the candidate's two reminders and the panelist's, at the company's hours", () => {
    const plan = remindersOf(
      interview(),
      defaultReminderSettings(),
      NOW,
      false,
    );
    expect(plan.off).toBe(false);
    expect(plan.items.map((i) => [i.kind, i.at, i.status])).toEqual([
      ["CANDIDATE_EARLY", "2026-10-19T09:00:00.000Z", "PLANNED"],
      ["PANELIST", "2026-10-19T09:00:00.000Z", "PLANNED"],
      ["CANDIDATE_FINAL", "2026-10-20T08:00:00.000Z", "PLANNED"],
    ]);
  });

  it("follows the company's hours when they change", () => {
    const settings = defaultReminderSettings();
    const early = settings.rules.find((r) => r.kind === "CANDIDATE_EARLY");
    if (early) early.hours = 48;
    const plan = remindersOf(interview(), settings, NOW, false);
    expect(plan.items.find((i) => i.kind === "CANDIDATE_EARLY")?.at).toBe(
      "2026-10-18T09:00:00.000Z",
    );
  });

  it("plans nothing when the invitation was not sent, whatever else is true", () => {
    for (const status of [
      "NOT_ASKED",
      "SKIPPED",
      "PENDING",
      "FAILED",
    ] as const) {
      const plan = remindersOf(
        interview({ notices: [{ ...sentInvite, status }] }),
        defaultReminderSettings(),
        NOW,
        true,
      );
      expect(plan.items, status).toEqual([]);
    }
    expect(
      remindersOf(
        interview({ notices: [] }),
        defaultReminderSettings(),
        NOW,
        true,
      ).items,
    ).toEqual([]);
  });

  it("plans nothing for a cancelled interview", () => {
    expect(
      remindersOf(
        interview({ status: "CANCELLED" }),
        defaultReminderSettings(),
        NOW,
        true,
      ).items,
    ).toEqual([]);
  });

  it("plans nothing, and says they are off, when somebody turned them off for this interview", () => {
    const plan = remindersOf(
      interview({ remindersOff: true }),
      defaultReminderSettings(),
      NOW,
      true,
    );
    expect(plan.off).toBe(true);
    expect(plan.items).toEqual([]);
  });

  it("leaves out what the company switched off, and the panelist's when nobody is invited", () => {
    const settings = defaultReminderSettings();
    for (const r of settings.rules)
      if (r.kind === "CANDIDATE_FINAL") r.enabled = false;
    const plan = remindersOf(interview({ seats: [] }), settings, NOW, false);
    expect(kinds(plan.items)).toEqual(["CANDIDATE_EARLY"]);
  });

  it("does not plan a reminder whose time has already passed: sending it late is worse than not", () => {
    /* Booked a day and a half ahead: the 24-hour one is still to come, the 48 is not. */
    const settings = defaultReminderSettings();
    const early = settings.rules.find((r) => r.kind === "CANDIDATE_EARLY");
    if (early) early.hours = 48;
    const plan = remindersOf(
      interview({ scheduledFor: "2026-10-11T21:00:00.000Z" }),
      settings,
      NOW,
      false,
    );
    expect(kinds(plan.items)).toEqual(["PANELIST", "CANDIDATE_FINAL"]);
  });

  it("counts what is still planned", () => {
    expect(
      plannedCount(
        remindersOf(interview(), defaultReminderSettings(), NOW, false),
      ),
    ).toBe(3);
  });
});

describe("the nudges for a scorecard", () => {
  const after = "2026-10-20T11:00:00.000Z";

  it("plans each nudge a stretch of hours after the interview ends, up to the most there are", () => {
    const settings = defaultReminderSettings();
    settings.nudges.max = 3;
    const plan = remindersOf(
      interview({ status: "COMPLETED" }),
      settings,
      after,
      true,
    );
    expect(
      plan.items
        .filter((i) => i.kind === "SCORECARD_NUDGE")
        .map((i) => [i.nth, i.at]),
    ).toEqual([
      [{ n: 1, of: 3 }, "2026-10-21T10:00:00.000Z"],
      [{ n: 2, of: 3 }, "2026-10-22T10:00:00.000Z"],
      [{ n: 3, of: 3 }, "2026-10-23T10:00:00.000Z"],
    ]);
  });

  it("plans none once the scorecard is in", () => {
    expect(
      remindersOf(
        interview({ status: "COMPLETED" }),
        defaultReminderSettings(),
        after,
        false,
      ).items,
    ).toEqual([]);
  });

  it("plans only what is left after some have gone, and never more than the most", () => {
    const settings = defaultReminderSettings();
    settings.nudges.max = 2;
    const log: ReminderLogEntry[] = [
      {
        kind: "SCORECARD_NUDGE",
        audience: "PANELIST",
        at: "2026-10-21T10:00:00.000Z",
        status: "SENT",
        note: null,
      },
    ];
    const plan = remindersOf(
      interview({ status: "COMPLETED", reminderLog: log }),
      settings,
      "2026-10-21T12:00:00.000Z",
      true,
    );
    const nudges = plan.items.filter((i) => i.kind === "SCORECARD_NUDGE");
    expect(nudges.map((i) => [i.nth?.n, i.status])).toEqual([
      [1, "SENT"],
      [2, "PLANNED"],
    ]);
  });

  it("is not planned when the company switched the nudge off", () => {
    const settings = defaultReminderSettings();
    for (const r of settings.rules)
      if (r.kind === "SCORECARD_NUDGE") r.enabled = false;
    expect(
      remindersOf(interview({ status: "COMPLETED" }), settings, after, true)
        .items,
    ).toEqual([]);
  });
});

describe("what already went", () => {
  it("is kept in the list, whatever happens to the plan, with each reason", () => {
    const log: ReminderLogEntry[] = [
      {
        kind: "CANDIDATE_EARLY",
        audience: "CANDIDATE",
        at: "2026-10-19T09:00:00.000Z",
        status: "SENT",
        note: null,
      },
      {
        kind: "PANELIST",
        audience: "PANELIST",
        at: "2026-10-19T09:00:00.000Z",
        status: "SKIPPED",
        note: "not sent: mail not configured",
      },
    ];
    const off = remindersOf(
      interview({ reminderLog: log, remindersOff: true }),
      defaultReminderSettings(),
      "2026-10-19T12:00:00.000Z",
      false,
    );
    expect(off.items.map((i) => [i.kind, i.status, i.note])).toEqual([
      ["CANDIDATE_EARLY", "SENT", null],
      ["PANELIST", "SKIPPED", "not sent: mail not configured"],
    ]);
    /* Planned again for the one that has not gone yet, and not twice for the ones that have. */
    const on = remindersOf(
      interview({ reminderLog: log }),
      defaultReminderSettings(),
      "2026-10-19T12:00:00.000Z",
      false,
    );
    expect(on.items.filter((i) => i.kind === "CANDIDATE_EARLY")).toHaveLength(
      1,
    );
    expect(
      on.items.filter((i) => i.kind === "CANDIDATE_FINAL")[0]?.status,
    ).toBe("PLANNED");
  });
});
